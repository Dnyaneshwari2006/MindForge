// MindForge Chrome Extension — Background Service Worker v3.0
// Central hub: tab monitoring, ML classification, WebSocket, session state, 
// time tracking, analytics, user feedback, break mode

import { classify, classifyWithAI, aiVerdictToResult, getDomainTier, ensureMLReady } from './classifier.js';
import { initKNN, addFeedbackExample, getFeedbackExamples, getKNNStats } from './ml/knnClassifier.js';
import {
  onTabActivated as trackerTabActivated,
  onTabClosed as trackerTabClosed,
  updateTabClassification,
  getTimeBreakdown,
  getPerSiteAnalytics,
  getSessionAnalytics,
  resetTracking,
  persistAnalytics,
  saveFeedbackExamples,
  loadFeedbackExamples,
  loadContentPreferences,
  saveContentPreferences,
} from './tracker.js';

// Primary: Web App local server (replaces Electron desktop app)
const WEB_SERVER_URL = 'http://localhost:39871';
const WEB_SERVER_WS  = 'ws://localhost:39871';

// ─── In-memory state ───

let sessionState = { active: false, sessionId: null, goal: '', score: 0, label: '', startTime: 0 };
let wsConnection = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let desktopAlive = false;
let lastClassification = {}; // { tabId: { category, confidence, label, hostname, contentType, method } }

// ─── Storage helpers (inline for service worker module) ───
// Using chrome.storage.local (5MB limit) instead of chrome.storage.sync (8KB/item limit)
// to avoid Resource::kQuotaBytesPerItem quota exceeded errors.

async function _storageGet(key, defaultVal) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? defaultVal;
  } catch (err) {
    console.warn(`[MindForge] storage.get(${key}) error:`, err.message);
    return defaultVal;
  }
}

async function _storageSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    console.warn(`[MindForge] storage.set(${key}) error:`, err.message);
  }
}

async function getAllowlist() { return await _storageGet('allowlist', []); }
async function getBlocklist() { return await _storageGet('blocklist', []); }

async function getSettings() {
  return await _storageGet('settings', {
    breakModeActive: false, breakModeEndsAt: 0, extensionEnabled: true,
  });
}

async function updateSettings(partial) {
  const settings = await getSettings();
  const updated = { ...settings, ...partial };
  await _storageSet('settings', updated);
  return updated;
}

async function isBreakModeActive() {
  const settings = await getSettings();
  if (!settings.breakModeActive) return false;
  if (Date.now() >= settings.breakModeEndsAt) {
    await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
    return false;
  }
  return true;
}

async function isExtensionEnabled() {
  const settings = await getSettings();
  return settings.extensionEnabled !== false;
}

async function addClassificationEntry(entry) {
  try {
    const history = await _storageGet('classificationHistory', []);
    history.unshift({
      hostname: entry.hostname,
      category: entry.category,
      confidence: entry.confidence,
      label: entry.label || '',
      contentType: entry.contentType || 'text',
      method: entry.method || '',
      timestamp: Date.now(),
    });
    if (history.length > 50) history.length = 50;
    await _storageSet('classificationHistory', history);
  } catch (err) {
    console.warn('[MindForge] addClassificationEntry error (non-fatal):', err.message);
  }
}

// ─── Desktop App Communication ───

/**
 * Ping Electron's /ping endpoint to check if the desktop app is running.
 */
async function checkElectronAlive() {
  try {
    const resp = await fetch(`${WEB_SERVER_URL}/ping`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      desktopAlive = true;
      return true;
    }
  } catch { /* not reachable */ }
  desktopAlive = false;
  return false;
}

async function sendEventToDesktop(url, title, category, confidence, contentType) {
  const payload = JSON.stringify({ url, title, category, confidence, contentType, timestamp: Date.now() });
  const headers = { 'Content-Type': 'application/json' };

  try {
    const resp = await fetch(`${WEB_SERVER_URL}/browser-event`, { method: 'POST', headers, body: payload });
    const data = await resp.json();
    desktopAlive = true;
    return data;
  } catch {
    desktopAlive = false;
    return null;
  }
}

