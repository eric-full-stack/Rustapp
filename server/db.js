const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data.db');
const ALGO = 'aes-256-gcm';

function getEncKey() {
  const key = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + enc;
}

function decrypt(data) {
  const [ivHex, tagHex, enc] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), iv);
  decipher.setAuthTag(tag);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      rcon_port INTEGER NOT NULL,
      rcon_password_enc TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      steam_id TEXT,
      player_name TEXT,
      message TEXT,
      channel TEXT DEFAULT 'global',
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      steam_id TEXT,
      player_name TEXT,
      event TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fps_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      fps REAL,
      player_count INTEGER,
      entity_count INTEGER,
      memory INTEGER,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fps_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      fps_before REAL,
      fps_after REAL,
      logs TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quick_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      command_template TEXT NOT NULL,
      requires_player INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_server ON chat_logs(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_history_server ON player_history(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_fps_server ON fps_history(server_id, timestamp);
  `);

  // Create default admin if none exists
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`Default admin user created: ${adminUser}`);
  }

  return db;
}

// User operations
const getUser = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const getUserById = (id) => db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);

// Server operations
const getServers = (userId) => {
  const rows = db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY name').all(userId);
  return rows.map((r) => ({ ...r, rcon_password: decrypt(r.rcon_password_enc), rcon_password_enc: undefined }));
};

const getServer = (id, userId) => {
  const row = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return { ...row, rcon_password: decrypt(row.rcon_password_enc), rcon_password_enc: undefined };
};

const addServer = (userId, name, host, rconPort, rconPassword) => {
  const enc = encrypt(rconPassword);
  const r = db.prepare('INSERT INTO servers (user_id, name, host, rcon_port, rcon_password_enc) VALUES (?,?,?,?,?)').run(userId, name, host, rconPort, enc);
  return r.lastInsertRowid;
};

const updateServer = (id, userId, name, host, rconPort, rconPassword) => {
  const enc = encrypt(rconPassword);
  db.prepare('UPDATE servers SET name=?, host=?, rcon_port=?, rcon_password_enc=? WHERE id=? AND user_id=?').run(name, host, rconPort, enc, id, userId);
};

const deleteServer = (id, userId) => {
  db.prepare('DELETE FROM servers WHERE id = ? AND user_id = ?').run(id, userId);
};

// Chat logs
const addChatLog = (serverId, steamId, playerName, message, channel) => {
  db.prepare('INSERT INTO chat_logs (server_id, steam_id, player_name, message, channel) VALUES (?,?,?,?,?)').run(serverId, steamId, playerName, message, channel || 'global');
};

const getChatLogs = (serverId, limit = 200, channel = null) => {
  if (channel) {
    return db.prepare('SELECT * FROM chat_logs WHERE server_id = ? AND channel = ? ORDER BY id DESC LIMIT ?').all(serverId, channel, limit).reverse();
  }
  return db.prepare('SELECT * FROM chat_logs WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
};

// Player history
const addPlayerEvent = (serverId, steamId, playerName, event) => {
  db.prepare('INSERT INTO player_history (server_id, steam_id, player_name, event) VALUES (?,?,?,?)').run(serverId, steamId, playerName, event);
};

const getPlayerHistory = (serverId, limit = 200) => {
  return db.prepare('SELECT * FROM player_history WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
};

const getPlayerHistoryBySteamId = (serverId, steamId, limit = 100) => {
  return db.prepare('SELECT * FROM player_history WHERE server_id = ? AND steam_id = ? ORDER BY id DESC LIMIT ?').all(serverId, steamId, limit).reverse();
};

// FPS history
const addFpsRecord = (serverId, fps, playerCount, entityCount, memory) => {
  db.prepare('INSERT INTO fps_history (server_id, fps, player_count, entity_count, memory) VALUES (?,?,?,?,?)').run(serverId, fps, playerCount, entityCount, memory);
};

const getFpsHistory = (serverId, limit = 120) => {
  return db.prepare('SELECT * FROM fps_history WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
};

// FPS drops
const addFpsDrop = (serverId, fpsBefore, fpsAfter, logs) => {
  db.prepare('INSERT INTO fps_drops (server_id, fps_before, fps_after, logs) VALUES (?,?,?,?)').run(serverId, fpsBefore, fpsAfter, logs);
};

const getFpsDrops = (serverId, limit = 50) => {
  return db.prepare('SELECT * FROM fps_drops WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
};

// Quick actions
const getQuickActions = (userId) => {
  return db.prepare('SELECT * FROM quick_actions WHERE user_id = ? ORDER BY name').all(userId);
};

const addQuickAction = (userId, name, commandTemplate, requiresPlayer) => {
  const r = db.prepare('INSERT INTO quick_actions (user_id, name, command_template, requires_player) VALUES (?,?,?,?)').run(userId, name, commandTemplate, requiresPlayer ? 1 : 0);
  return r.lastInsertRowid;
};

const updateQuickAction = (id, userId, name, commandTemplate, requiresPlayer) => {
  db.prepare('UPDATE quick_actions SET name=?, command_template=?, requires_player=? WHERE id=? AND user_id=?').run(name, commandTemplate, requiresPlayer ? 1 : 0, id, userId);
};

const deleteQuickAction = (id, userId) => {
  db.prepare('DELETE FROM quick_actions WHERE id = ? AND user_id = ?').run(id, userId);
};

module.exports = {
  init, getUser, getUserById,
  getServers, getServer, addServer, updateServer, deleteServer,
  addChatLog, getChatLogs,
  addPlayerEvent, getPlayerHistory, getPlayerHistoryBySteamId,
  addFpsRecord, getFpsHistory,
  addFpsDrop, getFpsDrops,
  getQuickActions, addQuickAction, updateQuickAction, deleteQuickAction,
};
