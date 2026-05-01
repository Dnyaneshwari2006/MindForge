import { useState, useEffect, useCallback, useRef } from 'react';
import { sessionApi, useWebSocket, aiApi, systemApi, djangoApi, tagsApi, matrixApi, IS_DEMO_MODE } from '../api';
import useVisibilityTracker from '../hooks/useVisibilityTracker';
import FocusPiP from './FocusPiP';
import FocusOverlay from './FocusOverlay';
import BlocklistManager from './BlocklistManager';
import { getBlocklist } from './BlocklistManager';

/* ─── Browser-side LAN IP detection (fallback when Express isn't available) ── */
async function detectLanIp() {
  // Method 1: Try the Express backend endpoint
  try {
    const info = await systemApi.networkInfo();
    if (info?.preferred && info.preferred !== 'localhost') return info.preferred;
  } catch (_) {}

  // Method 2: WebRTC-based local IP detection
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => { pc.close(); resolve(null); }, 3000);
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const parts = e.candidate.candidate.split(' ');
        const ip = parts[4];
        if (ip && !ip.includes(':') && ip !== '0.0.0.0' && !ip.startsWith('127.')) {
          clearTimeout(timeout);
          pc.close();
          resolve(ip);
        }
      };
    });
  } catch (_) {}

  // Method 3: Use the hostname the browser is connected to (if not localhost)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.hostname;
  }

  return null;
}
/* ─── CSS animations ─────────────────────────────────── */
const SPINNER_CSS = `
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`;

/* ─── App icons ──────────────────────────────────────── */
const APP_ICON_CFG = {
  chrome:    { bg: '#4285f4' },
  firefox:   { bg: '#ff6611' },
  instagram: { bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366)' },
  twitter:   { bg: '#1da1f2' },
  whatsapp:  { bg: '#25d366' },
  reddit:    { bg: '#ff4500' },
  youtube:   { bg: '#ff0000' },
  vscode:    { bg: '#0078d4' },
  screen:    { bg: '#22c55e' },
  blue:      { bg: '#3b82f6' },
};

function AppIcon({ app }) {
  const key = Object.keys(APP_ICON_CFG).find(k => (app || '').toLowerCase().includes(k)) || 'screen';
  const cfg = APP_ICON_CFG[key];
  const letter = (app || '?')[0].toUpperCase();
  return (
    <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: cfg.bg, color: '#fff', fontWeight: 700, fontSize: '14px' }}>
      {letter}
    </div>
  );
}

/* ─── Timeline icon ──────────────────────────────────── */
function TlIcon({ category }) {
  if (category === 'productive') return (
    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
  );
  if (category === 'distraction') return (
    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#450a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
  );
  return (
    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#451a03', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: '11px', color: '#f59e0b' }}>⚠</span>
    </div>
  );
}

/* ─── Shared card style ──────────────────────────────── */
const CARD = { background: '#111111', borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.08)' };

/* ═══════════════════════════════════════════════════════
   STATE 1 — Initialize Core
   ═══════════════════════════════════════════════════════ */
