import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, LineChart, Line, Tooltip, PieChart, Pie } from 'recharts';
import { analyticsApi, dashboardApi, tagsApi } from '../api';

const CARD = {
  background: '#111111',
  borderRadius: '14px',
  padding: '24px',
  border: '1px solid rgba(255,255,255,0.06)',
};

const RANGES = [
  { label: 'Today', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

// ─── Mock Data Generators (shown when DB is empty) ───
function genMockStats() {
  return {
    avgFocusScore: 72, totalSessions: 18, totalDeepWorkMin: 246,
    totalProductiveSec: 11400, totalDistractionSec: 3200, totalNeutralSec: 2800,
    currentStreak: 5,
  };
}
function genMockAna() {
  const days = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({ date: d.toISOString().slice(0,10), deepWork: Math.floor(Math.random()*40+10), avgScore: Math.floor(Math.random()*35+55), sessions: Math.floor(Math.random()*4+1) });
  }
  return {
    dailyStats: days,
    bestHours: [{hour:9,avgScore:92},{hour:10,avgScore:88},{hour:14,avgScore:85},{hour:11,avgScore:78},{hour:16,avgScore:72}],
  };
}
function genMockHeatmap() {
  const out = [];
  for (let i = 90; i >= 0; i--) {
    if (Math.random() > 0.35) {
      const d = new Date(Date.now() - i * 86400000);
      out.push({ date: d.toISOString().slice(0,10), avg_score: Math.floor(Math.random()*60+30) });
    }
  }
  return out;
}
function genMockSessions() {
  const goals = ['Study React Hooks','DSA Practice','Read Research Paper','Build UI Component','Math Revision','Physics Notes','ML Assignment'];
  return goals.map((g, i) => ({
    id: `mock-${i}`, goal: g, avg_score: Math.floor(Math.random()*40+55),
    deep_work_minutes: Math.floor(Math.random()*35+10),
    start_time: Date.now() - (i+1)*3600000*3,
  }));
}
function genMockTabs() {
  return [
    {hostname:'github.com',total_seconds:4200,productive_seconds:4200,distraction_seconds:0,neutral_seconds:0,visits:32},
    {hostname:'leetcode.com',total_seconds:3600,productive_seconds:3600,distraction_seconds:0,neutral_seconds:0,visits:18},
    {hostname:'stackoverflow.com',total_seconds:2100,productive_seconds:1800,distraction_seconds:0,neutral_seconds:300,visits:24},
    {hostname:'youtube.com',total_seconds:1800,productive_seconds:600,distraction_seconds:900,neutral_seconds:300,visits:15},
    {hostname:'docs.google.com',total_seconds:1500,productive_seconds:1500,distraction_seconds:0,neutral_seconds:0,visits:8},
    {hostname:'reddit.com',total_seconds:900,productive_seconds:0,distraction_seconds:900,neutral_seconds:0,visits:12},
    {hostname:'chatgpt.com',total_seconds:2400,productive_seconds:2000,distraction_seconds:0,neutral_seconds:400,visits:20},
  ];
}
function genMockTags() {
  return [
    {id:'t1',name:'Data Structures',color:'#a78bfa',target_minutes:60,target_type:'daily',logged_minutes:42},
    {id:'t2',name:'Web Dev',color:'#22c55e',target_minutes:120,target_type:'daily',logged_minutes:95},
    {id:'t3',name:'Mathematics',color:'#f59e0b',target_minutes:300,target_type:'weekly',logged_minutes:210},
  ];
}

function fmtTime(sec) {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreBadge(score) {
  const bg = score >= 70 ? 'rgba(34,197,94,0.15)' : score >= 40 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return { background: bg, color, padding: '3px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, display: 'inline-block' };
}

// ─── Range Selector ───
function RangeSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', background: '#0a0a0a', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.06)' }}>
      {RANGES.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
          background: value === opt.value ? '#1a1a1a' : 'transparent',
          color: value === opt.value ? '#ffffff' : '#6b7280',
          transition: 'all 0.15s',
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

// ─── Focus Score Ring ───
function FocusRing({ score, size = 120 }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score, 100) / 100;
  const offset = circumference * (1 - progress);
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '1px', marginTop: '2px' }}>FOCUS</span>
      </div>
    </div>
  );
}

