require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const RconClient = require('./rcon');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FPS_POLL_INTERVAL = parseInt(process.env.FPS_POLL_INTERVAL) || 30000;
const PLAYER_POLL_INTERVAL = parseInt(process.env.PLAYER_POLL_INTERVAL) || 15000;
const FPS_DROP_THRESHOLD = parseFloat(process.env.FPS_DROP_THRESHOLD) || 0.30;

db.init();

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true });
app.use('/api', limiter);

// Health check for Docker
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth routes ─────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = db.getUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// ─── Server CRUD ─────────────────────────────────────────────
app.get('/api/servers', auth, (req, res) => {
  const servers = db.getServers(req.userId);
  res.json(servers.map((s) => ({ id: s.id, name: s.name, rcon_port: s.rcon_port, created_at: s.created_at })));
});

app.post('/api/servers', auth, (req, res) => {
  const { name, host, rcon_port, rcon_password } = req.body;
  if (!name || !host || !rcon_port || !rcon_password) return res.status(400).json({ error: 'Missing fields' });
  const id = db.addServer(req.userId, name, host, parseInt(rcon_port), rcon_password);
  res.json({ id });
});

app.put('/api/servers/:id', auth, (req, res) => {
  const { name, host, rcon_port, rcon_password } = req.body;
  if (!name || !host || !rcon_port || !rcon_password) return res.status(400).json({ error: 'Missing fields' });
  db.updateServer(parseInt(req.params.id), req.userId, name, host, parseInt(rcon_port), rcon_password);
  const key = `${req.userId}:${req.params.id}`;
  if (rconConnections.has(key)) {
    rconConnections.get(key).disconnect();
    rconConnections.delete(key);
  }
  res.json({ ok: true });
});

app.delete('/api/servers/:id', auth, (req, res) => {
  const key = `${req.userId}:${req.params.id}`;
  if (rconConnections.has(key)) {
    rconConnections.get(key).disconnect();
    rconConnections.delete(key);
  }
  db.deleteServer(parseInt(req.params.id), req.userId);
  res.json({ ok: true });
});

// ─── Quick Actions CRUD ──────────────────────────────────────
app.get('/api/quick-actions', auth, (req, res) => {
  res.json(db.getQuickActions(req.userId));
});

app.post('/api/quick-actions', auth, (req, res) => {
  const { name, command_template, requires_player, category, confirm_before } = req.body;
  if (!name || !command_template) return res.status(400).json({ error: 'Missing fields' });
  const id = db.addQuickAction(req.userId, name, command_template, !!requires_player, category, !!confirm_before);
  res.json({ id });
});

app.put('/api/quick-actions/:id', auth, (req, res) => {
  const { name, command_template, requires_player, category, confirm_before } = req.body;
  db.updateQuickAction(parseInt(req.params.id), req.userId, name, command_template, !!requires_player, category, !!confirm_before);
  res.json({ ok: true });
});

app.delete('/api/quick-actions/:id', auth, (req, res) => {
  db.deleteQuickAction(parseInt(req.params.id), req.userId);
  res.json({ ok: true });
});

// ─── Player Notes ────────────────────────────────────────────
app.get('/api/servers/:id/notes', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getAllPlayerNotes(srv.id));
});

app.get('/api/servers/:id/notes/:steamId', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getPlayerNotes(srv.id, req.params.steamId));
});

app.post('/api/servers/:id/notes', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  const { steam_id, player_name, note } = req.body;
  if (!steam_id || !note) return res.status(400).json({ error: 'Missing fields' });
  const id = db.addPlayerNote(srv.id, req.userId, steam_id, player_name || '', note);
  res.json({ id });
});

app.delete('/api/notes/:id', auth, (req, res) => {
  db.deletePlayerNote(parseInt(req.params.id), req.userId);
  res.json({ ok: true });
});

// ─── History / Logs routes ───────────────────────────────────
app.get('/api/servers/:id/chat', auth, (req, res) => {
  const { channel, limit } = req.query;
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getChatLogs(srv.id, parseInt(limit) || 200, channel || null));
});

app.get('/api/servers/:id/history', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getPlayerHistory(srv.id, parseInt(req.query.limit) || 200));
});

app.get('/api/servers/:id/history/:steamId', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getPlayerHistoryBySteamId(srv.id, req.params.steamId, parseInt(req.query.limit) || 100));
});

app.get('/api/servers/:id/fps', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getFpsHistory(srv.id, parseInt(req.query.limit) || 120));
});

