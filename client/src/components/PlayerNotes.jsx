import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function PlayerNotes({ serverId, players }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [steamId, setSteamId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [search, setSearch] = useState('');

  const loadNotes = async () => {
    try {
      const data = await api.getNotes(serverId);
      setNotes(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadNotes(); }, [serverId]);

  const handleAdd = async () => {
    if (!steamId.trim() || !noteText.trim()) return;
    try {
      await api.addNote(serverId, {
        steam_id: steamId.trim(),
        player_name: playerName.trim() || steamId.trim(),
        note: noteText.trim(),
      });
      setNoteText('');
      setSteamId('');
      setPlayerName('');
      setShowAdd(false);
      await loadNotes();
    } catch {
      alert('Erro ao salvar nota');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch { /* ignore */ }
  };

  const selectPlayer = (p) => {
    setSteamId(p.steamId);
    setPlayerName(p.name);
  };

  const filtered = search
    ? notes.filter((n) =>
        (n.player_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.steam_id || '').includes(search) ||
        (n.note || '').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Notas de Jogadores</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs px-3">
          {showAdd ? 'Cancelar' : '+ Nova Nota'}
        </button>
      </div>

      {showAdd && (
        <div className="card mb-4 space-y-2">
          <div className="text-dark-400 text-xs uppercase tracking-wider">Nova Nota</div>
          {players.length > 0 && !steamId && (
            <div className="max-h-32 overflow-y-auto space-y-1 no-scrollbar">
              {players.map((p) => (
                <button
                  key={p.steamId}
                  onClick={() => selectPlayer(p)}
                  className="w-full text-left bg-dark-700 rounded px-3 py-1.5 text-sm active:bg-dark-600"
                >
                  {p.name} <span className="text-dark-400 text-xs">{p.steamId}</span>
                </button>
              ))}
            </div>
          )}
          <input
            placeholder="Steam ID"
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            className="w-full text-sm"
          />
          <input
            placeholder="Nome do jogador"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full text-sm"
          />
          <textarea
            placeholder="Nota..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full text-sm min-h-[60px] bg-dark-700 border border-dark-600 rounded-lg p-2 text-dark-100"
          />
          <button onClick={handleAdd} className="btn-primary w-full text-sm">
            Salvar Nota
          </button>
        </div>
      )}

      <input
        placeholder="Buscar notas..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3"
      />

      {loading && (
        <div className="text-center text-dark-400 py-8 animate-pulse text-sm">Carregando...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-dark-400 py-8 text-sm">Nenhuma nota encontrada</div>
      )}

      <div className="space-y-2">
        {filtered.map((n) => (
          <div key={n.id} className="card">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-sm text-rust-300">{n.player_name || n.steam_id}</div>
              <button
                onClick={() => handleDelete(n.id)}
                className="text-red-400 text-xs active:text-red-300"
              >
                Remover
              </button>
            </div>
            <div className="text-dark-400 text-xs mb-2">{n.steam_id}</div>
            <div className="text-sm text-dark-200 break-words">{n.note}</div>
            {n.created_at && (
              <div className="text-dark-500 text-xs mt-2">
                {new Date(n.created_at).toLocaleString('pt-BR')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
