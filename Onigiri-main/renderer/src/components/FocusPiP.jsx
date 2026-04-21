/**
 * FocusPiP — Document Picture-in-Picture floating timer
 *
 * Opens a small always-on-top window (320×200) that shows:
 *   - Live elapsed timer (HH:MM:SS)
 *   - Session goal
 *   - Live focus score (color-coded)
 *   - Mode badge
 *   - End Session button
 *
 * Uses the Document PiP API (Chrome 116+). Falls back to an
 * in-page floating mini-widget if the API is unsupported.
 *
 * Communication between PiP window ↔ parent uses BroadcastChannel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const PIP_CHANNEL_NAME = 'mindforge-pip';

/* ─── Check API support ─── */
function isPiPSupported() {
  return 'documentPictureInPicture' in window;
}

/* ─── Build the PiP document HTML ─── */
function buildPiPHTML(goal, mode, elapsed, score) {
  const timeStr = formatTime(elapsed);
  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  const modeLabel = mode === 'exam' ? 'EXAM' : 'BASIC';
  const modeColor = mode === 'exam' ? '#ef4444' : '#3b82f6';

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>MindForge Focus Timer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0a;
    color: #ffffff;
    overflow: hidden;
    user-select: none;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px 20px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .logo-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #22c55e;
    animation: pulse 1.5s infinite;
  }
  .mode-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    padding: 2px 8px;
    border-radius: 4px;
    background: ${modeColor}22;
    color: ${modeColor};
    border: 1px solid ${modeColor}44;
  }
  .timer {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: -1px;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    margin-bottom: 8px;
  }
  .goal {
    font-size: 12px;
    color: #9ca3af;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 12px;
  }
  .goal strong { color: #d1d5db; font-weight: 600; }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .score-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .score-label {
    font-size: 10px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .score-value {
    font-size: 20px;
    font-weight: 800;
    color: ${scoreColor};
  }
  .end-btn {
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #ef4444;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .end-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
  }
  /* Progress bar */
  .progress-bar {
    height: 3px;
    background: #1f1f1f;
    border-radius: 2px;
    margin-top: 12px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #3b82f6);
    border-radius: 2px;
    transition: width 1s linear;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo"><div class="logo-dot"></div> MindForge</div>
    <div class="mode-badge">${modeLabel}</div>
  </div>
  <div class="timer" id="pip-timer">${timeStr}</div>
  <div class="goal">Goal: <strong id="pip-goal">${escapeHTML(goal || 'Focus Session')}</strong></div>
  <div class="footer">
    <div class="score-wrap">
      <span class="score-label">Score</span>
      <span class="score-value" id="pip-score">${score ?? '--'}</span>
    </div>
    <button class="end-btn" id="pip-end-btn">End Session</button>
  </div>
  <div class="progress-bar"><div class="progress-fill" id="pip-progress" style="width: 50%"></div></div>

  <script>
    const channel = new BroadcastChannel('${PIP_CHANNEL_NAME}');

    // Listen for updates from parent
    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'tick') {
        const el = document.getElementById('pip-timer');
        if (el) el.textContent = msg.timeStr;
      }
      if (msg.type === 'score') {
        const el = document.getElementById('pip-score');
        if (el) {
          el.textContent = msg.score ?? '--';
          const c = msg.score >= 70 ? '#22c55e' : msg.score >= 40 ? '#f59e0b' : '#ef4444';
          el.style.color = c;
        }
      }
      if (msg.type === 'progress') {
        const el = document.getElementById('pip-progress');
        if (el) el.style.width = msg.percent + '%';
      }
      if (msg.type === 'close') {
        window.close();
      }
    };

    // End session button
    document.getElementById('pip-end-btn').addEventListener('click', () => {
      channel.postMessage({ type: 'end_session' });
    });
  </script>
