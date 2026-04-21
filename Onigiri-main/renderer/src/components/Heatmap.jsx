import { useState, useEffect } from 'react';
import { dashboardApi } from '../api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cellColor(score) {
  if (score === null || score === undefined) return '#161616';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#16a34a';
  if (score >= 40) return '#15803d';
  if (score >= 20) return '#166534';
  return '#14532d';
}

export default function Heatmap() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState(null);

  useEffect(() => {
    dashboardApi.heatmap()
      .then(d => { setData(d || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Build 365-day contribution grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  const scoreMap = {};
  data.forEach(d => { scoreMap[d.date] = d.avg_score; });

  const startDate = new Date(today.getTime() - 364 * dayMs);
  const startDay = startDate.getDay();
  const gridStart = new Date(startDate.getTime() - startDay * dayMs);

  const weeks = [];
  let current = new Date(gridStart);
  while (current <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().slice(0, 10);
      const isFuture = current > today;
      week.push({ date: dateStr, score: isFuture ? null : (scoreMap[dateStr] || null), isFuture });
      current = new Date(current.getTime() + dayMs);
    }
    weeks.push(week);
  }

  const months = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const d = new Date(week[0].date);
    const m = d.getMonth();
    if (m !== lastMonth) {
      months.push({ index: wi, label: d.toLocaleString('en', { month: 'short' }) });
      lastMonth = m;
    }
  });

  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div style={{ background: '#111111', borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: 0 }}>Focus Matrix</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>Density map of sustained concentration over the year.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280', letterSpacing: '1px' }}>
          <span>LESS</span>
          {[null, 20, 40, 60, 80].map((v, i) => (
            <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: cellColor(v) }} />
          ))}
          <span>MORE</span>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#6b7280', fontSize: '14px' }}>Syncing matrix data...</div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '1px', minWidth: 'fit-content' }}>
            {/* Day labels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingRight: '8px', paddingTop: '20px' }}>
              {DAY_LABELS.map((d, i) => (
                <div key={i} style={{ height: '13px', fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Month labels */}
              <div style={{ display: 'flex', gap: '1px', height: '18px', marginBottom: '2px' }}>
                {weeks.map((_, wi) => {
                  const month = months.find(m => m.index === wi);
                  return <div key={wi} style={{ width: '13px', fontSize: '10px', color: '#6b7280', flexShrink: 0 }}>{month?.label || ''}</div>;
                })}
              </div>
              {/* Grid rows */}
              {Array.from({ length: 7 }, (_, dayIdx) => (
                <div key={dayIdx} style={{ display: 'flex', gap: '1px' }}>
                  {weeks.map((week, wi) => {
                    const cell = week[dayIdx];
                    if (!cell || cell.isFuture) return <div key={wi} style={{ width: '13px', height: '13px' }} />;
                    const isHovered = hoveredDay === cell.date;
                    return (
                      <div key={wi}
                        onMouseEnter={() => setHoveredDay(cell.date)}
                        onMouseLeave={() => setHoveredDay(null)}
                        style={{
                          width: '13px', height: '13px', borderRadius: '2px', flexShrink: 0,
                          background: cellColor(cell.score), cursor: 'crosshair',
                          outline: isHovered ? '1px solid rgba(255,255,255,0.4)' : 'none',
                          transition: 'transform 0.1s',
                          transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                          zIndex: isHovered ? 10 : 1,
                          position: 'relative',
                        }}
                        title={cell.score !== null ? `${cell.date}: ${cell.score}%` : `${cell.date}: No data`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
