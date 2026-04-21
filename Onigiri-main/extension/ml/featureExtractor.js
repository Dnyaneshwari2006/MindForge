// MindForge — Feature Extraction for ML Classifier
// Extracts TF-IDF-like feature vectors from page content for classification.
// Runs in the service worker (background.js context).

import { buildVocabulary, TRAINING_DATA } from './trainingData.js';

let _vocabulary = null;
let _vocabIndex = null; // token → index mapping

/**
 * Initialize vocabulary from training data.
 * Called once on extension start.
 */
export function initFeatures() {
  _vocabulary = buildVocabulary();
  _vocabIndex = {};
  _vocabulary.forEach((token, i) => { _vocabIndex[token] = i; });
  console.log(`[MindForge ML] Vocabulary initialized: ${_vocabulary.length} terms`);
  return _vocabulary;
}

/**
 * Tokenize text into cleaned unigrams and bigrams.
 */
function tokenize(text) {
  if (!text) return [];
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const tokens = [...words];

  // Add bigrams
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(words[i] + ' ' + words[i + 1]);
  }

  return tokens;
}

/**
 * Build a sparse TF vector from text against the vocabulary.
 * Returns a Float64Array of term frequencies (normalized).
 */
function buildTFVector(text) {
  if (!_vocabulary) initFeatures();

  const tokens = tokenize(text);
  const vec = new Float64Array(_vocabulary.length + META_FEATURES_COUNT);

  if (tokens.length === 0) return vec;

  // Count term frequencies
  for (const token of tokens) {
    const idx = _vocabIndex[token];
    if (idx !== undefined) {
      vec[idx]++;
    }
  }

  // Normalize by document length (TF normalization)
  const maxTF = Math.max(1, ...vec.slice(0, _vocabulary.length));
  for (let i = 0; i < _vocabulary.length; i++) {
    vec[i] = vec[i] / maxTF;
  }

  return vec;
}

// ─── Meta Features ───
// Additional non-text features appended to the vector
const META_FEATURES_COUNT = 10;

/**
 * Detect content type from extracted content signals.
 */
export function detectContentType(extractedContent) {
  const content = (extractedContent.content || '').toLowerCase();
  const title = (extractedContent.title || '').toLowerCase();
  const url = (extractedContent.url || '').toLowerCase();
  const allText = title + ' ' + content + ' ' + url;

  // Video signals
  const videoSignals = ['video', 'watch', 'stream', 'episode', 'movie', 'film',
    'lecture video', 'tutorial video', 'youtube.com/watch', 'vimeo.com',
    'twitch.tv', 'netflix.com', 'mp4', 'webm'];
  const videoScore = videoSignals.reduce((s, sig) => s + (allText.includes(sig) ? 1 : 0), 0);

  // Audio signals
  const audioSignals = ['podcast', 'audio', 'listen', 'spotify', 'music',
    'soundcloud', 'mp3', 'radio', 'beats', 'lofi', 'song', 'album'];
  const audioScore = audioSignals.reduce((s, sig) => s + (allText.includes(sig) ? 1 : 0), 0);

  // Interactive signals (coding, quizzes, tools)
  const interactiveSignals = ['editor', 'compiler', 'playground', 'sandbox',
    'quiz', 'exercise', 'practice', 'challenge', 'interactive', 'colab',
    'replit', 'codepen', 'jsfiddle', 'leetcode', 'hackerrank', 'codeforces'];
  const interactiveScore = interactiveSignals.reduce((s, sig) => s + (allText.includes(sig) ? 1 : 0), 0);

  if (interactiveScore > videoScore && interactiveScore > audioScore && interactiveScore >= 1) return 'interactive';
  if (videoScore > audioScore && videoScore >= 1) return 'video';
  if (audioScore >= 2) return 'audio';
  return 'text';
}

/**
 * Compute goal similarity between session goal and page content.
 * Returns a score 0-1.
 */
export function computeGoalSimilarity(goalText, pageText) {
  if (!goalText || !pageText) return 0;

  const goalTokens = new Set(tokenize(goalText));
  const pageTokens = new Set(tokenize(pageText));

  if (goalTokens.size === 0) return 0;

  let matches = 0;
  for (const token of goalTokens) {
    if (pageTokens.has(token)) matches++;
  }

  return matches / goalTokens.size;
}

/**
 * Compute goal relevance using fuzzy matching.
 * More aggressive than computeGoalSimilarity — uses substring, prefix,
 * and cross-word matching to catch abbreviations and word variants.
 * 
 * Used by the goal-relevance adjustment stage in the classifier.
 *
 * @param {Object} extractedContent — { title, url, hostname, content }
 * @param {string} goalText — Session goal text
 * @returns {number} — 0 to 1 relevance score
 */
