import { useState, useEffect, useRef } from 'react';
import { emailApi } from '../api';
import { useAuth } from '../AuthContext';

export default function EmailHistory() {
  const { user } = useAuth();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedHtml, setExpandedHtml] = useState('');
  const [toast, setToast] = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await emailApi.getHistory();
      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load email history:', err);
      setEmails([]);
    }
    setLoading(false);
  }

  async function handleSendNow() {
    setSending(true);
    setToast(null);
    try {
      const result = await emailApi.sendNow(user?.email);
      if (result.ok) {
        setToast({ type: 'success', message: `✓ Report sent to ${result.recipientEmail}` });
        loadHistory();
      } else {
        setToast({ type: 'error', message: `✗ ${result.error || 'Failed to send'}` });
      }
    } catch (err) {
      setToast({ type: 'error', message: `✗ ${err.message}` });
    }
    setSending(false);
    setTimeout(() => setToast(null), 5000);
  }

  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedHtml('');
      return;
    }
    try {
      const data = await emailApi.getById(id);
      setExpandedId(id);
      setExpandedHtml(data?.html_content || '<p style="color:#71717a;text-align:center;padding:40px;">No content available</p>');
    } catch {
      setExpandedId(id);
      setExpandedHtml('<p style="color:#ef4444;text-align:center;padding:40px;">Failed to load report</p>');
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  // Styles
  const s = {
    page: { padding: '40px 60px', maxWidth: '900px', margin: '0 auto', width: '100%' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', color: '#fafafa', display: 'flex', alignItems: 'center', gap: '12px' },
    subtitle: { fontSize: '14px', color: '#71717a', marginTop: '4px' },
    sendBtn: {
      background: '#ffffff', color: '#09090b', border: 'none', borderRadius: '10px',
      padding: '10px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '8px',
      transition: 'all 0.15s ease', fontFamily: 'inherit',
    },
    sendBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
    card: {
      background: '#18181b', border: '1px solid #27272a', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '12px', transition: 'border-color 0.2s',
    },
    cardRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', cursor: 'pointer', transition: 'background 0.15s',
    },
    cardLeft: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
    subject: { fontSize: '15px', fontWeight: 500, color: '#fafafa', lineHeight: 1.4 },
    meta: { fontSize: '13px', color: '#71717a', display: 'flex', alignItems: 'center', gap: '12px' },
    badge: (status) => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.5px',
      background: status === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      color: status === 'sent' ? '#10b981' : '#ef4444',
      border: `1px solid ${status === 'sent' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
    }),
    expandIcon: (expanded) => ({
      color: '#71717a', transition: 'transform 0.2s',
      transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
    }),
    preview: {
      borderTop: '1px solid #27272a', background: '#121214',
    },
    iframe: {
      width: '100%', border: 'none', minHeight: '600px', background: '#09090b',
    },
    empty: {
      textAlign: 'center', padding: '80px 40px', color: '#71717a',
    },
    emptyIcon: { fontSize: '48px', marginBottom: '16px', opacity: 0.5 },
    toast: (type) => ({
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
      padding: '14px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
      animation: 'slide-up 0.3s ease-out',
      background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
      color: type === 'success' ? '#10b981' : '#ef4444',
      border: `1px solid ${type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      backdropFilter: 'blur(12px)',
    }),
    spinner: {
      width: '16px', height: '16px',
      border: '2px solid #27272a', borderTopColor: '#09090b',
      borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    },
    loadingWrap: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '80px', color: '#71717a',
    },
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fafafa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Email Reports
          </div>
          <div style={s.subtitle}>
            Daily focus reports sent to {user?.email || 'your email'} at 6:00 PM
          </div>
        </div>
        <button
          style={{ ...s.sendBtn, ...(sending ? s.sendBtnDisabled : {}) }}
          onClick={handleSendNow}
          disabled={sending}
          onMouseEnter={e => { if (!sending) { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1.02)'; }}}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {sending ? (
            <>
              <div style={s.spinner} />
              Sending...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send Now
            </>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={s.loadingWrap}>
          <div style={{ ...s.spinner, width: '24px', height: '24px', borderColor: '#27272a', borderTopColor: '#fafafa' }} />
        </div>
      ) : emails.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📭</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#a1a1aa', marginBottom: '8px' }}>No reports yet</div>
          <div style={{ fontSize: '14px', color: '#52525b', maxWidth: '360px', margin: '0 auto', lineHeight: 1.6 }}>
            Your daily focus reports will appear here. Click <strong style={{ color: '#fafafa' }}>Send Now</strong> to generate your first report, or wait for the automatic 6 PM delivery.
          </div>
        </div>
      ) : (
        <div>
          {emails.map((email, i) => (
            <div
              key={email.id}
              style={{ ...s.card, animationDelay: `${i * 40}ms`, animation: 'slide-up 0.3s ease-out forwards', opacity: 0 }}
            >
              <div
                style={s.cardRow}
                onClick={() => toggleExpand(email.id)}
                onMouseEnter={e => e.currentTarget.style.background = '#1c1c1f'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={s.cardLeft}>
                  <div style={s.subject}>{email.subject || 'Daily Report'}</div>
                  <div style={s.meta}>
                    <span>📅 {formatDate(email.sent_at)}</span>
                    <span>🕐 {formatTime(email.sent_at)}</span>
                    <span>📧 {email.recipient_email}</span>
                    <span style={s.badge(email.status)}>
                      {email.status === 'sent' ? '✓' : '✗'} {email.status}
                    </span>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={s.expandIcon(expandedId === email.id)}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {expandedId === email.id && (
                <div style={s.preview}>
                  <iframe
                    ref={iframeRef}
                    srcDoc={expandedHtml}
                    style={s.iframe}
                    title="Email Preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && <div style={s.toast(toast.type)}>{toast.message}</div>}
    </div>
  );
}
