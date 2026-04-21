import { useState, useEffect } from 'react';

const API = 'http://localhost:39871';

export default function DailySummary() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/summary/today`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="premium-card p-6 h-full flex items-center justify-center">
        <div className="animate-pulse text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading today...</div>
      </div>
    );
  }

  const tiles = [
    { label: 'Sessions', value: data.totalSessions, icon: '🎯', color: 'var(--text-primary)' },
    { label: 'Deep Work', value: `${data.totalDeepWork}m`, icon: '🧠', color: 'var(--score-green)' },
    { label: 'Avg Score', value: data.avgScore || '—', icon: '⚡', color: 'var(--score-amber)' },
    { label: 'Habits', value: `${data.habitsCompleted}/${data.habitsTotal}`, icon: '✅', color: data.habitsCompleted === data.habitsTotal ? 'var(--score-green)' : 'var(--text-secondary)' },
  ];

  return (
    <div className="premium-card p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Today's Summary
        </h3>
        {data.streak > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--score-green)', color: 'black' }}>
            🔥 {data.streak} day streak
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t, i) => (
          <div
            key={i}
            className="rounded-lg p-3 flex items-center gap-3 transition-colors"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <span className="text-xl">{t.icon}</span>
            <div>
              <span className="text-lg font-bold tabular-nums block" style={{ color: t.color, lineHeight: 1.2 }}>
                {t.value}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                {t.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
