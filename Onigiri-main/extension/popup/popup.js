// MindForge Popup — Control Panel Logic v3.0
// All communication goes through chrome.runtime.sendMessage to background.js
// Includes: Insights tab, ML feedback, content type display, analytics

// ─── State ───
let currentTab = null;
let refreshInterval = null;

// ─── DOM Helpers ───
const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.style.display = ''; };
const hide = (el) => { if (el) el.style.display = 'none'; };

// ─── Initialize ───
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupBreakMode();
  setupSiteActions();
  setupSettings();
  setupFeedback();
  await refresh();

  // Auto-refresh every 3 seconds while popup is open
  refreshInterval = setInterval(refresh, 3000);
});

window.addEventListener('unload', () => {
  if (refreshInterval) clearInterval(refreshInterval);
});

// ─── Tab Switching ───
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = `panel-${tab.dataset.tab}`;
      const panel = $(panelId);
      if (panel) panel.classList.add('active');

      // Refresh data when switching tabs
      if (tab.dataset.tab === 'insights') loadInsights();
      if (tab.dataset.tab === 'summary') loadSummary();
      if (tab.dataset.tab === 'settings') loadSettings();
    });
  });
}

// ─── Main Refresh ───
async function refresh() {
  try {
    // Get session status from background
    const status = await sendMessage({ type: 'GET_SESSION_STATUS' });

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    // Update disconnected banner
    if (status.desktopAlive === false) {
      show($('disconnected-banner'));
    } else {
      hide($('disconnected-banner'));
    }

    // Update session status
    if (status.active) {
      $('session-badge').textContent = '● Session Active';
      $('session-badge').className = 'session-badge active';
      show($('session-goal'));
      $('session-goal-text').textContent = status.goal || 'Focus Session';
      show($('score-ring'));
      show($('header-score'));
      updateScoreRing(status.score || 0, status.label || '');
      $('header-score-value').textContent = status.score || '—';
      updateScoreColor(status.score || 0);
    } else {
      $('session-badge').textContent = 'No active session';
      $('session-badge').className = 'session-badge inactive';
      hide($('session-goal'));
      hide($('score-ring'));
      hide($('header-score'));
    }

    // Update break mode
    if (status.breakModeActive) {
      hide($('break-btn'));
      hide($('break-picker'));
      show($('break-active'));
      const remaining = Math.max(0, Math.ceil((status.breakModeEndsAt - Date.now()) / 60000));
      $('break-remaining').textContent = `${remaining} min`;
    } else {
      show($('break-btn'));
      hide($('break-active'));
    }

    // Update classification
    if (tab && tab.url) {
      const classification = await sendMessage({ type: 'GET_CLASSIFICATION', tabId: tab.id });
      updateClassification(classification, tab);
    }

  } catch (err) {
    console.error('[MindForge Popup] Refresh error:', err);
  }
}

// ─── Score Ring ───
function updateScoreRing(score, label) {
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - score / 100);

  const fill = $('score-ring-fill');
  if (fill) {
    fill.style.strokeDashoffset = offset;
    if (score >= 70) fill.style.stroke = 'var(--score-green)';
    else if (score >= 50) fill.style.stroke = 'var(--score-amber)';
    else fill.style.stroke = 'var(--score-red)';
  }

  $('score-ring-value').textContent = score;
  $('score-ring-label').textContent = label || 'Focus';
}

function updateScoreColor(score) {
  const el = $('header-score-value');
  if (!el) return;
  if (score >= 70) el.style.color = 'var(--score-green)';
  else if (score >= 50) el.style.color = 'var(--score-amber)';
  else el.style.color = 'var(--score-red)';
}

// ─── Classification Display ───
function updateClassification(classification, tab) {
  const dot = $('classification-dot');
  const text = $('classification-text');
  const conf = $('classification-confidence');
  const meta = $('classification-meta');
  const ctBadge = $('meta-content-type');
  const methodBadge = $('meta-method');

  if (!classification || classification.category === 'unknown') {
    dot.className = 'classification-dot';
    text.textContent = tab ? new URL(tab.url).hostname : '—';
    conf.textContent = '';
    hide(meta);
    return;
  }

  dot.className = `classification-dot ${classification.category}`;

  const hostname = classification.hostname || (tab ? new URL(tab.url).hostname : '');
  text.textContent = hostname;

  if (classification.confidence > 0) {
    conf.textContent = `${Math.round(classification.confidence * 100)}%`;
  } else {
    conf.textContent = '';
  }

  // Show content type and method badges
  if (classification.contentType || classification.method) {
    show(meta);
    if (ctBadge && classification.contentType) {
      const icons = { text: '📄', video: '🎬', interactive: '🖥️', audio: '🎧' };
      ctBadge.textContent = `${icons[classification.contentType] || ''} ${classification.contentType}`;
    }
    if (methodBadge && classification.method) {
      const methodLabels = {
        'domain-tier': 'Domain List',
        'knn-personalized': 'ML (Personalized)',
        'naive-bayes': 'ML (Naive Bayes)',
        'keyword-fallback': 'Keyword',
        'no-session': 'No Session',
      };
      methodBadge.textContent = methodLabels[classification.method] || classification.method;
    }
  } else {
    hide(meta);
  }
}

