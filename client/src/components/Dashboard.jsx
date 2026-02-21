import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../App';
import BottomNav from './BottomNav';
import PlayerList from './PlayerList';
import Console from './Console';
import Chat from './Chat';
import Plugins from './Plugins';
import FpsChart from './FpsChart';
import History from './History';
import QuickActions from './QuickActions';

const TABS = ['overview', 'players', 'console', 'chat', 'more'];

export default function Dashboard({ server, onBack }) {
  const { ws } = useApp();
  const [tab, setTab] = useState('overview');
  const [serverInfo, setServerInfo] = useState(null);
  const [players, setPlayers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [moreTab, setMoreTab] = useState(null);

  // Subscribe to server
  useEffect(() => {
    if (!ws) return;
    ws.subscribe(server.id);
    return () => ws.unsubscribe(server.id);
  }, [ws, server.id]);

  // Listen for updates
  useEffect(() => {
    if (!ws) return;
    const unsubs = [
      ws.on('status', (msg) => {
        if (msg.serverId === server.id) setConnected(msg.data.connected);
      }),
      ws.on('serverinfo', (msg) => {
        if (msg.serverId === server.id) setServerInfo(msg.data);
      }),
      ws.on('players', (msg) => {
        if (msg.serverId === server.id) setPlayers(msg.data);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [ws, server.id]);

  const renderMoreMenu = () => (
    <div className="p-4 space-y-3">
      <button onClick={onBack} className="btn-secondary w-full text-left flex items-center gap-2">
        <span>&#8592;</span> Voltar aos Servidores
      </button>
      {[
        ['plugins', 'Plugins'],
        ['fps', 'Monitor FPS'],
        ['history', 'Histórico de Jogadores'],
        ['quick', 'Ações Rápidas'],
      ].map(([key, label]) => (
        <button key={key} onClick={() => setMoreTab(key)} className="btn-secondary w-full text-left">
          {label}
        </button>
      ))}
    </div>
  );

  const formatUptime = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const renderOverview = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold truncate">{server.name}</h2>
          <div className="text-dark-400 text-sm">{server.host}:{server.rcon_port}</div>
        </div>
        <div className={`badge ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {connected ? 'Online' : 'Offline'}
        </div>
      </div>

      {serverInfo && (
        <>
          <div className="card">
            <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">Servidor</div>
            <div className="font-semibold truncate mb-3">{serverInfo.hostname || '—'}</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoItem label="Jogadores" value={`${serverInfo.players}/${serverInfo.maxPlayers}`} />
              <InfoItem label="Na Fila" value={serverInfo.queued || 0} />
              <InfoItem label="FPS" value={Math.round(serverInfo.fps || 0)} highlight={serverInfo.fps < 15} />
              <InfoItem label="Entidades" value={serverInfo.entityCount?.toLocaleString()} />
              <InfoItem label="Memória" value={`${serverInfo.memory || 0} MB`} />
              <InfoItem label="Uptime" value={formatUptime(serverInfo.uptime)} />
              <InfoItem label="Mapa" value={serverInfo.map || '—'} />
              <InfoItem label="Hora in-game" value={serverInfo.gameTime || '—'} />
            </div>
          </div>

          <div className="card">
            <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">Rede</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoItem label="Net In" value={`${serverInfo.networkIn || 0}`} />
              <InfoItem label="Net Out" value={`${serverInfo.networkOut || 0}`} />
              <InfoItem label="Conectando" value={serverInfo.joining || 0} />
            </div>
          </div>
        </>
      )}

      {!serverInfo && connected && (
        <div className="card text-center text-dark-400 py-6 animate-pulse">
          Carregando dados do servidor...
        </div>
      )}

      {!connected && (
        <div className="card text-center text-dark-400 py-6">
          Conectando ao servidor RCON...
        </div>
      )}

      <button onClick={onBack} className="btn-secondary w-full mt-2">
        &#8592; Voltar aos Servidores
      </button>
    </div>
  );

  const renderContent = () => {
    if (tab === 'more' && moreTab) {
      const backBtn = (
        <button onClick={() => setMoreTab(null)} className="text-dark-400 active:text-dark-200 mb-3 text-sm px-4 pt-4">
          &#8592; Menu
        </button>
      );
      switch (moreTab) {
        case 'plugins': return <>{backBtn}<Plugins serverId={server.id} /></>;
        case 'fps': return <>{backBtn}<FpsChart serverId={server.id} /></>;
        case 'history': return <>{backBtn}<History serverId={server.id} /></>;
        case 'quick': return <>{backBtn}<QuickActions serverId={server.id} players={players} /></>;
      }
    }

    switch (tab) {
      case 'overview': return renderOverview();
      case 'players': return <PlayerList serverId={server.id} players={players} />;
      case 'console': return <Console serverId={server.id} />;
      case 'chat': return <Chat serverId={server.id} />;
      case 'more': return renderMoreMenu();
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        {renderContent()}
      </div>
      <BottomNav active={tab} onChange={(t) => { setTab(t); if (t !== 'more') setMoreTab(null); }} />
    </div>
  );
}

function InfoItem({ label, value, highlight }) {
  return (
    <div>
      <div className="text-dark-400 text-xs">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  );
}