export function computeGoalRelevance(extractedContent, goalText) {
  if (!goalText) return 0;

  const title = (extractedContent.title || '').toLowerCase();
  const content = (extractedContent.content || '').toLowerCase();
  const url = (extractedContent.url || '').toLowerCase();
  // Title gets double weight — it's the strongest topical indicator
  const allText = [title, title, content, url].join(' ');

  const goalWords = goalText.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (goalWords.length === 0) return 0;

  const contentTokens = allText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  const contentWordSet = new Set(contentTokens);

  let totalScore = 0;

  for (const goalWord of goalWords) {
    // 1. Exact match (strongest signal)
    if (contentWordSet.has(goalWord)) {
      totalScore += 1.0;
      continue;
    }

    // 2. Substring + prefix fuzzy matching
    let bestPartial = 0;
    for (const cw of contentWordSet) {
      // Goal word found inside a content word (e.g., "data" in "database")
      if (cw.length > goalWord.length && cw.includes(goalWord) && goalWord.length >= 3) {
        bestPartial = Math.max(bestPartial, 0.8);
      }
      // Content word found inside goal word (e.g., "base" in "database")
      if (goalWord.length > cw.length && goalWord.includes(cw) && cw.length >= 4) {
        bestPartial = Math.max(bestPartial, 0.6);
      }
      // Shared prefix (e.g., "program" ↔ "programming")
      if (goalWord.length >= 4 && cw.length >= 4) {
        const prefixLen = Math.min(5, Math.min(goalWord.length, cw.length));
        if (goalWord.substring(0, prefixLen) === cw.substring(0, prefixLen)) {
          bestPartial = Math.max(bestPartial, 0.5);
        }
      }
    }
    totalScore += bestPartial;
  }

  return totalScore / goalWords.length;
}

/**
 * Extract a full feature vector from extracted content + session context.
 *
 * @param {Object} extractedContent — { title, url, hostname, content }
 * @param {string} sessionGoal — Current session goal text
 * @returns {{ vector: Float64Array, contentType: string }}
 */
export function extractFeatures(extractedContent, sessionGoal = '') {
  if (!_vocabulary) initFeatures();

  const title = extractedContent.title || '';
  const url = extractedContent.url || '';
  const hostname = extractedContent.hostname || '';
  const content = extractedContent.content || '';

  // Combine all text, give title 3x weight
  const allText = [title, title, title, url, hostname, content].join(' ');
  const vec = buildTFVector(allText);

  // ─── Meta features (appended after vocabulary features) ───
  const metaStart = _vocabulary.length;

  // 1. Goal similarity (0-1)
  const goalSim = computeGoalSimilarity(sessionGoal, allText);
  vec[metaStart + 0] = goalSim;

  // 2. URL depth (number of path segments, normalized)
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    vec[metaStart + 1] = Math.min(urlObj.pathname.split('/').filter(Boolean).length / 5, 1);
  } catch { vec[metaStart + 1] = 0; }

  // 3. Content length bucket (0-1)
  vec[metaStart + 2] = Math.min(content.length / 5000, 1);

  // 4. Has video content (0 or 1)
  const ct = detectContentType(extractedContent);
  vec[metaStart + 3] = ct === 'video' ? 1 : 0;

  // 5. Has code/interactive content (0 or 1)
  vec[metaStart + 4] = ct === 'interactive' ? 1 : 0;

  // 6. Has audio content (0 or 1)
  vec[metaStart + 5] = ct === 'audio' ? 1 : 0;

  // 7. Is YouTube (0 or 1)
  vec[metaStart + 6] = hostname.includes('youtube.com') ? 1 : 0;

  // 8. TLD education/org signal (0 or 1)
  const eduTLDs = ['.edu', '.ac.', '.org', '.gov'];
  vec[metaStart + 7] = eduTLDs.some(tld => hostname.includes(tld)) ? 1 : 0;

  // 9. Podcast content detected (0 or 1) — works across any site
  const podcastSignals = ['podcast', 'episode', 'hosted by', 'listen now', 'show notes', 'subscribe to podcast'];
  const isPodcast = podcastSignals.some(sig => allText.includes(sig)) ? 1 : 0;
  vec[metaStart + 8] = isPodcast;

  // 10. Has structured data (0 or 1) — content-rich pages tend to have schema.org data
  const hasStructured = (extractedContent.structuredDataFound) ? 1 : 0;
  vec[metaStart + 9] = hasStructured;

  return { vector: vec, contentType: ct };
}

/**
 * Extract features from a training data entry (for building the model).
 */
export function extractTrainingFeatures(entry) {
  return extractFeatures({
    title: entry.title,
    url: entry.url,
    hostname: entry.url.split('/')[0] || '',
    content: entry.snippet,
  }, '');
}

/**
 * Get the vocabulary size (for Naive Bayes initialization).
 */
export function getVocabSize() {
  if (!_vocabulary) initFeatures();
  return _vocabulary.length + META_FEATURES_COUNT;
}