function InitPage({ goal, setGoal, mode, setMode, apps, setApps, tagId, setTagId, tags, focusTasks, selectedTaskId, setSelectedTaskId, blocklist, setBlocklist, onBoot, booting }) {
  const [newApp, setNewApp] = useState('');
  const [aiChecking, setAiChecking] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  async function addApp() {
    const name = newApp.trim();
    if (!name) return;
    setAiChecking(true);
    setAiMsg('');
    try {
      const result = await aiApi.validateApp(name);
      if (result.isProductive) {
        setApps(p => [...p, name]);
        setAiMsg(`✓ ${name} allowed — ${result.reason}`);
      } else {
        setAiMsg(`✗ ${name} blocked — ${result.reason}`);
      }
    } catch {
      setApps(p => [...p, name]); // fallback allow on API error
    }
    setNewApp('');
    setAiChecking(false);
    setTimeout(() => setAiMsg(''), 4000);
  }

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000', display: 'flex', alignItems: 'center', paddingLeft: '80px', boxSizing: 'border-box' }}>
      <div style={{ width: '540px', ...CARD }}>
        <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: '0 0 28px 0' }}>Initialize Core</h2>

        <label style={{ color: '#6b7280', fontSize: '14px', display: 'block', marginBottom: '8px' }}>Main objective...</label>
        {focusTasks && focusTasks.length > 0 && (
          <select 
            value={selectedTaskId || ''} 
            onChange={e => {
              const id = e.target.value;
              setSelectedTaskId(id);
              if (id) {
                const t = focusTasks.find(x => x.id === id);
                if (t) setGoal(t.title);
              } else {
                setGoal('');
              }
            }}
            style={{ width: '100%', height: '48px', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px', padding: '0 16px', color: '#fff', fontSize: '15px', outline: 'none', appearance: 'none', cursor: 'pointer', marginBottom: '12px' }}
          >
            <option value="">-- Custom Goal --</option>
            {focusTasks.map(t => (
              <option key={t.id} value={t.id}>{t.title} ({t.quadrant === 'do_first' ? 'Do First' : 'Schedule'})</option>
            ))}
          </select>
        )}
        <input value={goal} onChange={e => { setGoal(e.target.value); setSelectedTaskId(''); }} placeholder="What will you work on?"
          style={{ width: '100%', height: '48px', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px', padding: '0 16px', color: '#fff', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />

        <label style={{ color: '#9ca3af', fontSize: '14px', display: 'block', marginTop: '20px', marginBottom: '10px' }}>Focus Intensity:</label>
        <div style={{ display: 'flex', background: '#1a1a1a', borderRadius: '10px', padding: '4px', border: '1px solid #2d2d2d', height: '48px' }}>
          {[['Basic (Warm)', 'basic'], ['Exam (Kill)', 'exam']].map(([l, v]) => (
            <button key={v} onClick={() => setMode(v)}
              style={{ flex: 1, background: mode === v ? '#374151' : 'transparent', color: mode === v ? '#fff' : '#6b7280', fontSize: '14px', fontWeight: mode === v ? 500 : 400, border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>

        <label style={{ color: '#9ca3af', fontSize: '14px', display: 'block', marginTop: '20px', marginBottom: '10px' }}>Subject Tag (Optional):</label>
        <select value={tagId || ''} onChange={e => setTagId(e.target.value || null)}
          style={{ width: '100%', height: '48px', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px', padding: '0 16px', color: '#fff', fontSize: '15px', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
          <option value="">-- No specific tag --</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.target_minutes}m/{t.target_type})</option>
          ))}
        </select>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', marginBottom: '10px' }}>
          <label style={{ color: '#9ca3af', fontSize: '14px' }}>Permit apps:</label>
          {aiChecking && <span style={{ fontSize: '12px', color: '#6366f1' }}>Checking with AI...</span>}
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', minHeight: '48px' }}>
          {apps.map((a, i) => (
            <span key={i} style={{ background: '#2d2d2d', borderRadius: '6px', padding: '4px 10px', color: '#fff', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {a}
              <span onClick={() => setApps(p => p.filter((_, j) => j !== i))} style={{ color: '#6b7280', cursor: 'pointer', fontSize: '12px' }}>✕</span>
            </span>
          ))}
          <input value={newApp} onChange={e => setNewApp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addApp()}
            placeholder="e.g. figma"
            style={{ flex: 1, minWidth: '80px', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px' }} />
          <button onClick={addApp} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>+ Add</button>
        </div>
        {aiMsg && <p style={{ fontSize: '12px', marginTop: '6px', color: aiMsg.startsWith('✓') ? '#22c55e' : '#ef4444' }}>{aiMsg}</p>}
        <p style={{ color: '#4b5563', fontSize: '13px', margin: '6px 0 0 0' }}>AI validates if each app is productive</p>

        {/* Blocklist — self-declared distracting sites */}
        <BlocklistManager blocklist={blocklist} setBlocklist={setBlocklist} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px' }}>
          <button onClick={onBoot} disabled={!goal.trim() || booting}
            style={{ background: booting ? '#374151' : '#fff', color: booting ? '#9ca3af' : '#000', borderRadius: '10px', padding: '12px 28px', fontSize: '15px', fontWeight: 600, border: 'none', cursor: booting ? 'not-allowed' : 'pointer' }}>
            {booting ? 'Starting...' : 'Boot Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STATE 2 — QR Waiting (waiting for phone connection)
   ═══════════════════════════════════════════════════════ */
function QrWaitPage({ sessionId, djangoSessionId, pwaUrl, goal, mode, pcIp, onConnected, onCancel }) {
  const [dots, setDots] = useState('');
  const [phoneConnected, setPhoneConnected] = useState(false);

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);

  // WebSocket: listen for phone connection from BOTH Express and Django bridge
  // - phone_connected: direct Express WS event
  // - mobile_connected_notification: fired by Django consumer, bridged by Express
  useWebSocket(useCallback((msg) => {
    if (
      msg.type === 'phone_connected' ||
      msg.type === 'mobile_connected_notification' ||
      msg.type === 'mobile_connected'
    ) {
      setPhoneConnected(true);
      setTimeout(() => onConnected(), 1000);
    }
  }, [onConnected]));

  // QR encodes the Django PWA URL directly (already has real network IP)
  const qrImgUrl = pwaUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pwaUrl)}`
    : null;

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '480px', width: '100%' }}>

        {/* Status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', border: `1px solid ${phoneConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '50px', padding: '8px 20px', marginBottom: '40px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: phoneConnected ? '#22c55e' : '#f59e0b', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '14px', color: phoneConnected ? '#22c55e' : '#f59e0b', fontWeight: 500 }}>
            {phoneConnected ? '✓ Phone connected! Starting session...' : `Waiting for phone connection${dots}`}
          </span>
        </div>

        {/* QR Card */}
        <div style={{ ...CARD, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 48px' }}>
          <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 700, margin: '0 0 8px 0', textAlign: 'center' }}>Session QR Code</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 32px 0', textAlign: 'center' }}>
            Scan on your phone to link it with this session.<br/>Session starts automatically once phone connects.
          </p>

          {/* QR code */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 0 40px rgba(99,102,241,0.15)' }}>
            {qrImgUrl ? (
              <img src={qrImgUrl} alt="Session QR" style={{ width: '200px', height: '200px', display: 'block' }} />
            ) : (
              <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                </svg>
              </div>
            )}
          </div>

          {/* Show the actual URL so user can verify it's the network IP */}
          {pwaUrl && (
            <div style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace', textAlign: 'center', marginBottom: '20px', wordBreak: 'break-all', padding: '6px 10px', background: '#0a0a0a', borderRadius: '6px', border: '1px solid #1f2937' }}>
              {pwaUrl}
            </div>
          )}

          {/* Session info */}
          <div style={{ width: '100%', background: '#1a1a1a', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#6b7280', fontSize: '13px' }}>Objective</span>
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal || '(not set)'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#6b7280', fontSize: '13px' }}>Intensity</span>
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>{mode === 'exam' ? 'Exam (Kill)' : 'Basic (Warm)'}</span>
            </div>
            {djangoSessionId && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280', fontSize: '13px' }}>Session Code</span>
                <span style={{ color: '#22c55e', fontSize: '14px', fontFamily: 'monospace', fontWeight: 700 }}>{djangoSessionId}</span>
              </div>
            )}
          </div>

          <button onClick={onCancel}
            style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '14px', cursor: 'pointer' }}>
            ← Cancel session
          </button>
        </div>

        <p style={{ color: '#374151', fontSize: '12px', marginTop: '20px', textAlign: 'center' }}>
          Open MindForge PWA on your phone and scan to connect.
        </p>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   STATE 3 — Active Session
   ═══════════════════════════════════════════════════════ */
function ActivePage({ sessionId, djangoSessionId, pwaUrl, goal, mode, pcIp, onEnd, visibilityData, wsSend }) {
  const [elapsed, setElapsed] = useState(0);
  const [focusScore, setFocusScore] = useState(null);
  const [avgScore, setAvgScore] = useState(null);
  const [events, setEvents] = useState([]);           // live activity audit
  const [breakdown, setBreakdown] = useState({ productive: 0, distraction: 0, idle: 0 });
  const [ending, setEnding] = useState(false);
  const [paused, setPaused] = useState(false);
  const [breakCount, setBreakCount] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0); // seconds into current break
  const BREAK_MAX = 20 * 60; // 20 minutes in seconds
  const statusInterval = useRef(null);
  const phoneBackgroundSinceRef = useRef(null);
  const alertedPhoneBackgroundRef = useRef(false);
  const lastDesktopCategoryRef = useRef('neutral');

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Count up elapsed time (only when NOT paused) and check phone background status
  useEffect(() => {
    const t = setInterval(() => {
      if (!paused) {
        setElapsed(s => s + 1);

        // Check if phone has been in the background for > 1 minute
        if (phoneBackgroundSinceRef.current && !alertedPhoneBackgroundRef.current) {
          if (Date.now() - phoneBackgroundSinceRef.current > 60000) {
            if (lastDesktopCategoryRef.current !== 'productive') {
              alertedPhoneBackgroundRef.current = true;
              fetch('http://localhost:39871/desktop-notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: 'Phone Distraction Detected 🚨',
                  message: 'Your phone has been in the background for over a minute! Please return to the Focus Room.'
                })
              }).catch(() => {});
            }
          }
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [paused]);

  // Break countdown timer — auto-resume after 20 min
  useEffect(() => {
    if (!paused) { setBreakElapsed(0); return; }
    const t = setInterval(() => {
      setBreakElapsed(prev => {
        const next = prev + 1;
        if (next >= BREAK_MAX) {
          handleResume(); // auto-resume
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused]);

  // Pause / Resume handlers
  async function handlePause() {
    try {
      const res = await sessionApi.pause();
      if (res.ok) {
        setPaused(true);
        setBreakCount(res.breakCount);
        setBreakElapsed(0);
      }
    } catch (e) { console.warn('[Session] Pause failed:', e.message); }
  }

  async function handleResume() {
    try {
      const res = await sessionApi.resume();
      if (res.ok) {
        setPaused(false);
        setBreakElapsed(0);
      }
    } catch (e) { console.warn('[Session] Resume failed:', e.message); }
  }

  // Poll /session/status every 5s for real scores
  useEffect(() => {
    async function pollStatus() {
      try {
        const status = await sessionApi.status();
        if (status.active) {
          setAvgScore(status.avgScore ?? null);
          setFocusScore(status.lastScore ?? null);
          if (status.breakdown) setBreakdown(status.breakdown);
        }
      } catch (_) {}
    }
    pollStatus();
    statusInterval.current = setInterval(pollStatus, 5000);
    return () => clearInterval(statusInterval.current);
  }, []);

  // WebSocket: live score + event feed
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'score_update') {
      setFocusScore(msg.score);
    }
    if (msg.type === 'event' || msg.type === 'phone_event' || msg.type === 'session_event' || msg.type === 'raw_mobile_signal' || msg.type === 'distraction_alert') {
      const ts = new Date(msg.timestamp || Date.now());
      const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      let appName = msg.app || msg.appName || 'Unknown';
      let cat = msg.category || 'neutral';
      let src = msg.source || 'desktop';

      if (src === 'desktop' && cat) {
        lastDesktopCategoryRef.current = cat;
      }

      if (msg.type === 'raw_mobile_signal') {
        appName = msg.signal_type || 'Phone';
        src = 'phone';
        
        if (msg.signal_type === 'pwa_foregrounded') {
          cat = 'productive';
          phoneBackgroundSinceRef.current = null;
          alertedPhoneBackgroundRef.current = false;
        } else if (msg.signal_type === 'pwa_backgrounded') {
          cat = 'distraction';
          phoneBackgroundSinceRef.current = Date.now();
          alertedPhoneBackgroundRef.current = false;
        } else if (msg.signal_type === 'phone_picked_up') {
          cat = 'distraction';
        } else if (msg.signal_type === 'phone_put_down') {
          cat = 'productive';
        }
      } else if (msg.type === 'distraction_alert') {
        appName = msg.alert_type || 'Phone Distraction';
        cat = 'distraction';
        src = 'phone';
      } else if (msg.type === 'device_disconnected' && msg.device === 'mobile') {
        appName = 'Phone Disconnected';
        cat = 'distraction';
        src = 'phone';
        // Treat disconnection as backgrounded to trigger the 1-minute alert
        if (!phoneBackgroundSinceRef.current) {
          phoneBackgroundSinceRef.current = Date.now();
          alertedPhoneBackgroundRef.current = false;
        }
      }

      setEvents(prev => [{
        app: appName,
        category: cat,
        source: src,
        time: timeStr,
        timestamp: msg.timestamp || Date.now(),
        reason: msg.reason || null,
      }, ...prev].slice(0, 20)); // keep last 20
    }
    if (msg.type === 'session_event' && msg.breakdown) {
      setBreakdown(msg.breakdown);
    }
  }, []));

  async function handleEnd() {
    setEnding(true);
    try { await sessionApi.end(); } catch (_) {}
    onEnd();
  }

  // Elapsed time display
  const hh = Math.floor(elapsed / 3600);
  const mm = Math.floor((elapsed % 3600) / 60);
  const ss = elapsed % 60;
  const timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

  // Productive time bar proportions
  const totalBd = (breakdown.productive || 0) + (breakdown.distraction || 0) + (breakdown.idle || 0);
  const pActive = totalBd > 0 ? Math.round((breakdown.productive / totalBd) * 100) : 60;
  const pDistracted = totalBd > 0 ? Math.round((breakdown.distraction / totalBd) * 100) : 25;
  const pInactive = totalBd > 0 ? Math.round((breakdown.idle / totalBd) * 100) : 15;

  const activeMin = Math.round((breakdown.productive || 0) / 60);
  const displayScore = avgScore ?? focusScore ?? '--';

  const djangoHost = pcIp || window.location.hostname;
  const qrUrl = pwaUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pwaUrl)}`
    : `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`http://${djangoHost}:8000/join?session=${djangoSessionId || 'ACTIVE'}`)}`;

  return (
    <div style={{ width: '100%', background: '#000', animation: 'fadeIn 0.3s ease' }}>

      {/* BREAK OVERLAY — shown when session is paused */}
      {paused && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ textAlign: 'center', maxWidth: '420px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>☕</div>
            <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: 700, margin: '0 0 8px 0' }}>Break Time</h2>
            <p style={{ color: '#9ca3af', fontSize: '15px', margin: '0 0 32px 0' }}>All tracking, scoring & blocking is paused. Relax!</p>

            {/* Countdown ring */}
            <div style={{ position: 'relative', width: '180px', height: '180px', margin: '0 auto 28px' }}>
              <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="90" cy="90" r="80" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="90" cy="90" r="80" fill="none" stroke="#f59e0b" strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 80}
                  strokeDashoffset={2 * Math.PI * 80 * (1 - breakElapsed / BREAK_MAX)}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '36px', fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                  {String(Math.floor((BREAK_MAX - breakElapsed) / 60)).padStart(2, '0')}:{String((BREAK_MAX - breakElapsed) % 60).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', letterSpacing: '1px' }}>REMAINING</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
                Break #{breakCount}
              </span>
              <span style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', padding: '6px 14px', borderRadius: '20px', fontSize: '13px' }}>
                {String(Math.floor(breakElapsed / 60)).padStart(2, '0')}:{String(breakElapsed % 60).padStart(2, '0')} elapsed
              </span>
            </div>

            <button onClick={handleResume}
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 40px', fontSize: '16px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,0.3)' }}>
              ▶ Resume Session
            </button>
            <p style={{ color: '#4b5563', fontSize: '12px', marginTop: '16px' }}>
              Auto-resumes in {Math.floor((BREAK_MAX - breakElapsed) / 60)}m {(BREAK_MAX - breakElapsed) % 60}s
            </p>
          </div>
        </div>
      )}

      {/* STATUS BAR */}
      <div style={{ padding: '14px 48px', borderBottom: `1px solid ${paused ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: paused ? '#f59e0b' : '#22c55e', animation: 'pulse 1.2s infinite' }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: paused ? '#f59e0b' : '#22c55e' }}>
              {paused ? 'On Break' : 'Session Active'}
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{ fontSize: '14px', color: '#9ca3af' }}>Elapsed: </span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{timeStr}</span>
          </div>
          {focusScore !== null && (
            <>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: '14px', color: '#9ca3af' }}>Live Score: <strong style={{ color: focusScore >= 70 ? '#22c55e' : focusScore >= 40 ? '#f59e0b' : '#ef4444' }}>{focusScore}</strong></span>
            </>
          )}
          {breakCount > 0 && (
            <>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: '13px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: '12px' }}>
                ☕ {breakCount} break{breakCount > 1 ? 's' : ''}
              </span>
            </>
          )}
          {visibilityData && visibilityData.awayCount > 0 && (
            <>
              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: '14px', color: '#f97316' }}>
                Away: <strong>{visibilityData.awayCount}×</strong>, {Math.floor(visibilityData.awayDuration / 60)}m {visibilityData.awayDuration % 60}s
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={paused ? handleResume : handlePause}
            style={{ background: paused ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.12)', border: `1px solid ${paused ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, color: paused ? '#22c55e' : '#f59e0b', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            {paused ? '▶ Resume' : '⏸ Break'}
          </button>
          <button onClick={handleEnd} disabled={ending}
            style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.6)', color: '#ef4444', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', fontWeight: 500, cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.5 : 1 }}>
            {ending ? 'Ending...' : 'End Session'}
          </button>
        </div>
      </div>

      {/* 3-COLUMN GRID */}
      <div style={{ padding: '24px 48px 40px', display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '20px', alignItems: 'start' }}>

        {/* LEFT: Initialize Core (session config recap) */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>Initialize Core</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '14px', color: '#22c55e', fontWeight: 500 }}>Focus</span>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{displayScore}</span>
            </span>
          </div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '8px' }}>Main objective...</div>
          <div style={{ width: '100%', minHeight: '44px', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px' }}>{goal}</div>

          <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '18px', marginBottom: '10px' }}>Focus Intensity:</div>
          <div style={{ display: 'flex', background: '#1a1a1a', borderRadius: '8px', padding: '4px', border: '1px solid #2d2d2d', height: '44px' }}>
            {[['Basic (25m)', 'basic'], ['Deep (30m)', 'exam']].map(([l, v]) => (
              <div key={v} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: mode === v ? '#1e3a5f' : 'transparent', color: mode === v ? '#fff' : '#6b7280', fontSize: '14px', fontWeight: 600, borderRadius: '6px' }}>{l}</div>
            ))}
          </div>

          {sessionId && (
            <div style={{ marginTop: '16px', padding: '10px 14px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #2d2d2d' }}>
              <div style={{ color: '#6b7280', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Session ID</div>
              <div style={{ color: '#6366f1', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{sessionId}</div>
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#1a1a1a', borderRadius: '8px', padding: '14px', border: '1px solid #2d2d2d' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>Session Running...</span>
          </div>
        </div>

        {/* MIDDLE: Productive Time + Timeline + QR */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>Productive Time</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.2s infinite' }} />
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>Live</span>
            </div>
          </div>

          {/* Dynamic progress bar */}
          <div style={{ display: 'flex', height: '48px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ flex: `0 0 ${pActive}%`, background: '#22c55e', display: 'flex', alignItems: 'center', paddingLeft: pActive > 20 ? '14px' : '4px', minWidth: '40px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{activeMin}m</span>
            </div>
            <div style={{ flex: `0 0 ${pDistracted}%`, background: '#f59e0b', minWidth: '4px' }} />
            <div style={{ flex: `0 0 ${pInactive}%`, background: '#ef4444', minWidth: '4px' }} />
          </div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
            {[['#22c55e','Active', `${pActive}%`],['#f59e0b','Distracted', `${pDistracted}%`],['#ef4444','Inactive', `${pInactive}%`]].map(([c,l,pct]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c }} />
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>{l} <span style={{ color: '#fff', fontWeight: 600 }}>{pct}</span></span>
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 0 20px 0' }} />

          {/* Live event timeline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>Today's Timeline</span>
            <span style={{ fontSize: '12px', color: '#6b7280', background: '#1a1a1a', borderRadius: '20px', padding: '2px 10px' }}>Live feed</span>
          </div>

          {events.length === 0 ? (
            <div style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Waiting for activity events...</div>
          ) : (
            events.slice(0, 5).map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <TlIcon category={ev.category} />
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>
                    {ev.source === 'phone' ? '📱 ' : ''}{ev.app}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{ev.time}</span>
                  <span style={{ fontSize: '11px', color: ev.category === 'productive' ? '#22c55e' : ev.category === 'distraction' ? '#ef4444' : '#f59e0b', minWidth: '60px', textAlign: 'right' }}>{ev.category}</span>
                </div>
              </div>
            ))
          )}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '20px 0' }} />

          {/* QR */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Session QR Code</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Scan to sync your phone with this session.</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ background: '#fff', padding: '8px', borderRadius: '8px' }}>
              <img src={qrUrl} alt="Session QR" style={{ width: '160px', height: '160px', display: 'block' }} />
            </div>
          </div>
          <button onClick={handleEnd}
            style={{ width: '100%', height: '44px', background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
            Disconnect
          </button>
        </div>

        {/* RIGHT: Activity Audit (live from WS events) */}
        <div style={CARD}>
          <div style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Activity Audit</div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '20px' }}>PWA &amp; Desktop Activity Tracking</div>

          {events.length === 0 ? (
            <div style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
              No activity yet.<br/>Start using apps to see audit data.
            </div>
          ) : (
            events.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', gap: '12px' }}>
                <AppIcon app={a.app} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.app}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: a.category === 'productive' ? '#22c55e' : a.category === 'distraction' ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: a.category === 'productive' ? '#22c55e' : a.category === 'distraction' ? '#ef4444' : '#f59e0b' }}>
                      {a.source === 'phone' ? 'Phone — ' : 'Desktop — '}{a.category}
                    </span>
                  </div>
                  {a.reason && (
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.reason}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>{a.time}</span>
              </div>
            ))
          )}

          <button style={{ marginTop: '20px', width: '100%', height: '48px', background: '#1e1b4b', color: '#fff', borderRadius: '10px', border: '1px solid #312e81', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => window.open(`http://${djangoHost}:8000`, '_blank')}>
            Install PWA
          </button>
        </div>
      </div>

      {/* PiP Floating Timer */}
      <FocusPiP
        active={true}
        goal={goal}
        mode={mode}
        elapsed={elapsed}
        score={avgScore ?? focusScore}
        productivePercent={pActive}
        onEnd={handleEnd}
      />


    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROOT COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function Session() {
  const [state, setState] = useState('init');       // 'init' | 'waiting' | 'active'
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState('basic');
  const [apps, setApps] = useState(['chrome', 'vscode']);
  const [tagId, setTagId] = useState(null);
  const [tags, setTags] = useState([]);
  const [sessionId, setSessionId] = useState(null);   // Express UUID session
  const [djangoSessionId, setDjangoSessionId] = useState(null); // Django 6-char session
  const [pwaUrl, setPwaUrl] = useState(null);          // Full PWA URL for QR (from Django)
  const [pcIp, setPcIp] = useState(null);
  const [booting, setBooting] = useState(false);
  const [focusTasks, setFocusTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [blocklist, setBlocklist] = useState([]);
  const [focusScore, setFocusScore] = useState(null);
  const [showDemoDisclaimer, setShowDemoDisclaimer] = useState(false);

  // Visibility tracking (only active during session)
  const { send: wsSend } = useWebSocket(useCallback((msg) => {
    if (msg.type === 'score_update') setFocusScore(msg.score);
  }, []));
  const visibilityData = useVisibilityTracker(state === 'active', wsSend);

  // On mount: fetch network IP + check for existing active session
  useEffect(() => {
    detectLanIp().then(ip => { if (ip) setPcIp(ip); });

    tagsApi.getAll()
      .then(data => setTags(data || []))
      .catch(() => {});

    matrixApi.getTasks().then(data => {
      setFocusTasks((data || []).filter(t => (t.quadrant === 'do_first' || t.quadrant === 'schedule') && !t.completed));
    }).catch(() => {});

    sessionApi.status().then(status => {
      if (status.active) {
        setSessionId(status.id);
        setGoal(status.goal || '');
        setMode(status.mode || 'basic');
        setState('active');
      }
    }).catch(() => {});
  }, []);

  async function handleBoot() {
    if (!goal.trim()) return;

    if (IS_DEMO_MODE) {
      setShowDemoDisclaimer(true);
      return;
    }

    setBooting(true);
    try {
      // ── Step 1: resolve real LAN IP ──
      let ip = pcIp;
      if (!ip) {
        ip = await detectLanIp();
        if (ip) setPcIp(ip);
      }

      // ── Step 2: create Django session (gets 6-char ID the phone WS can validate) ──
      let djangoId = null;
      let resolvedPwaUrl = null;
      try {
        const djangoResult = await djangoApi.createSession(
          goal,
          mode === 'exam' ? 45 : 30,
          ip || 'localhost'
        );
        djangoId = djangoResult.session_id;   // e.g. "AB12CD"
        resolvedPwaUrl = djangoResult.pwa_url; // e.g. "http://10.111.60.168:8000/join?session=AB12CD"
        setDjangoSessionId(djangoId);
        setPwaUrl(resolvedPwaUrl);
      } catch (djangoErr) {
        console.warn('[Session] Django session creation failed — proceeding without:', djangoErr.message);
        // Fallback: build URL manually
        const host = ip || window.location.hostname;
        resolvedPwaUrl = `http://${host}:8000/join?session=DEMO`;
        setPwaUrl(resolvedPwaUrl);
      }

      // ── Step 3: create Express session (for Supabase + desktop watcher) ──
      try {
        const result = await sessionApi.start(goal, mode, apps, tagId, djangoId);
        setSessionId(result.session?.id || result.id || null);
      } catch (err) {
        console.warn('[Session] Express session start error:', err.message);
        setSessionId('demo-' + Math.random().toString(36).slice(2, 10));
      }

      setState('waiting');
    } finally {
      setBooting(false);
    }
  }

    async function handleEnd() {
    // End both sessions
    try { await sessionApi.end(); } catch (_) {}
    if (djangoSessionId && pcIp) {
      try { await djangoApi.endSession(djangoSessionId, pcIp); } catch (_) {}
    }
    
    // Complete Eisenhower Task if one was selected
    if (selectedTaskId) {
      try { await matrixApi.completeTask(selectedTaskId); } catch (_) {}
    }

    setSessionId(null);
    setDjangoSessionId(null);
    setPwaUrl(null);
    setSelectedTaskId('');
    setState('init');
  }

  return (
    <>
      <style>{SPINNER_CSS}</style>
      {state === 'init' && (
        <InitPage
          goal={goal} setGoal={setGoal}
          mode={mode} setMode={setMode}
          apps={apps} setApps={setApps}
          tagId={tagId} setTagId={setTagId} tags={tags}
          focusTasks={focusTasks} selectedTaskId={selectedTaskId} setSelectedTaskId={setSelectedTaskId}
          blocklist={blocklist} setBlocklist={setBlocklist}
          onBoot={handleBoot} booting={booting}
        />
      )}
      {state === 'waiting' && (
        <QrWaitPage
          sessionId={sessionId}
          djangoSessionId={djangoSessionId}
          pwaUrl={pwaUrl}
          goal={goal} mode={mode} pcIp={pcIp}
          onConnected={() => setState('active')}
          onCancel={async () => {
            try { await sessionApi.end(); } catch (_) {}
            if (djangoSessionId && pcIp) {
              try { await djangoApi.endSession(djangoSessionId, pcIp); } catch (_) {}
            }
            setSessionId(null); setDjangoSessionId(null); setPwaUrl(null);
            setState('init');
          }}
        />
      )}
      {state === 'active' && (
        <ActivePage
          sessionId={sessionId}
          djangoSessionId={djangoSessionId}
          pwaUrl={pwaUrl}
          goal={goal} mode={mode} pcIp={pcIp}
          visibilityData={visibilityData}
          wsSend={wsSend}
          onEnd={handleEnd}
        />
      )}

      {/* Focus Overlay — shown when user returns after being away too long */}
      <FocusOverlay
        sessionActive={state === 'active'}
        mode={mode}
        isAway={visibilityData.isAway}
        awayDuration={visibilityData.awayDuration}
        awayCount={visibilityData.awayCount}
        lastReturnedAt={visibilityData.lastReturnedAt}
        goal={goal}
        score={focusScore}
      />
      {/* Web Demo Disclaimer Modal */}
      {showDemoDisclaimer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', position: 'relative' }}>
            <button 
              onClick={() => setShowDemoDisclaimer(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            
            <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 600, color: '#f8fafc' }}>Web Demo Limitations</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.6', color: '#94a3b8' }}>
              You are currently viewing the MindForge <strong>Live Web Demo</strong>. Because browser security prevents websites from tracking your local computer usage, the core tracking features cannot be demonstrated here.
            </p>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.6', color: '#94a3b8' }}>
              To experience real-time desktop app tracking, AI Chrome tab blocking, and mobile phone syncing, please view our demo video or download the full local application!
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setShowDemoDisclaimer(false)}
                style={{ flex: 1, padding: '10px 0', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