async function sendAnalyticsToDesktop(analytics) {
  const payload = JSON.stringify(analytics);
  const headers = { 'Content-Type': 'application/json' };

  try {
    const resp = await fetch(`${WEB_SERVER_URL}/analytics/tab-time`, { method: 'POST', headers, body: payload });
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchSessionStatus() {
  try {
    const resp = await fetch(`${WEB_SERVER_URL}/session/status`, { signal: AbortSignal.timeout(2000) });
    const data = await resp.json();
    desktopAlive = true;
    return applySessionData(data);
  } catch {
    desktopAlive = false;
    return sessionState;
  }
}

/** Shared helper to apply session data from either server */
function applySessionData(data) {
  if (data.active && (data.session_id || data.id)) {
    sessionState = {
      active: true,
      sessionId: data.session_id || data.id,
      goal: data.goal || '',
      score: data.last_score || data.lastScore || data.avgScore || 0,
      label: data.label || 'Deep work',
      startTime: data.start_time || data.startTime || Date.now(),
      elapsedMinutes: data.elapsedMinutes || 0,
    };
    // Auto-connect WS if active
    connectWebSocket(sessionState.sessionId);
  } else {
    sessionState = { active: false, sessionId: null, goal: '', score: 0, label: '', startTime: 0 };
  }
  return sessionState;
}

// ─── WebSocket Connection ───

function connectWebSocket(sessionId) {
  if (wsConnection && wsConnection.readyState <= 1) return;

  const wsUrl = WEB_SERVER_WS;

  tryConnectWS(wsUrl, 'Web Server').catch(() => scheduleReconnect());
}

function tryConnectWS(url, label) {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`${label} WS timeout`));
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log(`[MindForge] WebSocket connected (${label}: ${url})`);
        wsConnection = ws;
        desktopAlive = true;
        wsReconnectDelay = 1000;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWSMessage(data);
        } catch (err) {
          console.warn('[MindForge] WebSocket parse error:', err.message);
        }
      };

      ws.onclose = () => {
        console.log(`[MindForge] WebSocket disconnected (${label})`);
        if (wsConnection === ws) {
          wsConnection = null;
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`${label} WS error`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

function scheduleReconnect() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(() => {
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
    if (sessionState.sessionId) {
      connectWebSocket(sessionState.sessionId);
    }
  }, wsReconnectDelay);
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'score':
      sessionState.score = data.score;
      sessionState.label = data.label;
      if (data.session) {
        sessionState.active = data.session.active;
        sessionState.goal = data.session.goal || sessionState.goal;
        sessionState.elapsedMinutes = data.session.elapsedMinutes || 0;
      }
      break;

    case 'intervention':
      forwardToActiveTab({ type: 'INTERVENTION', message: data.message, score: data.score });
      break;

    case 'session_started':
      sessionState = {
        active: true,
        goal: data.goal || '',
        score: 0,
        label: '',
        startTime: data.startTime || Date.now(),
        elapsedMinutes: 0,
      };
      // Reset tracking for new session
      resetTracking();
      classifyActiveTab();
      break;

    case 'session_ended': {
      // Send analytics to desktop before clearing
      const analytics = getSessionAnalytics();
      sendAnalyticsToDesktop(analytics).catch(() => {});
      // Save content preferences
      const breakdown = getTimeBreakdown();
      saveContentPreferences(breakdown.contentType).catch(() => {});
      // Persist analytics
      persistAnalytics().catch(() => {});

      sessionState = { active: false, goal: '', score: 0, label: '', startTime: 0 };
      broadcastToAllTabs({ type: 'HIDE_OVERLAY' });
      break;
    }

    case 'session_paused':
      sessionState.paused = true;
      broadcastToAllTabs({ type: 'HIDE_OVERLAY', reason: 'break' });
      break;

    case 'session_resumed':
      sessionState.paused = false;
      classifyActiveTab();
      break;

    case 'session_status':
      if (data.active) {
        sessionState.active = true;
        sessionState.sessionId = data.session_id || data.sessionId;
        sessionState.goal = data.goal || '';
        sessionState.score = data.lastScore || 0;
        sessionState.startTime = data.startTime || Date.now();
        sessionState.paused = data.paused || false;
      }
      break;
  }
}

// ─── External Messaging ───
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SESSION') {
    console.log('[MindForge] Received START_SESSION from Renderer', message.sessionId);
    sessionState.active = true;
    sessionState.sessionId = message.sessionId;
    
    // Reset tracking for new session
    resetTracking();

    connectWebSocket(message.sessionId);
    sendResponse({ ok: true });
  }
  return true;
});

// ─── Tab Communication Helpers ───

async function forwardToActiveTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch {
    // Content script may not be ready
  }
}

async function broadcastToAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  } catch {}
}

// ─── Classification Logic ───