// ─── Break Mode ───
function setupBreakMode() {
  $('break-btn').addEventListener('click', () => {
    const picker = $('break-picker');
    picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
  });

  document.querySelectorAll('.break-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const minutes = parseInt(btn.dataset.minutes);
      await sendMessage({ type: 'START_BREAK', minutes });
      hide($('break-picker'));
      await refresh();
    });
  });

  $('break-end-btn').addEventListener('click', async () => {
    await sendMessage({ type: 'END_BREAK' });
    await refresh();
  });
}

// ─── Site Actions ───
function setupSiteActions() {
  $('allow-btn').addEventListener('click', async () => {
    if (!currentTab?.url) return;
    const hostname = new URL(currentTab.url).hostname.replace(/^www\./, '');
    await sendMessage({ type: 'ADD_TO_ALLOWLIST', hostname });
    $('allow-btn').textContent = '✅ Added!';
    setTimeout(() => { $('allow-btn').textContent = '✅ Always productive'; }, 1500);
  });

  $('block-btn').addEventListener('click', async () => {
    if (!currentTab?.url) return;
    const hostname = new URL(currentTab.url).hostname.replace(/^www\./, '');
    await sendMessage({ type: 'ADD_TO_BLOCKLIST', hostname });
    $('block-btn').textContent = '🚫 Added!';
    setTimeout(() => { $('block-btn').textContent = '🚫 Always block'; }, 1500);
  });
}

// ─── ML Feedback ───
function setupFeedback() {
  $('feedback-productive').addEventListener('click', async () => {
    if (!currentTab?.url) return;
    await submitFeedback('productive');
  });

  $('feedback-distraction').addEventListener('click', async () => {
    if (!currentTab?.url) return;
    await submitFeedback('distraction');
  });
}

async function submitFeedback(category) {
  if (!currentTab?.url) return;

  const hostname = new URL(currentTab.url).hostname.replace(/^www\./, '');
  const result = await sendMessage({
    type: 'SUBMIT_FEEDBACK',
    category,
    hostname,
    url: currentTab.url,
    title: currentTab.title || '',
    content: '',
  });

  const statusEl = $('feedback-status');
  if (result.ok) {
    statusEl.textContent = `✓ Learned! (${result.totalExamples} total examples)`;
    statusEl.style.color = 'var(--score-green)';
  } else {
    statusEl.textContent = '✗ Error submitting feedback';
    statusEl.style.color = 'var(--score-red)';
  }
  show(statusEl);
  setTimeout(() => hide(statusEl), 3000);
}

// ─── Insights Tab ───
async function loadInsights() {
  try {
    const analytics = await sendMessage({ type: 'GET_ANALYTICS' });

    if (!analytics || analytics.error) return;

    // Time breakdown bars
    const tb = analytics.timeBreakdown;
    if (tb && tb.category) {
      const { productive, distraction, neutral } = tb.category;
      const total = productive + distraction + neutral;

      if (total > 0) {
        $('time-bar-productive').style.width = `${(productive / total) * 100}%`;
        $('time-bar-distraction').style.width = `${(distraction / total) * 100}%`;
        $('time-bar-neutral').style.width = `${(neutral / total) * 100}%`;
      }

      $('time-val-productive').textContent = formatDuration(productive);
      $('time-val-distraction').textContent = formatDuration(distraction);
      $('time-val-neutral').textContent = formatDuration(neutral);
    }

    // Content type preferences
    if (tb && tb.contentType) {
      $('pref-text').textContent = formatDuration(tb.contentType.text || 0);
      $('pref-video').textContent = formatDuration(tb.contentType.video || 0);
      $('pref-interactive').textContent = formatDuration(tb.contentType.interactive || 0);
      $('pref-audio').textContent = formatDuration(tb.contentType.audio || 0);
    }

    // Top sites
    const container = $('insights-top-sites');
    if (analytics.perSite && analytics.perSite.length > 0) {
      const topSites = analytics.perSite.slice(0, 5);
      container.innerHTML = '';
      for (const site of topSites) {
        const item = document.createElement('div');
        item.className = 'site-time-item';
        item.innerHTML = `
          <div class="site-time-info">
            <span class="site-time-dot ${site.category || 'neutral'}"></span>
            <span class="site-time-host">${escapeHtml(site.hostname)}</span>
          </div>
          <span class="site-time-duration">${formatDuration(site.totalSeconds)}</span>
        `;
        container.appendChild(item);
      }
    } else {
      container.innerHTML = '<div class="empty-list">No data yet — browse some pages</div>';
    }

    // ML Stats
    if (analytics.mlStats) {
      $('ml-total-examples').textContent = analytics.mlStats.totalExamples || 0;
      const knnStatus = $('ml-knn-status');
      if (analytics.mlStats.isReady) {
        knnStatus.textContent = 'Active';
        knnStatus.className = 'ml-status-badge active';
      } else {
        const needed = 5 - (analytics.mlStats.totalExamples || 0);
        knnStatus.textContent = `Need ${Math.max(0, needed)} more`;
        knnStatus.className = 'ml-status-badge';
      }
    }

  } catch (err) {
    console.error('[MindForge Popup] Insights error:', err);
  }
}

