const BASE = '';

function getToken() {
  return localStorage.getItem('rcon_token');
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function request(method, path, body) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem('rcon_token');
    window.location.reload();
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  me: () => request('GET', '/api/auth/me'),

  getServers: () => request('GET', '/api/servers'),
  addServer: (data) => request('POST', '/api/servers', data),
  updateServer: (id, data) => request('PUT', `/api/servers/${id}`, data),
  deleteServer: (id) => request('DELETE', `/api/servers/${id}`),

  getChat: (serverId, channel, limit) => {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (limit) params.set('limit', limit);
    return request('GET', `/api/servers/${serverId}/chat?${params}`);
  },
  getHistory: (serverId, limit) => request('GET', `/api/servers/${serverId}/history?limit=${limit || 200}`),
  getPlayerHistory: (serverId, steamId) => request('GET', `/api/servers/${serverId}/history/${steamId}`),
  getFps: (serverId, limit) => request('GET', `/api/servers/${serverId}/fps?limit=${limit || 120}`),
  getFpsDrops: (serverId) => request('GET', `/api/servers/${serverId}/fps-drops`),

  // Notes
  getNotes: (serverId) => request('GET', `/api/servers/${serverId}/notes`),
  getPlayerNotes: (serverId, steamId) => request('GET', `/api/servers/${serverId}/notes/${steamId}`),
  addNote: (serverId, data) => request('POST', `/api/servers/${serverId}/notes`, data),
  deleteNote: (id) => request('DELETE', `/api/notes/${id}`),

  // Quick Actions
  getQuickActions: () => request('GET', '/api/quick-actions'),
  addQuickAction: (data) => request('POST', '/api/quick-actions', data),
  updateQuickAction: (id, data) => request('PUT', `/api/quick-actions/${id}`, data),
  deleteQuickAction: (id) => request('DELETE', `/api/quick-actions/${id}`),
};

// WebSocket connection manager
export class WsClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      const token = getToken();
      if (token) {
        this.ws.send(JSON.stringify({ type: 'auth', token }));
      }
      this._emit('connection', { connected: true });
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._emit(msg.type, msg);
      } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._emit('connection', { connected: false });
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (getToken()) this.connect();
    }, 3000);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(serverId) {
    this.send({ type: 'subscribe', serverId });
  }

  unsubscribe(serverId) {
    this.send({ type: 'unsubscribe', serverId });
  }

  command(serverId, command) {
    this.send({ type: 'command', serverId, command });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
    this.connected = false;
  }
}
