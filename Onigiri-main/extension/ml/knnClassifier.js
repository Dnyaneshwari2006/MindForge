// MindForge — KNN Classifier for Personalized, Goal-Contextual Learning
// Learns from user feedback (allow/block/override actions).
// Runs in the service worker (background.js context).

import { extractFeatures, computeGoalSimilarity } from './featureExtractor.js';

const K = 5;                // Number of neighbors
const MIN_EXAMPLES = 5;     // Minimum feedback examples before KNN activates
const GOAL_WEIGHT = 2.0;    // Weight multiplier for examples from similar goals
const MAX_EXAMPLES = 500;   // Cap feedback store to limit memory

let _feedbackExamples = []; // { vector, category, goalText, hostname, timestamp }

/**
 * Initialize KNN with stored feedback data.
 * @param {Array} storedExamples — from chrome.storage
 */
export function initKNN(storedExamples = []) {
  _feedbackExamples = storedExamples.slice(0, MAX_EXAMPLES);
  console.log(`[MindForge ML] KNN initialized with ${_feedbackExamples.length} feedback examples`);
}

/**
 * Check if KNN has enough data to be useful.
 */
export function isKNNReady() {
  return _feedbackExamples.length >= MIN_EXAMPLES;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Classify using KNN with goal-weighted distance.
 *
 * @param {Float64Array} featureVector — from extractFeatures()
 * @param {string} currentGoal — current session goal text
 * @returns {{ category: string, confidence: number, neighbors: number } | null}
 */
export function classifyKNN(featureVector, currentGoal = '') {
  if (!isKNNReady()) return null;

  // Compute similarity to all stored examples
  const similarities = _feedbackExamples.map((example, idx) => {
    let sim = cosineSimilarity(featureVector, example.vector);

    // Goal-contextual weighting: if this example was labeled under a similar goal,
    // give it more influence
    if (currentGoal && example.goalText) {
      const goalSim = computeGoalSimilarity(currentGoal, example.goalText);
      if (goalSim > 0.3) {
        sim *= GOAL_WEIGHT; // 2x influence for similar-goal examples
      }
    }

    return { idx, sim, category: example.category };
  });

  // Sort by similarity (descending) and take top K
  similarities.sort((a, b) => b.sim - a.sim);
  const neighbors = similarities.slice(0, K);

  // Distance-weighted voting
  const votes = { productive: 0, distraction: 0, neutral: 0 };

  for (const neighbor of neighbors) {
    // Weight = similarity (closer neighbors get more votes)
    const weight = Math.max(neighbor.sim, 0.01);
    votes[neighbor.category] = (votes[neighbor.category] || 0) + weight;
  }

  // Find winner
  let bestCategory = 'neutral';
  let bestVotes = 0;
  let totalVotes = 0;

  for (const [cat, voteWeight] of Object.entries(votes)) {
    totalVotes += voteWeight;
    if (voteWeight > bestVotes) {
      bestVotes = voteWeight;
      bestCategory = cat;
    }
  }

  const confidence = totalVotes > 0 ? bestVotes / totalVotes : 0;

  // Only return result if there's reasonable agreement among neighbors
  if (confidence < 0.35) return null;

  return {
    category: bestCategory,
    confidence: Math.min(confidence, 0.95),
    neighbors: neighbors.length,
  };
}

/**
 * Add a user feedback example to the KNN store.
 * Called when the user clicks "This is productive" / "This is a distraction".
 *
 * @param {Object} extractedContent — page content
 * @param {string} category — user's label: productive/distraction/neutral
 * @param {string} goalText — current session goal
 * @returns {Object} — the stored example (for persistence)
 */
export function addFeedbackExample(extractedContent, category, goalText = '') {
  const { vector } = extractFeatures(extractedContent, goalText);

  const example = {
    vector: Array.from(vector), // Convert to plain array for JSON serialization
    category,
    goalText,
    hostname: extractedContent.hostname || '',
    timestamp: Date.now(),
  };

  _feedbackExamples.push(example);

  // Cap at MAX_EXAMPLES, remove oldest
  if (_feedbackExamples.length > MAX_EXAMPLES) {
    _feedbackExamples = _feedbackExamples.slice(-MAX_EXAMPLES);
  }

  console.log(`[MindForge ML] KNN feedback added: ${category} for ${example.hostname} (goal: "${goalText}") — ${_feedbackExamples.length} total examples`);

  return example;
}

/**
 * Get all feedback examples (for persistence to chrome.storage).
 */
export function getFeedbackExamples() {
  return _feedbackExamples;
}

/**
 * Get stats about the KNN model.
 */
export function getKNNStats() {
  const counts = { productive: 0, distraction: 0, neutral: 0 };
  for (const ex of _feedbackExamples) {
    counts[ex.category] = (counts[ex.category] || 0) + 1;
  }

  return {
    totalExamples: _feedbackExamples.length,
    isReady: isKNNReady(),
    categoryCounts: counts,
  };
}
