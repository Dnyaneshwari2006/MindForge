/**
 * FocusOverlay — Return-to-tab distraction warning
 *
 * Shown when the user returns to the MindForge tab after being away
 * for longer than the threshold (Basic: 30s, Exam: 15s).
 *
 * Displays away duration, focus score, goal reminder, and a
 * "Resume Focus" button. Auto-dismisses after 10 seconds.
 *
 * This works WITHOUT the Chrome extension — purely based on
 * the Page Visibility API via useVisibilityTracker.
 */

import { useState, useEffect, useRef } from 'react';

const AWAY_THRESHOLD = { basic: 30, exam: 15 }; // seconds

export default function FocusOverlay({ sessionActive, mode, isAway, awayDuration, awayCount, lastReturnedAt, goal, score }) {
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [lastAwayStint, setLastAwayStint] = useState(0);
  const timerRef = useRef(null);
  const prevAwayRef = useRef(false);
  const prevDurationRef = useRef(0);

  // Detect return from away
  useEffect(() => {
    if (!sessionActive) {
      setVisible(false);
      return;
    }

    const wasAway = prevAwayRef.current;
    prevAwayRef.current = isAway;

    // User just returned (was away → now visible)
    if (wasAway && !isAway && lastReturnedAt) {
      const stintSeconds = awayDuration - prevDurationRef.current;
      prevDurationRef.current = awayDuration;

      const threshold = AWAY_THRESHOLD[mode] || 30;
      if (stintSeconds >= threshold) {
        setLastAwayStint(stintSeconds);
        setCountdown(10);
        setVisible(true);
      }
    }
  }, [isAway, sessionActive, mode, awayDuration, lastReturnedAt]);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setVisible(false);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  function dismiss() {
    if (timerRef.current) clearInterval(timerRef.current);
    setVisible(false);
    setCountdown(10);
  }

  if (!visible) return null;

  const awayMin = Math.floor(lastAwayStint / 60);
  const awaySec = lastAwayStint % 60;
  const awayDisplay = awayMin > 0
    ? `${awayMin}m ${awaySec}s`
    : `${awaySec} seconds`;

  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      animation: 'focusOverlayFadeIn 0.3s ease',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <style>{`
        @keyframes focusOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes focusOverlaySlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes focusOverlayPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{
        maxWidth: '420px', width: '100%', margin: '0 24px',
        textAlign: 'center',
        animation: 'focusOverlaySlideUp 0.4s ease',
      }}>
        {/* Warning icon */}
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          background: 'rgba(249, 115, 22, 0.12)',
          border: '2px solid rgba(249, 115, 22, 0.25)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        {/* Title */}
        <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0' }}>
          You were away
        </h2>

        {/* Away duration */}
        <div style={{
          fontSize: '36px', fontWeight: 800, color: '#f97316',
          lineHeight: 1.2, marginBottom: '8px', fontVariantNumeric: 'tabular-nums',
        }}>
          {awayDisplay}
        </div>

        <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>
          You left this tab {awayCount > 1 ? `(${awayCount} times total)` : ''}
        </p>

        {/* Goal & Score card */}
        <div style={{
          background: '#111111', borderRadius: '12px', padding: '16px 20px',
          border: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
              Your Goal
            </div>
            <div style={{
              fontSize: '14px', color: '#ffffff', fontWeight: 600,
              maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {goal || 'Focus Session'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
              Score
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: scoreColor }}>
              {score ?? '--'}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={dismiss}
            style={{
              background: '#ffffff', color: '#000000',
              border: 'none', borderRadius: '10px',
              padding: '12px 28px', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
          >
            Resume Focus
          </button>
          <button
            onClick={dismiss}
            style={{
              background: 'transparent', color: '#6b7280',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
              padding: '12px 20px', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            Dismiss ({countdown}s)
          </button>
        </div>

        {/* Total away time this session */}
        <p style={{ color: '#374151', fontSize: '12px', marginTop: '20px' }}>
          Total away this session: {Math.floor(awayDuration / 60)}m {awayDuration % 60}s
        </p>
      </div>
    </div>
  );
}
