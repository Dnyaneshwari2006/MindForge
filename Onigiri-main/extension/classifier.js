// MindForge — Classification Engine v5.0
// Runs in the service worker (background.js context).
// 6-stage classification pipeline:
//   1. Domain tier check (instant, goal-independent)
//   2. KNN personalized check (goal-contextual, if ≥5 feedback examples)
//   3. Naive Bayes ML classifier (general text classification)
//   4. Keyword fallback (only if ML confidence < 0.4)
//   5. Goal-relevance adjustment (session-goal-aware override)
//   6. Groq AI LLM classification (3-tier: GOAL_RELEVANT / STUDY_RELATED / DISTRACTION)

import { extractFeatures, detectContentType, initFeatures, computeGoalRelevance } from './ml/featureExtractor.js';
import { trainNaiveBayes, classifyNaiveBayes } from './ml/naiveBayes.js';
import { classifyKNN, isKNNReady } from './ml/knnClassifier.js';

// ─── Domain Tier Data ───

const TIER1_DISTRACTIONS = [
  'instagram.com', 'twitter.com', 'x.com', 'netflix.com', 'tiktok.com',
  'facebook.com', 'snapchat.com', 'twitch.tv', 'pinterest.com',
  'tumblr.com', '9gag.com', 'whatsapp.com',
  // NOTE: YouTube + Reddit are NOT here — they are mixed-content sites.
  // Classification is determined by ML analysis of actual page content
  // (video title, subreddit, post topic).
];

const DEFAULT_TIER2_PRODUCTIVE = [
  'github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.google.com',
  'notion.so', 'leetcode.com', 'coursera.org', 'udemy.com', 'kaggle.com',
  'dev.to', 'learn.microsoft.com', 'w3schools.com', 'freecodecamp.org',
  'chat.openai.com', 'claude.ai',
];

function getDomainTier(hostname, userAllowlist = [], userBlocklist = []) {
  if (!hostname) return 'ambiguous';
  const h = hostname.toLowerCase().replace(/^www\./, '');

  // Never block MindForge's own UI (localhost / 127.0.0.1 / LAN IPs)
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.')) return 'productive';

  if (userBlocklist.some(d => h === d || h.endsWith('.' + d))) return 'distraction';
  if (userAllowlist.some(d => h === d || h.endsWith('.' + d))) return 'productive';
  if (TIER1_DISTRACTIONS.some(d => h === d || h.endsWith('.' + d))) return 'distraction';
  if (DEFAULT_TIER2_PRODUCTIVE.some(d => h === d || h.endsWith('.' + d))) return 'productive';

  return 'ambiguous';
}

// ─── Legacy Keyword Classifier (Stage 4 fallback) ───

const DISTRACTION_SIGNALS = [
  'meme', 'funny', 'viral', 'gossip', 'celebrity', 'trending',
  'gaming', 'watch later', 'shorts', 'reels', 'stories',
  'entertainment', 'movie', 'tv show', 'anime', 'manga',
  'social media', 'selfie', 'influencer', 'vlogger', 'drama',
  'prank', 'reaction', 'roast', 'rant', 'cringe', 'fail',
  'unboxing', 'haul', 'mukbang', 'asmr', 'compilation',
  "we're so back", 'hot take', 'beef', 'exposed',
  'clickbait', 'subscribe', 'giveaway', 'scandal',
  'binge watch', 'episode recap', 'fan theory', 'fandom',
  'dating', 'relationship drama', 'party mix', 'top hits',
  'satisfying', 'oddly satisfying', 'try not to laugh',
  'gone wrong', 'pov', 'storytime', 'grwm',
];

const PRODUCTIVE_SIGNALS = [
  'tutorial', 'documentation', 'api', 'guide', 'reference', 'how to',
  'learn', 'course', 'lecture', 'programming', 'coding', 'development',
  'algorithm', 'data structure', 'framework', 'library', 'debug',
  'research', 'study', 'paper', 'analysis', 'engineering', 'design',
  'architecture', 'deploy', 'database', 'server', 'config', 'setup',
  'textbook', 'syllabus', 'chapter', 'exam', 'notes', 'education',
  'university', 'college', 'academic', 'fundamentals', 'concepts',
  'introduction', 'overview', 'explained', 'deep dive',
  'workshop', 'seminar', 'conference', 'masterclass',
  'problem solving', 'mathematics', 'physics', 'chemistry',
  'biology', 'statistics', 'machine learning', 'artificial intelligence',
  'neural network', 'data science', 'computer science',
  'open source', 'repository', 'pull request', 'code review',
  'documentation', 'specification', 'technical', 'implementation',
  'focus music', 'study playlist', 'concentration', 'deep work',
  'white noise', 'study session', 'revision', 'thesis',
  'educational podcast', 'tech talk',
];

