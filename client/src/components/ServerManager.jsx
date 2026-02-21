import React, { useState } from 'react';
import { useApp } from '../App';
import { api } from '../api';

function ServerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', host: '', rcon_port: 28016, rcon_password: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input placeholder="Nome do servidor" value={form.name} onChange={set('name')} className="w-full" required />
      <input placeholder="IP / Host" value={form.host} onChange={set('host')} className="w-full" required />
      <div className="flex gap-3">
        <input type="number" placeholder="Porta RCON" value={form.rcon_port} onChange={set('rcon_port')} className="w-1/2" required />
        <input type="password" placeholder="Senha RCON" value={form.rcon_password} onChange={set('rcon_password')} className="w-1/2" required />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>}
      </div>
    </form>
  );
}

export default function ServerManager() {
  const { servers, loadServers, setActiveServer, logout } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleAdd = async (form) => {
    await api.addServer(form);
    await loadServers();
    setShowAdd(false);
  };

  const handleEdit = async (form) => {
    await api.updateServer(editing.id, form);
    await loadServers();
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este servidor?')) return;
    await api.deleteServer(id);
    await loadServers();
  };

  return (
    <div className="min-h-screen p-4 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-rust-500">RUST RCON</h1>
        <button onClick={logout} className="text-dark-400 text-sm active:text-dark-200">Sair</button>
      </div>

      {/* Server list */}
      <div className="space-y-3 mb-4">
        {servers.length === 0 && !showAdd && (
          <div className="card text-center text-dark-400 py-8">
            Nenhum servidor cadastrado.<br />
            <span className="text-sm">Adicione seu primeiro servidor.</span>
          </div>
        )}

        {servers.map((s) => (
          <div key={s.id} className="card">
            {editing?.id === s.id ? (
              <ServerForm
                initial={{ name: s.name, host: s.host, rcon_port: s.rcon_port, rcon_password: '' }}
                onSave={handleEdit}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="flex-1 min-w-0 cursor-pointer active:opacity-70"
                  onClick={() => setActiveServer(s)}
                >
                  <div className="font-semibold truncate">{s.name}</div>
                  <div className="text-dark-400 text-sm truncate">{s.host}:{s.rcon_port}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditing(s)} className="text-dark-400 active:text-dark-200 p-1 text-sm">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="text-red-500 active:text-red-300 p-1 text-sm">
                    Remover
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add server */}
      {showAdd ? (
        <div className="card">
          <h3 className="font-semibold mb-3">Novo Servidor</h3>
          <ServerForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="btn-primary w-full">
          + Adicionar Servidor
        </button>
      )}
    </div>
  );
}
