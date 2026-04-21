import { useState, useEffect } from 'react';
import { tagsApi } from '../api';

const CARD = {
  background: '#161616',
  borderRadius: '16px',
  padding: '24px',
  border: '1px solid rgba(255,255,255,0.07)',
};

const COLORS = [
  '#22c55e', '#3b82f6', '#ec4899', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#f43f5e'
];

export default function TagsManager() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState({});

  // Form State
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [targetMinutes, setTargetMinutes] = useState(60);
  const [targetType, setTargetType] = useState('daily');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  async function loadTags() {
    try {
      setLoading(true);
      const data = await tagsApi.getAll();
      setTags(data || []);
      
      // Load session grids for each tag
      const grids = {};
      for (const t of data) {
        const sessions = await tagsApi.getSessions(t.id, 30);
        grids[t.id] = sessions;
      }
      setSessionData(grids);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name || targetMinutes <= 0) return;
    setSubmitting(true);
    try {
      await tagsApi.create({ name, color, targetMinutes, targetType });
      setName('');
      setTargetMinutes(60);
      await loadTags();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function renderGrid(tagId) {
    const sessions = sessionData[tagId] || [];
    const tag = tags.find(t => t.id === tagId);
    
    // Group logged minutes by date
    const logMap = {};
    sessions.forEach(s => {
      logMap[s.date] = (logMap[s.date] || 0) + s.minutes_logged;
    });

    const days = [];
    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ date: dateStr, logged: logMap[dateStr] || 0 });
    }

    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '20px', padding: '12px', background: '#0a0a0a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
        {days.map((d, i) => {
          let opacity = 0.15;
          const pct = d.logged / (tag?.target_minutes || 60);
          
          if (d.logged > 0) opacity = 0.3;       // Touched
          if (pct >= 0.5) opacity = 0.6;     // Halfway
          if (pct >= 1.0) opacity = 1.0;     // Target Hit!
          
          return (
            <div
              key={i}
              title={`${d.date}: ${d.logged} mins (Target: ${tag?.target_minutes}m)`}
              style={{
                width: '14px', height: '14px',
                borderRadius: '3px',
                background: d.logged > 0 ? tag.color : '#1f1f1f',
                opacity: d.logged > 0 ? opacity : 1,
                boxShadow: pct >= 1.0 ? `0 0 6px ${tag.color}40` : 'none'
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ padding: '60px 48px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ color: '#ffffff', fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', margin: '0 0 8px 0' }}>Subject Tags</h1>
        <p style={{ color: '#6b7280', fontSize: '15px' }}>Track specific subjects, set goals, and build unbreakable streaks.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'flex-start' }}>
        
        {/* Create Form */}
        <div style={{ ...CARD }}>
          <h3 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Create New Tag</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', marginBottom: '6px' }}>Tag Name (e.g., DSA, Math)</label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Subject name"
                required
                style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>Color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <div 
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '2px solid transparent' }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', marginBottom: '6px' }}>Target Time</label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', paddingRight: '12px' }}>
                  <input 
                    type="number" value={targetMinutes} onChange={e => setTargetMinutes(parseInt(e.target.value))}
                    min="1" required
                    style={{ width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', color: '#fff', fontSize: '15px', outline: 'none' }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>min</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#9ca3af', fontSize: '13px', marginBottom: '6px' }}>Frequency</label>
                <select 
                  value={targetType} onChange={e => setTargetType(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box', appearance: 'none' }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={submitting}
              style={{ marginTop: '8px', background: '#ffffff', color: '#000000', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Creating...' : 'Create Tag'}
            </button>
          </form>
        </div>

        {/* Tags List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
             <div style={{ color: '#6b7280' }}>Loading tags...</div>
          ) : tags.length === 0 ? (
             <div style={{ ...CARD, textAlign: 'center', color: '#6b7280', padding: '40px' }}>No tags created yet. Build something amazing.</div>
          ) : (
            tags.map(tag => (
              <div key={tag.id} style={{ ...CARD }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: tag.color }} />
                    <h3 style={{ color: '#ffffff', fontSize: '20px', fontWeight: 600, margin: 0 }}>{tag.name}</h3>
                    <span style={{ fontSize: '12px', background: '#2d2d2d', color: '#9ca3af', padding: '2px 8px', borderRadius: '12px' }}>
                      {tag.target_minutes}m {tag.target_type}
                    </span>
                  </div>
                  
                  {/* Progress Bar & Streaks */}
                  <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                     
                     {/* Progress Bar (Analytics tag request) */}
                     <div style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tag.target_type === 'daily' ? 'Today' : 'This Week'}</span>
                          <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>{tag.logged_minutes || 0} / {tag.target_minutes}m</span>
                        </div>
                        <div style={{ height: '6px', background: '#000', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.round(((tag.logged_minutes || 0) / tag.target_minutes) * 100))}%`, height: '100%', background: tag.color, borderRadius: '4px' }} />
                        </div>
                     </div>

                     {/* Only display streak if user has successfully started one */}
                     {tag.current_streak > 0 && (
                       <div style={{ display: 'flex', gap: '16px', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                         <div>
                           <div style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Streak</div>
                           <div style={{ color: '#f97316', fontSize: '20px', fontWeight: 700 }}>
                             🔥 {tag.current_streak}
                           </div>
                         </div>
                         <div>
                           <div style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Longest</div>
                           <div style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>{tag.longest_streak}</div>
                         </div>
                       </div>
                     )}
                  </div>
                </div>

                {renderGrid(tag.id, tag)}
                
              </div>
            ))
          )}
        </div>
        
      </div>
    </div>
  );
}
