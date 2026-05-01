/**
 * MindForge API layer
 * All HTTP calls go through /api (Vite proxies to Express :39871).
 * WebSocket connects directly to ws://localhost:39871.
 *
 * CLOUD / DEMO MODE: When deployed to Vercel/Netlify there is no local Express
 * backend. IS_CLOUD is true when running on a non-localhost domain.
 * In cloud mode all Express API calls return MOCK DATA so the UI is fully
 * functional as a showcase / demo.
 */

import { IS_DEMO } from './supabaseClient';

const BASE = '/api'; // proxied by Vite to http://localhost:39871

// Detect cloud deployment: hostname is not localhost / 192.168.x / 10.x
export const IS_CLOUD = typeof window !== 'undefined' &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname) &&
  !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);

/** True when backend is unavailable — either cloud deployment or missing env vars */
export const IS_DEMO_MODE = IS_CLOUD || IS_DEMO;

// WS URL — only used locally (watcher + scorer run on the student's PC)
const WS_PORT = 39871;
function getWsUrl() {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `ws://${host}:${WS_PORT}`;
}

// ─── Generic fetch helper ─────────────────────────────────
// Returns null (instead of throwing) in cloud mode so components
// can render a graceful "feature not available in demo" state.
async function apiFetch(path, options = {}) {
  if (IS_CLOUD) return null; // no local Express in cloud deployment

  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════
//  MOCK DATA GENERATORS — used in cloud / demo mode
// ═══════════════════════════════════════════════════════════

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mockDailySummary() {
  return {
    avgScore: randomBetween(60, 92),
    totalSessions: randomBetween(3, 8),
    deepWorkMin: randomBetween(45, 180),
    habitsCompleted: 2,
    habitsTotal: 3,
  };
}

function mockRamp() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    goal: 120,
    dailyMinutes: days.map(d => ({ day: d, minutes: randomBetween(15, 90) })),
    todayMinutes: randomBetween(20, 80),
  };
}

function mockDebt() {
  return { debtMinutes: randomBetween(0, 45), targetMinutes: 120 };
}

function mockHeatmap() {
  const out = [];
  for (let i = 90; i >= 0; i--) {
    if (Math.random() > 0.3) {
      const d = new Date(Date.now() - i * 86400000);
      out.push({ date: d.toISOString().slice(0, 10), avg_score: randomBetween(25, 95) });
    }
  }
  return out;
}

function mockDashboardStats() {
  return {
    avgFocusScore: randomBetween(62, 88),
    totalSessions: randomBetween(12, 35),
    totalDeepWorkMin: randomBetween(180, 600),
    totalProductiveSec: randomBetween(8000, 20000),
    totalDistractionSec: randomBetween(1000, 5000),
    totalNeutralSec: randomBetween(1000, 4000),
    currentStreak: randomBetween(1, 14),
  };
}

function mockSessionsHistory() {
  const goals = ['Study React Hooks', 'DSA Practice', 'Read Research Paper', 'Build UI Component', 'Math Revision', 'Physics Notes', 'ML Assignment'];
  return {
    sessions: goals.map((g, i) => ({
      id: `demo-${i}`,
      goal: g,
      avg_score: randomBetween(50, 95),
      deep_work_minutes: randomBetween(15, 55),
      start_time: Date.now() - (i + 1) * 3600000 * 3,
    })),
  };
}

function mockAnalytics() {
  const days = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({
      date: d.toISOString().slice(0, 10),
      deepWork: randomBetween(10, 50),
      avgScore: randomBetween(50, 92),
      sessions: randomBetween(1, 5),
    });
  }
  return {
    dailyStats: days,
    bestHours: [
      { hour: 9, avgScore: 92 }, { hour: 10, avgScore: 88 },
      { hour: 14, avgScore: 85 }, { hour: 11, avgScore: 78 },
      { hour: 16, avgScore: 72 },
    ],
  };
}

function mockTabs() {
  return [
    { hostname: 'github.com', total_seconds: 4200, productive_seconds: 4200, distraction_seconds: 0, neutral_seconds: 0, visits: 32 },
    { hostname: 'leetcode.com', total_seconds: 3600, productive_seconds: 3600, distraction_seconds: 0, neutral_seconds: 0, visits: 18 },
    { hostname: 'stackoverflow.com', total_seconds: 2100, productive_seconds: 1800, distraction_seconds: 0, neutral_seconds: 300, visits: 24 },
    { hostname: 'youtube.com', total_seconds: 1800, productive_seconds: 600, distraction_seconds: 900, neutral_seconds: 300, visits: 15 },
    { hostname: 'docs.google.com', total_seconds: 1500, productive_seconds: 1500, distraction_seconds: 0, neutral_seconds: 0, visits: 8 },
    { hostname: 'reddit.com', total_seconds: 900, productive_seconds: 0, distraction_seconds: 900, neutral_seconds: 0, visits: 12 },
    { hostname: 'chatgpt.com', total_seconds: 2400, productive_seconds: 2000, distraction_seconds: 0, neutral_seconds: 400, visits: 20 },
  ];
}