app.get('/api/servers/:id/fps-drops', auth, (req, res) => {
  const srv = db.getServer(parseInt(req.params.id), req.userId);
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  res.json(db.getFpsDrops(srv.id, parseInt(req.query.limit) || 50));
});

// ─── RCON Connection Manager ─────────────────────────────────
const rconConnections = new Map();
const rconIntervals = new Map();
const wsClients = new Map();

async function getOrCreateRcon(userId, serverId) {
  const key = `${userId}:${serverId}`;
  if (rconConnections.has(key) && rconConnections.get(key).connected) {
    return rconConnections.get(key);
  }

  const srv = db.getServer(serverId, userId);
  if (!srv) throw new Error('Server not found');

  const client = new RconClient(srv.host, srv.rcon_port, srv.rcon_password);

  client.on('chat', (chatData) => {
    db.addChatLog(serverId, chatData.steamId, chatData.playerName, chatData.message, chatData.channel);
    broadcastToSubscribers(serverId, { type: 'chat', serverId, data: chatData });
  });

  client.on('message', (msg) => {
    broadcastToSubscribers(serverId, { type: 'console', serverId, data: { message: msg.Message, msgType: msg.Type } });
  });

  client.on('disconnected', () => {
    broadcastToSubscribers(serverId, { type: 'status', serverId, data: { connected: false } });
    stopPolling(key);
  });

  client.on('connected', () => {
    broadcastToSubscribers(serverId, { type: 'status', serverId, data: { connected: true } });
    startPolling(key, userId, serverId, client);
  });

  await client.connect();
  rconConnections.set(key, client);
  startPolling(key, userId, serverId, client);
  return client;
}

const previousPlayers = new Map();

function startPolling(key, userId, serverId, client) {
  if (rconIntervals.has(key)) return;
  let fpsAvg = null;

  const fpsInterval = setInterval(async () => {
    if (!client.connected) return;
    try {
      const info = await client.getServerInfo();
      if (!info) return;
      const fps = info.Framerate || 0;
      const players = info.Players || 0;
      const entities = info.EntityCount || 0;
      const memory = info.Memory || 0;

      db.addFpsRecord(serverId, fps, players, entities, memory);

      if (fpsAvg !== null && fpsAvg > 0 && fps < fpsAvg * (1 - FPS_DROP_THRESHOLD)) {
        const logs = client.getRecentLogs(50);
        db.addFpsDrop(serverId, fpsAvg, fps, JSON.stringify(logs));
        broadcastToSubscribers(serverId, {
          type: 'fps_drop', serverId,
          data: { fpsBefore: fpsAvg, fpsAfter: fps, timestamp: new Date().toISOString() },
        });
      }

      fpsAvg = fpsAvg === null ? fps : fpsAvg * 0.7 + fps * 0.3;

      broadcastToSubscribers(serverId, {
        type: 'serverinfo', serverId,
        data: {
          hostname: info.Hostname, players: info.Players, maxPlayers: info.MaxPlayers,
          queued: info.Queued, joining: info.Joining, fps,
          entityCount: entities, memory, gameTime: info.GameTime,
          uptime: info.Uptime, map: info.Map, seed: info.Seed, worldSize: info.WorldSize,
          networkIn: info.NetworkIn, networkOut: info.NetworkOut,
          saveCreatedTime: info.SaveCreatedTime,
        },
      });
    } catch { /* ignore */ }
  }, FPS_POLL_INTERVAL);

  const playerInterval = setInterval(async () => {
    if (!client.connected) return;
    try {
      const players = await client.getPlayerList();
      const currentIds = new Set(players.map((p) => p.SteamID));
      const prevIds = previousPlayers.get(serverId) || new Set();

      for (const p of players) {
        if (!prevIds.has(p.SteamID)) {
          db.addPlayerEvent(serverId, p.SteamID, p.DisplayName, 'join');
          broadcastToSubscribers(serverId, {
            type: 'player_event', serverId,
            data: { steamId: p.SteamID, playerName: p.DisplayName, event: 'join', timestamp: new Date().toISOString() },
          });
        }
      }

      for (const sid of prevIds) {
        if (!currentIds.has(sid)) {
          db.addPlayerEvent(serverId, sid, '', 'leave');
          broadcastToSubscribers(serverId, {
            type: 'player_event', serverId,
            data: { steamId: sid, playerName: '', event: 'leave', timestamp: new Date().toISOString() },
          });
        }
      }

      previousPlayers.set(serverId, currentIds);

      broadcastToSubscribers(serverId, {
        type: 'players', serverId,
        data: players.map((p) => ({
          steamId: p.SteamID, name: p.DisplayName, ping: p.Ping,
          address: p.Address ? p.Address.replace(/:\d+$/, '') : '',
          connectedSeconds: p.ConnectedSeconds, health: p.Health,
          violationLevel: p.VoiationLevel || p.ViolationLevel || 0,
        })),
      });
    } catch { /* ignore */ }
  }, PLAYER_POLL_INTERVAL);

  rconIntervals.set(key, { fpsInterval, playerInterval });
}

