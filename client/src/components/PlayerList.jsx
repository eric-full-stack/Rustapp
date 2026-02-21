import React, { useState } from 'react';
import { useApp } from '../App';

export default function PlayerList({ serverId, players }) {
  const { ws } = useApp();
  const [search, setSearch] = useState('');
  const [menuPlayer, setMenuPlayer] = useState(null);
  const [copied, setCopied] = useState(false);

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.steamId.includes(search)
  );

  const formatTime = (seconds) => {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const runCommand = (cmd) => {
    ws?.command(serverId, cmd);
    setMenuPlayer(null);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for iOS
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Jogadores ({players.length})</h2>
      </div>

      <input
        placeholder="Buscar jogador ou Steam ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="card text-center text-dark-400 py-4 text-sm">
            {players.length === 0 ? 'Nenhum jogador online' : 'Nenhum resultado'}
          </div>
        )}

        {filtered.map((p) => (
          <div key={p.steamId} className="card">
            <div
              className="flex items-center gap-3 cursor-pointer active:opacity-70"
              onClick={() => setMenuPlayer(menuPlayer?.steamId === p.steamId ? null : p)}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-dark-400 text-xs mt-0.5">
                  {p.steamId}
                </div>
              </div>
              <div className="text-right shrink-0 text-sm">
                <div className="text-dark-300">{p.ping}ms</div>
                <div className="text-dark-500 text-xs">{formatTime(p.connectedSeconds)}</div>
              </div>
            </div>

            {/* Health bar */}
            <div className="mt-2 h-1.5 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(p.health || 0, 100)}%` }}
              />
            </div>
            <div className="text-xs text-dark-500 mt-0.5">HP: {Math.round(p.health || 0)}</div>

            {/* Action menu */}
            {menuPlayer?.steamId === p.steamId && (
              <div className="mt-3 pt-3 border-t border-dark-700 grid grid-cols-2 gap-2">
                <button
                  onClick={() => copyToClipboard(p.steamId)}
                  className="btn-secondary text-xs"
                >
                  {copied ? 'Copiado!' : 'Copiar ID'}
                </button>
                <button
                  onClick={() => {
                    const reason = prompt('Motivo do kick:') || '';
                    runCommand(`kick ${p.steamId} "${reason}"`);
                  }}
                  className="btn bg-yellow-700 text-yellow-100 text-xs"
                >
                  Kick
                </button>
                <button
                  onClick={() => {
                    const reason = prompt('Motivo do ban:') || '';
                    if (confirm(`Banir ${p.name}?`)) {
                      runCommand(`ban ${p.steamId} "${reason}"`);
                    }
                  }}
                  className="btn-danger text-xs"
                >
                  Ban
                </button>
                <button
                  onClick={() => runCommand(`mute ${p.steamId}`)}
                  className="btn-secondary text-xs"
                >
                  Mute
                </button>
                <button
                  onClick={() => runCommand(`teleportpos ${p.steamId} 0 100 0`)}
                  className="btn-secondary text-xs"
                >
                  Teleport
                </button>
                <button
                  onClick={() => runCommand(`inventory.giveto ${p.steamId} supply.signal 1`)}
                  className="btn-secondary text-xs"
                >
                  Give Item
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
