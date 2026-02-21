import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../App';

export default function Plugins({ serverId }) {
  const { ws } = useApp();
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(null);
  const [search, setSearch] = useState('');

  const loadPlugins = useCallback(() => {
    if (!ws) return;
    setLoading(true);

    // We'll listen for the command result
    const unsub = ws.on('command_result', (msg) => {
      if (msg.serverId !== serverId) return;
      if (msg.data.command !== 'plugins') return;
      unsub();

      // Parse the plugins response
      const text = msg.data.response || '';
      const parsed = parsePlugins(text);
      setPlugins(parsed);
      setLoading(false);
    });

    ws.command(serverId, 'plugins');

    // Timeout
    setTimeout(() => {
      setLoading(false);
    }, 10000);
  }, [ws, serverId]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  function parsePlugins(text) {
    // Oxide plugins format: "PluginName v1.0.0 by Author"
    // or numbered list: "01 PluginName v1.0.0 by Author"
    const lines = text.split('\n').filter((l) => l.trim());
    const result = [];
    for (const line of lines) {
      // Try: "PluginName vX.X.X by Author" or numbered
      const match = line.match(/(?:\d+\s+)?(\S+)\s+(v?[\d.]+)(?:\s+by\s+(.+))?/i);
      if (match) {
        result.push({
          name: match[1],
          version: match[2],
          author: match[3]?.trim() || '',
        });
      } else if (line.trim() && !line.includes('Listing') && !line.includes('plugin')) {
        result.push({ name: line.trim(), version: '', author: '' });
      }
    }
    return result;
  }

  const handleReload = (pluginName) => {
    setReloading(pluginName);
    ws?.command(serverId, `oxide.reload ${pluginName}`);
    setTimeout(() => setReloading(null), 2000);
  };

  const handleReloadAll = () => {
    setReloading('__all__');
    ws?.command(serverId, 'oxide.reload *');
    setTimeout(() => {
      setReloading(null);
      loadPlugins();
    }, 3000);
  };

  const handleLoad = (name) => {
    ws?.command(serverId, `oxide.load ${name}`);
  };

  const handleUnload = (name) => {
    ws?.command(serverId, `oxide.unload ${name}`);
  };

  const filtered = plugins.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Plugins ({plugins.length})</h2>
        <div className="flex gap-2">
          <button onClick={loadPlugins} className="btn-secondary text-xs px-3">
            Atualizar
          </button>
          <button
            onClick={handleReloadAll}
            disabled={reloading === '__all__'}
            className="btn-primary text-xs px-3 disabled:opacity-50"
          >
            {reloading === '__all__' ? 'Recarregando...' : 'Reload All'}
          </button>
        </div>
      </div>

      <input
        placeholder="Buscar plugin..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      {loading && (
        <div className="text-center text-dark-400 py-8 animate-pulse text-sm">
          Carregando plugins...
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => (
          <div key={p.name} className="card flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              {(p.version || p.author) && (
                <div className="text-dark-400 text-xs truncate">
                  {p.version}{p.author ? ` - ${p.author}` : ''}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleLoad(p.name)}
                className="btn-secondary text-xs px-2 py-1"
              >
                Load
              </button>
              <button
                onClick={() => handleReload(p.name)}
                disabled={reloading === p.name}
                className="btn-secondary text-xs px-2 py-1 disabled:opacity-50"
              >
                {reloading === p.name ? '...' : 'Reload'}
              </button>
              <button
                onClick={() => handleUnload(p.name)}
                className="text-red-400 text-xs px-2 py-1 active:text-red-300"
              >
                Unload
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && plugins.length === 0 && (
        <div className="text-center text-dark-400 py-8 text-sm">
          Nenhum plugin encontrado
        </div>
      )}
    </div>
  );
}
