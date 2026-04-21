// MindForge — Per-Tab Time Tracker & Content-Type Detector
// Runs in the service worker (background.js context).
// Tracks active time per tab, detects content type, and aggregates analytics.

const TAB_DATA_KEY = 'mf_tab_analytics';
const CONTENT_PREFS_KEY = 'mf_content_prefs';
const FEEDBACK_KEY = 'mf_user_feedback';

// ─── In-memory tracking state ───
let activeTabId = null;
let activeTabStartTime = null;
// tabTracking: { [tabId]: { hostname, url, category, contentType, activeMsByCategory, totalActiveMs } }
let tabTracking = {}; 

// ─── Tab Switch Tracking ───

/**
 * Finalize the current active time for a specific tab into its category bucket.
 */
function finalizeTabTime(tabId) {
  if (tabId === null || activeTabStartTime === null || !tabTracking[tabId]) return;
  const now = Date.now();
  const elapsed = now - activeTabStartTime;
  
  if (elapsed > 0 && elapsed < 3600000) { // Max 1 hour per tracking window
    const cat = tabTracking[tabId].category;
    if (!tabTracking[tabId].activeMsByCategory) {
      tabTracking[tabId].activeMsByCategory = { productive: 0, distraction: 0, neutral: 0 };
    }
    tabTracking[tabId].activeMsByCategory[cat] = (tabTracking[tabId].activeMsByCategory[cat] || 0) + elapsed;
    tabTracking[tabId].totalActiveMs += elapsed;
  }
}

/**
 * Record a tab becoming active. Finalizes time for the previous tab.
 * @param {number} tabId — newly active tab ID
 * @param {string} url — URL of the active tab
 * @param {string} hostname — hostname of the active tab
 */
export function onTabActivated(tabId, url, hostname) {
  const now = Date.now();

  // Finalize previous tab's time
  if (activeTabId !== null) {
    finalizeTabTime(activeTabId);
  }

  // Start tracking new tab
  activeTabId = tabId;
  activeTabStartTime = now;

  if (!tabTracking[tabId]) {
    tabTracking[tabId] = {
      hostname: hostname || '',
      url: url || '',
      category: 'neutral',
      contentType: 'text',
      activeMsByCategory: { productive: 0, distraction: 0, neutral: 0 },
      totalActiveMs: 0,
    };
  } else {
    // Update hostname/url if changed
    tabTracking[tabId].hostname = hostname || tabTracking[tabId].hostname;
    tabTracking[tabId].url = url || tabTracking[tabId].url;
  }
}

/**
 * Update classification result for a tab.
 * If category changes mid-tab, finalize time *before* applying the new category.
 */
export function updateTabClassification(tabId, category, contentType) {
  if (!tabTracking[tabId]) {
    tabTracking[tabId] = { 
      hostname: '', 
      url: '', 
      category: 'neutral', 
      contentType: 'text', 
      activeMsByCategory: { productive: 0, distraction: 0, neutral: 0 },
      totalActiveMs: 0 
    };
  }

  // If this is the active tab and the category is changing, finalize current run first
  if (tabId === activeTabId && tabTracking[tabId].category !== category) {
    finalizeTabTime(tabId);
    activeTabStartTime = Date.now(); // reset timer for new category
  }

  tabTracking[tabId].category = category || 'neutral';
  tabTracking[tabId].contentType = contentType || 'text';
}

/**
 * Clean up when a tab is closed.
 */
export function onTabClosed(tabId) {
  // Finalize time if this was the active tab
  if (activeTabId === tabId) {
    finalizeTabTime(tabId);
    activeTabId = null;
    activeTabStartTime = null;
  }
  // Don't delete the data — keep it for session analytics
}

// ─── Analytics Aggregation ───

/**
 * Get time breakdown across all tracked tabs.
 * Returns time in seconds for each category and content type.
 */
export function getTimeBreakdown() {
  // Briefly finalize active tab to ensure we capture current ongoing time
  if (activeTabId !== null) {
    finalizeTabTime(activeTabId);
    activeTabStartTime = Date.now(); // Restart timer so tracking continues
  }

  let productiveMs = 0;
  let distractionMs = 0;
  let neutralMs = 0;
  let textMs = 0;
  let videoMs = 0;
  let interactiveMs = 0;
  let audioMs = 0;

  for (const data of Object.values(tabTracking)) {
    // Accumulate from precise category buckets
    if (data.activeMsByCategory) {
      productiveMs += data.activeMsByCategory.productive || 0;
      distractionMs += data.activeMsByCategory.distraction || 0;
      neutralMs += data.activeMsByCategory.neutral || 0;
    }

    // Content type is still roughly tracked by last known content type proportionally based on total time
    // For simplicity, we assign the total tab time to its current content_type
    const ms = data.totalActiveMs;
    if (data.contentType === 'video') videoMs += ms;
    else if (data.contentType === 'interactive') interactiveMs += ms;
    else if (data.contentType === 'audio') audioMs += ms;
    else textMs += ms;
  }

  return {
    category: {
      productive: Math.round(productiveMs / 1000),
      distraction: Math.round(distractionMs / 1000),
      neutral: Math.round(neutralMs / 1000),
    },
    contentType: {
      text: Math.round(textMs / 1000),
      video: Math.round(videoMs / 1000),
      interactive: Math.round(interactiveMs / 1000),
      audio: Math.round(audioMs / 1000),
    },
    totalSeconds: Math.round((productiveMs + distractionMs + neutralMs) / 1000),
  };
}