// ─── Donut Chart ───
function DonutChart({ productive, neutral, distraction }) {
  const total = productive + neutral + distraction;
  if (total === 0) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#6b7280', fontSize: '14px' }}>No time data yet</div>;
  const data = [
    { name: 'Productive', value: productive, color: '#22c55e' },
    { name: 'Neutral', value: neutral, color: '#f59e0b' },
    { name: 'Distraction', value: distraction, color: '#ef4444' },
  ].filter(d => d.value > 0);
  const pPct = Math.round((productive / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} formatter={(v) => fmtTime(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{pPct}%</span>
          <span style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '1px', marginTop: '2px' }}>FOCUS</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>{fmtTime(d.value)}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{d.name}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>Total: {fmtTime(total)}</div>
      </div>
    </div>
  );
}

// ─── LeetCode Heatmap ───
function ContributionHeatmap({ data }) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const today = new Date(); today.setHours(0,0,0,0);
  const dayMs = 86400000;
  const scoreMap = {};
  (data || []).forEach(d => { scoreMap[d.date] = d.avg_score; });
  const startDate = new Date(today.getTime() - 364 * dayMs);
  const gridStart = new Date(startDate.getTime() - startDate.getDay() * dayMs);
  const weeks = [];
  let cur = new Date(gridStart);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const ds = cur.toISOString().slice(0,10);
      week.push({ date: ds, score: cur > today ? null : (scoreMap[ds] || null), isFuture: cur > today });
      cur = new Date(cur.getTime() + dayMs);
    }
    weeks.push(week);
  }
  const months = []; let lm = -1;
  weeks.forEach((w, wi) => { const m = new Date(w[0].date).getMonth(); if (m !== lm) { months.push({ index: wi, label: new Date(w[0].date).toLocaleString('en',{month:'short'}) }); lm = m; } });
  const cc = s => { if (s==null) return '#161616'; if (s>=80) return '#22c55e'; if (s>=60) return '#16a34a'; if (s>=40) return '#15803d'; if (s>=20) return '#166534'; return '#14532d'; };
  const DL = ['','Mon','','Wed','','Fri',''];
  return (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600 }}>Focus Contributions</div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>{data?.length || 0} active days in the past year</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
          <span>Less</span>
          {[null,20,40,60,80].map((v,i) => <div key={i} style={{ width:'12px',height:'12px',borderRadius:'2px',background:cc(v) }} />)}
          <span>More</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '1px', minWidth: 'fit-content' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingRight: '8px', paddingTop: '20px' }}>
            {DL.map((d,i) => <div key={i} style={{ height:'13px',fontSize:'10px',color:'#6b7280',display:'flex',alignItems:'center' }}>{d}</div>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '1px', height: '18px', marginBottom: '2px' }}>
              {weeks.map((_,wi) => { const mo = months.find(m=>m.index===wi); return <div key={wi} style={{ width:'13px',fontSize:'10px',color:'#6b7280',flexShrink:0 }}>{mo?.label||''}</div>; })}
            </div>
            {Array.from({length:7},(_,di) => (
              <div key={di} style={{ display: 'flex', gap: '1px' }}>
                {weeks.map((w,wi) => { const c=w[di]; if(!c||c.isFuture) return <div key={wi} style={{width:'13px',height:'13px'}} />;
                  return <div key={wi} onMouseEnter={()=>setHoveredDay(c.date)} onMouseLeave={()=>setHoveredDay(null)}
                    style={{ width:'13px',height:'13px',borderRadius:'2px',flexShrink:0,background:cc(c.score),cursor:'crosshair',
                      outline:hoveredDay===c.date?'1px solid rgba(255,255,255,0.4)':'none',position:'relative' }}
                    title={c.score!=null?`${c.date}: ${c.score}%`:`${c.date}: No data`} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  MAIN ANALYTICS PAGE
// ═══════════════════════════════════════════

export default function AnalyticsDashboard() {
  const [range, setRange] = useState('week');
  const [stats, setStats] = useState(null);
  const [anaData, setAnaData] = useState(null);
  const [heatData, setHeatData] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tabData, setTabData] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const days = range === 'day' ? 1 : range === 'month' ? 30 : 7;
    Promise.allSettled([
      dashboardApi.stats(range),
      analyticsApi.get(range),
      dashboardApi.heatmap(),
      dashboardApi.sessions(10, 0),
      analyticsApi.tabsDetail(days),
      tagsApi.getAll(),
    ]).then(([sRes, aRes, hRes, sessRes, tabRes, tagRes]) => {
      const s = sRes.status === 'fulfilled' ? sRes.value : null;
      const a = aRes.status === 'fulfilled' ? aRes.value : null;
      const h = hRes.status === 'fulfilled' ? (hRes.value || []) : [];
      const se = sessRes.status === 'fulfilled' ? (sessRes.value?.sessions || []) : [];
      const t = tabRes.status === 'fulfilled' ? (tabRes.value || []) : [];
      const tg = tagRes.status === 'fulfilled' ? (tagRes.value || []) : [];

      // Use real data if available, otherwise fall back to mock data
      const isEmpty = !s || (!s.totalSessions && !s.avgFocusScore && !s.totalDeepWorkMin);
      setStats(isEmpty ? genMockStats() : s);
      setAnaData(!a || !a.dailyStats?.length ? genMockAna() : a);
      setHeatData(h.length === 0 ? genMockHeatmap() : h);
      setSessions(se.length === 0 ? genMockSessions() : se);
      setTabData(t.length === 0 ? genMockTabs() : t);
      setTags(tg.length === 0 ? genMockTags() : tg);
      setLoading(false);
    });
  }, [range]);

  // Chart data from analyticsApi
  const focusWindows = anaData?.bestHours?.slice(0,5).map(h => ({ time: `${h.hour}:00`, score: h.avgScore })) || [];
  const volumeData = anaData?.dailyStats?.slice(-10).map(d => ({ day: d.date?.slice(5)||d.date, v: d.deepWork||0 })) || [];
  const integrityData = anaData?.dailyStats?.map(d => ({ d: d.date?.slice(5)||d.date, v: d.avgScore||0 })) || [];

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', background: '#0a0a0a', scrollBehavior: 'smooth' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 40px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h1 style={{ color: '#ffffff', fontSize: '28px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Analytics</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: '4px 0 0' }}>Your focus performance at a glance.</p>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {/* ROW 1: Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
          <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '20px' }}>
            <FocusRing score={stats?.avgFocusScore || 0} size={90} />
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280' }}>Avg Focus</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', lineHeight: 1, marginTop: '4px' }}>{loading ? '...' : `${stats?.avgFocusScore || 0}%`}</div>
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '12px' }}>Sessions</div>
            <span style={{ fontSize: '40px', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{loading ? '...' : stats?.totalSessions || 0}</span>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '12px' }}>Deep Work</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '40px', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{loading ? '...' : stats?.totalDeepWorkMin || 0}</span>
              <span style={{ fontSize: '16px', color: '#22c55e', fontWeight: 500 }}>min</span>
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '12px' }}>Streak</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '40px', fontWeight: 800, color: '#f97316', lineHeight: 1 }}>{loading ? '...' : stats?.currentStreak || 0}</span>
              <span style={{ fontSize: '22px' }}>🔥</span>
            </div>
          </div>
        </div>

        {/* ROW 2: Donut + Peak Hours */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>TIME DISTRIBUTION</div>
            <DonutChart productive={stats?.totalProductiveSec||0} neutral={stats?.totalNeutralSec||0} distraction={stats?.totalDistractionSec||0} />
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>PEAK FOCUS HOURS</div>
            {focusWindows.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No data yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {focusWindows.map((fw, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#6b7280', fontSize: '13px', width: '42px', flexShrink: 0 }}>{fw.time}</span>
                    <div style={{ flex: 1, height: '28px', background: '#0a0a0a', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(fw.score,100)}%`, height: '100%', background: 'linear-gradient(90deg, #16a34a, #22c55e)', borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600, width: '28px', textAlign: 'right', flexShrink: 0 }}>{fw.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ROW 3: Volume + Focus Trend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>DAILY DEEP WORK</div>
            {volumeData.length === 0 ? <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No data yet</div> : (
              <div style={{ height: '180px' }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={volumeData} barSize={24} margin={{ top: 4, right: 0, bottom: 20, left: -20 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: '6px', fontSize: '12px', color: '#fff' }} />
                    <Bar dataKey="v" radius={[4,4,0,0]}>
                      {volumeData.map((e,i) => <Cell key={i} fill={e.v >= 30 ? '#22c55e' : '#374151'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div style={CARD}>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>FOCUS TREND</div>
            {integrityData.length === 0 ? <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No data yet</div> : (
              <div style={{ height: '180px' }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={integrityData} margin={{ top: 8, right: 20, bottom: 20, left: -20 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="d" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0,100]} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={2.5} dot={{ fill: '#a78bfa', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#a78bfa' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ROW 4: Contribution Heatmap */}
        <div style={{ marginBottom: '20px' }}>
          <ContributionHeatmap data={heatData} />
        </div>

        {/* ROW 5: Recent Sessions */}
        <div style={{ ...CARD, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600 }}>Recent Sessions</div>
            <span style={{ color: '#6b7280', fontSize: '12px' }}>{sessions.length} shown</span>
          </div>
          {sessions.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>No sessions yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 140px', gap: '12px', padding: '8px 12px', fontSize: '11px', color: '#6b7280', letterSpacing: '1px', textTransform: 'uppercase' }}>
                <span>Goal</span><span>Score</span><span>Deep Work</span><span>Date</span>
              </div>
              {sessions.map((s, i) => (
                <div key={s.id||i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 140px', gap: '12px', padding: '10px 12px',
                  borderRadius: '8px', background: i%2===0?'rgba(255,255,255,0.02)':'transparent', fontSize: '14px', color: '#d1d5db', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goal||'Untitled Session'}</span>
                  <span style={scoreBadge(s.avg_score||0)}>{s.avg_score||0}%</span>
                  <span>{s.deep_work_minutes||0}m</span>
                  <span style={{ color: '#9ca3af', fontSize: '13px' }}>{fmtDate(s.start_time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ROW 6: Tab Analytics */}
        {tabData.length > 0 && (
          <div style={{ ...CARD, marginBottom: '20px' }}>
            <div style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Site Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 80px', gap: '8px', padding: '8px 12px', fontSize: '11px', color: '#6b7280', letterSpacing: '1px', textTransform: 'uppercase' }}>
                <span>Site</span><span>Total</span><span>Productive</span><span>Distraction</span><span>Neutral</span><span>Visits</span>
              </div>
              {tabData.slice(0,15).map((site, i) => (
                <div key={site.hostname} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 80px', gap: '8px', padding: '10px 12px',
                  borderRadius: '8px', background: i%2===0?'rgba(255,255,255,0.02)':'transparent', fontSize: '13px', color: '#d1d5db', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.hostname}</span>
                  <span>{fmtTime(site.total_seconds)}</span>
                  <span style={{ color: '#22c55e' }}>{fmtTime(site.productive_seconds)}</span>
                  <span style={{ color: '#ef4444' }}>{fmtTime(site.distraction_seconds)}</span>
                  <span style={{ color: '#f59e0b' }}>{fmtTime(site.neutral_seconds)}</span>
                  <span>{site.visits}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ROW 7: Subject Targets */}
        {tags.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600, marginBottom: '14px' }}>Subject Targets</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {tags.map(tag => {
                const pct = Math.min(100, Math.round(((tag.logged_minutes||0)/tag.target_minutes)*100));
                return (
                  <div key={tag.id} style={{ ...CARD, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{tag.name}</span>
                      <span style={{ color: '#9ca3af', fontSize: '12px' }}>{tag.logged_minutes||0} / {tag.target_minutes}m</span>
                    </div>
                    <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: tag.color||'#22c55e', borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{tag.target_type==='daily'?'Today':'This Week'}</span>
                      {pct>=100 && <span style={{ color: tag.color||'#22c55e', fontWeight: 600 }}>Done ✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