function keywordClassify(extractedContent, sessionGoal = '') {
  const title = (extractedContent.title || '').toLowerCase();
  const content = (extractedContent.content || '').toLowerCase();
  const url = (extractedContent.url || '').toLowerCase();
  const allText = [title, content, url].join(' ');

  let distractionScore = 0;
  for (const kw of DISTRACTION_SIGNALS) {
    if (title.includes(kw)) distractionScore += 2;
    else if (allText.includes(kw)) distractionScore++;
  }

  let productiveScore = 0;
  for (const kw of PRODUCTIVE_SIGNALS) {
    if (title.includes(kw)) productiveScore += 2;
    else if (allText.includes(kw)) productiveScore++;
  }

  // Goal-contextual boost for keyword stage
  if (sessionGoal) {
    const goalWords = sessionGoal.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let goalMatches = 0;
    for (const word of goalWords) {
      if (allText.includes(word)) goalMatches++;
    }
    if (goalWords.length > 0) {
      const goalOverlap = goalMatches / goalWords.length;
      if (goalOverlap >= 0.3) {
        productiveScore += Math.round(goalOverlap * 5);
      }
    }
  }

  if (productiveScore > distractionScore && productiveScore >= 1) {
    const conf = Math.min(0.3 + productiveScore * 0.04, 0.65);
    return { category: 'productive', confidence: conf, label: 'keyword: educational content' };
  }

  if (distractionScore > productiveScore && distractionScore >= 1) {
    const conf = Math.min(0.3 + distractionScore * 0.04, 0.65);
    return { category: 'distraction', confidence: conf, label: 'keyword: entertainment content' };
  }

  return { category: 'neutral', confidence: 0.25, label: 'keyword: uncertain content' };
}

// ─── ML Model Initialization ───

let _mlReady = false;

function ensureMLReady() {
  if (_mlReady) return;
  try {
    initFeatures();
    trainNaiveBayes();
    _mlReady = true;
    console.log('[MindForge] ML models initialized successfully');
  } catch (err) {
    console.error('[MindForge] ML initialization error:', err);
  }
}

// ─── Stage 5: Goal-Relevance Adjustment ───

/**
 * Adjusts the raw ML classification based on session goal relevance.
 * This is the key stage that makes the classifier understand:
 *   - Content matching session goal → PRODUCTIVE (e.g., DBMS video when goal is "database")
 *   - Educational but not goal-related → NEUTRAL (e.g., ML video when goal is "database")
 *   - Entertainment/distraction → DISTRACTION (unchanged)
 *
 * @param {Object} result — raw classification from stages 2-4
 * @param {Object} extractedContent — page content
 * @param {string} sessionGoal — current session goal text
 * @param {string} hostname — for logging
 * @returns {Object} — adjusted classification
 */
function applyGoalRelevance(result, extractedContent, sessionGoal, hostname) {
  if (!sessionGoal || !result) return result;

  const goalRelevance = computeGoalRelevance(extractedContent, sessionGoal);

  // HIGH goal relevance: content directly matches session topic → productive
  // e.g., watching "Normalization in DBMS" when goal is "database"
  if (goalRelevance >= 0.25) {
    if (result.category !== 'productive') {
      console.log(`[MindForge] 🎯 Goal-boost: ${result.category} → productive (relevance: ${goalRelevance.toFixed(2)}, goal: "${sessionGoal}") for ${hostname}`);
      return {
        ...result,
        category: 'productive',
        confidence: Math.max(0.7, goalRelevance),
        label: `Goal-relevant: matches "${sessionGoal}"`,
        method: result.method + '+goal-boost',
      };
    }
    return result; // Already productive — keep it
  }

  // LOW goal relevance + ML says productive → educational but NOT session-related → neutral
  // e.g., watching "ML tutorial" when goal is "database" — it's learning, but off-topic
  if (goalRelevance < 0.1 && result.category === 'productive') {
    console.log(`[MindForge] 📚 Goal-demote: productive → neutral (not related to "${sessionGoal}", relevance: ${goalRelevance.toFixed(2)}) for ${hostname}`);
    return {
      ...result,
      category: 'neutral',
      confidence: 0.5,
      label: `Educational but not related to "${sessionGoal}"`,
      method: result.method + '+goal-demote',
    };
  }

  // Everything else: distraction stays distraction, neutral stays neutral
  return result;
}

