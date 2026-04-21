/**
 * MindForge API layer
 * All HTTP calls go through /api (Vite proxies to Express :39871).
 * WebSocket connects directly to ws://localhost:39871.
 */

const BASE = '/api'; // proxied by Vite to http://localhost:39871
// WS URL is dynamic: uses the same host the page was served from
// → works for both localhost (dev) and 192.168.x.x (mobile / LAN)
const WS_PORT = 39871;
function getWsUrl() {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `ws://${host}:${WS_PORT}`;
}

// ─── Generic fetch helper ─────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ─── Session ─────────────────────────────────────────────
export const sessionApi = {
  /** Start a new session, returns { id, startTime, goal, mode, allowedApps } */
  start: (goal, mode, allowedApps, tagId = null, djangoId = null) =>
    apiFetch('/session/start', {
      method: 'POST',
      body: JSON.stringify({ goal, mode, allowedApps, tagId, djangoId }),
    }),

  /** End the current session, returns { ok, summary } */
  end: () => apiFetch('/session/end', { method: 'POST' }),

  /** Pause session (take a break) */
  pause: () => apiFetch('/session/pause', { method: 'POST' }),

  /** Resume session (end break) */
  resume: () => apiFetch('/session/resume', { method: 'POST' }),

  /** Get current session status */
  status: () => apiFetch('/session/status'),
};

// ─── Dashboard ───────────────────────────────────────────
export const dashboardApi = {
  summary: () => apiFetch('/summary/today'),
  ramp:    () => apiFetch('/ramp'),
  debt:    () => apiFetch('/debt'),
  heatmap: () => apiFetch('/scores/heatmap'),
  stats:   (range = 'week') => apiFetch(`/dashboard/stats?range=${range}`),
  sessions: (limit = 20, offset = 0) => apiFetch(`/sessions/history?limit=${limit}&offset=${offset}`),
};

// ─── Analytics ───────────────────────────────────────────
export const analyticsApi = {
  get: (range = 'week') => apiFetch(`/analytics?range=${range}`),
  timeBreakdown: (days = 7) => apiFetch(`/analytics/time-breakdown?days=${days}`),
  studyHabits: () => apiFetch('/analytics/study-habits'),
  topGoal: () => apiFetch('/analytics/top-goal'),
  tabsDetail: (days = 7) => apiFetch(`/analytics/tabs-detail?days=${days}`),
  perSite: (days = 7, category = null) => {
    let url = `/analytics/per-site?days=${days}`;
    if (category) url += `&category=${category}`;
    return apiFetch(url);
  },
};

// ─── Habits ──────────────────────────────────────────────
export const habitsApi = {
  get: (date) => {
    const d = date || new Date().toISOString().slice(0, 10);
    return apiFetch(`/habits?date=${d}`);
  },
  complete: (habit) =>
    apiFetch('/habit-complete', { method: 'POST', body: JSON.stringify({ habit }) }),
};

// ─── Tags ────────────────────────────────────────────────
export const tagsApi = {
  getAll: () => apiFetch('/tags'),
  create: (tagData) => apiFetch('/tags', { method: 'POST', body: JSON.stringify(tagData) }),
  getSessions: (tagId, days = 30) => apiFetch(`/tags/${tagId}/sessions?days=${days}`),
};

// ─── Eisenhower Matrix ───────────────────────────────────
export const matrixApi = {
  getTasks: () => apiFetch('/matrix'),
  createTask: (title, quadrant = 'inbox', googleEventId = null, dueDate = null) =>
    apiFetch('/matrix', { method: 'POST', body: JSON.stringify({ title, quadrant, googleEventId, dueDate }) }),
  updateTask: (id, updates) =>
    apiFetch(`/matrix/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteTask: (id) =>
    apiFetch(`/matrix/${id}`, { method: 'DELETE' }),
  completeTask: (id) =>
    apiFetch(`/matrix/${id}/complete`, { method: 'POST' }),
  autoClassify: (tasks) => 
    apiFetch('/ai-classify-tasks', { method: 'POST', body: JSON.stringify({ tasks }) }),
};

// ─── Google Calendar ─────────────────────────────────────
export const calendarApi = {
  getStatus: () => apiFetch('/calendar/status'),
  getAuthUrl: () => apiFetch('/calendar/auth-url'),
  sync: () => apiFetch('/calendar/sync', { method: 'POST' }),
  export: () => apiFetch('/calendar/export', { method: 'POST' }),
};

// ─── AI validation (for permit apps) ─────────────────────
export const aiApi = {
  validateApp: (appName) =>
    apiFetch('/ai-validate', { method: 'POST', body: JSON.stringify({ appName }) }),
};

// ─── System / network info ────────────────────────────────
export const systemApi = {
  /** Returns the PC's LAN IP so QR codes point to the right host */
  networkInfo: () => apiFetch('/network-info'),
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
    return apiFetch('/scraped-content', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    });
  },
};

// ─── Email Reports ────────────────────────────────────────
export const emailApi = {
  /** Get list of sent email reports */
  getHistory: () => apiFetch('/email/history'),
  /** Get a single email report by ID (includes html_content) */
  getById: (id) => apiFetch(`/email/${id}`),
  /** Manually trigger today's daily report */
  sendNow: (email = null) =>
    apiFetch('/email/send-now', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

// ─── WebSocket hook ───────────────────────────────────────
import { useEffect, useRef, useCallback } from 'react';

/**
 * useWebSocket(onMessage)
 * Connects to the Electron backend WS server.
 * Auto-reconnects every 3s on disconnect.
 * Returns { send, connected }
 */
export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
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
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
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
