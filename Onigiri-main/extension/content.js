// MindForge Chrome Extension — Content Script
// Injected into every page. Handles:
// 1. Content extraction (via extractor.js)
// 2. Overlay injection (via overlay/overlay.js Shadow DOM)
// 3. Focus indicator dot
// 4. Message handling from background.js

// Guard: prevent double-injection (extension reload / SPA re-inject)
if (window.__MINDFORGE_CONTENT_LOADED__) { /* already loaded — skip */ } else {
window.__MINDFORGE_CONTENT_LOADED__ = true;

// Note: Readability.js, extractor.js, and this file are loaded as content scripts
// via manifest.json. overlay.js functions are loaded inline below since content
// scripts share the same execution context.

// ─── Overlay Functions (inline to avoid separate script loading issues) ───
// These mirror overlay/overlay.js but are self-contained for content script use.

const MF_OVERLAY_HOST_ID = 'mindforge-overlay-host';
const MF_NUDGE_HOST_ID = 'mindforge-nudge-host';
const MF_INDICATOR_HOST_ID = 'mindforge-indicator-host';
const MF_INTERVENTION_HOST_ID = 'mindforge-intervention-host';
const MF_REMINDER_HOST_ID = 'mindforge-reminder-host';
const MF_NEUTRAL_TIMER_HOST_ID = 'mindforge-neutral-timer-host';

let mfOverlayTimer = null;
let mfNudgeTimer = null;
let mfInterventionTimer = null;
let mfReminderTimer = null;
let mfNeutralDelayTimer = null;
let mfNeutralDismissed = false;
let mfCachedCSS = null;

async function mfGetOverlayCSS() {
  if (mfCachedCSS) return mfCachedCSS;
  try {
    const cssUrl = chrome.runtime.getURL('overlay/overlay.css');
    const resp = await fetch(cssUrl);
    mfCachedCSS = await resp.text();
  } catch {
    mfCachedCSS = '';
  }
  return mfCachedCSS;
}

function mfCreateShadowHost(id) {
  mfRemoveShadowHost(id);
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  return { host, shadow };
}

function mfRemoveShadowHost(id) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
}

function mfEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ─── Full Overlay ───

async function showFullOverlay(data = {}) {
  hideFullOverlay();

  const css = await mfGetOverlayCSS();
  const { shadow } = mfCreateShadowHost(MF_OVERLAY_HOST_ID);

  const COUNTDOWN = 45;
  let remaining = COUNTDOWN;
  const scoreDisplay = data.score != null ? data.score : '—';
  const goalDisplay = data.goal || 'Focus Session';
  const aiReason = data.aiReason || '';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-overlay">
      <div class="mf-card">
        <div class="mf-emoji">🚫</div>
        <div class="mf-title">Stay Focused!</div>
        <div class="mf-subtitle">${aiReason
          ? `<span style="color: #ef4444; font-weight: 600;">AI Verdict:</span> ${mfEscapeHtml(aiReason)}`
          : 'This site might pull you away from your focus.'
        }</div>
        <div class="mf-goal">
          <div class="mf-goal-label">Your current goal</div>
          ${mfEscapeHtml(goalDisplay)}
        </div>
        <div class="mf-stats">
          <div class="mf-stat">
            <div class="mf-stat-value">${scoreDisplay}</div>
            <div class="mf-stat-label">Focus Score</div>
          </div>
          <div class="mf-stat">
            <div class="mf-stat-value">${mfEscapeHtml(data.hostname || '')}</div>
            <div class="mf-stat-label">Blocked Site</div>
          </div>
        </div>
        <div class="mf-buttons">
          <button class="mf-btn mf-btn-primary" id="mf-go-back" style="width: 100%;">Back to work</button>
        </div>
        <div class="mf-countdown" id="mf-countdown-text">Auto-closing in ${remaining}s</div>
        <div class="mf-countdown-bar">
          <div class="mf-countdown-fill" id="mf-countdown-fill" style="width: 100%"></div>
        </div>
      </div>
    </div>
  `;

  shadow.getElementById('mf-go-back').addEventListener('click', () => {
    hideFullOverlay();
    history.back();
  });

  mfOverlayTimer = setInterval(() => {
    remaining--;
    const txt = shadow.getElementById('mf-countdown-text');
    const fill = shadow.getElementById('mf-countdown-fill');
    if (txt) txt.textContent = `Auto-closing in ${remaining}s`;
    if (fill) fill.style.width = `${(remaining / COUNTDOWN) * 100}%`;
    if (remaining <= 0) hideFullOverlay();
  }, 1000);
}

function hideFullOverlay() {
  if (mfOverlayTimer) { clearInterval(mfOverlayTimer); mfOverlayTimer = null; }
  mfRemoveShadowHost(MF_OVERLAY_HOST_ID);
}

// ─── Nudge Banner ───

async function showNudgeBanner(data = {}) {
  hideNudgeBanner();

  const css = await mfGetOverlayCSS();
  const { host, shadow } = mfCreateShadowHost(MF_NUDGE_HOST_ID);
  host.style.cssText += 'top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important;';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-nudge">
      <span class="mf-nudge-icon">🤔</span>
      <span class="mf-nudge-text">${data.aiReason
          ? `<span style="color: #BA7517; font-weight: 500;">📚 Off-topic:</span> ${mfEscapeHtml(data.aiReason)}`
          : `This might not be related to: <strong>${mfEscapeHtml(data.goal || 'your goal')}</strong>`
        }</span>
      <div class="mf-nudge-actions">
        <button class="mf-nudge-btn mf-nudge-btn-back" id="mf-nudge-back">You're right, go back</button>
        <button class="mf-nudge-btn mf-nudge-btn-dismiss" id="mf-nudge-dismiss">This is relevant</button>
      </div>
    </div>
  `;

  shadow.getElementById('mf-nudge-back').addEventListener('click', () => {
    hideNudgeBanner();
    history.back();
  });

  shadow.getElementById('mf-nudge-dismiss').addEventListener('click', () => {
    hideNudgeBanner();
    chrome.runtime.sendMessage({
      type: 'OVERRIDE_CLASSIFICATION',
      hostname: data.hostname,
      originalCategory: 'distraction',
    }).catch(() => {});
  });

  mfNudgeTimer = setTimeout(() => hideNudgeBanner(), 15000);
}

