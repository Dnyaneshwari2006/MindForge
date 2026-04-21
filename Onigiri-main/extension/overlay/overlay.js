// MindForge — Overlay Injection Logic
// All UI is injected via Shadow DOM for style isolation.

const OVERLAY_HOST_ID = 'mindforge-overlay-host';
const NUDGE_HOST_ID = 'mindforge-nudge-host';
const INDICATOR_HOST_ID = 'mindforge-indicator-host';
const INTERVENTION_HOST_ID = 'mindforge-intervention-host';
const REMINDER_HOST_ID = 'mindforge-reminder-host';

let overlayTimer = null;
let nudgeTimer = null;
let interventionTimer = null;
let reminderTimer = null;

/**
 * Load overlay CSS. Cached after first fetch.
 */
let cachedCSS = null;
async function getOverlayCSS() {
  if (cachedCSS) return cachedCSS;
  try {
    const cssUrl = chrome.runtime.getURL('overlay/overlay.css');
    const resp = await fetch(cssUrl);
    cachedCSS = await resp.text();
  } catch {
    cachedCSS = ''; // Fail gracefully
  }
  return cachedCSS;
}

/**
 * Create an isolated Shadow DOM host element.
 */
function createShadowHost(id) {
  // Remove existing if present
  removeShadowHost(id);

  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  return { host, shadow };
}

function removeShadowHost(id) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
}

// ─── Full Overlay ───

async function injectFullOverlay(data = {}) {
  removeFullOverlay(); // Clear any existing

  const css = await getOverlayCSS();
  const { host, shadow } = createShadowHost(OVERLAY_HOST_ID);

  const COUNTDOWN_SECONDS = 45;
  let remaining = COUNTDOWN_SECONDS;

  const scoreDisplay = data.score != null ? data.score : '—';
  const goalDisplay = data.goal || 'Focus Session';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-overlay">
      <div class="mf-card">
        <div class="mf-emoji">⚡</div>
        <div class="mf-title">You were in the zone!</div>
        <div class="mf-subtitle">This site might pull you away from your focus.</div>

        <div class="mf-goal">
          <div class="mf-goal-label">Your current goal</div>
          ${escapeHtml(goalDisplay)}
        </div>

        <div class="mf-stats">
          <div class="mf-stat">
            <div class="mf-stat-value" id="mf-score">${scoreDisplay}</div>
            <div class="mf-stat-label">Focus Score</div>
          </div>
          <div class="mf-stat">
            <div class="mf-stat-value" id="mf-site">${escapeHtml(data.hostname || '')}</div>
            <div class="mf-stat-label">Current Site</div>
          </div>
        </div>

        <div class="mf-buttons">
          <button class="mf-btn mf-btn-primary" id="mf-go-back">Back to work</button>
          <button class="mf-btn mf-btn-secondary" id="mf-continue">Continue anyway</button>
        </div>

        <div class="mf-countdown" id="mf-countdown-text">Auto-closing in ${remaining}s</div>
        <div class="mf-countdown-bar">
          <div class="mf-countdown-fill" id="mf-countdown-fill" style="width: 100%"></div>
        </div>
      </div>
    </div>
  `;

  // Button handlers
  shadow.getElementById('mf-go-back').addEventListener('click', () => {
    removeFullOverlay();
    history.back();
  });

  shadow.getElementById('mf-continue').addEventListener('click', () => {
    removeFullOverlay();
    // Notify background about override
    chrome.runtime.sendMessage({
      type: 'OVERRIDE_CLASSIFICATION',
      hostname: data.hostname,
      originalCategory: 'distraction',
    }).catch(() => {});
  });

  // Countdown timer
  overlayTimer = setInterval(() => {
    remaining--;
    const countdownText = shadow.getElementById('mf-countdown-text');
    const countdownFill = shadow.getElementById('mf-countdown-fill');
    if (countdownText) countdownText.textContent = `Auto-closing in ${remaining}s`;
    if (countdownFill) countdownFill.style.width = `${(remaining / COUNTDOWN_SECONDS) * 100}%`;
    if (remaining <= 0) {
      removeFullOverlay();
    }
  }, 1000);
}

function removeFullOverlay() {
  if (overlayTimer) { clearInterval(overlayTimer); overlayTimer = null; }
  removeShadowHost(OVERLAY_HOST_ID);
}

// ─── Nudge Banner ───

async function injectNudgeBanner(data = {}) {
  removeNudgeBanner();

  const css = await getOverlayCSS();
  const { host, shadow } = createShadowHost(NUDGE_HOST_ID);
  host.style.cssText += 'top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important;';

  const goalDisplay = data.goal || 'your goal';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-nudge">
      <span class="mf-nudge-icon">🤔</span>
      <span class="mf-nudge-text">This might not be related to: <strong>${escapeHtml(goalDisplay)}</strong></span>
      <div class="mf-nudge-actions">
        <button class="mf-nudge-btn mf-nudge-btn-back" id="mf-nudge-back">You're right, go back</button>
        <button class="mf-nudge-btn mf-nudge-btn-dismiss" id="mf-nudge-dismiss">This is relevant</button>
      </div>
    </div>
  `;

  shadow.getElementById('mf-nudge-back').addEventListener('click', () => {
    removeNudgeBanner();
    history.back();
  });

  shadow.getElementById('mf-nudge-dismiss').addEventListener('click', () => {
    removeNudgeBanner();
    // Log override
    chrome.runtime.sendMessage({
      type: 'OVERRIDE_CLASSIFICATION',
      hostname: data.hostname,
      originalCategory: 'distraction',
    }).catch(() => {});
  });

  // Auto-dismiss after 15 seconds
  nudgeTimer = setTimeout(() => {
    removeNudgeBanner();
  }, 15000);
}

