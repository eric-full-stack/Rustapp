import React, { useState, useEffect } from 'react';
import { useApp } from '../App';
import { api } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CHART_MODES = [
  { key: 'fps', label: 'FPS', dataKey: 'fps', color: '#f57f17', unit: '' },
  { key: 'memory', label: 'Memoria', dataKey: 'memory', color: '#8b5cf6', unit: ' MB' },
  { key: 'entities', label: 'Entidades', dataKey: 'entities', color: '#22d3ee', unit: '' },
];

export default function FpsChart({ serverId }) {
  const { ws } = useApp();
  const [fpsData, setFpsData] = useState([]);
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDrops, setShowDrops] = useState(false);
  const [chartMode, setChartMode] = useState('fps');

  useEffect(() => {
    Promise.all([
      api.getFps(serverId, 120),
      api.getFpsDrops(serverId),
    ])
      .then(([fps, dr]) => {
        setFpsData(fps.map((f) => ({
          time: new Date(f.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          fps: Math.round(f.fps || 0),
          players: f.player_count || 0,
          entities: f.entity_count || 0,
          memory: f.memory || 0,
        })));
        setDrops(dr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  // Listen for real-time FPS updates
  useEffect(() => {
    if (!ws) return;
    const unsubs = [
      ws.on('serverinfo', (msg) => {
        if (msg.serverId !== serverId) return;
        setFpsData((prev) => {
          const next = [...prev, {
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            fps: Math.round(msg.data.fps || 0),
            players: msg.data.players || 0,
            entities: msg.data.entityCount || 0,
            memory: msg.data.memory || 0,
          }];
          return next.slice(-120);
        });
      }),
      ws.on('fps_drop', (msg) => {
        if (msg.serverId !== serverId) return;
        setDrops((prev) => [...prev, {
          fps_before: msg.data.fpsBefore,
          fps_after: msg.data.fpsAfter,
          timestamp: msg.data.timestamp,
        }]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [ws, serverId]);

  const latest = fpsData.length > 0 ? fpsData[fpsData.length - 1] : null;
  const avgFps = fpsData.length > 0
    ? Math.round(fpsData.reduce((sum, d) => sum + d.fps, 0) / fpsData.length)
    : 0;
  const minFps = fpsData.length > 0 ? Math.min(...fpsData.map((d) => d.fps)) : 0;
  const maxFps = fpsData.length > 0 ? Math.max(...fpsData.map((d) => d.fps)) : 0;

  const getHealthColor = (fps) => {
    if (fps > 25) return 'text-green-400';
    if (fps > 15) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getHealthBg = (fps) => {
    if (fps > 25) return 'bg-green-900/30 border-green-800';
    if (fps > 15) return 'bg-yellow-900/30 border-yellow-800';
    return 'bg-red-900/30 border-red-800';
  };

  const activeMode = CHART_MODES.find((m) => m.key === chartMode) || CHART_MODES[0];

  const exportCSV = async () => {
    const header = 'Time,FPS,Players,Entities,Memory';
    const rows = fpsData.map((d) => `${d.time},${d.fps},${d.players},${d.entities},${d.memory}`);
    const csv = [header, ...rows].join('\n');
    try {
      await navigator.clipboard.writeText(csv);
      alert('CSV copiado para a area de transferencia!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = csv;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('CSV copiado!');
    }
  };

  const copyDropLogs = (drop) => {
    const logs = drop.logs ? JSON.parse(drop.logs) : [];
    const text = logs.map((l) => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => alert('Logs copiados!'));
  };

  if (loading) {
    return <div className="px-4 py-8 text-center text-dark-400 animate-pulse text-sm">Carregando...</div>;
  }

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Monitor FPS</h2>
        <button onClick={exportCSV} className="text-dark-400 text-xs active:text-dark-200">
          Exportar CSV
        </button>
      </div>

      {/* Live values */}
      {latest && (
        <div className={`card mb-4 border ${getHealthBg(latest.fps)}`}>
          <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">Valores Atuais</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className={`text-2xl font-bold ${getHealthColor(latest.fps)}`}>{latest.fps}</div>
              <div className="text-dark-400 text-xs">FPS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-dark-200">{latest.players}</div>
              <div className="text-dark-400 text-xs">Jogadores</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{latest.memory}</div>
              <div className="text-dark-400 text-xs">MB</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-400">{(latest.entities || 0).toLocaleString()}</div>
              <div className="text-dark-400 text-xs">Entidades</div>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card text-center py-2">
          <div className="text-dark-400 text-xs">Media</div>
          <div className={`text-xl font-bold ${avgFps < 15 ? 'text-red-400' : avgFps < 25 ? 'text-yellow-400' : 'text-green-400'}`}>
            {avgFps}
          </div>
        </div>
        <div className="card text-center py-2">
          <div className="text-dark-400 text-xs">Minimo</div>
          <div className={`text-xl font-bold ${minFps < 10 ? 'text-red-400' : 'text-dark-200'}`}>{minFps}</div>
        </div>
        <div className="card text-center py-2">
          <div className="text-dark-400 text-xs">Maximo</div>
          <div className="text-xl font-bold text-dark-200">{maxFps}</div>
        </div>
      </div>

      {/* Chart mode toggle */}
      <div className="flex gap-2 mb-3">
        {CHART_MODES.map((mode) => (
          <button
            key={mode.key}
            onClick={() => setChartMode(mode.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              chartMode === mode.key
                ? 'bg-rust-600 text-white'
                : 'bg-dark-800 text-dark-400 active:bg-dark-700'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="card mb-4">
        <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">
          {activeMode.label} ao longo do tempo
        </div>
        {fpsData.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={fpsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value) => [`${value}${activeMode.unit}`, activeMode.label]}
              />
              {chartMode === 'fps' && (
                <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Low', fill: '#ef4444', fontSize: 10 }} />
              )}
              <Line type="monotone" dataKey={activeMode.dataKey} stroke={activeMode.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="players" stroke="#22d3ee" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-dark-500 text-sm py-8">Dados insuficientes para o grafico</div>
        )}
        <div className="flex gap-4 mt-2 text-xs text-dark-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ background: activeMode.color }} /> {activeMode.label}
          </span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Jogadores</span>
        </div>
      </div>

      {/* FPS Drops */}
      <div className="card">
        <button
          onClick={() => setShowDrops(!showDrops)}
          className="w-full flex items-center justify-between"
        >
          <span className="text-dark-400 text-xs uppercase tracking-wider">
            Quedas de FPS ({drops.length})
          </span>
          <span className="text-dark-500 text-xs">{showDrops ? 'Ocultar' : 'Mostrar'}</span>
        </button>

        {showDrops && (
          <div className="mt-3 space-y-2">
            {drops.length === 0 && (
              <div className="text-dark-500 text-sm text-center py-2">Nenhuma queda detectada</div>
            )}
            {drops.map((d, i) => (
              <div key={i} className="bg-dark-700 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-dark-400">FPS: </span>
                    <span className="text-green-400">{Math.round(d.fps_before)}</span>
                    <span className="text-dark-500 mx-1">&rarr;</span>
                    <span className="text-red-400">{Math.round(d.fps_after)}</span>
                  </div>
                  {d.logs && (
                    <button onClick={() => copyDropLogs(d)} className="text-dark-400 text-xs active:text-dark-200">
                      Copiar Logs
                    </button>
                  )}
                </div>
                <div className="text-dark-500 text-xs mt-1">
                  {d.timestamp ? new Date(d.timestamp).toLocaleString('pt-BR') : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