// ─── Summary Tab ───
async function loadSummary() {
  const history = await sendMessage({ type: 'GET_HISTORY' });
  if (!history || history.length === 0) {
    show($('summary-no-session'));
    hide($('summary-content'));
    return;
  }

  hide($('summary-no-session'));
  show($('summary-content'));

  // Compute stats from classification history
  let productive = 0, distraction = 0, neutral = 0, overrides = 0;
  const distractionCounts = {};

  for (const entry of history) {
    if (entry.category === 'productive') productive++;
    else if (entry.category === 'distraction') distraction++;
    else if (entry.category === 'override') overrides++;
    else neutral++;

    if (entry.category === 'distraction' && entry.hostname) {
      distractionCounts[entry.hostname] = (distractionCounts[entry.hostname] || 0) + 1;
    }
  }

  const total = productive + distraction + neutral;
  if (total > 0) {
    $('bar-productive').style.width = `${(productive / total) * 100}%`;
    $('bar-distraction').style.width = `${(distraction / total) * 100}%`;
    $('bar-neutral').style.width = `${(neutral / total) * 100}%`;
  }

  $('summary-overrides').textContent = overrides;

  // Top distractions
  const topDistractions = Object.entries(distractionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const container = $('top-distractions');
  container.innerHTML = '';
  if (topDistractions.length === 0) {
    container.innerHTML = '<div class="empty-list">No distractions recorded</div>';
  } else {
    for (const [hostname, count] of topDistractions) {
      const item = document.createElement('div');
      item.className = 'distraction-item';
      item.innerHTML = `
        <span class="distraction-hostname">${escapeHtml(hostname)}</span>
        <span class="distraction-count">${count}×</span>
      `;
      container.appendChild(item);
    }
  }
}

// ─── Settings Tab ───
async function loadSettings() {
  const lists = await sendMessage({ type: 'GET_LISTS' });
  renderList('allowlist-container', lists.allowlist || [], 'allowlist');
  renderList('blocklist-container', lists.blocklist || [], 'blocklist');
}

function setupSettings() {
  $('extension-toggle').addEventListener('change', async (e) => {
    await sendMessage({ type: 'UPDATE_EXTENSION_ENABLED', enabled: e.target.checked });
  });

  $('clear-history-btn').addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_HISTORY' });
    $('clear-history-btn').textContent = '✅ Cleared!';
    setTimeout(() => { $('clear-history-btn').textContent = '🗑️ Clear classification history'; }, 1500);
  });
}

function renderList(containerId, items, listType) {
  const container = $(containerId);
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-list">No custom sites added</div>';
    return;
  }

  for (const hostname of items) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <span class="list-item-hostname">${escapeHtml(hostname)}</span>
      <button class="list-item-remove" data-hostname="${escapeHtml(hostname)}" data-list="${listType}">✕</button>
    `;
    container.appendChild(item);
  }

  // Attach remove handlers
  container.querySelectorAll('.list-item-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const h = btn.dataset.hostname;
      const type = btn.dataset.list === 'allowlist' ? 'REMOVE_FROM_ALLOWLIST' : 'REMOVE_FROM_BLOCKLIST';
      await sendMessage({ type, hostname: h });
      await loadSettings();
    });
  });
}

// ─── Helpers ───

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response || {});
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