function stopPolling(key) {
  const intervals = rconIntervals.get(key);
  if (intervals) {
    clearInterval(intervals.fpsInterval);
    clearInterval(intervals.playerInterval);
    rconIntervals.delete(key);
  }
}

function broadcastToSubscribers(serverId, msg) {
  const payload = JSON.stringify(msg);
  for (const [ws, info] of wsClients) {
    if (info.subscriptions.has(serverId) && ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

// ─── WebSocket server ────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  wsClients.set(ws, { userId: null, subscriptions: new Set() });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const info = wsClients.get(ws);

    if (msg.type === 'auth') {
      try {
        const payload = jwt.verify(msg.token, JWT_SECRET);
        info.userId = payload.userId;
        ws.send(JSON.stringify({ type: 'auth', ok: true }));
      } catch {
        ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Invalid token' }));
      }
      return;
    }

    if (!info.userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      return;
    }

    switch (msg.type) {
      case 'subscribe': {
        const serverId = parseInt(msg.serverId);
        info.subscriptions.add(serverId);
        try {
          const rcon = await getOrCreateRcon(info.userId, serverId);
          ws.send(JSON.stringify({ type: 'status', serverId, data: { connected: rcon.connected } }));
          try {
            const [srvInfo, players] = await Promise.all([rcon.getServerInfo(), rcon.getPlayerList()]);
            if (srvInfo) {
              ws.send(JSON.stringify({
                type: 'serverinfo', serverId, data: {
                  hostname: srvInfo.Hostname, players: srvInfo.Players, maxPlayers: srvInfo.MaxPlayers,
                  queued: srvInfo.Queued, joining: srvInfo.Joining, fps: srvInfo.Framerate,
                  entityCount: srvInfo.EntityCount, memory: srvInfo.Memory, gameTime: srvInfo.GameTime,
                  uptime: srvInfo.Uptime, map: srvInfo.Map, seed: srvInfo.Seed, worldSize: srvInfo.WorldSize,
                  networkIn: srvInfo.NetworkIn, networkOut: srvInfo.NetworkOut,
                  saveCreatedTime: srvInfo.SaveCreatedTime,
                },
              }));
            }
            if (players) {
              ws.send(JSON.stringify({
                type: 'players', serverId, data: players.map((p) => ({
                  steamId: p.SteamID, name: p.DisplayName, ping: p.Ping,
                  address: p.Address ? p.Address.replace(/:\d+$/, '') : '',
                  connectedSeconds: p.ConnectedSeconds, health: p.Health,
                  violationLevel: p.VoiationLevel || p.ViolationLevel || 0,
                })),
              }));
            }
          } catch { /* initial fetch failed */ }
        } catch (err) {
          ws.send(JSON.stringify({ type: 'status', serverId, data: { connected: false, error: err.message } }));
        }
        break;
      }
      case 'unsubscribe':
        info.subscriptions.delete(parseInt(msg.serverId));
        break;
      case 'command': {
        const serverId = parseInt(msg.serverId);
        try {
          const rcon = await getOrCreateRcon(info.userId, serverId);
          const result = await rcon.send(msg.command);
          ws.send(JSON.stringify({ type: 'command_result', serverId, data: { command: msg.command, response: result.Message, msgType: result.Type } }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'command_result', serverId, data: { command: msg.command, response: err.message, msgType: 'Error' } }));
        }
        break;
      }
    }
  });

  ws.on('close', () => { wsClients.delete(ws); });
});

// ─── Daily cleanup ───────────────────────────────────────────
setInterval(() => {
  try { db.cleanOldData(30); } catch { /* ignore */ }
}, 86400000);

// ─── Serve static in production ──────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Rust RCON Dashboard running on port ${PORT}`);
});