function mockHabits() {
  return { read_done: false, meditation_done: false, session_done: false, streak_count: randomBetween(0, 12) };
}

function mockTags() {
  return [
    { id: 't1', name: 'Data Structures', color: '#a78bfa', target_minutes: 60, target_type: 'daily', logged_minutes: 42 },
    { id: 't2', name: 'Web Dev', color: '#22c55e', target_minutes: 120, target_type: 'daily', logged_minutes: 95 },
    { id: 't3', name: 'Mathematics', color: '#f59e0b', target_minutes: 300, target_type: 'weekly', logged_minutes: 210 },
  ];
}

function mockTasks() {
  return [
    { id: '1', title: 'Finish React project', quadrant: 'do_first', completed: false, dueDate: null },
    { id: '2', title: 'Review pull requests', quadrant: 'do_first', completed: false, dueDate: null },
    { id: '3', title: 'Prepare presentation slides', quadrant: 'schedule', completed: false, dueDate: null },
    { id: '4', title: 'Research new CSS frameworks', quadrant: 'delegate', completed: false, dueDate: null },
    { id: '5', title: 'Clean up old branches', quadrant: 'eliminate', completed: true, dueDate: null },
  ];
}

// ─── Session ─────────────────────────────────────────────
export const sessionApi = {
  /** Start a new session, returns { id, startTime, goal, mode, allowedApps } */
  start: (goal, mode, allowedApps, tagId = null, djangoId = null) => {
    if (IS_CLOUD) return Promise.resolve({ id: 'demo-session', startTime: Date.now(), goal, mode, allowedApps });
    return apiFetch('/session/start', {
      method: 'POST',
      body: JSON.stringify({ goal, mode, allowedApps, tagId, djangoId }),
    });
  },

  /** End the current session, returns { ok, summary } */
  end: () => {
    if (IS_CLOUD) return Promise.resolve({ ok: true, summary: { avgScore: 78, deepWorkMin: 32 } });
    return apiFetch('/session/end', { method: 'POST' });
  },

  /** Pause session (take a break) */
  pause: () => {
    if (IS_CLOUD) return Promise.resolve({ ok: true, breakCount: 1 });
    return apiFetch('/session/pause', { method: 'POST' });
  },

  /** Resume session (end break) */
  resume: () => {
    if (IS_CLOUD) return Promise.resolve({ ok: true });
    return apiFetch('/session/resume', { method: 'POST' });
  },

  /** Get current session status */
  status: () => {
    if (IS_CLOUD) return Promise.resolve({ active: false });
    return apiFetch('/session/status');
  },
};

// ─── Dashboard ───────────────────────────────────────────
export const dashboardApi = {
  summary: () => IS_CLOUD ? Promise.resolve(mockDailySummary()) : apiFetch('/summary/today'),
  ramp:    () => IS_CLOUD ? Promise.resolve(mockRamp()) : apiFetch('/ramp'),
  debt:    () => IS_CLOUD ? Promise.resolve(mockDebt()) : apiFetch('/debt'),
  heatmap: () => IS_CLOUD ? Promise.resolve(mockHeatmap()) : apiFetch('/scores/heatmap'),
  stats:   (range = 'week') => IS_CLOUD ? Promise.resolve(mockDashboardStats()) : apiFetch(`/dashboard/stats?range=${range}`),
  sessions: (limit = 20, offset = 0) => IS_CLOUD ? Promise.resolve(mockSessionsHistory()) : apiFetch(`/sessions/history?limit=${limit}&offset=${offset}`),
};

// ─── Analytics ───────────────────────────────────────────
export const analyticsApi = {
  get: (range = 'week') => IS_CLOUD ? Promise.resolve(mockAnalytics()) : apiFetch(`/analytics?range=${range}`),
  timeBreakdown: (days = 7) => IS_CLOUD ? Promise.resolve({}) : apiFetch(`/analytics/time-breakdown?days=${days}`),
  studyHabits: () => IS_CLOUD ? Promise.resolve({}) : apiFetch('/analytics/study-habits'),
  topGoal: () => IS_CLOUD ? Promise.resolve({ goal: 'Deep Learning' }) : apiFetch('/analytics/top-goal'),
  tabsDetail: (days = 7) => IS_CLOUD ? Promise.resolve(mockTabs()) : apiFetch(`/analytics/tabs-detail?days=${days}`),
  perSite: (days = 7, category = null) => {
    if (IS_CLOUD) return Promise.resolve(mockTabs());
    let url = `/analytics/per-site?days=${days}`;
    if (category) url += `&category=${category}`;
    return apiFetch(url);
  },
};