function hideNudgeBanner() {
  if (mfNudgeTimer) { clearTimeout(mfNudgeTimer); mfNudgeTimer = null; }
  mfRemoveShadowHost(MF_NUDGE_HOST_ID);
}

// ─── Intervention Banner ───

async function showIntervention(message) {
  hideIntervention();

  const css = await mfGetOverlayCSS();
  const { host, shadow } = mfCreateShadowHost(MF_INTERVENTION_HOST_ID);
  host.style.cssText += 'top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important;';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-intervention">
      <span>${mfEscapeHtml(message)}</span>
      <span class="mf-intervention-dismiss" id="mf-intervention-close">✕</span>
    </div>
  `;

  shadow.getElementById('mf-intervention-close').addEventListener('click', () => hideIntervention());
  mfInterventionTimer = setTimeout(() => hideIntervention(), 20000);
}

function hideIntervention() {
  if (mfInterventionTimer) { clearTimeout(mfInterventionTimer); mfInterventionTimer = null; }
  mfRemoveShadowHost(MF_INTERVENTION_HOST_ID);
}

// ─── Focus Indicator Dot ───

async function showIndicator(category) {
  if (category === 'productive') {
    hideIndicator();
    return;
  }

  hideIndicator();

  const css = await mfGetOverlayCSS();
  const { host, shadow } = mfCreateShadowHost(MF_INDICATOR_HOST_ID);
  host.style.cssText = 'all: initial !important;';

  const colorClass = category === 'distraction' ? 'mf-indicator--distraction' :
    category === 'neutral' ? 'mf-indicator--neutral' : 'mf-indicator--productive';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-indicator ${colorClass}" title="MindForge Focus"></div>
  `;
}

function hideIndicator() {
  mfRemoveShadowHost(MF_INDICATOR_HOST_ID);
}

// ─── Goal Reminder ───

