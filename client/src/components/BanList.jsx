import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../App';

export default function BanList({ serverId }) {
  const { ws } = useApp();
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadBans = useCallback(() => {
    if (!ws) return;
    setLoading(true);

    const unsub = ws.on('command_result', (msg) => {
      if (msg.serverId !== serverId) return;
      if (msg.data.command !== 'banlist') return;
      unsub();

      const text = msg.data.response || '';
      const parsed = parseBans(text);
      setBans(parsed);
      setLoading(false);
    });

    ws.command(serverId, 'banlist');

    setTimeout(() => {
      setLoading(false);
    }, 10000);
  }, [ws, serverId]);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  function parseBans(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const result = [];
    for (const line of lines) {
      const match = line.match(/(\d{17})\s+"?([^"]*)"?\s*-?\s*(.*)?/);
      if (match) {
        result.push({
          steamId: match[1],
          name: match[2]?.trim() || '',
          reason: match[3]?.trim() || '',
        });
      }
    }
    return result;
  }

  const handleUnban = (steamId) => {
    if (!confirm(`Desbanir ${steamId}?`)) return;
    ws?.command(serverId, `unban ${steamId}`);
    setBans((prev) => prev.filter((b) => b.steamId !== steamId));
  };

  const filtered = search
    ? bans.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.steamId.includes(search) ||
        b.reason.toLowerCase().includes(search.toLowerCase())
      )
    : bans;

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Lista de Bans ({bans.length})</h2>
        <button onClick={loadBans} className="btn-secondary text-xs px-3">
          Atualizar
        </button>
      </div>

      <input
        placeholder="Buscar ban..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      {loading && (
        <div className="text-center text-dark-400 py-8 animate-pulse text-sm">Carregando...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-dark-400 py-8 text-sm">Nenhum ban encontrado</div>
      )}

      <div className="space-y-2">
        {filtered.map((b) => (
          <div key={b.steamId} className="card flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{b.name || b.steamId}</div>
              <div className="text-dark-400 text-xs">{b.steamId}</div>
              {b.reason && <div className="text-dark-500 text-xs mt-0.5">Motivo: {b.reason}</div>}
            </div>
            <button
              onClick={() => handleUnban(b.steamId)}
              className="btn-secondary text-xs px-3 shrink-0"
            >
              Unban
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