async function classifyTab(tabId, url, title) {
  console.log(`[MindForge] classifyTab called — tab:${tabId} url:${url}`);

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    console.log('[MindForge] Skipping — internal URL');
    return;
  }

  const enabled = await isExtensionEnabled();
  if (!enabled) {
    console.log('[MindForge] Skipping — extension disabled');
    return;
  }

  // Check break mode
  const onBreak = sessionState.paused || await isBreakModeActive();
  if (onBreak) {
    console.log('[MindForge] Skipping — break mode / paused');
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY', reason: 'break' });
    } catch (e) { console.warn('[MindForge] sendMessage error (break):', e.message); }
    lastClassification[tabId] = { category: 'break', confidence: 1, label: 'Break mode', hostname: '' };
    return;
  }

  // Build extracted content
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch {}

  // Track tab activation
  trackerTabActivated(tabId, url, hostname);

  let extractedContent;
  try {
    extractedContent = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
    console.log(`[MindForge] Content extracted via content script: ${extractedContent?.extractionMethod}`);
  } catch (e) {
    console.log(`[MindForge] Content script not available, using basic info: ${e.message}`);
    extractedContent = { title: title || '', url, hostname, content: '', extractionMethod: 'none' };
  }

  if (!extractedContent || !extractedContent.url) {
    extractedContent = { title: title || '', url, hostname, content: '', extractionMethod: 'none' };
  }

  const allowlist = await getAllowlist();
  const blocklist = await getBlocklist();

  const result = await classify(
    extractedContent,
    sessionState.goal,
    allowlist,
    blocklist,
    sessionState.active
  );

  // Store result (now includes contentType and method)
  lastClassification[tabId] = { ...result, hostname: extractedContent.hostname };
  console.log(`[MindForge] ▸ Tab ${tabId} classified: ${result.category} (${result.confidence.toFixed(2)}) [${result.method}] — ${extractedContent.hostname} — contentType: ${result.contentType} — session:${sessionState.active}`);

  // Update tracker with classification result
  updateTabClassification(tabId, result.category, result.contentType);

  // Log to history (non-blocking — errors here must NOT prevent overlay display)
  addClassificationEntry({
    hostname: extractedContent.hostname,
    category: result.category,
    confidence: result.confidence,
    label: result.label,
    contentType: result.contentType,
    method: result.method,
  }).catch(err => console.warn('[MindForge] History log error:', err.message));

  // Send event to desktop app (non-blocking) via WS if active, else fallback to POST
  const eventPayload = {
    type: 'browser_signal',
    url: url,
    title: extractedContent.title,
    category: result.category,
    confidence: result.confidence,
    contentType: result.contentType,
    timestamp: Date.now()
  };

  if (sessionState.active && wsConnection && wsConnection.readyState === 1) {
    wsConnection.send(JSON.stringify(eventPayload));
  } else {
    // We don't necessarily need to ping if there's no session, but we can try POSTing to Django
    sendEventToDesktop(url, extractedContent.title, result.category, result.confidence, result.contentType)
      .catch(err => console.warn('[MindForge] Desktop event error:', err.message));
  }

  // Determine UI action based on classification
  if (!sessionState.active) {
    console.log('[MindForge] No active session — indicator only');
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: result.category,
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (indicator):', e.message); }
    return;
  }

  // Session is active — apply 3-tier AI-enhanced blocking
  // For ambiguous/neutral results OR low-confidence results, escalate to AI
  const needsAI = (
    result.category === 'neutral' ||
    (result.category === 'productive' && result.confidence < 0.7 && !result.method.includes('domain-tier')) ||
    (result.category === 'distraction' && result.confidence < 0.6 && !result.method.includes('domain-tier'))
  );

  if (needsAI && sessionState.goal) {
    console.log(`[MindForge] \u{1F916} Escalating to AI for ${extractedContent.hostname} (local: ${result.category} @ ${result.confidence.toFixed(2)})`);

    // Fire AI classification (non-blocking — show local result first, then override)
    classifyWithAI(extractedContent, sessionState.goal).then(async (aiResult) => {
      if (!aiResult) return; // AI unavailable, keep local result

      const aiClassification = aiVerdictToResult(aiResult, result);
      console.log(`[MindForge] \u{1F916} AI verdict: ${aiResult.verdict} \u2014 ${aiResult.reason}`);

      // Update classification cache
      lastClassification[tabId] = { ...aiClassification, hostname: extractedContent.hostname };
      updateTabClassification(tabId, aiClassification.category, aiClassification.contentType);

      // Send AI event to desktop
      const aiEventPayload = {
        type: 'browser_signal',
        url: url,
        title: extractedContent.title,
        category: aiClassification.category,
        confidence: aiClassification.confidence,
        contentType: aiClassification.contentType,
        aiVerdict: aiResult.verdict,
        aiReason: aiResult.reason,
        timestamp: Date.now()
      };
      if (wsConnection && wsConnection.readyState === 1) {
        wsConnection.send(JSON.stringify(aiEventPayload));
      }

      // Apply AI-powered UI action
      if (aiResult.verdict === 'DISTRACTION') {
        // BLOCK IT 🚫 — Full overlay, no mercy
        console.log(`[MindForge] \ud83d\udeab AI BLOCKED: ${extractedContent.hostname} \u2014 ${aiResult.reason}`);
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_OVERLAY',
            goal: sessionState.goal,
            score: sessionState.score,
            confidence: aiClassification.confidence,
            hostname: extractedContent.hostname,
            aiReason: aiResult.reason,
          });
        } catch (e) { console.warn('[MindForge] sendMessage error (ai-overlay):', e.message); }
      } else if (aiResult.verdict === 'STUDY_RELATED') {
        // Nudge — it's educational but off-topic
        console.log(`[MindForge] \ud83d\udcda AI NUDGE: ${extractedContent.hostname} \u2014 study-related but not ${sessionState.goal}`);
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_NUDGE',
            goal: sessionState.goal,
            confidence: aiClassification.confidence,
            hostname: extractedContent.hostname,
            aiReason: aiResult.reason,
          });
        } catch (e) { console.warn('[MindForge] sendMessage error (ai-nudge):', e.message); }
      } else {
        // GOAL_RELEVANT — all good, hide any existing overlays
        console.log(`[MindForge] \u{1F3AF} AI APPROVED: ${extractedContent.hostname} \u2014 relevant to ${sessionState.goal}`);
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY' });
          await chrome.tabs.sendMessage(tabId, {
            type: 'UPDATE_INDICATOR',
            category: 'productive',
            confidence: aiClassification.confidence,
          });
        } catch (e) { console.warn('[MindForge] sendMessage error (ai-approve):', e.message); }
      }
    }).catch(err => console.warn('[MindForge] AI classify promise error:', err.message));
  }

  // Meanwhile, apply LOCAL classification immediately (AI will override if needed)
  if (result.category === 'distraction') {
    if (result.confidence >= 0.75) {
      console.log(`[MindForge] \ud83d\udeab Showing FULL OVERLAY for ${extractedContent.hostname}`);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_OVERLAY',
          goal: sessionState.goal,
          score: sessionState.score,
          confidence: result.confidence,
          hostname: extractedContent.hostname,
        });
      } catch (e) { console.warn('[MindForge] sendMessage error (overlay):', e.message); }
    } else if (result.confidence >= 0.45) {
      console.log(`[MindForge] \u26a0 Showing NUDGE for ${extractedContent.hostname}`);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_NUDGE',
          goal: sessionState.goal,
          confidence: result.confidence,
          hostname: extractedContent.hostname,
        });
      } catch (e) { console.warn('[MindForge] sendMessage error (nudge):', e.message); }
    } else {
      console.log(`[MindForge] Low confidence distraction (${result.confidence.toFixed(2)}) \u2014 logging only`);
    }
  } else if (result.category === 'productive') {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY' });
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: 'productive',
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (productive):', e.message); }
  } else {
    // Neutral — start a 3-minute timer that will prompt the user
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_NEUTRAL_TIMER',
        goal: sessionState.goal,
        hostname: extractedContent.hostname,
        delayMs: 3 * 60 * 1000, // 3 minutes
      });
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: 'neutral',
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (neutral):', e.message); }
  }
}