async function showGoalReminder(goal) {
  hideGoalReminder();

  const css = await mfGetOverlayCSS();
  const { host, shadow } = mfCreateShadowHost(MF_REMINDER_HOST_ID);
  host.style.cssText = 'all: initial !important;';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-goal-reminder">
      <div class="mf-goal-reminder-label">Session Goal</div>
      ${mfEscapeHtml(goal || 'Focus Session')}
    </div>
  `;

  mfReminderTimer = setTimeout(() => hideGoalReminder(), 5000);
}

function hideGoalReminder() {
  if (mfReminderTimer) { clearTimeout(mfReminderTimer); mfReminderTimer = null; }
  mfRemoveShadowHost(MF_REMINDER_HOST_ID);
}

// ─── Neutral Site Timer ───

async function showNeutralTimer(data = {}) {
  hideNeutralTimer();

  const css = await mfGetOverlayCSS();
  const { host, shadow } = mfCreateShadowHost(MF_NEUTRAL_TIMER_HOST_ID);
  host.style.cssText += 'top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important;';

  const goalDisplay = data.goal || 'Focus Session';
  const hostname = data.hostname || window.location.hostname;

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-neutral-timer">
      <span class="mf-neutral-timer-icon">⏰</span>
      <span class="mf-neutral-timer-text">
        You've been on <strong>${mfEscapeHtml(hostname)}</strong> for 3 minutes.
        Is this helping with: <strong>${mfEscapeHtml(goalDisplay)}</strong>?
      </span>
      <div class="mf-neutral-timer-actions">
        <button class="mf-neutral-timer-btn mf-neutral-timer-btn-remind" id="mf-neutral-remind">Remind in 5 min</button>
        <button class="mf-neutral-timer-btn mf-neutral-timer-btn-back" id="mf-neutral-back">Go back</button>
        <button class="mf-neutral-timer-btn mf-neutral-timer-btn-dismiss" id="mf-neutral-dismiss">Dismiss</button>
      </div>
    </div>
  `;

  // "Remind in 5 min" — hide popup, show again after 5 min
  shadow.getElementById('mf-neutral-remind').addEventListener('click', () => {
    hideNeutralTimer();
    mfNeutralDelayTimer = setTimeout(() => {
      if (!mfNeutralDismissed) showNeutralTimer(data);
    }, 5 * 60 * 1000);
  });

  // "Go back" — navigate back
  shadow.getElementById('mf-neutral-back').addEventListener('click', () => {
    hideNeutralTimer();
    history.back();
  });

  // "Dismiss" — hide until tab switch (page navigation will reset)
  shadow.getElementById('mf-neutral-dismiss').addEventListener('click', () => {
    mfNeutralDismissed = true;
    hideNeutralTimer();
  });
}

function hideNeutralTimer() {
  if (mfNeutralDelayTimer) { clearTimeout(mfNeutralDelayTimer); mfNeutralDelayTimer = null; }
  mfRemoveShadowHost(MF_NEUTRAL_TIMER_HOST_ID);
}

/**
 * Schedule the neutral timer to show after a delay (default 3 min).
 * Called when background classifies a page as neutral during an active session.
 */
function scheduleNeutralTimer(data = {}) {
  // Clear any previous scheduled timer
  hideNeutralTimer();
  mfNeutralDismissed = false;

  const delayMs = data.delayMs || 3 * 60 * 1000; // 3 minutes default
  mfNeutralDelayTimer = setTimeout(() => {
    if (!mfNeutralDismissed) showNeutralTimer(data);
  }, delayMs);
  console.log(`[MindForge] Neutral timer scheduled — ${delayMs / 1000}s for ${data.hostname}`);
}

function hideAllOverlays() {
  hideFullOverlay();
  hideNudgeBanner();
  hideIntervention();
  hideIndicator();
  hideGoalReminder();
  hideNeutralTimer();
  mfNeutralDismissed = false;
}

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_CONTENT':
      // Background is asking us to extract page content
      if (typeof MindForgeExtractor !== 'undefined' && MindForgeExtractor.extractPageContent) {
        MindForgeExtractor.extractPageContent()
          .then(data => sendResponse(data))
          .catch(() => sendResponse({
            title: document.title,
            url: window.location.href,
            hostname: window.location.hostname,
            content: '',
            extractionMethod: 'error',
          }));
        return true; // Keep channel open for async response
      } else {
        // Extractor not available — send basic info
        sendResponse({
          title: document.title,
          url: window.location.href,
          hostname: window.location.hostname,
          content: document.title + ' ' + (window.location.pathname || ''),
          extractionMethod: 'basic',
        });
      }
      break;

    case 'SHOW_OVERLAY':
      showFullOverlay(message);
      sendResponse({ ok: true });
      break;

    case 'SHOW_NUDGE':
      showNudgeBanner(message);
      sendResponse({ ok: true });
      break;

    case 'HIDE_OVERLAY':
      hideAllOverlays();
      sendResponse({ ok: true });
      break;

    case 'UPDATE_INDICATOR':
      showIndicator(message.category);
      sendResponse({ ok: true });
      break;

    case 'INTERVENTION':
      showIntervention(message.message);
      sendResponse({ ok: true });
      break;

    case 'SESSION_GOAL_REMINDER':
      showGoalReminder(message.goal);
      sendResponse({ ok: true });
      break;

    case 'SHOW_NEUTRAL_TIMER':
      scheduleNeutralTimer(message);
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }
});

