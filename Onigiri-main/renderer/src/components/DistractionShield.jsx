import { useState, useEffect, useRef } from 'react';

const DJANGO_API = 'http://localhost:8000/api';
const DJANGO_WS = 'ws://localhost:8000/ws/session';

export default function DistractionShield() {
  const [alert, setAlert] = useState(null);
  const [countdown, setCountdown] = useState(10);
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  const [sessionId, setSessionId] = useState(null);

  // Poll for active session ID from localStorage
  useEffect(() => {
    const checkSession = () => {
      const savedId = localStorage.getItem('mindforge_session_id');
      if (savedId !== sessionId) {
        setSessionId(savedId);
      }
    };
    checkSession();
    // Fast local polling since it costs nothing
    const interval = setInterval(checkSession, 1000);
    return () => clearInterval(interval);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      if (wsRef.current) wsRef.current.close();
      return;
    }
    function connect() {
      const ws = new WebSocket(`${DJANGO_WS}/${sessionId}/`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'distraction_alert' || data.type === 'intervention') {
            setAlert({ app: data.hostname || data.app || 'Distraction', focusMinutes: 0 });
            setCountdown(10);
          }
        } catch (e) { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    }
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [sessionId]);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!alert) return;

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setAlert(null);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [alert]);

  function dismiss() {
    clearInterval(timerRef.current);
    setAlert(null);
    setCountdown(10);
  }

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'rgba(239, 68, 68, 0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-md w-full mx-4 text-center animate-slide-up">
        {/* Warning icon */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid rgba(239, 68, 68, 0.3)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--score-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Focus Interrupted
        </h2>

        {alert.focusMinutes > 0 && (
          <p className="text-lg font-semibold mb-1" style={{ color: 'var(--score-amber)' }}>
            You've been focused for {alert.focusMinutes} minutes!
          </p>
        )}

        <p className="text-zinc-400 mb-2">
          You switched to <span className="text-red-400 font-semibold">"{alert.app}"</span>
        </p>

        <p className="text-sm text-zinc-500 mb-8">
          Are you sure you want to break your flow?
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={dismiss}
            className="px-6 py-3 rounded-lg font-semibold text-sm transition-all active:scale-95"
            style={{
              background: 'var(--score-green)',
              color: 'black',
            }}
          >
            Return to Focus
          </button>
          <button
            onClick={dismiss}
            className="px-6 py-3 rounded-lg font-semibold text-sm transition-all text-zinc-400 hover:text-white"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            Dismiss ({countdown}s)
          </button>
        </div>
      </div>
    </div>
  );
}
