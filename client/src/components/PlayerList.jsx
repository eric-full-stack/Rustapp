import React, { useState, useMemo } from 'react';
import { useApp } from '../App';
import { api } from '../api';

const SORT_OPTIONS = [
  { key: 'name', label: 'Nome' },
  { key: 'ping', label: 'Ping' },
  { key: 'time', label: 'Tempo' },
];

export default function PlayerList({ serverId, players }) {
  const { ws } = useApp();
  const [search, setSearch] = useState('');
  const [menuPlayer, setMenuPlayer] = useState(null);
  const [toast, setToast] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [playerNotes, setPlayerNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label || 'Copiado!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(label || 'Copiado!');
    }
  };

  const filtered = useMemo(() => {
    let list = players.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.steamId.includes(search)
    );

    list.sort((a, b) => {
      switch (sortBy) {
        case 'ping': return (a.ping || 0) - (b.ping || 0);
        case 'time': return (b.connectedSeconds || 0) - (a.connectedSeconds || 0);
        default: return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [players, search, sortBy]);

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

  const copyAllPlayers = () => {
    const text = players.map((p) => `${p.name} - ${p.steamId}`).join('\n');
    copyToClipboard(text, 'Lista copiada!');
  };

  const openNotes = async (player) => {
    setNoteModal(player);
    setNoteText('');
    setLoadingNotes(true);
    try {
      const notes = await api.getPlayerNotes(serverId, player.steamId);
      setPlayerNotes(notes);
    } catch {
      setPlayerNotes([]);
    }
    setLoadingNotes(false);
  };

  const saveNote = async () => {
    if (!noteText.trim() || !noteModal) return;
    try {
      await api.addNote(serverId, {
        steam_id: noteModal.steamId,
        player_name: noteModal.name,
        note: noteText.trim(),
      });
      const notes = await api.getPlayerNotes(serverId, noteModal.steamId);
      setPlayerNotes(notes);
      setNoteText('');
      showToast('Nota salva!');
    } catch {
      showToast('Erro ao salvar nota');
    }
  };

  const deleteNote = async (id) => {
    try {
      await api.deleteNote(id);
      setPlayerNotes((prev) => prev.filter((n) => n.id !== id));
      showToast('Nota removida');
    } catch {
      showToast('Erro ao remover');
    }
  };

  return (
    <div className="p-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-dark-700 text-white px-4 py-2 rounded-lg text-sm font-medium z-50 shadow-lg animate-pulse">
          {toast}
        </div>
      )}

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setNoteModal(null)}>
          <div
            className="bg-dark-800 w-full max-w-lg rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm">Notas - {noteModal.name}</h3>
                <div className="text-dark-400 text-xs">{noteModal.steamId}</div>
              </div>
              <button onClick={() => setNoteModal(null)} className="text-dark-400 active:text-dark-200 text-sm px-2">
                Fechar
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Adicionar nota..."
                className="flex-1 text-sm"
              />
              <button onClick={saveNote} className="btn-primary text-xs px-3">
                Salvar
              </button>
            </div>

            {loadingNotes && (
              <div className="text-center text-dark-400 py-4 animate-pulse text-sm">Carregando...</div>
            )}

            {!loadingNotes && playerNotes.length === 0 && (
              <div className="text-center text-dark-500 py-4 text-sm">Nenhuma nota para este jogador</div>
            )}

            <div className="space-y-2">
              {playerNotes.map((n) => (
                <div key={n.id} className="bg-dark-700 rounded-lg p-3">
                  <div className="text-sm text-dark-200 break-words">{n.note}</div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-dark-500 text-xs">
                      {n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : ''}
                    </div>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="text-red-400 text-xs active:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Jogadores ({players.length})</h2>
        <button onClick={copyAllPlayers} className="text-dark-400 text-xs active:text-dark-200">
          Copiar Lista
        </button>
      </div>

      <input
        placeholder="Buscar jogador ou Steam ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      {/* Sort options */}
      <div className="flex gap-2 mb-3">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              sortBy === opt.key
                ? 'bg-rust-600 text-white'
                : 'bg-dark-800 text-dark-400 active:bg-dark-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

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
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{p.name}</span>
                  {(p.violations > 0 || p.violationLevel > 0) && (
                    <span className="badge bg-yellow-900 text-yellow-300 text-[10px] px-1.5 py-0.5">
                      ! {p.violations || p.violationLevel}
                    </span>
                  )}
                </div>
                <div
                  className="text-dark-400 text-xs mt-0.5 cursor-pointer active:text-rust-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(p.steamId, 'Copiado!');
                  }}
                >
                  {p.steamId}
                </div>
                {p.ip && (
                  <div className="text-dark-500 text-[10px] mt-0.5">IP: {p.ip}</div>
                )}
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
                  onClick={() => copyToClipboard(p.steamId, 'Copiado!')}
                  className="btn-secondary text-xs"
                >
                  Copiar ID
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
                  onClick={() => runCommand(`noclip ${p.steamId}`)}
                  className="btn-secondary text-xs"
                >
                  Freeze (Noclip)
                </button>
                <button
                  onClick={() => runCommand(`spectate ${p.steamId}`)}
                  className="btn-secondary text-xs"
                >
                  Spectate
                </button>
                <button
                  onClick={() => runCommand(`inventory.clearall ${p.steamId}`)}
                  className="btn-warn text-xs"
                >
                  Limpar Inventario
                </button>
                <button
                  onClick={() => runCommand(`combatlog ${p.steamId}`)}
                  className="btn-secondary text-xs"
                >
                  CombatLog
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
                <button
                  onClick={() => openNotes(p)}
                  className="btn-primary text-xs col-span-2"
                >
                  Notas do Jogador
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
