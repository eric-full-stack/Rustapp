const WebSocket = require('ws');
const EventEmitter = require('events');

class RconClient extends EventEmitter {
  constructor(host, port, password) {
    super();
    this.host = host;
    this.port = port;
    this.password = password;
    this.ws = null;
    this.connected = false;
    this.nextId = 1;
    this.pending = new Map();
    this.reconnectTimer = null;
    this.shouldReconnect = true;
    this.recentLogs = [];
    this.maxLogs = 200;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.connected) {
        return resolve();
      }

      const url = `ws://${this.host}:${this.port}/${this.password}`;
      this.ws = new WebSocket(url, { handshakeTimeout: 10000 });

      const connectTimeout = setTimeout(() => {
        if (!this.connected) {
          this.ws.terminate();
          reject(new Error('Connection timeout'));
        }
      }, 12000);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (e) {
          // ignore malformed
        }
      });

      this.ws.on('close', () => {
        clearTimeout(connectTimeout);
        const wasConnected = this.connected;
        this.connected = false;
        this._rejectAll('Connection closed');
        if (wasConnected) this.emit('disconnected');
        this._scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        clearTimeout(connectTimeout);
        if (!this.connected) {
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  _handleMessage(msg) {
    // Store in recent logs
    if (msg.Message) {
      this.recentLogs.push({
        type: msg.Type || 'Generic',
        message: msg.Message,
        timestamp: new Date().toISOString(),
      });
      if (this.recentLogs.length > this.maxLogs) {
        this.recentLogs.shift();
      }
    }

    // Resolve pending command if matched by Identifier
    if (msg.Identifier > 0 && this.pending.has(msg.Identifier)) {
      const { resolve } = this.pending.get(msg.Identifier);
      this.pending.delete(msg.Identifier);
      resolve(msg);
      return;
    }

    // Emit typed events for unsolicited messages
    const type = (msg.Type || 'Generic').toLowerCase();
    if (type === 'chat') {
      this._handleChat(msg);
    } else {
      this.emit('message', msg);
    }
  }

  _handleChat(msg) {
    try {
      const chat = JSON.parse(msg.Message);
      this.emit('chat', {
        steamId: chat.UserId || '',
        playerName: chat.Username || '',
        message: chat.Message || '',
        channel: chat.Channel === 1 ? 'team' : 'global',
        color: chat.Color || '#ffffff',
        time: chat.Time || Date.now() / 1000,
      });
    } catch {
      this.emit('chat', {
        steamId: '',
        playerName: '',
        message: msg.Message,
        channel: 'global',
        time: Date.now() / 1000,
      });
    }
  }

  send(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        return reject(new Error('Not connected'));
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Command timeout'));
      }, timeout);

      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      const payload = JSON.stringify({
        Identifier: id,
        Message: command,
        Name: 'WebRcon',
      });

      this.ws.send(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  async getServerInfo() {
    const res = await this.send('serverinfo');
    try {
      return JSON.parse(res.Message);
    } catch {
      return null;
    }
  }

  async getPlayerList() {
    const res = await this.send('playerlist');
    try {
      return JSON.parse(res.Message);
    } catch {
      return [];
    }
  }

  async getPlugins() {
    const res = await this.send('plugins');
    return res.Message || '';
  }

  getRecentLogs(count = 50) {
    return this.recentLogs.slice(-count);
  }

  _rejectAll(reason) {
    for (const [, { reject }] of this.pending) {
      reject(new Error(reason));
    }
    this.pending.clear();
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
      try {
        await this.connect();
      } catch {
        this._scheduleReconnect();
      }
    }, 5000);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._rejectAll('Disconnected');
  }
}

module.exports = RconClient;
