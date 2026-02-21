import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../App';
import { api } from '../api';

export default function QuickActions({ serverId, players }) {
  const { ws } = useApp();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [executing, setExecuting] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [result, setResult] = useState(null);

  const loadActions = useCallback(async () => {
    try {
      const data = await api.getQuickActions();
      setActions(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadActions(); }, [loadActions]);

  // Listen for command results
  useEffect(() => {
    if (!ws) return;
    return ws.on('command_result', (msg) => {
      if (msg.serverId !== serverId) return;
      setResult({ command: msg.data.command, response: msg.data.response, type: msg.data.msgType });
      setTimeout(() => setResult(null), 5000);
    });
  }, [ws, serverId]);

  const executeAction = (action) => {
    let cmd = action.command_template;

    if (action.requires_player) {
      if (!selectedPlayer) {
        alert('Selecione um jogador primeiro');
        return;
      }
      cmd = cmd.replace(/\{steam_id\}/g, selectedPlayer.steamId);
      cmd = cmd.replace(/\{player_name\}/g, selectedPlayer.name);
    }

    setExecuting(action.id);
    ws?.command(serverId, cmd);
    setTimeout(() => setExecuting(null), 2000);
  };

  const handleSave = async (formData) => {
    if (editing) {
      await api.updateQuickAction(editing.id, formData);
    } else {
      await api.addQuickAction(formData);
    }
    await loadActions();
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover esta ação rápida?')) return;
    await api.deleteQuickAction(id);
    await loadActions();
  };

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-bold mb-3">Ações Rápidas</h2>

      {/* Player selector */}
      <div className="card mb-4">
        <div className="text-dark-400 text-xs uppercase tracking-wider mb-2">Jogador Selecionado</div>
        {selectedPlayer ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">{selectedPlayer.name}</div>
              <div className="text-dark-400 text-xs">{selectedPlayer.steamId}</div>
            </div>
            <button onClick={() => setSelectedPlayer(null)} className="text-dark-400 text-xs active:text-dark-200">
              Limpar
            </button>
          </div>
        ) : (
          <div>
            <div className="text-dark-500 text-sm mb-2">Nenhum jogador selecionado (opcional)</div>
            {players.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 no-scrollbar">
                {players.map((p) => (
                  <button
                    key={p.steamId}
                    onClick={() => setSelectedPlayer(p)}
                    className="w-full text-left bg-dark-700 rounded px-3 py-2 text-sm active:bg-dark-600"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-dark-400 text-xs ml-2">{p.steamId}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${
          result.type === 'Error' ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'
        }`}>
          <div className="text-xs text-dark-400 mb-1">{result.command}</div>
          <div className="break-all">{result.response}</div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {actions.map((a) => (
          <div key={a.id} className="card p-0 overflow-hidden">
            <button
              onClick={() => executeAction(a)}
              disabled={executing === a.id}
              className="w-full p-3 text-left active:bg-dark-700 transition-colors disabled:opacity-50"
            >
              <div className="font-semibold text-sm truncate">{a.name}</div>
              <div className="text-dark-500 text-xs truncate mt-0.5 font-mono">
                {a.command_template}
              </div>
              {a.requires_player ? (
                <div className="badge bg-blue-900 text-blue-300 mt-1">Requer jogador</div>
              ) : null}
            </button>
            <div className="flex border-t border-dark-700">
              <button
                onClick={() => { setEditing(a); setShowForm(true); }}
                className="flex-1 py-1.5 text-xs text-dark-400 active:bg-dark-700"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                className="flex-1 py-1.5 text-xs text-red-400 active:bg-dark-700 border-l border-dark-700"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="text-center text-dark-400 py-4 animate-pulse text-sm">Carregando...</div>
      )}

      {!loading && actions.length === 0 && !showForm && (
        <div className="card text-center text-dark-400 py-6 mb-4">
          <div className="mb-2">Nenhuma ação rápida cadastrada</div>
          <div className="text-xs text-dark-500">
            Crie templates de comandos como:<br />
            <code className="text-dark-300">addkill igris {'{'+'steam_id'+'}'} 10000</code>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <ActionForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      ) : (
        <button onClick={() => setShowForm(true)} className="btn-primary w-full">
          + Nova Ação Rápida
        </button>
      )}
    </div>
  );
}

function ActionForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [commandTemplate, setCommandTemplate] = useState(initial?.command_template || '');
  const [requiresPlayer, setRequiresPlayer] = useState(initial?.requires_player || false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, command_template: commandTemplate, requires_player: requiresPlayer });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <h3 className="font-semibold text-sm">{initial ? 'Editar Ação' : 'Nova Ação Rápida'}</h3>

      <input
        placeholder="Nome da ação"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full"
        required
      />

      <div>
        <input
          placeholder="Comando: addkill igris {steam_id} 10000"
          value={commandTemplate}
          onChange={(e) => setCommandTemplate(e.target.value)}
          className="w-full font-mono text-sm"
          required
        />
        <div className="text-dark-500 text-xs mt-1">
          Variáveis: {'{steam_id}'}, {'{player_name}'}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={requiresPlayer}
          onChange={(e) => setRequiresPlayer(e.target.checked)}
          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-rust-500 focus:ring-rust-500"
        />
        <span className="text-sm text-dark-300">Requer seleção de jogador</span>
      </label>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
