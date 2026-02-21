import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import { api } from '../api';

export default function History({ serverId }) {
  const { ws } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSteamId, setFilterSteamId] = useState('');
  const [playerLogs, setPlayerLogs] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getHistory(serverId, 300)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  // Listen for real-time events
  useEffect(() => {
    if (!ws) return;
    return ws.on('player_event', (msg) => {
      if (msg.serverId !== serverId) return;
      setEvents((prev) => [...prev, {
        steam_id: msg.data.steamId,
        player_name: msg.data.playerName,
        event: msg.data.event,
        timestamp: msg.data.timestamp,
      }]);
    });
  }, [ws, serverId]);

  // Calculate total playtime per player
  const playtimes = useMemo(() => {
    const map = {};
    const sessions = {};

    const source = playerLogs || events;
    const sorted = [...source].sort((a, b) =>
      new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );

    for (const e of sorted) {
      const id = e.steam_id;
      if (!id) continue;

      if (!map[id]) {
        map[id] = { name: e.player_name || id, totalMs: 0 };
      }

      if (e.event === 'join') {
        sessions[id] = new Date(e.timestamp).getTime();
      } else if (e.event === 'leave' && sessions[id]) {
        const joinTime = sessions[id];
        const leaveTime = new Date(e.timestamp).getTime();
        if (leaveTime > joinTime) {
          map[id].totalMs += leaveTime - joinTime;
        }
        delete sessions[id];
      }
    }

    // Count still-active sessions (joined but no leave yet)
    const now = Date.now();
    for (const [id, joinTime] of Object.entries(sessions)) {
      if (map[id]) {
        map[id].totalMs += now - joinTime;
      }
    }

    return map;
  }, [events, playerLogs]);

  const formatPlaytime = (ms) => {
    if (!ms || ms <= 0) return '0m';
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatFullDate = (timestamp) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleViewPlayer = async (steamId) => {
    if (filterSteamId === steamId) {
      setFilterSteamId('');
      setPlayerLogs(null);
      return;
    }
    setFilterSteamId(steamId);
    try {
      const logs = await api.getPlayerHistory(serverId, steamId);
      setPlayerLogs(logs);
    } catch {
      setPlayerLogs([]);
    }
  };

  const displayed = playerLogs || events;
  const filtered = search
    ? displayed.filter((e) =>
        (e.player_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.steam_id || '').includes(search)
      )
    : displayed;

  const exportHistory = async () => {
    const lines = filtered.map((e) =>
      `[${formatFullDate(e.timestamp)}] ${e.event === 'join' ? 'ENTROU' : 'SAIU'} - ${e.player_name || 'Desconhecido'} (${e.steam_id || ''})`
    );

    // Add playtime summary
    const playtimeEntries = Object.entries(playtimes)
      .filter(([, v]) => v.totalMs > 0)
      .sort((a, b) => b[1].totalMs - a[1].totalMs);

    if (playtimeEntries.length > 0) {
      lines.push('');
      lines.push('--- TEMPO DE JOGO ---');
      for (const [id, data] of playtimeEntries) {
        lines.push(`${data.name} (${id}): ${formatPlaytime(data.totalMs)}`);
      }
    }

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Historico copiado para a area de transferencia!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Historico copiado!');
    }
  };

  // Get unique players with playtime for summary
  const playerSummary = useMemo(() => {
    return Object.entries(playtimes)
      .filter(([, v]) => v.totalMs > 0)
      .sort((a, b) => b[1].totalMs - a[1].totalMs);
  }, [playtimes]);

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Historico de Jogadores</h2>
        <button onClick={exportHistory} className="text-dark-400 text-xs active:text-dark-200">
          Exportar
        </button>
      </div>

      <input
        placeholder="Buscar por nome ou Steam ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      {filterSteamId && (
        <div className="flex items-center gap-2 mb-3">
          <span className="badge bg-rust-900 text-rust-300">
            Filtrado: {filterSteamId}
          </span>
          <button
            onClick={() => { setFilterSteamId(''); setPlayerLogs(null); }}
            className="text-dark-400 text-xs active:text-dark-200"
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* Playtime summary for filtered player */}
      {filterSteamId && playtimes[filterSteamId] && (
        <div className="card mb-3 bg-dark-800 border border-dark-700">
          <div className="text-dark-400 text-xs uppercase tracking-wider mb-1">Tempo Total de Jogo</div>
          <div className="text-xl font-bold text-rust-400">
            {formatPlaytime(playtimes[filterSteamId].totalMs)}
          </div>
          <div className="text-dark-400 text-xs mt-1">{playtimes[filterSteamId].name}</div>
        </div>
      )}

      {/* Top playtime summary (only when not filtered) */}
      {!filterSteamId && playerSummary.length > 0 && (
        <div className="card mb-3">
          <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">Top Tempo de Jogo</div>
          <div className="space-y-1">
            {playerSummary.slice(0, 5).map(([id, data]) => (
              <div
                key={id}
                className="flex items-center justify-between text-sm cursor-pointer active:bg-dark-700 rounded px-1 py-0.5"
                onClick={() => handleViewPlayer(id)}
              >
                <span className="text-dark-200 truncate">{data.name}</span>
                <span className="text-rust-400 font-medium shrink-0 ml-2">{formatPlaytime(data.totalMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center text-dark-400 py-8 animate-pulse text-sm">Carregando...</div>
      )}

      <div className="space-y-1">
        {filtered.length === 0 && !loading && (
          <div className="text-center text-dark-400 py-8 text-sm">Nenhum evento encontrado</div>
        )}

        {filtered.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2 border-b border-dark-800/50 cursor-pointer active:bg-dark-800/50 rounded"
            onClick={() => e.steam_id && handleViewPlayer(e.steam_id)}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${e.event === 'join' ? 'bg-green-400' : 'bg-red-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {e.player_name || e.steam_id || 'Desconhecido'}
              </div>
              <div className="text-dark-500 text-xs truncate">{e.steam_id}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xs font-medium ${e.event === 'join' ? 'text-green-400' : 'text-red-400'}`}>
                {e.event === 'join' ? 'Entrou' : 'Saiu'}
              </div>
              <div className="text-dark-500 text-xs">
                {formatFullDate(e.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