// ─── Main classify function (5-stage pipeline) ───

/**
 * Classify a page's content.
 * Returns { category, confidence, label, contentType, method }
 */
async function classify(extractedContent, sessionGoal, userAllowlist = [], userBlocklist = [], sessionActive = false) {
  let hostname = extractedContent.hostname || '';
  if (!hostname && extractedContent.url) {
    try { hostname = new URL(extractedContent.url).hostname; } catch {}
  }

  // ─── Stage 1: Domain tier check (instant, goal-independent) ───
  const tier = getDomainTier(hostname, userAllowlist, userBlocklist);

  if (tier === 'distraction') {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] ✗ DISTRACTION (tier): ${hostname}`);
    return { category: 'distraction', confidence: 1.0, label: 'Known distraction site', contentType: ct, method: 'domain-tier' };
  }
  if (tier === 'productive') {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] ✓ PRODUCTIVE (tier): ${hostname}`);
    return { category: 'productive', confidence: 1.0, label: 'Known productive site', contentType: ct, method: 'domain-tier' };
  }

  // If no active session, mark neutral
  if (!sessionActive) {
    const ct = detectContentType(extractedContent);
    console.log(`[MindForge] — NEUTRAL (no session): ${hostname}`);
    return { category: 'neutral', confidence: 0.5, label: 'no active session', contentType: ct, method: 'no-session' };
  }

  // Special case: YouTube homepage, search, and feeds should be neutral
  // We want to block distracting videos, not the platform itself before the user can search
  if (hostname.includes('youtube.com') && extractedContent.url) {
    try {
      const pathname = new URL(extractedContent.url).pathname;
      if (pathname === '/' || pathname === '/results' || pathname.startsWith('/feed/')) {
        console.log(`[MindForge] — NEUTRAL (YouTube navigation): ${extractedContent.url}`);
        return { category: 'neutral', confidence: 0.9, label: 'YouTube Navigation', contentType: 'video', method: 'special-case' };
      }
    } catch (e) {}
  }

  // ─── Initialize ML models if needed ───
  ensureMLReady();

  // ─── Extract features for ML stages ───
  let featureResult;
  try {
    featureResult = extractFeatures(extractedContent, sessionGoal);
  } catch (err) {
    console.warn('[MindForge] Feature extraction failed:', err.message);
    const kwResult = keywordClassify(extractedContent, sessionGoal);
    const fallback = { ...kwResult, contentType: 'text', method: 'keyword-fallback-error' };
    return applyGoalRelevance(fallback, extractedContent, sessionGoal, hostname);
  }

  const { vector: featureVector, contentType } = featureResult;

  // ─── Stages 2-4: ML Classification Pipeline ───
  // Results are collected (not returned early) so Stage 5 can adjust them.
  let result = null;

  // Stage 2: KNN personalized check (goal-contextual)
  if (isKNNReady()) {
    try {
      const knnResult = classifyKNN(featureVector, sessionGoal);
      if (knnResult && knnResult.confidence >= 0.5) {
        console.log(`[MindForge] [raw] ${knnResult.category.toUpperCase()} (KNN): ${hostname} — confidence: ${knnResult.confidence.toFixed(2)}`);
        result = {
          category: knnResult.category,
          confidence: knnResult.confidence,
          label: `ML personalized: ${knnResult.category} (goal-contextual)`,
          contentType,
          method: 'knn-personalized',
        };
      }
    } catch (err) {
      console.warn('[MindForge] KNN classification failed:', err.message);
    }
  }

  // Stage 3: Naive Bayes general classifier
  if (!result) {
    try {
      const nbResult = classifyNaiveBayes(featureVector);

      if (nbResult.confidence >= 0.4) {
        console.log(`[MindForge] [raw] ${nbResult.category.toUpperCase()} (NaiveBayes): ${hostname} — confidence: ${nbResult.confidence.toFixed(2)} — scores: P=${nbResult.scores.productive.toFixed(2)} D=${nbResult.scores.distraction.toFixed(2)} N=${nbResult.scores.neutral.toFixed(2)}`);
        result = {
          category: nbResult.category,
          confidence: Math.min(nbResult.confidence, 0.9),
          label: `ML classified: ${nbResult.category}`,
          contentType,
          method: 'naive-bayes',
        };
      }
    } catch (err) {
      console.warn('[MindForge] Naive Bayes classification failed:', err.message);
    }
  }

  // Stage 4: Keyword fallback (goal-aware)
  if (!result) {
    const kwResult = keywordClassify(extractedContent, sessionGoal);
    console.log(`[MindForge] [raw] ${kwResult.category.toUpperCase()} (keyword): ${hostname} — ${kwResult.label}`);
    result = { ...kwResult, contentType, method: 'keyword-fallback' };
  }

  // ═══════════════════════════════════════
  // Stage 5: Goal-Relevance Adjustment
  // ═══════════════════════════════════════
  // Override ML classification based on session goal:
  //   - Content matching session goal → PRODUCTIVE
  //   - Educational but off-topic   → NEUTRAL
  //   - Entertainment               → DISTRACTION (unchanged)
  result = applyGoalRelevance(result, extractedContent, sessionGoal, hostname);

  // Final log
  const icon = result.category === 'distraction' ? '✗' : result.category === 'productive' ? '✓' : '—';
  console.log(`[MindForge] ${icon} FINAL: ${result.category.toUpperCase()} (${result.method}): ${hostname} — confidence: ${result.confidence.toFixed(2)} — ${result.label}`);

  return result;
}

