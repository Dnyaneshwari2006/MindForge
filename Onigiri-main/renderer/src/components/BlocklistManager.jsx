/**
 * BlocklistManager — Self-declared distracting sites UI
 *
 * Users add sites they consider distracting (YouTube, Reddit, etc.).
 * Stored in localStorage. Shown in the session init flow.
 *
 * When the Chrome extension IS installed, it reads this list
 * for active blocking. Without the extension, the list is shown
 * in the PiP timer as a "guilt reminder."
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mindforge_blocklist';

const SUGGESTIONS = [
  { name: 'YouTube', domain: 'youtube.com', emoji: '📺' },
  { name: 'Reddit', domain: 'reddit.com', emoji: '🟠' },
  { name: 'Twitter / X', domain: 'twitter.com', emoji: '🐦' },
  { name: 'Instagram', domain: 'instagram.com', emoji: '📸' },
  { name: 'TikTok', domain: 'tiktok.com', emoji: '🎵' },
  { name: 'Facebook', domain: 'facebook.com', emoji: '👤' },
  { name: 'Netflix', domain: 'netflix.com', emoji: '🎬' },
  { name: 'Discord', domain: 'discord.com', emoji: '💬' },
];

/** Load blocklist from localStorage */
export function getBlocklist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save blocklist to localStorage */
function saveBlocklist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function BlocklistManager({ blocklist, setBlocklist }) {
  const [customDomain, setCustomDomain] = useState('');

  // Initialize from localStorage on mount
  useEffect(() => {
    if (blocklist.length === 0) {
      const saved = getBlocklist();
      if (saved.length > 0) {
        setBlocklist(saved);
      }
    }
  }, []);

  // Save to localStorage whenever blocklist changes
  useEffect(() => {
    saveBlocklist(blocklist);
  }, [blocklist]);

  function addDomain(domain) {
    const clean = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
    if (!clean) return;
    if (blocklist.includes(clean)) return;
    setBlocklist(prev => [...prev, clean]);
  }

  function removeDomain(domain) {
    setBlocklist(prev => prev.filter(d => d !== domain));
  }

  function handleAddCustom() {
    if (customDomain.trim()) {
      addDomain(customDomain);
      setCustomDomain('');
    }
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <label style={{ color: '#9ca3af', fontSize: '14px', display: 'block', marginBottom: '10px' }}>
        Blocked sites (self-declared):
      </label>

      {/* Suggestion chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {SUGGESTIONS.map(s => {
          const isAdded = blocklist.includes(s.domain);
          return (
            <button
              key={s.domain}
              onClick={() => isAdded ? removeDomain(s.domain) : addDomain(s.domain)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s', border: 'none',
                background: isAdded ? 'rgba(239, 68, 68, 0.15)' : '#1a1a1a',
                color: isAdded ? '#ef4444' : '#9ca3af',
              }}
            >
              <span>{s.emoji}</span>
              <span>{s.name}</span>
              {isAdded && <span style={{ fontSize: '10px', marginLeft: '2px' }}>✕</span>}
            </button>
          );
        })}
      </div>

      {/* Active blocklist */}
      <div style={{
        background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px',
        padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px',
        alignItems: 'center', minHeight: '44px',
      }}>
        {blocklist.map(domain => (
          <span key={domain} style={{
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '6px', padding: '3px 8px', color: '#fca5a5',
            fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            🚫 {domain}
            <span
              onClick={() => removeDomain(domain)}
              style={{ color: '#6b7280', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
            >✕</span>
          </span>
        ))}
        <input
          value={customDomain}
          onChange={e => setCustomDomain(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
          placeholder="e.g. twitch.tv"
          style={{
            flex: 1, minWidth: '80px', background: 'transparent',
            border: 'none', outline: 'none', color: '#fff', fontSize: '12px',
          }}
        />
        <button
          onClick={handleAddCustom}
          style={{
            background: '#450a0a', color: '#fca5a5', border: 'none',
            borderRadius: '6px', padding: '3px 10px', fontSize: '11px',
            cursor: 'pointer', fontWeight: 600,
          }}
        >+ Block</button>
      </div>

      <p style={{ color: '#4b5563', fontSize: '12px', margin: '6px 0 0 0' }}>
        These sites will show as reminders in the floating timer
      </p>
    </div>
  );
}
