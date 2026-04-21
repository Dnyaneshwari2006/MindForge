// MindForge — Chrome Storage Wrapper
// All other files import from here. Never call chrome.storage directly elsewhere.

const DEFAULTS = {
  allowlist: [],
  blocklist: [],
  settings: {
    breakModeActive: false,
    breakModeEndsAt: 0,
    extensionEnabled: true,
  },
  classificationHistory: [],
};

const HISTORY_MAX = 50;

// ─── Generic helpers ───

async function _get(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? DEFAULTS[key];
}

async function _set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ─── Allowlist ───

async function getAllowlist() {
  return await _get('allowlist');
}

async function addToAllowlist(hostname) {
  const list = await getAllowlist();
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (!list.includes(h)) {
    list.push(h);
    await _set('allowlist', list);
  }
  return list;
}

async function removeFromAllowlist(hostname) {
  let list = await getAllowlist();
  const h = hostname.toLowerCase().replace(/^www\./, '');
  list = list.filter(d => d !== h);
  await _set('allowlist', list);
  return list;
}

// ─── Blocklist ───

async function getBlocklist() {
  return await _get('blocklist');
}

async function addToBlocklist(hostname) {
  const list = await getBlocklist();
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (!list.includes(h)) {
    list.push(h);
    await _set('blocklist', list);
  }
  return list;
}

async function removeFromBlocklist(hostname) {
  let list = await getBlocklist();
  const h = hostname.toLowerCase().replace(/^www\./, '');
  list = list.filter(d => d !== h);
  await _set('blocklist', list);
  return list;
}

// ─── Settings ───

async function getSettings() {
  return await _get('settings');
}

async function updateSettings(partial) {
  const settings = await getSettings();
  const updated = { ...settings, ...partial };
  await _set('settings', updated);
  return updated;
}

async function isBreakModeActive() {
  const settings = await getSettings();
  if (!settings.breakModeActive) return false;
  if (Date.now() >= settings.breakModeEndsAt) {
    // Break expired — auto-clear
    await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
    return false;
  }
  return true;
}

async function startBreakMode(durationMinutes) {
  const endsAt = Date.now() + durationMinutes * 60 * 1000;
  await updateSettings({ breakModeActive: true, breakModeEndsAt: endsAt });
  return endsAt;
}

async function clearBreakMode() {
  await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
}

// ─── Classification History ───

async function getClassificationHistory() {
  return await _get('classificationHistory');
}

async function addClassificationEntry(entry) {
  const history = await getClassificationHistory();
  history.unshift({
    hostname: entry.hostname,
    category: entry.category,
    confidence: entry.confidence,
    label: entry.label || '',
    timestamp: Date.now(),
  });
  // Cap at HISTORY_MAX
  if (history.length > HISTORY_MAX) {
    history.length = HISTORY_MAX;
  }
  await _set('classificationHistory', history);
  return history;
}

async function clearClassificationHistory() {
  await _set('classificationHistory', []);
}

// Export for both content script (global) and module contexts
if (typeof globalThis !== 'undefined') {
  globalThis.MindForgeStorage = {
    getAllowlist, addToAllowlist, removeFromAllowlist,
    getBlocklist, addToBlocklist, removeFromBlocklist,
    getSettings, updateSettings,
    isBreakModeActive, startBreakMode, clearBreakMode,
    getClassificationHistory, addClassificationEntry, clearClassificationHistory,
  };
}
