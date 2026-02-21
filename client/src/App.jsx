import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { api, WsClient } from './api';
import Login from './components/Login';
import ServerManager from './components/ServerManager';
import Dashboard from './components/Dashboard';

// ─── Contexts ────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const wsRef = useRef(null);

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('rcon_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then((u) => { setUser(u); loadServers(); })
      .catch(() => localStorage.removeItem('rcon_token'))
      .finally(() => setLoading(false));
  }, []);

  // WebSocket setup
  useEffect(() => {
    if (!user) return;
    const ws = new WsClient();
    ws.connect();
    wsRef.current = ws;
    return () => ws.disconnect();
  }, [user]);

  const loadServers = useCallback(async () => {
    try {
      const list = await api.getServers();
      setServers(list);
    } catch { /* ignore */ }
  }, []);

  const handleLogin = async (username, password) => {
    const res = await api.login(username, password);
    localStorage.setItem('rcon_token', res.token);
    setUser(res.user);
    loadServers();
  };

  const handleLogout = () => {
    localStorage.removeItem('rcon_token');
    wsRef.current?.disconnect();
    setUser(null);
    setServers([]);
    setActiveServer(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-rust-500 text-xl font-bold">RUST RCON</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const ctx = {
    user,
    servers,
    activeServer,
    setActiveServer,
    loadServers,
    ws: wsRef.current,
    logout: handleLogout,
  };

  return (
    <AppContext.Provider value={ctx}>
      {activeServer ? (
        <Dashboard server={activeServer} onBack={() => setActiveServer(null)} />
      ) : (
        <ServerManager />
      )}
    </AppContext.Provider>
  );
}
