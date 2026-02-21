import React, { useState, useEffect } from 'react';
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

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-bold mb-3">Histórico de Jogadores</h2>

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
                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString('pt-BR') : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