// ─── Habits ──────────────────────────────────────────────
export const habitsApi = {
  get: (date) => {
    if (IS_CLOUD) return Promise.resolve(mockHabits());
    const d = date || new Date().toISOString().slice(0, 10);
    return apiFetch(`/habits?date=${d}`);
  },
  complete: (habit) => {
    if (IS_CLOUD) return Promise.resolve({ ok: true });
    return apiFetch('/habit-complete', { method: 'POST', body: JSON.stringify({ habit }) });
  },
};

// ─── Tags ────────────────────────────────────────────────
export const tagsApi = {
  getAll: () => IS_CLOUD ? Promise.resolve(mockTags()) : apiFetch('/tags'),
  create: (tagData) => {
    if (IS_CLOUD) return Promise.resolve({ id: 'demo-tag', ...tagData });
    return apiFetch('/tags', { method: 'POST', body: JSON.stringify(tagData) });
  },
  getSessions: (tagId, days = 30) => {
    if (IS_CLOUD) return Promise.resolve([]);
    return apiFetch(`/tags/${tagId}/sessions?days=${days}`);
  },
};

// ─── Eisenhower Matrix ───────────────────────────────────
export const matrixApi = {
  getTasks: () => IS_CLOUD ? Promise.resolve(mockTasks()) : apiFetch('/matrix'),
  createTask: (title, quadrant = 'inbox', googleEventId = null, dueDate = null) => {
    if (IS_CLOUD) {
      const task = { id: `demo-${Date.now()}`, title, quadrant, completed: false, googleEventId, dueDate };
      return Promise.resolve(task);
    }
    return apiFetch('/matrix', { method: 'POST', body: JSON.stringify({ title, quadrant, googleEventId, dueDate }) });
  },
  updateTask: (id, updates) => {
    if (IS_CLOUD) return Promise.resolve({ id, ...updates });
    return apiFetch(`/matrix/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },
  deleteTask: (id) => {
    if (IS_CLOUD) return Promise.resolve({ ok: true });
    return apiFetch(`/matrix/${id}`, { method: 'DELETE' });
  },
  completeTask: (id) => {
    if (IS_CLOUD) return Promise.resolve({ ok: true });
    return apiFetch(`/matrix/${id}/complete`, { method: 'POST' });
  },
  autoClassify: (tasks) => {
    if (IS_CLOUD) return Promise.resolve({ classifications: [] });
    return apiFetch('/ai-classify-tasks', { method: 'POST', body: JSON.stringify({ tasks }) });
  },
};

// ─── Google Calendar ─────────────────────────────────────
export const calendarApi = {
  getStatus: () => IS_CLOUD ? Promise.resolve({ connected: false }) : apiFetch('/calendar/status'),
  getAuthUrl: () => IS_CLOUD ? Promise.resolve({ url: '#' }) : apiFetch('/calendar/auth-url'),
  sync: () => IS_CLOUD ? Promise.resolve({ ok: true }) : apiFetch('/calendar/sync', { method: 'POST' }),
  export: () => IS_CLOUD ? Promise.resolve({ ok: true }) : apiFetch('/calendar/export', { method: 'POST' }),
};

// ─── AI validation (for permit apps) ─────────────────────
export const aiApi = {
  validateApp: (appName) => {
    if (IS_CLOUD) return Promise.resolve({ isProductive: true, reason: 'Demo mode — all apps allowed' });
    return apiFetch('/ai-validate', { method: 'POST', body: JSON.stringify({ appName }) });
  },
};

// ─── System / network info ────────────────────────────────
export const systemApi = {
  /** Returns the PC's LAN IP so QR codes point to the right host */
  networkInfo: () => {
    if (IS_CLOUD) return Promise.resolve({ preferred: window.location.hostname });
    return apiFetch('/network-info');
  },
};

// ─── Django PWA session bridge ────────────────────────────
// Django runs on port 8000 with its own SQLite DB.
// We must create a session there so the phone's WS consumer can validate it.
export const djangoApi = {
  /**
   * Create a Django session record.
   * Returns { session_id, pwa_url, ws_url }
   * session_id is Django's 6-char alphanumeric id (e.g. "AB12CD")
   */
  createSession: async (topic, durationMinutes = 30, pcIp = 'localhost') => {
    if (IS_CLOUD) return { session_id: 'DEMO01', pwa_url: '#', ws_url: '#' };
    const res = await fetch(`http://${pcIp}:8000/api/sessions/create/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, duration_minutes: durationMinutes }),
    });
    if (!res.ok) throw new Error(`Django createSession → ${res.status}`);
    return res.json(); // { session_id, pwa_url, ws_url }
  },

  /** End a Django session */
  endSession: async (sessionId, pcIp = 'localhost') => {
    if (IS_CLOUD) return {};
    const res = await fetch(`http://${pcIp}:8000/api/sessions/${sessionId}/end/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Django endSession → ${res.status}`);
    return res.status === 404 ? {} : res.json();
  },
};

