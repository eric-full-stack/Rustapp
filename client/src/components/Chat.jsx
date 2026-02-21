import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import { api } from '../api';

export default function Chat({ serverId }) {
  const { ws } = useApp();
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'global', 'team'
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);
  const maxMessages = 500;

  // Load initial chat history
  useEffect(() => {
    setLoading(true);
    api.getChat(serverId, null, 200)
      .then((data) => setMessages(data.map((m) => ({
        ...m,
        playerName: m.player_name,
        steamId: m.steam_id,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  // Listen for new chat messages
  useEffect(() => {
    if (!ws) return;
    return ws.on('chat', (msg) => {
      if (msg.serverId !== serverId) return;
      setMessages((prev) => [...prev, msg.data].slice(-maxMessages));
    });
  }, [ws, serverId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filter]);

  const filtered = filter === 'all'
    ? messages
    : messages.filter((m) => m.channel === filter);

  const copyChat = async () => {
    const text = filtered.map((m) =>
      `[${m.timestamp || ''}] [${m.channel}] ${m.playerName}: ${m.message}`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Chat copiado!');
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Chat</h2>
          <button onClick={copyChat} className="text-dark-400 text-xs active:text-dark-200">
            Copiar tudo
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {[
            ['all', 'Todos'],
            ['global', 'Global'],
            ['team', 'Time'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-rust-600 text-white'
                  : 'bg-dark-800 text-dark-400 active:bg-dark-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 no-scrollbar" style={{ minHeight: '50vh' }}>
        {loading && (
          <div className="text-center text-dark-400 py-4 animate-pulse text-sm">Carregando...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-dark-400 py-4 text-sm">Nenhuma mensagem</div>
        )}

        {filtered.map((m, i) => (
          <div key={i} className="py-1.5 border-b border-dark-800/50">
            <div className="flex items-baseline gap-2">
              <span className={`text-xs font-medium ${m.channel === 'team' ? 'text-blue-400' : 'text-green-400'}`}>
                {m.channel === 'team' ? '[TIME]' : '[GLOBAL]'}
              </span>
              <span className="font-semibold text-sm text-rust-300 truncate">{m.playerName || 'Server'}</span>
            </div>
            <div className="text-sm text-dark-200 mt-0.5 break-words">{m.message}</div>
            {m.timestamp && (
              <div className="text-xs text-dark-600 mt-0.5">
                {new Date(m.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
