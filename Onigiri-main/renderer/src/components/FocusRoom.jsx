import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';

/* ─── REST API helper (replaces Electron IPC) ─── */
async function roomApi(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`Room API ${path} → ${res.status}`);
  return res.json();
}

/* ─── Helpers ─── */
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ─── Status Helpers (score-based from File 2 UI, labels from File 1) ─── */
function getStatusDisplay(status, score) {
  if (status === 'break') return { label: 'On Break', color: '#f59e0b', emoji: '☕', dot: '#f59e0b' };
  if (status === 'distracted') return { label: 'Distracted', color: '#ef4444', emoji: '😵', dot: '#ef4444' };
  return { label: 'Focused', color: '#22c55e', emoji: '📚', dot: '#22c55e' };
}

/* ─── SVG Icons (from File 1) ─── */
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ─── Shared inline styles (File 2 aesthetic) ─── */
const INPUT_STYLE = {
  width: '100%',
  height: '44px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  padding: '0 16px',
  color: '#ffffff',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
};

const BTN_PRIMARY = {
  width: '100%',
  height: '44px',
  background: '#3730a3',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '12px',
  opacity: 1,
};

const BTN_PRIMARY_DISABLED = { ...BTN_PRIMARY, opacity: 0.4, cursor: 'not-allowed' };

const CARD_STYLE = {
  background: '#111418',
  borderRadius: '16px',
  padding: '28px 32px 32px',
  border: '1px solid rgba(255,255,255,0.07)',
  width: '340px',
};

