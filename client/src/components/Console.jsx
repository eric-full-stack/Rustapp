import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../App';

const QUICK_COMMANDS = [
  { label: 'status', cmd: 'status' },
  { label: 'fps', cmd: 'fps' },
  { label: 'serverinfo', cmd: 'serverinfo' },
  { label: 'server.save', cmd: 'server.save' },
  { label: 'server.readcfg', cmd: 'server.readcfg' },
  { label: 'ent kill', cmd: 'ent kill' },
  { label: 'gc.collect', cmd: 'gc.collect' },
  { label: 'kick', cmd: 'kick ' },
  { label: 'ban', cmd: 'ban ' },
  { label: 'unban', cmd: 'unban ' },
  { label: 'banlist', cmd: 'banlist' },
  { label: 'oxide.reload *', cmd: 'oxide.reload *' },
  { label: 'fog 0', cmd: 'weather.fog 0' },
  { label: 'rain 0', cmd: 'weather.rain 0' },
];

export default function Console({ serverId }) {
  const { ws } = useApp();
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef(null);
  const maxLogs = 300;

  useEffect(() => {
    if (!ws) return;
    const unsubs = [
      ws.on('command_result', (msg) => {
        if (msg.serverId !== serverId) return;
        setLogs((prev) => {
          const next = [...prev, {
            type: 'response',
            text: msg.data.response,
            command: msg.data.command,
            msgType: msg.data.msgType,
            time: new Date().toLocaleTimeString(),
          }];
          return next.slice(-maxLogs);
        });
      }),
      ws.on('console', (msg) => {
        if (msg.serverId !== serverId) return;
        setLogs((prev) => {
          const next = [...prev, {
            type: 'server',
            text: msg.data.message,
            msgType: msg.data.msgType,
            time: new Date().toLocaleTimeString(),
          }];
          return next.slice(-maxLogs);
        });
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [ws, serverId]);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleSend = (e) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd) return;

    ws?.command(serverId, cmd);
    setLogs((prev) => [...prev, {
      type: 'command',
      text: cmd,
      time: new Date().toLocaleTimeString(),
    }].slice(-maxLogs));

    setHistory((prev) => [cmd, ...prev.filter((h) => h !== cmd)].slice(0, 50));
    setHistoryIdx(-1);
    setCommand('');
  };

  const handleQuickCmd = (cmd) => {
    // If command ends with space, it expects args -- put in input
    if (cmd.endsWith(' ')) {
      setCommand(cmd);
      return;
    }
    ws?.command(serverId, cmd);
    setLogs((prev) => [...prev, {
      type: 'command',
      text: cmd,
      time: new Date().toLocaleTimeString(),
    }].slice(-maxLogs));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      if (history[next]) setCommand(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) { setHistoryIdx(-1); setCommand(''); }
      else { setHistoryIdx(next); setCommand(history[next] || ''); }
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleExportLogs = async () => {
    const text = logs.map((log) => {
      const prefix = log.type === 'command' ? '> ' : log.type === 'response' ? '< ' : '  ';
      return `[${log.time}] ${prefix}${log.text}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Logs copiados para a area de transferencia!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Logs copiados!');
    }
  };

  const getColor = (log) => {
    if (log.type === 'command') return 'text-rust-400';
    if (log.msgType === 'Error') return 'text-red-400';
    if (log.msgType === 'Warning') return 'text-yellow-400';
    if (log.type === 'response') return 'text-green-400';
    return 'text-dark-300';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Console</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-xs px-2 py-1 rounded ${
                autoScroll ? 'bg-green-900/40 text-green-400' : 'bg-dark-700 text-dark-400'
              }`}
            >
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button onClick={handleClearLogs} className="text-dark-400 text-xs active:text-dark-200 px-2 py-1">
              Limpar
            </button>
            <button onClick={handleExportLogs} className="text-dark-400 text-xs active:text-dark-200 px-2 py-1">
              Exportar
            </button>
          </div>
        </div>

        {/* Quick command bar */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
          {QUICK_COMMANDS.map((qc) => (
            <button
              key={qc.cmd}
              onClick={() => handleQuickCmd(qc.cmd)}
              className="shrink-0 px-2.5 py-1 bg-dark-700 rounded text-xs text-dark-300 active:bg-dark-600 active:text-dark-100 whitespace-nowrap"
            >
              {qc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto px-4 font-mono text-xs no-scrollbar" style={{ minHeight: '50vh' }}>
        {logs.length === 0 && (
          <div className="text-center text-dark-500 py-8 text-sm font-sans">
            Console vazio. Envie um comando ou use os atalhos acima.
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`py-0.5 break-all ${getColor(log)}`}>
            <span className="text-dark-600 mr-2">{log.time}</span>
            {log.type === 'command' && <span className="text-dark-500">&gt; </span>}
            {log.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Command input */}
      <form onSubmit={handleSend} className="p-3 bg-dark-900 border-t border-dark-700 flex gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite um comando..."
          className="flex-1 font-mono text-sm"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" className="btn-primary px-4">
          Enviar
        </button>
      </form>
    </div>
  );
}
