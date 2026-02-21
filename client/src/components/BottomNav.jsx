import React from 'react';

const tabs = [
  { id: 'overview', label: 'Início', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { id: 'players', label: 'Jogadores', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' },
  { id: 'console', label: 'Console', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'chat', label: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'more', label: 'Mais', icon: 'M4 6h16M4 12h16M4 18h16' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-900 border-t border-dark-700 pb-[env(safe-area-inset-bottom)] z-50">
      <div className="flex max-w-lg mx-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
              active === t.id ? 'text-rust-500' : 'text-dark-400 active:text-dark-200'
            }`}
          >
            <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
