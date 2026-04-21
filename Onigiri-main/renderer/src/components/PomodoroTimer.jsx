import { useState, useEffect, useRef } from 'react';

export default function PomodoroTimer() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [goal, setGoal] = useState('');
  const [showCompletion, setShowCompletion] = useState(false);
  const timerRef = useRef(null);
  
  // Audio references
  const ambientAudioRef = useRef(new Audio('https://actions.google.com/sounds/v1/water/rain_on_roof.ogg'));
  const completeAudioRef = useRef(new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg'));

  useEffect(() => {
    // Setup audio looping
    ambientAudioRef.current.loop = true;
    ambientAudioRef.current.volume = 0.4;
    
    return () => {
      ambientAudioRef.current.pause();
      completeAudioRef.current.pause();
    };
  }, []);

  useEffect(() => {
    if (running) {
      // Play ambient sound
      ambientAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
      
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            // Time's up!
            clearInterval(timerRef.current);
            setRunning(false);
            setShowCompletion(true);
            ambientAudioRef.current.pause();
            completeAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
            
            // Native desktop notification
            if (Notification.permission === 'granted') {
              new Notification('Pomodoro Complete! 🍅', {
                body: `Great job focusing on: ${goal || 'your task'}. Time for a break!`,
                icon: '/favicon.svg'
              });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission();
            }
            
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      ambientAudioRef.current.pause();
    }
    return () => clearInterval(timerRef.current);
  }, [running, goal]);

  const resetTimer = () => {
    setSeconds(25 * 60);
    setRunning(false);
    setShowCompletion(false);
    completeAudioRef.current.pause();
    completeAudioRef.current.currentTime = 0;
  };

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000000', minHeight: 'calc(100vh - 60px)', position: 'relative' }}>

      {/* Completion Overlay */}
      {showCompletion && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.5s ease' }}>
          <div style={{ fontSize: '80px', marginBottom: '24px', animation: 'bounce 2s infinite' }}>🎉</div>
          <h1 style={{ color: '#22c55e', fontSize: '48px', fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-1px' }}>Study Completed!</h1>
          <p style={{ color: '#e5e7eb', fontSize: '20px', marginBottom: '40px', textAlign: 'center', maxWidth: '500px' }}>
            You successfully completed your {goal ? `focus session for "${goal}"` : 'Pomodoro session'}. Time to take a well-deserved break!
          </p>
          <button
            onClick={resetTimer}
            style={{ background: '#22c55e', color: '#000', padding: '16px 48px', borderRadius: '12px', fontSize: '18px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,0.4)' }}
          >
            Start Next Session
          </button>
        </div>
      )}

      {/* Timer Circle */}
      <div style={{ width: '320px', height: '320px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '48px', position: 'relative' }}>
        {running && (
          <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 2s linear infinite' }} />
        )}
        <span style={{ fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', color: running ? '#6366f1' : '#9ca3af', marginBottom: '8px' }}>
          {running ? 'FOCUSING...' : 'READY'}
        </span>
        <span style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', letterSpacing: '-2px', lineHeight: 1 }}>{display}</span>
      </div>

      {/* Below Circle */}
      <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', alignSelf: 'flex-start', marginBottom: '4px' }}>SESSION GOAL</label>
        <input
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="What will you focus on?"
          disabled={running}
          style={{ width: '100%', height: '44px', background: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', padding: '0 16px', color: '#ffffff', fontSize: '15px', outline: 'none', boxSizing: 'border-box', opacity: running ? 0.6 : 1 }}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#374151'}
        />
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={() => setRunning(r => !r)}
            style={{ flex: 1, height: '48px', background: running ? '#ef4444' : '#ffffff', color: running ? '#ffffff' : '#000000', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 600, cursor: 'pointer' }}
          >
            {running ? 'Pause' : 'Start Pomodoro'}
          </button>
          {!running && seconds !== 25 * 60 && (
            <button
              onClick={resetTimer}
              style={{ padding: '0 24px', height: '48px', background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: '8px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      
      {/* Required CSS animation for the spin effect */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