// ─── Stage 6: Groq AI LLM Classification (3-Tier) ───

/**
 * Call the backend's /ai-classify-content endpoint for LLM-powered classification.
 * Returns { verdict: 'GOAL_RELEVANT'|'STUDY_RELATED'|'DISTRACTION', reason, confidence }
 * Falls back to the local result if the API is unreachable.
 */
async function classifyWithAI(extractedContent, sessionGoal) {
  try {
    const response = await fetch(`${AI_SERVER_URL}/ai-classify-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: extractedContent.title || '',
        url: extractedContent.url || '',
        hostname: extractedContent.hostname || '',
        content: (extractedContent.content || '').substring(0, 600),
        sessionGoal: sessionGoal || '',
      }),
      signal: AbortSignal.timeout(8000), // 8s timeout — LLM can be slow
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data; // { verdict, reason, confidence }
  } catch (err) {
    console.warn('[MindForge] AI classify error:', err.message);
    return null;
  }
}

// Server URL for AI classification
const AI_SERVER_URL = 'http://localhost:39871';

/**
 * Map AI verdict to classifier result format.
 */
function aiVerdictToResult(aiResult, localResult) {
  if (!aiResult || !aiResult.verdict) return localResult;

  switch (aiResult.verdict) {
    case 'GOAL_RELEVANT':
      return {
        category: 'productive',
        confidence: Math.max(0.85, aiResult.confidence || 0.85),
        label: `🎯 AI: Goal-relevant — ${aiResult.reason}`,
        contentType: localResult.contentType,
        method: localResult.method + '+ai-goal-relevant',
      };
    case 'STUDY_RELATED':
      return {
        category: 'neutral',
        confidence: aiResult.confidence || 0.6,
        label: `📚 AI: Study-related — ${aiResult.reason}`,
        contentType: localResult.contentType,
        method: localResult.method + '+ai-study-related',
      };
    case 'DISTRACTION':
      return {
        category: 'distraction',
        confidence: Math.max(0.85, aiResult.confidence || 0.85),
        label: `🚫 AI: Distraction — ${aiResult.reason}`,
        contentType: localResult.contentType,
        method: localResult.method + '+ai-distraction',
      };
    default:
      return localResult;
  }
}

export { classify, classifyWithAI, aiVerdictToResult, getDomainTier, keywordClassify, ensureMLReady };
