const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'rcon.db');
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
      host_enc TEXT NOT NULL,
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
      category TEXT DEFAULT 'geral',
      confirm_before INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      steam_id TEXT NOT NULL,
      player_name TEXT,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_server ON chat_logs(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_history_server ON player_history(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_history_steam ON player_history(server_id, steam_id);
    CREATE INDEX IF NOT EXISTS idx_fps_server ON fps_history(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_notes_steam ON player_notes(server_id, steam_id);
  `);

  // Migration: if servers table has old 'host' column, migrate to host_enc
  try {
    const cols = db.prepare("PRAGMA table_info(servers)").all();
    const hasHost = cols.some(c => c.name === 'host');
    const hasHostEnc = cols.some(c => c.name === 'host_enc');
    if (hasHost && !hasHostEnc) {
      db.exec('ALTER TABLE servers ADD COLUMN host_enc TEXT');
      const rows = db.prepare('SELECT id, host FROM servers').all();
      const stmt = db.prepare('UPDATE servers SET host_enc = ? WHERE id = ?');
      for (const row of rows) { stmt.run(encrypt(row.host), row.id); }
    }
  } catch { /* not needed */ }

  // Migration: add new quick_actions columns
  try {
    const cols = db.prepare("PRAGMA table_info(quick_actions)").all();
    if (!cols.some(c => c.name === 'category')) db.exec("ALTER TABLE quick_actions ADD COLUMN category TEXT DEFAULT 'geral'");
    if (!cols.some(c => c.name === 'confirm_before')) db.exec("ALTER TABLE quick_actions ADD COLUMN confirm_before INTEGER DEFAULT 0");
  } catch { /* not needed */ }

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`Admin user created: ${adminUser}`);
  }
  return db;
}

const getUser = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const getUserById = (id) => db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);

const getServers = (userId) => {
  const rows = db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY name').all(userId);
  return rows.map((r) => ({
    ...r,
    host: r.host_enc ? decrypt(r.host_enc) : '',
    rcon_password: decrypt(r.rcon_password_enc),
    host_enc: undefined, rcon_password_enc: undefined,
  }));
};

const getServer = (id, userId) => {
  const row = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return {
    ...row,
    host: row.host_enc ? decrypt(row.host_enc) : '',
    rcon_password: decrypt(row.rcon_password_enc),
    host_enc: undefined, rcon_password_enc: undefined,
  };
};

const addServer = (userId, name, host, rconPort, rconPassword) => {
  const hostEnc = encrypt(host);
  const passEnc = encrypt(rconPassword);
  const r = db.prepare('INSERT INTO servers (user_id, name, host_enc, rcon_port, rcon_password_enc) VALUES (?,?,?,?,?)').run(userId, name, hostEnc, rconPort, passEnc);
  return r.lastInsertRowid;
};

const updateServer = (id, userId, name, host, rconPort, rconPassword) => {
  const hostEnc = encrypt(host);
  const passEnc = encrypt(rconPassword);
  db.prepare('UPDATE servers SET name=?, host_enc=?, rcon_port=?, rcon_password_enc=? WHERE id=? AND user_id=?').run(name, hostEnc, rconPort, passEnc, id, userId);
};

const deleteServer = (id, userId) => {
  db.prepare('DELETE FROM servers WHERE id = ? AND user_id = ?').run(id, userId);
};

const addChatLog = (serverId, steamId, playerName, message, channel) => {
  db.prepare('INSERT INTO chat_logs (server_id, steam_id, player_name, message, channel) VALUES (?,?,?,?,?)').run(serverId, steamId, playerName, message, channel || 'global');
};
const getChatLogs = (serverId, limit = 200, channel = null) => {
  if (channel) return db.prepare('SELECT * FROM chat_logs WHERE server_id = ? AND channel = ? ORDER BY id DESC LIMIT ?').all(serverId, channel, limit).reverse();
  return db.prepare('SELECT * FROM chat_logs WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
};

const addPlayerEvent = (serverId, steamId, playerName, event) => {
  db.prepare('INSERT INTO player_history (server_id, steam_id, player_name, event) VALUES (?,?,?,?)').run(serverId, steamId, playerName, event);
};
const getPlayerHistory = (serverId, limit = 200) => db.prepare('SELECT * FROM player_history WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();
const getPlayerHistoryBySteamId = (serverId, steamId, limit = 100) => db.prepare('SELECT * FROM player_history WHERE server_id = ? AND steam_id = ? ORDER BY id DESC LIMIT ?').all(serverId, steamId, limit).reverse();

const addFpsRecord = (serverId, fps, playerCount, entityCount, memory) => {
  db.prepare('INSERT INTO fps_history (server_id, fps, player_count, entity_count, memory) VALUES (?,?,?,?,?)').run(serverId, fps, playerCount, entityCount, memory);
};
const getFpsHistory = (serverId, limit = 120) => db.prepare('SELECT * FROM fps_history WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();

const addFpsDrop = (serverId, fpsBefore, fpsAfter, logs) => {
  db.prepare('INSERT INTO fps_drops (server_id, fps_before, fps_after, logs) VALUES (?,?,?,?)').run(serverId, fpsBefore, fpsAfter, logs);
};
const getFpsDrops = (serverId, limit = 50) => db.prepare('SELECT * FROM fps_drops WHERE server_id = ? ORDER BY id DESC LIMIT ?').all(serverId, limit).reverse();

const getQuickActions = (userId) => db.prepare('SELECT * FROM quick_actions WHERE user_id = ? ORDER BY category, name').all(userId);
const addQuickAction = (userId, name, commandTemplate, requiresPlayer, category, confirmBefore) => {
  const r = db.prepare('INSERT INTO quick_actions (user_id, name, command_template, requires_player, category, confirm_before) VALUES (?,?,?,?,?,?)').run(userId, name, commandTemplate, requiresPlayer ? 1 : 0, category || 'geral', confirmBefore ? 1 : 0);
  return r.lastInsertRowid;
};
const updateQuickAction = (id, userId, name, commandTemplate, requiresPlayer, category, confirmBefore) => {
  db.prepare('UPDATE quick_actions SET name=?, command_template=?, requires_player=?, category=?, confirm_before=? WHERE id=? AND user_id=?').run(name, commandTemplate, requiresPlayer ? 1 : 0, category || 'geral', confirmBefore ? 1 : 0, id, userId);
};
const deleteQuickAction = (id, userId) => db.prepare('DELETE FROM quick_actions WHERE id = ? AND user_id = ?').run(id, userId);

const getPlayerNotes = (serverId, steamId) => db.prepare('SELECT * FROM player_notes WHERE server_id = ? AND steam_id = ? ORDER BY id DESC').all(serverId, steamId);
const getAllPlayerNotes = (serverId) => db.prepare('SELECT DISTINCT steam_id, player_name, COUNT(*) as count FROM player_notes WHERE server_id = ? GROUP BY steam_id').all(serverId);
const addPlayerNote = (serverId, userId, steamId, playerName, note) => {
  const r = db.prepare('INSERT INTO player_notes (server_id, user_id, steam_id, player_name, note) VALUES (?,?,?,?,?)').run(serverId, userId, steamId, playerName, note);
  return r.lastInsertRowid;
};
const deletePlayerNote = (id, userId) => db.prepare('DELETE FROM player_notes WHERE id = ? AND user_id = ?').run(id, userId);

const cleanOldData = (daysToKeep = 30) => {
  const cutoff = new Date(Date.now() - daysToKeep * 86400000).toISOString();
  db.prepare('DELETE FROM chat_logs WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM fps_history WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM fps_drops WHERE timestamp < ?').run(cutoff);
};

module.exports = {
  init, encrypt, decrypt,
  getUser, getUserById,
  getServers, getServer, addServer, updateServer, deleteServer,
  addChatLog, getChatLogs,
  addPlayerEvent, getPlayerHistory, getPlayerHistoryBySteamId,
  addFpsRecord, getFpsHistory,
  addFpsDrop, getFpsDrops,
  getQuickActions, addQuickAction, updateQuickAction, deleteQuickAction,
  getPlayerNotes, getAllPlayerNotes, addPlayerNote, deletePlayerNote,
  cleanOldData,
};
