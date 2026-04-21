import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = 'http://localhost:39871';

export default function DeepWorkRamp() {
  const [data, setData] = useState({
    current_target: 20,
    today_best: 0,
    history: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/ramp`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[DeepWorkRamp] Fetch error:', err);
        setLoading(false);
      });
  }, []);

  const progressPercent = data.current_target > 0
    ? Math.min(100, Math.round((data.today_best / data.current_target) * 100))
    : 0;

  const successCount = data.history.filter((d) => d.success).length;
  const untilIncrease = Math.max(0, 3 - successCount);

  // Prepare chart data
  const chartData = data.history.map((d) => ({
    date: d.date?.slice(5) || '',
    achieved: d.achieved || 0,
    target: d.target_minutes || 20,
    success: d.success,
  }));

  return (
    <div className="premium-card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Deep Work Ramp
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Progressive focus training
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700"
        >
          🎯 Target: {data.current_target} min
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</span>
        </div>
      ) : (
        <>
          {/* Today's progress */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Today's best: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{data.today_best} min</span>
              </span>
              <span className="text-xs font-bold" style={{ color: progressPercent >= 100 ? 'var(--score-green)' : 'var(--text-primary)' }}>
                {progressPercent}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden bg-zinc-800">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  background: progressPercent >= 100 ? 'var(--score-green)' : 'var(--text-secondary)'
                }}
              />
            </div>
          </div>

          {/* Weekly history chart */}
          <div className="flex-1 min-h-0 mt-2">
            <span className="text-[10px] font-medium uppercase tracking-wider block mb-2"
              style={{ color: 'var(--text-tertiary)' }}>
              This Week
            </span>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} barGap={4}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--text-primary)',
                  }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="target" radius={[4, 4, 0, 0]} fill="var(--bg-secondary)" />
                <Bar dataKey="achieved" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.success ? 'var(--score-green)' : 'var(--text-tertiary)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tip */}
          <div className="mt-3 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-800">
            <p className="text-[11px] font-medium text-zinc-400">
              {untilIncrease > 0
                ? `${untilIncrease} more success${untilIncrease > 1 ? 'es' : ''} → target increases to ${data.current_target + 5} min`
                : '🎉 Target will increase tomorrow!'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
