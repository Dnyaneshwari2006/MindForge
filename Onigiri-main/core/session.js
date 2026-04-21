const crypto = require('crypto');

/**
 * MindForge Session Manager
 * 
 * During an active session:
 *   - Events stored in memory (fast, no network)
 *   - Scorer reads from memory (instant)
 *   - Score updates in real-time
 * 
 * When session ends:
 *   - Summary computed (avg score, deep work minutes, categories)
 *   - Summary pushed to Supabase
 *   - Memory cleared
 */

let currentSession = null;

/**
 * Start a new focus session
 */
function startSession(goal = 'Focus Session', mode = 'basic', allowedApps = [], tagId = null) {
  if (currentSession) {
    console.log('[Session] Session already active, ending previous one first');
    const summary = endSession();
    // Don't return summary here, just end silently
  }

  currentSession = {
    id: crypto.randomUUID(),
    startTime: Date.now(),
    goal,
    mode, // 'basic' or 'exam'
    tagId, // tied subject tag
    allowedApps: allowedApps.map(a => a.toLowerCase()),
    events: [],
    scores: [],
    violations: {}, // track violation start times
    // Extension browser data accumulator — keyed by hostname, NOT pruned
    browserTabs: {}, // { [hostname]: { hostname, category, contentType, active_seconds, visits, lastSeen } }
    // Break / Pause state
    paused: false,
    breakCount: 0,
    breakStartTime: null,
    totalBreakMs: 0,
  };

  console.log(`[Session] ▶ Started: "${goal}" (ID: ${currentSession.id.slice(0, 8)}) [Mode: ${mode}]`);
  return {
    id: currentSession.id,
    startTime: currentSession.startTime,
    goal,
    mode,
    allowedApps,
    tagId,
  };
}

/**
 * End the current session and return summary
 */
function endSession() {
  if (!currentSession) {
    console.log('[Session] No active session to end');
    return null;
  }

  const session = currentSession;
  const endTime = Date.now();
  const durationMs = endTime - session.startTime;
  const durationMinutes = Math.round(durationMs / 60000);

  // Compute average score
  const avgScore = session.scores.length > 0
    ? Math.round(session.scores.reduce((a, b) => a + b, 0) / session.scores.length)
    : 0;

  // Compute time breakdown
  const breakdown = computeTimeBreakdown(session.events);

  // Compute content type breakdown
  const contentTypeBreakdown = computeContentTypeBreakdown(session.events);

  // Deep work minutes = minutes with score >= 70
  const deepWorkMinutes = Math.round(
    (session.scores.filter(s => s >= 70).length * 30) / 60 // each score = 30s cycle
  );

  // Flatten browserTabs map into an array for Supabase insertion
  const browserTabsArray = Object.values(session.browserTabs || {});

  const summary = {
    id: session.id,
    start_time: session.startTime,
    end_time: endTime,
    goal: session.goal,
    duration_minutes: durationMinutes,
    avg_score: avgScore,
    deep_work_minutes: deepWorkMinutes,
    total_events: session.events.length,
    breakdown,
    contentTypeBreakdown,
    scores: [...session.scores],
    browserTabs: browserTabsArray, // per-site data from extension
    tagId: session.tagId,
  };

  console.log(`[Session] ⏹ Ended: "${session.goal}" — ${durationMinutes}min, avg score: ${avgScore}, deep work: ${deepWorkMinutes}min`);

  // Clear current session
  currentSession = null;

  return summary;
}

/**
 * Pause the current session (start a break)
 * Break is capped at 20 minutes — auto-resumes after that.
 */
function pauseSession() {
  if (!currentSession || currentSession.paused) {
    return { ok: false, reason: 'No active session or already paused' };
  }
  currentSession.paused = true;
  currentSession.breakStartTime = Date.now();
  currentSession.breakCount += 1;
  console.log(`[Session] ⏸ Paused (break #${currentSession.breakCount})`);
  return { ok: true, breakCount: currentSession.breakCount, breakStartTime: currentSession.breakStartTime };
}

/**
 * Resume from a break
 */
function resumeSession() {
  if (!currentSession || !currentSession.paused) {
    return { ok: false, reason: 'No active session or not paused' };
  }
  const breakDuration = Date.now() - currentSession.breakStartTime;
  currentSession.totalBreakMs += breakDuration;
  currentSession.paused = false;
  currentSession.breakStartTime = null;
  console.log(`[Session] ▶ Resumed after ${Math.round(breakDuration / 1000)}s break`);
  return { ok: true, breakDuration, totalBreakMs: currentSession.totalBreakMs };
}

/**
 * Check if session is paused
 */
function isPaused() {
  return currentSession !== null && currentSession.paused === true;
}

/**
 * Add an event to the current session
 */
function addEvent(source, appName, url, category, isIdle = false, contentType = 'text') {
  if (!currentSession || currentSession.paused) return;

  currentSession.events.push({
    timestamp: Date.now(),
    source,
    app: appName,
    url,
    category,
    is_idle: isIdle,
    contentType: contentType || 'text',
  });

  // Keep memory bounded: only keep last 5 minutes of events
  // (older events are already scored and don't need to stay)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  if (currentSession.events.length > 200) {
    currentSession.events = currentSession.events.filter(e => e.timestamp >= fiveMinAgo);
  }
}