</body>
</html>`;
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHTML(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════
   FocusPiP Component
   ═══════════════════════════════════════════════════════ */
export default function FocusPiP({ active, goal, mode, elapsed, score, productivePercent, onEnd }) {
  const pipWindowRef = useRef(null);
  const channelRef = useRef(null);
  const [pipOpen, setPipOpen] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Initialize BroadcastChannel
  useEffect(() => {
    const ch = new BroadcastChannel(PIP_CHANNEL_NAME);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      if (e.data.type === 'end_session' && onEnd) {
        onEnd();
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [onEnd]);

  // Send timer ticks to PiP
  useEffect(() => {
    if (channelRef.current && pipOpen) {
      channelRef.current.postMessage({ type: 'tick', timeStr: formatTime(elapsed) });
    }
  }, [elapsed, pipOpen]);

  // Send score updates to PiP
  useEffect(() => {
    if (channelRef.current && pipOpen) {
      channelRef.current.postMessage({ type: 'score', score });
    }
  }, [score, pipOpen]);

  // Send progress updates
  useEffect(() => {
    if (channelRef.current && pipOpen) {
      channelRef.current.postMessage({ type: 'progress', percent: productivePercent || 50 });
    }
  }, [productivePercent, pipOpen]);

  // Close PiP when session ends
  useEffect(() => {
    if (!active && pipWindowRef.current) {
      try {
        channelRef.current?.postMessage({ type: 'close' });
        pipWindowRef.current.close();
      } catch (_) {}
      pipWindowRef.current = null;
      setPipOpen(false);
    }
  }, [active]);

  // Open PiP window
  const openPiP = useCallback(async () => {
    if (!isPiPSupported()) {
      setFallback(true);
      return;
    }

    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 200,
      });

      pipWindowRef.current = pipWindow;

      // Write the full HTML into the PiP document
      const html = buildPiPHTML(goal, mode, elapsed, score);
      pipWindow.document.open();
      pipWindow.document.write(html);
      pipWindow.document.close();

      setPipOpen(true);

      // Listen for PiP window close
      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setPipOpen(false);
      });
    } catch (err) {
      console.warn('[FocusPiP] Could not open PiP window:', err.message);
      setFallback(true);
    }
  }, [goal, mode, elapsed, score]);

  // Don't render anything if session isn't active
  if (!active) return null;

  const timeStr = formatTime(elapsed);
  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  /* ─── Fallback: in-page floating widget ─── */
  if (fallback || !isPiPSupported()) {
    return (
      <div style={{
        position: 'fixed', bottom: '80px', right: '20px', zIndex: 9998,
        width: '260px', background: '#111111', borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.1)', padding: '16px 18px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>MindForge</span>
          </div>
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px',
            padding: '2px 8px', borderRadius: '4px',
            background: mode === 'exam' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
            color: mode === 'exam' ? '#ef4444' : '#3b82f6',
            border: `1px solid ${mode === 'exam' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
          }}>{mode === 'exam' ? 'EXAM' : 'BASIC'}</span>
        </div>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: '6px' }}>
          {timeStr}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Goal: <strong style={{ color: '#d1d5db' }}>{goal || 'Focus Session'}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Score</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: scoreColor }}>{score ?? '--'}</span>
          </div>
          <button onClick={onEnd} style={{
            background: 'transparent', border: '1px solid rgba(239,68,68,0.5)',
            color: '#ef4444', fontSize: '11px', fontWeight: 600,
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
          }}>End</button>
        </div>
      </div>
    );
  }

  /* ─── PiP supported: show launch button or status ─── */
  return (
    <div style={{
      position: 'fixed', bottom: '80px', right: '20px', zIndex: 9998,
    }}>
      {!pipOpen ? (
        <button
          onClick={openPiP}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#111111', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px', padding: '10px 18px', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'all 0.2s',
            color: '#fff', fontSize: '13px', fontWeight: 500,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; e.currentTarget.style.background = '#1a1a2e'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = '#111111'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <rect x="12" y="11" width="10" height="9" rx="1" ry="1" fill="#6366f1" fillOpacity="0.2"/>
          </svg>
          Launch Floating Timer
        </button>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: '#111111', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '10px', padding: '8px 14px',
          fontSize: '12px', color: '#22c55e', fontWeight: 500,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
          PiP Timer Active — {timeStr}
        </div>
      )}
    </div>
  );
}
