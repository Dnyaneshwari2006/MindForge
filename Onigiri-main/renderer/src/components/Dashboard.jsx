import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, scoreToHeatColor, tagsApi, matrixApi } from '../api';

function useSplineScript() {
  useEffect(() => {
    if (!document.querySelector('script[src*="spline-viewer"]')) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://unpkg.com/@splinetool/viewer@1.12.70/build/spline-viewer.js';
      document.head.appendChild(s);
    }
  }, []);
}

// Placeholder for heatmapDataToMatrix if not imported or defined elsewhere
// This function is referenced in the provided code snippet, so it needs to exist.
// Assuming it transforms raw heatmap data into a structured matrix.
const heatmapDataToMatrix = (data) => {
  // Implement actual transformation logic based on your API response
  // For now, a simple placeholder that returns an empty array or processes minimally
  if (!Array.isArray(data)) return [];
  // Example: Group by day or week, then by quadrant
  return data.map(item => ({
    ...item,
    // Add any matrix-specific properties here
  }));
};


export default function Dashboard() {
  const navigate = useNavigate();
  useSplineScript();

  const [ramp, setRamp] = useState(null);
  const [debt, setDebt] = useState(null);
  const [matrix, setMatrix] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tags, setTags] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const [rampRes, debtRes, heatRes, sumRes, tagsRes, tasksRes] = await Promise.allSettled([
        dashboardApi.ramp(),
        dashboardApi.debt(),
        dashboardApi.heatmap(),
        dashboardApi.summary(),
        tagsApi.getAll(),
        matrixApi.getTasks(),
      ]);
      if (rampRes.status === 'fulfilled') setRamp(rampRes.value);
      if (debtRes.status === 'fulfilled') setDebt(debtRes.value);
      if (heatRes.status === 'fulfilled' && Array.isArray(heatRes.value) && heatRes.value.length > 0) {
        setMatrix(heatmapDataToMatrix(heatRes.value));
      }
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
      if (tagsRes.status === 'fulfilled') setTags(tagsRes.value || []);
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value || []);
    };

    fetchData();
  }, []);

  const habDone = summary?.habitsCompleted || 0;
  const habTotal = summary?.habitsTotal || 3;
  const pct = summary?.avgScore ? `${summary.avgScore}%` : '--';

  const focusList = tasks.filter(t => (t.quadrant === 'do_first' || t.quadrant === 'schedule') && !t.completed);

  return (
    <div style={{ width: '100%', height: '100vh', overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth' }}>

      {/* ── HERO ── */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '80px', minHeight: '100vh', width: '100%', position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#000000' }}>
        <div style={{ flex: '0 0 auto', maxWidth: '560px', paddingRight: '40px', zIndex: 10 }}>
          <h1 style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-2px', margin: '0 0 24px 0' }}>
            Design your<br />own focus
          </h1>
          <p style={{ fontSize: '16px', color: '#9ca3af', fontWeight: 400, lineHeight: 1.6, margin: '0 0 40px 0' }}>
            We build systems that process data at the speed of thought.<br />
            Fast, adaptive, and built to scale with the world.
          </p>
          <button onClick={() => navigate('/session')}
            style={{ background: '#ffffff', color: '#000000', borderRadius: '50px', padding: '14px 32px', fontSize: '16px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Get Started
          </button>

          {/* Today's Focus List */}
          <div style={{ marginTop: '40px', color: '#ffffff' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Today's Focus List</h2>
            {focusList.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {focusList.map(task => (
                  <li key={task.id} style={{ marginBottom: '10px', fontSize: '18px' }}>
                    {task.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: '16px', color: '#9ca3af' }}>No priority tasks for today. Great job!</p>
            )}
          </div>
        </div>
        <div style={{ flex: '0 0 55%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
          {/* @ts-ignore */}
          <spline-viewer url="https://prod.spline.design/Nv3Hgrs9DL1kFEb1/scene.splinecode" style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '220px', height: '60px', background: '#000000', zIndex: 20 }} />
        </div>
      </div>

    </div>
  );
}