// ─── Scraper ──────────────────────────────────────────────
export const scraperApi = {
  /**
   * Fetch web-scraped content (blogs, research papers) for a topic.
   * Calls the internal Express endpoint.
   */
  fetchContent: async (topic = 'Deep Learning') => {
    if (IS_CLOUD) {
      return {
        topic,
        results: [
          { title: 'Understanding Transformer Architecture', link: 'https://arxiv.org/abs/1706.03762', description: 'The foundational paper on attention mechanisms that revolutionized NLP and beyond.' },
          { title: 'A Practical Guide to Deep Learning', link: 'https://d2l.ai/', description: 'An interactive deep learning textbook with code, math, and discussions.' },
          { title: 'State of AI Report 2025', link: 'https://www.stateof.ai/', description: 'Annual report covering the most interesting developments in AI research and industry.' },
        ],
      };
    }
    return apiFetch('/scraped-content', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    });
  },
};

// ─── Email Reports ────────────────────────────────────────
export const emailApi = {
  /** Get list of sent email reports */
  getHistory: () => {
    if (IS_CLOUD) return Promise.resolve([
      { id: 1, subject: 'Daily Focus Report — May 1', sent_at: new Date().toISOString(), status: 'sent' },
      { id: 2, subject: 'Daily Focus Report — Apr 30', sent_at: new Date(Date.now() - 86400000).toISOString(), status: 'sent' },
    ]);
    return apiFetch('/email/history');
  },
  /** Get a single email report by ID (includes html_content) */
  getById: (id) => {
    if (IS_CLOUD) return Promise.resolve({ id, subject: 'Demo Report', html_content: '<h1>Demo Report</h1><p>This is a demo report. Deploy with backend for real reports.</p>' });
    return apiFetch(`/email/${id}`);
  },
  /** Manually trigger today's daily report */
  sendNow: (email = null) => {
    if (IS_CLOUD) return Promise.resolve({ ok: true, message: 'Demo mode — email not sent.' });
    return apiFetch('/email/send-now', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};

// ─── WebSocket hook ───────────────────────────────────────
import { useEffect, useRef, useCallback } from 'react';

/**
 * useWebSocket(onMessage)
 * Connects to the Electron backend WS server.
 * Auto-reconnects every 3s on disconnect.
 * Returns { send, connected }
 *
 * In CLOUD mode, returns a no-op that simulates periodic score updates.
 */
export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);
  const demoTimer = useRef(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // ── Cloud / demo mode: simulate WS score_update events ──
    if (IS_CLOUD) {
      demoTimer.current = setInterval(() => {
        if (onMessage) {
          onMessage({ type: 'score_update', score: randomBetween(55, 98) });
        }
      }, 10000); // every 10s like the real scorer
      return;
    }

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to MindForge backend');
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (onMessage) onMessage(data);
        } catch (_) {}
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected — reconnecting in 3s...');
        reconnectTimer.current = setTimeout(() => connect(), 3000);
      };

      ws.onerror = (e) => {
        console.warn('[WS] Error', e.message);
        ws.close();
      };
    } catch (err) {
      console.warn('[WS] Could not connect:', err.message);
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    }
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      clearInterval(demoTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (IS_CLOUD) return; // no-op in cloud mode
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}

// ─── Helper: map heatmap score (0-100) → CSS colour ──────
export function scoreToHeatColor(score) {
  if (!score || score === 0) return '#1f2937';
  if (score < 30) return '#14532d';
  if (score < 50) return '#166534';
  if (score < 70) return '#16a34a';
  if (score < 85) return '#22c55e';
  return '#4ade80';
}

// ─── Helper: format elapsed seconds → HH:MM:SS ───────────
export function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