function removeNudgeBanner() {
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
  removeShadowHost(NUDGE_HOST_ID);
}

// ─── Intervention Banner ───

async function injectIntervention(message) {
  removeIntervention();

  const css = await getOverlayCSS();
  const { host, shadow } = createShadowHost(INTERVENTION_HOST_ID);
  host.style.cssText += 'top: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important;';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-intervention">
      <span>${escapeHtml(message)}</span>
      <span class="mf-intervention-dismiss" id="mf-intervention-close">✕</span>
    </div>
  `;

  shadow.getElementById('mf-intervention-close').addEventListener('click', () => {
    removeIntervention();
  });

  // Auto-dismiss after 20 seconds
  interventionTimer = setTimeout(() => {
    removeIntervention();
  }, 20000);
}

function removeIntervention() {
  if (interventionTimer) { clearTimeout(interventionTimer); interventionTimer = null; }
  removeShadowHost(INTERVENTION_HOST_ID);
}

// ─── Focus Indicator Dot ───

async function updateIndicator(category) {
  // Don't show indicator on productive sites
  if (category === 'productive') {
    removeIndicator();
    return;
  }

  const existing = document.getElementById(INDICATOR_HOST_ID);
  if (existing) {
    // Update the existing indicator's class
    const shadow = existing.shadowRoot;
    // Since we used 'closed', we need to recreate
    removeIndicator();
  }

  const css = await getOverlayCSS();
  const { host, shadow } = createShadowHost(INDICATOR_HOST_ID);
  host.style.cssText = 'all: initial !important;';

  const colorClass = category === 'distraction' ? 'mf-indicator--distraction' :
    category === 'neutral' ? 'mf-indicator--neutral' : 'mf-indicator--productive';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-indicator ${colorClass}" id="mf-indicator-dot" title="MindForge Focus"></div>
  `;

  shadow.getElementById('mf-indicator-dot').addEventListener('click', () => {
    // Open the popup by sending a message
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
  });
}

function removeIndicator() {
  removeShadowHost(INDICATOR_HOST_ID);
}

// ─── Goal Reminder ───

async function showGoalReminder(goal) {
  removeGoalReminder();

  const css = await getOverlayCSS();
  const { host, shadow } = createShadowHost(REMINDER_HOST_ID);
  host.style.cssText = 'all: initial !important;';

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="mf-goal-reminder">
      <div class="mf-goal-reminder-label">Session Goal</div>
      ${escapeHtml(goal || 'Focus Session')}
    </div>
  `;

  // Auto-dismiss after 5 seconds
  reminderTimer = setTimeout(() => {
    removeGoalReminder();
  }, 5000);
}

function removeGoalReminder() {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  removeShadowHost(REMINDER_HOST_ID);
}

// ─── Remove All Overlays ───

function removeAllOverlays() {
  removeFullOverlay();
  removeNudgeBanner();
  removeIntervention();
  removeIndicator();
  removeGoalReminder();
}

// ─── HTML Escaping ───

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Expose globally for content.js
if (typeof globalThis !== 'undefined') {
  globalThis.MindForgeOverlay = {
    injectFullOverlay,
    removeFullOverlay,
    injectNudgeBanner,
    removeNudgeBanner,
    injectIntervention,
    removeIntervention,
    updateIndicator,
    removeIndicator,
    showGoalReminder,
    removeGoalReminder,
    removeAllOverlays,
  };
}
