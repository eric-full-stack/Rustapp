import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../App';
import { api } from '../api';

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'admin', label: 'Admin' },
  { key: 'items', label: 'Items' },
  { key: 'permissions', label: 'Permissoes' },
  { key: 'geral', label: 'Geral' },
];

const DEFAULT_TEMPLATES = [
  { name: 'Server Save', command_template: 'server.save', requires_player: false, category: 'admin', confirm_before: false },
  { name: 'Kick Player', command_template: 'kick {steam_id} "{player_name}"', requires_player: true, category: 'admin', confirm_before: true },
  { name: 'Ban Player', command_template: 'ban {steam_id}', requires_player: true, category: 'admin', confirm_before: true },
  { name: 'Give VIP', command_template: 'oxide.usergroup add {steam_id} vip', requires_player: true, category: 'permissions', confirm_before: false },
  { name: 'Teleport To', command_template: 'teleport.topos {steam_id} 0 100 0', requires_player: true, category: 'geral', confirm_before: false },
  { name: 'Clear Inventory', command_template: 'inventory.clearall {steam_id}', requires_player: true, category: 'items', confirm_before: true },
];

export default function QuickActions({ serverId, players }) {
  const { ws } = useApp();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [executing, setExecuting] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [result, setResult] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [confirmingAction, setConfirmingAction] = useState(null);
  const [playerSearch, setPlayerSearch] = useState('');

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

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return players;
    const q = playerSearch.toLowerCase();
    return players.filter((p) =>
      p.name.toLowerCase().includes(q) || p.steamId.includes(q)
    );
  }, [players, playerSearch]);

  const filteredActions = useMemo(() => {
    if (categoryFilter === 'all') return actions;
    return actions.filter((a) => (a.category || 'geral') === categoryFilter);
  }, [actions, categoryFilter]);

  const executeAction = (action) => {
    // Check if confirmation needed
    if (action.confirm_before && confirmingAction !== action.id) {
      setConfirmingAction(action.id);
      setTimeout(() => setConfirmingAction(null), 5000);
      return;
    }
    setConfirmingAction(null);

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
    if (!confirm('Remover esta acao rapida?')) return;
    await api.deleteQuickAction(id);
    await loadActions();
  };

  const handleAddDefaults = async () => {
    if (!confirm('Adicionar templates padrao? Isso criara 6 acoes rapidas pre-configuradas.')) return;
    try {
      for (const tpl of DEFAULT_TEMPLATES) {
        await api.addQuickAction(tpl);
      }
      await loadActions();
    } catch {
      alert('Erro ao criar templates');
    }
  };

  return (
    <div className="px-4 pb-4">
      <h2 className="text-lg font-bold mb-3">Acoes Rapidas</h2>

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
              <>
                <input
                  placeholder="Buscar jogador..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="w-full mb-2 text-sm"
                />
                <div className="max-h-40 overflow-y-auto space-y-1 no-scrollbar">
                  {filteredPlayers.map((p) => (
                    <button
                      key={p.steamId}
                      onClick={() => { setSelectedPlayer(p); setPlayerSearch(''); }}
                      className="w-full text-left bg-dark-700 rounded px-3 py-2 text-sm active:bg-dark-600"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-dark-400 text-xs ml-2">{p.steamId}</span>
                    </button>
                  ))}
                  {filteredPlayers.length === 0 && (
                    <div className="text-dark-500 text-xs text-center py-2">Nenhum jogador encontrado</div>
                  )}
                </div>
              </>
            )}
            {players.length === 0 && (
              <div className="text-dark-500 text-xs">Nenhum jogador online</div>
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

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              categoryFilter === cat.key
                ? 'bg-rust-600 text-white'
                : 'bg-dark-800 text-dark-400 active:bg-dark-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {filteredActions.map((a) => (
          <div key={a.id} className="card p-0 overflow-hidden">
            <button
              onClick={() => executeAction(a)}
              disabled={executing === a.id}
              className={`w-full p-3 text-left transition-colors disabled:opacity-50 ${
                confirmingAction === a.id
                  ? 'bg-red-900/30 active:bg-red-900/50'
                  : 'active:bg-dark-700'
              }`}
            >
              <div className="font-semibold text-sm truncate">
                {confirmingAction === a.id ? 'Confirmar?' : a.name}
              </div>
              <div className="text-dark-500 text-xs truncate mt-0.5 font-mono">
                {a.command_template}
              </div>
              <div className="flex gap-1 mt-1 flex-wrap">
                {a.requires_player && (
                  <span className="badge bg-blue-900 text-blue-300">Requer jogador</span>
                )}
                {a.category && a.category !== 'geral' && (
                  <span className="badge bg-dark-600 text-dark-300">{a.category}</span>
                )}
                {a.confirm_before && (
                  <span className="badge bg-yellow-900 text-yellow-300">Confirmar</span>
                )}
              </div>
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
          <div className="mb-2">Nenhuma acao rapida cadastrada</div>
          <div className="text-xs text-dark-500 mb-3">
            Crie templates de comandos ou use os templates padrao
          </div>
          <button onClick={handleAddDefaults} className="btn-secondary text-sm px-4">
            Carregar Templates Padrao
          </button>
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
        <div className="flex gap-2">
          <button onClick={() => setShowForm(true)} className="btn-primary flex-1">
            + Nova Acao Rapida
          </button>
          {actions.length > 0 && (
            <button onClick={handleAddDefaults} className="btn-secondary text-sm px-3">
              + Templates
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActionForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [commandTemplate, setCommandTemplate] = useState(initial?.command_template || '');
  const [requiresPlayer, setRequiresPlayer] = useState(initial?.requires_player || false);
  const [category, setCategory] = useState(initial?.category || 'geral');
  const [confirmBefore, setConfirmBefore] = useState(initial?.confirm_before || false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        command_template: commandTemplate,
        requires_player: requiresPlayer,
        category,
        confirm_before: confirmBefore,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <h3 className="font-semibold text-sm">{initial ? 'Editar Acao' : 'Nova Acao Rapida'}</h3>

      <input
        placeholder="Nome da acao"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full"
        required
      />

      <div>
        <input
          placeholder="Comando: kick {steam_id} &quot;{player_name}&quot;"
          value={commandTemplate}
          onChange={(e) => setCommandTemplate(e.target.value)}
          className="w-full font-mono text-sm"
          required
        />
        <div className="text-dark-500 text-xs mt-1">
          Variaveis: {'{steam_id}'}, {'{player_name}'}
        </div>
      </div>

      <div>
        <div className="text-dark-400 text-xs mb-1">Categoria</div>
        <div className="flex gap-1.5 flex-wrap">
          {['admin', 'items', 'permissions', 'geral'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                category === cat
                  ? 'bg-rust-600 text-white'
                  : 'bg-dark-700 text-dark-400 active:bg-dark-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={requiresPlayer}
          onChange={(e) => setRequiresPlayer(e.target.checked)}
          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-rust-500 focus:ring-rust-500"
        />
        <span className="text-sm text-dark-300">Requer selecao de jogador</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmBefore}
          onChange={(e) => setConfirmBefore(e.target.checked)}
          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-rust-500 focus:ring-rust-500"
        />
        <span className="text-sm text-dark-300">Pedir confirmacao antes de executar</span>
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