// ─── Auto-extract on page load ───
// After DOM is stable, extract content and send to background for classification.
// This triggers classification for the initial page load.

(async function autoExtract() {
  // Don't run on chrome:// or extension pages
  if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'chrome:') {
    return;
  }

  // Small delay to let the page settle
  await new Promise(r => setTimeout(r, 1000));

  try {
    let extractedContent;
    if (typeof MindForgeExtractor !== 'undefined' && MindForgeExtractor.extractPageContent) {
      extractedContent = await MindForgeExtractor.extractPageContent();
    } else {
      extractedContent = {
        title: document.title,
        url: window.location.href,
        hostname: window.location.hostname,
        content: document.title,
        extractionMethod: 'basic',
      };
    }

    // Send to background for classification
    chrome.runtime.sendMessage({
      type: 'CONTENT_EXTRACTED',
      data: extractedContent,
    }).catch(() => {});
  } catch (err) {
    console.log('[MindForge] Auto-extract error:', err.message);
  }
})();

// ─── YouTube SPA Navigation Handler ───
// YouTube doesn't do full page reloads — it fires 'yt-navigate-finish'
// when navigating between videos. Re-extract content on each navigation.

if (window.location.hostname.includes('youtube.com')) {
  document.addEventListener('yt-navigate-finish', async () => {
    console.log('[MindForge] YouTube SPA navigation detected');
    // Small delay for DOM to update with new video info
    await new Promise(r => setTimeout(r, 1500));
    try {
      let extractedContent;
      if (typeof MindForgeExtractor !== 'undefined' && MindForgeExtractor.extractPageContent) {
        extractedContent = await MindForgeExtractor.extractPageContent();
      } else {
        extractedContent = {
          title: document.title,
          url: window.location.href,
          hostname: window.location.hostname,
          content: document.title,
          extractionMethod: 'basic',
        };
      }
      chrome.runtime.sendMessage({
        type: 'CONTENT_EXTRACTED',
        data: extractedContent,
      }).catch(() => {});
    } catch (err) {
      console.log('[MindForge] YouTube SPA re-extract error:', err.message);
    }
  });
}

// ─── Generic SPA Navigation Handler ───
// Catches pushState / replaceState and popstate events on ANY SPA site
// (Spotify, ChatGPT, Reddit, etc.) so content gets re-extracted when
// the user navigates without a full page reload.

(function setupSPANavigationHandler() {
  // Don't double-up on YouTube (it has its own handler above)
  if (window.location.hostname.includes('youtube.com')) return;

  let lastUrl = window.location.href;

  async function onSPANavigate() {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    console.log('[MindForge] SPA navigation detected:', currentUrl);

    // Delay to let the new content render
    await new Promise(r => setTimeout(r, 2000));

    try {
      let extractedContent;
      if (typeof MindForgeExtractor !== 'undefined' && MindForgeExtractor.extractPageContent) {
        extractedContent = await MindForgeExtractor.extractPageContent();
      } else {
        extractedContent = {
          title: document.title,
          url: window.location.href,
          hostname: window.location.hostname,
          content: document.title,
          extractionMethod: 'basic',
        };
      }
      chrome.runtime.sendMessage({
        type: 'CONTENT_EXTRACTED',
        data: extractedContent,
      }).catch(() => {});
    } catch (err) {
      console.log('[MindForge] SPA re-extract error:', err.message);
    }
  }

  // Intercept History.pushState and replaceState
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (...args) {
    originalPush.apply(this, args);
    onSPANavigate();
  };

  history.replaceState = function (...args) {
    originalReplace.apply(this, args);
    onSPANavigate();
  };

  // Also catch browser back/forward
  window.addEventListener('popstate', () => onSPANavigate());
})();

} // end guard: __MINDFORGE_CONTENT_LOADED__