/* ─── Member Card (File 2 UI + File 1 reaction logic) ─── */
function MemberCard({ member, isYou, onReact }) {
  const statusInfo = getStatusDisplay(member.status, member.score);
  const [showReaction, setShowReaction] = useState(null);

  function handleReact(emoji) {
    if (onReact) onReact(member.user_id, emoji);
    setShowReaction(emoji);
    setTimeout(() => setShowReaction(null), 1500);
  }

  return (
    <div style={{
      background: '#111418',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.2s',
    }}>
      {/* Reaction animation */}
      {showReaction && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '2rem', pointerEvents: 'none', zIndex: 10,
          animation: 'scoreEnter 0.3s ease-out',
        }}>
          {showReaction}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Avatar with status dot */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: '#222', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '14px',
          }}>
            {member.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{
            position: 'absolute', bottom: '-2px', right: '-2px',
            width: '10px', height: '10px', borderRadius: '50%',
            background: statusInfo.dot, border: '2px solid #111418',
          }} />
        </div>

        <div>
          <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
            {member.display_name}
            {isYou && <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '6px' }}>(You)</span>}
          </div>
          <div style={{ color: statusInfo.color, fontSize: '12px', marginTop: '2px' }}>
            {statusInfo.emoji} {statusInfo.label}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: statusInfo.color, fontSize: '22px', fontWeight: 700 }}>
          {member.score || 0}
        </span>
        {/* Reaction buttons (File 1 logic) */}
        {!isYou && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {['👍', '🔥'].map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'transparent', border: '1px solid transparent',
                  cursor: 'pointer', fontSize: '16px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Email Invite Modal (from File 1) ─── */
function InviteModal({ roomCode, roomName, onClose }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!email.trim()) return;
    const subject = encodeURIComponent(`Join my Focus Room on MindForge: "${roomName}"`);
    const body = encodeURIComponent(
      `Hey!\n\nI'm studying on MindForge and created a Focus Room. Join me!\n\nRoom Code: ${roomCode}\nRoom Name: ${roomName}\n\nOpen MindForge → Focus Room → Enter the code to join.\n\nLet's focus together! 🧠`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    setSent(true);
    setTimeout(() => { setSent(false); onClose(); }, 1500);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        style={{ ...CARD_STYLE, width: '380px' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, margin: '0 0 4px 0' }}>
          Invite via Email
        </h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 20px 0' }}>
          Send the room code to a friend's email
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="friend@email.com"
            style={{ ...INPUT_STYLE, flex: 1 }}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!email.trim() || sent}
            style={{
              height: '44px', padding: '0 16px', background: '#3730a3', color: '#fff',
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
              cursor: email.trim() && !sent ? 'pointer' : 'not-allowed',
              opacity: !email.trim() || sent ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {sent ? <><CheckIcon /> Sent!</> : <><MailIcon /> Send</>}
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '12px', width: '100%', background: 'transparent',
            border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', padding: '6px',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function FocusRoom() {
  const { user } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputRoomName, setInputRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const pollRef = useRef(null);

  // Auto-fill username from email (File 1)
  useEffect(() => {
    if (user?.email) setUserName(user.email.split('@')[0]);
  }, [user]);

  // Check for active room on mount (File 1)
  useEffect(() => {
    checkActiveRoom();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function checkActiveRoom() {
    try {
      const result = await roomApi('/room/active');
      if (result?.room) {
        setRoomCode(result.room.id);
        setRoomName(result.room.name);
        setMembers(result.members || []);
        setInRoom(true);
        startPolling(result.room.id);
      }
    } catch (err) {
      console.error('[FocusRoom] checkActiveRoom error:', err);
    }
  }

  function startPolling(code) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await roomApi(`/room/members/${code}`);
        if (result?.members) setMembers(result.members);
      } catch {}
    }, 5000);
  }

  async function createRoom() {
    if (!userName.trim() || !inputRoomName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await roomApi('/room/create', { method: 'POST', body: JSON.stringify({ name: inputRoomName.trim(), displayName: userName.trim() }) });
      if (result.error) { setError(result.error); setLoading(false); return; }
      setRoomCode(result.code);
      setRoomName(inputRoomName.trim());
      setInRoom(true);
      const membersResult = await roomApi(`/room/members/${result.code}`);
      setMembers(membersResult?.members || []);
      startPolling(result.code);
    } catch (err) {
      setError(err.message || 'Failed to create room');
    }
    setLoading(false);
  }

  async function joinRoom() {
    if (!userName.trim() || inputCode.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const result = await roomApi('/room/join', { method: 'POST', body: JSON.stringify({ code: inputCode.trim(), displayName: userName.trim() }) });
      if (result.error) { setError(result.error); setLoading(false); return; }
      setRoomCode(inputCode.toUpperCase());
      setRoomName(result.room?.name || 'Focus Room');
      setInRoom(true);
      const membersResult = await roomApi(`/room/members/${inputCode.toUpperCase()}`);
      setMembers(membersResult?.members || []);
      startPolling(inputCode.toUpperCase());
    } catch (err) {
      setError(err.message || 'Failed to join room');
    }
    setLoading(false);
  }

  async function leaveRoom() {
    if (pollRef.current) clearInterval(pollRef.current);
    try { await roomApi('/room/leave', { method: 'POST', body: JSON.stringify({ code: roomCode }) }); } catch {}
    setInRoom(false);
    setRoomCode('');
    setRoomName('');
    setMembers([]);
    setInputCode('');
    setInputRoomName('');
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function copyLink() {
    navigator.clipboard.writeText(roomCode);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  /* ─── LOBBY VIEW (File 2 UI: side-by-side cards) ─── */
  if (!inRoom) {
    return (
      <div style={{
        width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <h1 style={{ color: '#ffffff', fontSize: '36px', fontWeight: 500, margin: '0 0 56px 0', letterSpacing: '-0.5px' }}>
          Focus <span style={{ color: '#9ca3af', fontWeight: 300 }}>Room</span>
        </h1>

        {/* Error (File 1) */}
        {error && (
          <div style={{
            marginBottom: '24px', padding: '10px 16px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.2)', fontSize: '13px', fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {/* Two cards side by side (File 2 UI) */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0' }}>

          {/* LEFT: Name + Room Name + Create */}
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '16px', fontWeight: 600 }}>
              YOUR NAME
            </div>
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Enter your name"
              style={INPUT_STYLE}
            />
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', margin: '16px 0 10px', fontWeight: 600 }}>
              ROOM NAME
            </div>
            <input
              type="text"
              value={inputRoomName}
              onChange={e => setInputRoomName(e.target.value)}
              placeholder="e.g. Study Squad, Final Exam Prep"
              style={INPUT_STYLE}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
            />
            <button
              onClick={createRoom}
              disabled={!userName.trim() || !inputRoomName.trim() || loading}
              style={!userName.trim() || !inputRoomName.trim() || loading ? BTN_PRIMARY_DISABLED : BTN_PRIMARY}
            >
              {loading ? 'Creating…' : 'Create New Room'}
            </button>
          </div>

          {/* OR divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '60px', flexShrink: 0 }}>
            <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>OR</span>
          </div>

          {/* RIGHT: Room Code + Join */}
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '16px', fontWeight: 600 }}>
              ROOM CODE
            </div>
            <input
              type="text"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              style={{ ...INPUT_STYLE, letterSpacing: '3px', fontFamily: 'monospace', textTransform: 'uppercase' }}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
            />
            <button
              onClick={joinRoom}
              disabled={!userName.trim() || inputCode.length < 6 || loading}
              style={!userName.trim() || inputCode.length < 6 || loading ? BTN_PRIMARY_DISABLED : BTN_PRIMARY}
            >
              {loading ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── IN-ROOM VIEW (File 2 UI + File 1 functionality) ─── */
  const currentUserId = user?.id;

  return (
    <div style={{
      width: '100%', minHeight: 'calc(100vh - 60px)', background: '#000000',
      padding: '48px', boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: '0 0 4px 0' }}>{roomName}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', padding: '2px 10px', color: '#ffffff',
              fontSize: '13px', fontFamily: 'monospace', letterSpacing: '3px',
            }}>
              {roomCode}
            </span>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>
              {members.length} Member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button
          onClick={leaveRoom}
          style={{
            background: '#1a1a1a', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
          }}
        >
          Leave Room
        </button>
      </div>

      {/* Share Bar (File 1 logic, File 2 aesthetic) */}
      <div style={{ ...CARD_STYLE, width: '100%', maxWidth: '600px', marginBottom: '28px', padding: '16px 20px' }}>
        <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, margin: '0 0 12px 0' }}>
          Share This Room
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: copiedCode ? 'Copied!' : 'Copy Code', icon: copiedCode ? <CheckIcon /> : <CopyIcon />, action: copyCode, copied: copiedCode },
            { label: copiedLink ? 'Copied!' : 'Copy Invite Link', icon: copiedLink ? <CheckIcon /> : <LinkIcon />, action: copyLink, copied: copiedLink },
            { label: 'Invite via Email', icon: <MailIcon />, action: () => setShowInviteModal(true), copied: false },
          ].map(({ label, icon, action, copied }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s',
                background: copied ? 'rgba(34,197,94,0.1)' : '#1a1a1a',
                border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: copied ? '#22c55e' : '#d1d5db',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Members list */}
      <h3 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Members
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
        {members.map(m => (
          <MemberCard
            key={m.id || m.user_id}
            member={m}
            isYou={m.user_id === currentUserId}
            onReact={() => {}}
          />
        ))}
        {members.length === 0 && (
          <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '32px' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
              No members yet. Share the room code to invite friends!
            </p>
          </div>
        )}
      </div>

      {/* Leaderboard (File 1 logic, File 2 aesthetic) */}
      {members.length > 1 && (
        <div style={{ marginTop: '40px', maxWidth: '600px' }}>
          <h3 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Leaderboard
          </h3>
          <div style={{ ...CARD_STYLE, width: '100%', padding: '0', overflow: 'hidden' }}>
            {[...members]
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map((m, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = i < 3 ? medals[i] : `#${i + 1}`;
                const barWidth = Math.max(10, m.score || 0);
                const statusInfo = getStatusDisplay(m.status, m.score);
                const isYou = m.user_id === currentUserId;
                return (
                  <div
                    key={m.id || m.user_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 20px',
                      borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: isYou ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: '16px', width: '28px', textAlign: 'center', flexShrink: 0 }}>{medal}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '120px', flexShrink: 0 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusInfo.dot, flexShrink: 0 }} />
                      <span style={{ color: isYou ? '#818cf8' : '#ffffff', fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.display_name}
                        {isYou && <span style={{ color: '#6b7280', fontSize: '10px', marginLeft: '4px' }}>(You)</span>}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: '18px', borderRadius: '4px', overflow: 'hidden', background: '#1a1a1a' }}>
                      <div style={{
                        height: '100%', borderRadius: '4px',
                        width: `${barWidth}%`, background: statusInfo.color,
                        opacity: 0.85, transition: 'width 0.7s ease-out',
                      }} />
                    </div>
                    <span style={{ color: statusInfo.color, fontSize: '14px', fontWeight: 700, width: '32px', textAlign: 'right' }}>
                      {m.score || 0}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Email Invite Modal (File 1) */}
      {showInviteModal && (
        <InviteModal
          roomCode={roomCode}
          roomName={roomName}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}