import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';

export default function Console({ serverId }) {
  const { ws } = useApp();
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
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
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
        <h2 className="text-lg font-bold">Console</h2>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto px-4 font-mono text-xs no-scrollbar" style={{ minHeight: '50vh' }}>
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