async function classifyActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[MindForge] classifyActiveTab —', tab?.url || 'no tab');
    if (tab?.id && tab?.url) {
      await classifyTab(tab.id, tab.url, tab.title);
    }
  } catch (err) {
    console.error('[MindForge] classifyActiveTab error:', err);
  }
}

// ─── Tab Listeners ───

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log(`[MindForge] Tab activated: ${activeInfo.tabId}`);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await classifyTab(tab.id, tab.url, tab.title);
    }
  } catch (err) {
    console.error('[MindForge] Tab activated error:', err);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log(`[MindForge] Tab updated (complete): ${tabId} — ${tab.url}`);
    await classifyTab(tabId, tab.url, tab.title);
  }
});

// Clean up classification cache and tracker when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete lastClassification[tabId];
  trackerTabClosed(tabId);
});

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[MindForge] Message handler error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep sendResponse alive for async
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_SESSION_STATUS':
      return {
        ...sessionState,
        desktopAlive,
        breakModeActive: await isBreakModeActive(),
        breakModeEndsAt: (await getSettings()).breakModeEndsAt,
      };

    case 'GET_CLASSIFICATION': {
      const tabId = message.tabId || sender.tab?.id;
      return lastClassification[tabId] || { category: 'unknown', confidence: 0, label: '' };
    }

    case 'START_BREAK': {
      const minutes = message.minutes || 5;
      const endsAt = Date.now() + minutes * 60 * 1000;
      await updateSettings({ breakModeActive: true, breakModeEndsAt: endsAt });
      await broadcastToAllTabs({ type: 'HIDE_OVERLAY', reason: 'break' });
      return { ok: true, endsAt };
    }

    case 'END_BREAK':
      await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
      await classifyActiveTab();
      return { ok: true };

    case 'ADD_TO_ALLOWLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!h) return { ok: false, error: 'No hostname' };
      const list = await getAllowlist();
      if (!list.includes(h)) {
        list.push(h);
        await _storageSet('allowlist', list);
      }
      await classifyActiveTab();
      return { ok: true, allowlist: list };
    }

    case 'ADD_TO_BLOCKLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!h) return { ok: false, error: 'No hostname' };
      const list = await getBlocklist();
      if (!list.includes(h)) {
        list.push(h);
        await _storageSet('blocklist', list);
      }
      await classifyActiveTab();
      return { ok: true, blocklist: list };
    }

    case 'REMOVE_FROM_ALLOWLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      let list = await getAllowlist();
      list = list.filter(d => d !== h);
      await _storageSet('allowlist', list);
      return { ok: true, allowlist: list };
    }

    case 'REMOVE_FROM_BLOCKLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      let list = await getBlocklist();
      list = list.filter(d => d !== h);
      await _storageSet('blocklist', list);
      return { ok: true, blocklist: list };
    }

    case 'OVERRIDE_CLASSIFICATION': {
      // User clicked "continue anyway" or "this is relevant"
      await addClassificationEntry({
        hostname: message.hostname,
        category: 'override',
        confidence: 0,
        label: `User override: ${message.originalCategory}`,
      });
      return { ok: true };
    }

    // ═══════════════════════════════════════
    //  NEW: User Feedback for ML Learning
    // ═══════════════════════════════════════
    case 'SUBMIT_FEEDBACK': {
      // User labeled a page as productive/distraction via popup
      const extractedContent = {
        title: message.title || '',
        url: message.url || '',
        hostname: message.hostname || '',
        content: message.content || '',
      };
      const category = message.category; // productive or distraction
      const goalText = sessionState.goal || '';

      const example = addFeedbackExample(extractedContent, category, goalText);

      // Persist feedback to storage
      const allExamples = getFeedbackExamples();
      await saveFeedbackExamples(allExamples);

      // Re-classify active tab with updated ML model
      await classifyActiveTab();

      console.log(`[MindForge] User feedback: ${category} for ${message.hostname} (goal: "${goalText}")`);
      return { ok: true, totalExamples: allExamples.length };
    }

    // ═══════════════════════════════════════
    //  NEW: Analytics Endpoints
    // ═══════════════════════════════════════
    case 'GET_ANALYTICS': {
      const timeBreakdown = getTimeBreakdown();
      const perSite = getPerSiteAnalytics();
      const knnStats = getKNNStats();
      return {
        timeBreakdown,
        perSite,
        mlStats: knnStats,
        sessionActive: sessionState.active,
        sessionGoal: sessionState.goal,
      };
    }

    case 'GET_CONTENT_PREFERENCES': {
      const prefs = await loadContentPreferences();
      const current = getTimeBreakdown();
      return {
        history: prefs,
        current: current.contentType,
      };
    }

    case 'GET_ML_STATS': {
      return getKNNStats();
    }

    case 'UPDATE_EXTENSION_ENABLED': {
      await updateSettings({ extensionEnabled: message.enabled });
      if (!message.enabled) {
        await broadcastToAllTabs({ type: 'HIDE_OVERLAY' });
      }
      return { ok: true };
    }

    case 'CLEAR_HISTORY':
      await _storageSet('classificationHistory', []);
      return { ok: true };

    case 'GET_HISTORY':
      return await _storageGet('classificationHistory', []);

    case 'GET_LISTS':
      return { allowlist: await getAllowlist(), blocklist: await getBlocklist() };

    case 'CONTENT_EXTRACTED': {
      const tabId = sender.tab?.id;
      const tabUrl = sender.tab?.url;
      if (tabId && message.data) {
        classifyTab(tabId, tabUrl || message.data.url, message.data.title).catch(() => {});
      }
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

async function injectContentScriptsIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    console.log(`[MindForge] Injecting content scripts into ${tabs.length} existing tabs`);
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['libs/Readability.js', 'extractor.js', 'content.js'],
        });
        console.log(`[MindForge] Injected into tab ${tab.id}: ${tab.url}`);
      } catch (e) {
        console.log(`[MindForge] Could not inject into tab ${tab.id}: ${e.message}`);
      }
    }
  } catch (err) {
    console.error('[MindForge] Error injecting content scripts:', err);
  }
}

