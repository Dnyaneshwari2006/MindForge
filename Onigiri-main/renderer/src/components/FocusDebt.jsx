import { useState, useEffect } from 'react';

const API = 'http://localhost:39871';

export default function FocusDebt() {
  const [debt, setDebt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/debt`)
      .then((r) => r.json())
      .then((d) => {
        setDebt(d.debt_minutes || 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[FocusDebt] Fetch error:', err);
        setLoading(false);
      });
  }, []);

  function getColor() {
    if (debt > 30) return 'var(--score-red)';
    if (debt > 10) return 'var(--score-amber)';
    return 'var(--score-green)';
  }

  function getGlow() {
    if (debt > 30) return 'var(--score-red-glow)';
    if (debt > 10) return 'var(--score-amber-glow)';
    return 'var(--score-green-glow)';
  }

  function getSeverity() {
    if (debt > 30) return 'High';
    if (debt > 10) return 'Moderate';
    return 'Low';
  }

  function getEmoji() {
    if (debt > 30) return '🔴';
    if (debt > 10) return '🟡';
    return '🟢';
  }

  const color = getColor();

  return (
    <div className="glass-card p-6 h-full flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 80%, ${getGlow()} 0%, transparent 70%)`,
        }}
      />

      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Focus Debt
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Carry-over cost from incomplete sessions
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Debt number */}
          <div className="text-center mb-4">
            <span className="text-5xl font-black tabular-nums" style={{ color }}>
              {debt}
            </span>
            <span className="text-lg font-medium ml-1" style={{ color: 'var(--text-secondary)' }}>
              min
            </span>
          </div>

          {/* Severity badge */}
          <div
            className="px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: `${color}20`, color }}
          >
            {getEmoji()} {getSeverity()} Debt
          </div>

          {/* Explanation */}
          <div className="w-full space-y-2">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                📊 Carry-over cost from interrupted sessions yesterday
              </p>
            </div>
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(29, 158, 117, 0.08)' }}>
              <p className="text-xs" style={{ color: 'var(--score-green)' }}>
                💡 Complete today's meditation to reduce by 8 minutes
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