/**
 * Add or merge a browser tab event from the Chrome extension.
 * Called on every POST /browser-event during an active session.
 * This accumulator is NOT pruned — it survives the full session.
 * 
 * @param {string} hostname  - e.g. "github.com"
 * @param {string} url       - full URL
 * @param {string} category  - "productive" | "distraction" | "neutral"
 * @param {string} contentType - "text" | "video" | "audio" | "interactive"
 * @param {number} elapsedSec - seconds since last event for this tab (optional, for accumulation)
 */
function addBrowserTab(hostname, url, category, contentType, elapsedSec = 0) {
  if (!currentSession || !hostname) return;

  const cleanHost = hostname.replace(/^www\./, '');
  const cat = category || 'neutral';
  const key = `${cleanHost}|${cat}`;
  
  const existing = currentSession.browserTabs[key];

  if (existing) {
    // Update contentType to latest classification (time accumulates per category)
    existing.contentType = contentType || existing.contentType;
    existing.active_seconds += elapsedSec;
    existing.visits += 1;
    // Don't modify category since the key enforces the split
    existing.lastSeen = Date.now();
  } else {
    currentSession.browserTabs[key] = {
      hostname: cleanHost,
      url: url || '',
      category: cat,
      contentType: contentType || 'text',
      active_seconds: elapsedSec,
      visits: 1,
      lastSeen: Date.now(),
    };
  }
}

/**
 * Get the current browser tabs accumulator (snapshot for status checks)
 */
function getBrowserTabs() {
  if (!currentSession) return {};
  return { ...currentSession.browserTabs };
}

/**
 * Record a computed score
 */
function addScore(score) {
  if (!currentSession || currentSession.paused) return;
  currentSession.scores.push(score);
}

/**
 * Get recent events from session memory
 * @param {number} seconds — how far back to look
 */
function getRecentSessionEvents(seconds = 60) {
  if (!currentSession) return [];

  const since = Date.now() - seconds * 1000;
  return currentSession.events.filter(e => e.timestamp >= since);
}

/**
 * Check if a session is currently active
 */
function isActive() {
  return currentSession !== null;
}

/**
 * Get current session status
 */
function getStatus() {
  if (!currentSession) {
    return { active: false };
  }

  const elapsed = Date.now() - currentSession.startTime;
  const elapsedMinutes = Math.round(elapsed / 60000);
  const lastScore = currentSession.scores.length > 0
    ? currentSession.scores[currentSession.scores.length - 1]
    : null;

  return {
    active: true,
    paused: currentSession.paused || false,
    id: currentSession.id,
    goal: currentSession.goal,
    mode: currentSession.mode,
    tagId: currentSession.tagId,
    allowedApps: currentSession.allowedApps,
    startTime: currentSession.startTime,
    elapsedMinutes,
    totalScores: currentSession.scores.length,
    lastScore,
    avgScore: currentSession.scores.length > 0
      ? Math.round(currentSession.scores.reduce((a, b) => a + b, 0) / currentSession.scores.length)
      : 0,
    breakCount: currentSession.breakCount || 0,
    breakStartTime: currentSession.breakStartTime,
    totalBreakMs: currentSession.totalBreakMs || 0,
  };
}

/**
 * Get internal session config (for watcher)
 */
function getConfig() {
  if (!currentSession) return null;
  return {
    mode: currentSession.mode,
    allowedApps: currentSession.allowedApps,
    violations: currentSession.violations,
  };
}

/**
 * Update violation trackers
 */
function setViolationStart(appName, timestamp) {
  if (!appName) return;
  if (!currentSession.violations[appName]) {
    currentSession.violations[appName] = timestamp;
  }
}
function clearViolation(appName) {
  if (!appName) return;
  delete currentSession.violations[appName];
}

/**
 * Compute time breakdown from events array
 */
function computeTimeBreakdown(events) {
  if (events.length === 0) return { productive: 0, distraction: 0, browser: 0, neutral: 0, idle: 0 };

  let productive = 0, distraction = 0, browser = 0, neutral = 0, idle = 0;
  const now = Date.now();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = (i + 1 < events.length) ? events[i + 1].timestamp : now;
    const dur = Math.max(0, next - e.timestamp);

    if (e.is_idle) idle += dur;
    else if (e.category === 'productive') productive += dur;
    else if (e.category === 'distraction') distraction += dur;
    else if (e.category === 'browser') browser += dur;
    else neutral += dur;
  }

  return {
    productive: Math.round(productive / 1000),
    distraction: Math.round(distraction / 1000),
    browser: Math.round(browser / 1000),
    neutral: Math.round(neutral / 1000),
    idle: Math.round(idle / 1000),
  };
}

/**
 * Compute content type breakdown from events array
 */
function computeContentTypeBreakdown(events) {
  if (events.length === 0) return { text: 0, video: 0, interactive: 0, audio: 0 };

  let text = 0, video = 0, interactive = 0, audio = 0;
  const now = Date.now();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = (i + 1 < events.length) ? events[i + 1].timestamp : now;
    const dur = Math.max(0, next - e.timestamp);

    const ct = e.contentType || 'text';
    if (ct === 'video') video += dur;
    else if (ct === 'interactive') interactive += dur;
    else if (ct === 'audio') audio += dur;
    else text += dur;
  }

  return {
    text: Math.round(text / 1000),
    video: Math.round(video / 1000),
    interactive: Math.round(interactive / 1000),
    audio: Math.round(audio / 1000),
  };
}

module.exports = {
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  isPaused,
  addEvent,
  addScore,
  getRecentSessionEvents,
  isActive,
  getStatus,
  getConfig,
  setViolationStart,
  clearViolation,
  addBrowserTab,
  getBrowserTabs,
};