async function initialize() {
  console.log('[MindForge] Extension v3.0 initializing (ML-enhanced)...');

  // ─── One-time migration: sync → local storage ───
  // Previous versions used chrome.storage.sync (8KB/item limit) which caused
  // Resource::kQuotaBytesPerItem errors. Migrate any existing data to local.
  try {
    const migrated = await chrome.storage.local.get('_migrated_from_sync');
    if (!migrated._migrated_from_sync) {
      console.log('[MindForge] Migrating data from sync → local storage...');
      const syncData = await chrome.storage.sync.get(null); // get everything
      if (syncData && Object.keys(syncData).length > 0) {
        // Copy settings/lists (skip overly large history to avoid issues)
        const toMigrate = {};
        for (const [key, val] of Object.entries(syncData)) {
          if (key === 'classificationHistory') continue; // skip — too large
          toMigrate[key] = val;
        }
        if (Object.keys(toMigrate).length > 0) {
          await chrome.storage.local.set(toMigrate);
          console.log(`[MindForge] Migrated ${Object.keys(toMigrate).length} keys from sync`);
        }
      }
      // Clear sync storage to free quota
      await chrome.storage.sync.clear();
      await chrome.storage.local.set({ _migrated_from_sync: true });
      console.log('[MindForge] Sync storage cleared, migration complete');
    }
  } catch (err) {
    console.warn('[MindForge] Migration error (non-fatal):', err.message);
  }

  // Initialize ML models
  try {
    ensureMLReady();
    console.log('[MindForge] ML models loaded');
  } catch (err) {
    console.error('[MindForge] ML init error:', err);
  }

  // Load user feedback for KNN
  try {
    const feedbackExamples = await loadFeedbackExamples();
    initKNN(feedbackExamples);
  } catch (err) {
    console.warn('[MindForge] Could not load feedback examples:', err.message);
    initKNN([]);
  }

  // Check if Electron desktop app is running
  await checkElectronAlive();
  console.log('[MindForge] Desktop alive:', desktopAlive);

  // Fetch session status (tries Electron first, then Django)
  await fetchSessionStatus();
  console.log('[MindForge] Session state:', JSON.stringify(sessionState));

  // Connect WebSocket (tries Electron first, then Django)
  if (sessionState.sessionId) {
    connectWebSocket(sessionState.sessionId);
  }

  // Inject content scripts into tabs that existed before the extension loaded
  await injectContentScriptsIntoExistingTabs();

  // Classify the current active tab
  await classifyActiveTab();

  console.log('[MindForge] Extension ready. Desktop:', desktopAlive ? 'connected' : 'disconnected',
    'Session:', sessionState.active ? `active ("${sessionState.goal}")` : 'inactive');
}

// Run on service worker start
initialize();
console.log('[MindForge] Service worker script loaded (v3.0 — ML-enhanced)');

// Periodic session status check (every 30s) + analytics persistence
setInterval(async () => {
  // Refresh desktop alive status
  await checkElectronAlive();
  // Refresh session state (Electron-first)
  await fetchSessionStatus();
  if (sessionState.active && sessionState.sessionId) {
    if (!wsConnection || wsConnection.readyState > 1) {
      connectWebSocket(sessionState.sessionId);
    }
  }
  // Periodically persist analytics
  if (sessionState.active) {
    persistAnalytics().catch(() => {});
  }
}, 30000);