/**
 * Get per-site time data for analytics.
 * Returns array sorted by active time (descending), returning separate elements
 * for different categories on the same host (e.g., youtube/productive vs youtube/distraction).
 */
export function getPerSiteAnalytics() {
  // Ensure we capture ongoing active time
  if (activeTabId !== null) {
    finalizeTabTime(activeTabId);
    activeTabStartTime = Date.now(); 
  }

  // Aggregate by hostname AND category
  const siteData = {};

  for (const data of Object.values(tabTracking)) {
    const host = data.hostname || 'unknown';
    
    if (data.activeMsByCategory) {
      for (const [cat, ms] of Object.entries(data.activeMsByCategory)) {
        if (ms > 0) {
          const key = `${host}|${cat}`;
          if (!siteData[key]) {
            siteData[key] = {
              hostname: host,
              category: cat,
              contentType: data.contentType, // uses latest detected format
              totalSeconds: 0,
              visits: 0,
            };
          }
          siteData[key].totalSeconds += Math.round(ms / 1000);
          siteData[key].visits++;
        }
      }
    }
  }

  return Object.values(siteData)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

/**
 * Get all tab tracking data for session end (to send to backend).
 */
export function getSessionAnalytics() {
  return {
    timeBreakdown: getTimeBreakdown(),
    perSite: getPerSiteAnalytics(),
    timestamp: Date.now(),
  };
}

/**
 * Reset all tracking data (called on session start or new day).
 */
export function resetTracking() {
  tabTracking = {};
  activeTabId = null;
  activeTabStartTime = null;
  console.log('[MindForge Tracker] Tracking data reset');
}

// ─── Chrome Storage Persistence for Analytics ───

/**
 * Save analytics snapshot to chrome.storage.local.
 */
export async function persistAnalytics() {
  const analytics = getSessionAnalytics();
  try {
    await chrome.storage.local.set({ [TAB_DATA_KEY]: analytics });
  } catch (err) {
    console.warn('[MindForge Tracker] Failed to persist analytics:', err.message);
  }
}

/**
 * Load persisted analytics from chrome.storage.local.
 */
export async function loadPersistedAnalytics() {
  try {
    const result = await chrome.storage.local.get(TAB_DATA_KEY);
    return result[TAB_DATA_KEY] || null;
  } catch {
    return null;
  }
}

// ─── User Feedback Storage ───

/**
 * Save user feedback examples to chrome.storage.local.
 */
export async function saveFeedbackExamples(examples) {
  try {
    await chrome.storage.local.set({ [FEEDBACK_KEY]: examples });
  } catch (err) {
    console.warn('[MindForge Tracker] Failed to save feedback:', err.message);
  }
}

/**
 * Load user feedback examples from chrome.storage.local.
 */
export async function loadFeedbackExamples() {
  try {
    const result = await chrome.storage.local.get(FEEDBACK_KEY);
    return result[FEEDBACK_KEY] || [];
  } catch {
    return [];
  }
}

// ─── Content Preferences Storage ───

/**
 * Save daily content preferences to chrome.storage.local.
 */
export async function saveContentPreferences(prefs) {
  try {
    const existing = await loadContentPreferences();
    const today = new Date().toISOString().slice(0, 10);
    existing[today] = prefs;

    // Keep only last 30 days
    const keys = Object.keys(existing).sort();
    if (keys.length > 30) {
      for (const old of keys.slice(0, keys.length - 30)) {
        delete existing[old];
      }
    }

    await chrome.storage.local.set({ [CONTENT_PREFS_KEY]: existing });
  } catch (err) {
    console.warn('[MindForge Tracker] Failed to save content prefs:', err.message);
  }
}

/**
 * Load content preferences history from chrome.storage.local.
 */
export async function loadContentPreferences() {
  try {
    const result = await chrome.storage.local.get(CONTENT_PREFS_KEY);
    return result[CONTENT_PREFS_KEY] || {};
  } catch {
    return {};
  }
}
