// MindForge — Domain Tier Classification
// Tier 1: Certainty distractions (hardcoded, always blocked during sessions)
// Tier 2: Certainty productive (defaults + user allowlist, never questioned)
// Tier 3: Ambiguous (everything else — needs classifier)

const TIER1_DISTRACTIONS = [
  'instagram.com',
  'twitter.com',
  'x.com',
  'netflix.com',
  'tiktok.com',
  'facebook.com',
  'snapchat.com',
  'twitch.tv',
  'pinterest.com',
  'tumblr.com',
  '9gag.com',
  'whatsapp.com',
];

const DEFAULT_TIER2_PRODUCTIVE = [
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'docs.google.com',
  'notion.so',
  'leetcode.com',
  'coursera.org',
  'udemy.com',
  'kaggle.com',
  'dev.to',
  'learn.microsoft.com',
  'w3schools.com',
  'freecodecamp.org',
  'chat.openai.com',
  'claude.ai',
];

/**
 * Determine the tier for a given hostname.
 * User blocklist/allowlist override defaults.
 *
 * @param {string} hostname — e.g. "www.instagram.com"
 * @param {string[]} userAllowlist — hostnames the user marked always-productive
 * @param {string[]} userBlocklist — hostnames the user marked always-block
 * @returns {"distraction" | "productive" | "ambiguous"}
 */
function getTier(hostname, userAllowlist = [], userBlocklist = []) {
  if (!hostname) return 'ambiguous';

  const h = hostname.toLowerCase().replace(/^www\./, '');

  // User overrides take priority
  if (userBlocklist.some(d => h === d || h.endsWith('.' + d))) {
    return 'distraction';
  }
  if (userAllowlist.some(d => h === d || h.endsWith('.' + d))) {
    return 'productive';
  }

  // Tier 1 — certainty distractions
  if (TIER1_DISTRACTIONS.some(d => h === d || h.endsWith('.' + d))) {
    return 'distraction';
  }

  // Tier 2 — certainty productive
  if (DEFAULT_TIER2_PRODUCTIVE.some(d => h === d || h.endsWith('.' + d))) {
    return 'productive';
  }

  // Tier 3 — ambiguous, needs classifier
  return 'ambiguous';
}

// Export for both content script (global) and module contexts
if (typeof globalThis !== 'undefined') {
  globalThis.MindForgeDomainTiers = { TIER1_DISTRACTIONS, DEFAULT_TIER2_PRODUCTIVE, getTier };
}
