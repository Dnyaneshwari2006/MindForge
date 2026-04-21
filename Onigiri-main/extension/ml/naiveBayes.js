// MindForge — Multinomial Naive Bayes Classifier
// Pre-trained on the curated training dataset.
// Runs in the service worker (background.js context).

import { TRAINING_DATA } from './trainingData.js';
import { extractTrainingFeatures, getVocabSize, initFeatures } from './featureExtractor.js';

const CATEGORIES = ['productive', 'distraction', 'neutral'];
const LAPLACE_ALPHA = 1.0; // Laplace smoothing parameter

let _model = null; // { logPriors, logLikelihoods, vocabSize }

/**
 * Train the Naive Bayes model from the curated training data.
 * This runs once at extension startup — takes ~10ms.
 */
export function trainNaiveBayes() {
  initFeatures();

  const vocabSize = getVocabSize();

  // Group training data by category
  const categoryDocs = {};
  const categoryFeatureSums = {};
  const categoryCounts = {};

  for (const cat of CATEGORIES) {
    categoryDocs[cat] = [];
    categoryFeatureSums[cat] = new Float64Array(vocabSize);
    categoryCounts[cat] = 0;
  }

  // Extract features for all training examples
  for (const entry of TRAINING_DATA) {
    const { vector } = extractTrainingFeatures(entry);
    const cat = entry.category;

    if (!categoryFeatureSums[cat]) continue;

    categoryCounts[cat]++;

    // Accumulate feature sums per category
    for (let i = 0; i < vocabSize; i++) {
      categoryFeatureSums[cat][i] += vector[i];
    }
  }

  const totalDocs = TRAINING_DATA.length;

  // Compute log priors: P(category) = count(category) / total
  const logPriors = {};
  for (const cat of CATEGORIES) {
    logPriors[cat] = Math.log((categoryCounts[cat] + LAPLACE_ALPHA) / (totalDocs + CATEGORIES.length * LAPLACE_ALPHA));
  }

  // Compute log likelihoods with Laplace smoothing:
  // P(feature | category) = (count(feature, category) + alpha) / (sum(all features in category) + alpha * vocabSize)
  const logLikelihoods = {};
  for (const cat of CATEGORIES) {
    logLikelihoods[cat] = new Float64Array(vocabSize);
    const featureSum = categoryFeatureSums[cat].reduce((a, b) => a + b, 0);
    const denom = featureSum + LAPLACE_ALPHA * vocabSize;

    for (let i = 0; i < vocabSize; i++) {
      logLikelihoods[cat][i] = Math.log((categoryFeatureSums[cat][i] + LAPLACE_ALPHA) / denom);
    }
  }

  _model = { logPriors, logLikelihoods, vocabSize };
  console.log(`[MindForge ML] Naive Bayes trained: ${totalDocs} examples, ${vocabSize} features`);
  console.log(`[MindForge ML] Category distribution:`, categoryCounts);

  return _model;
}

/**
 * Classify a feature vector using the trained Naive Bayes model.
 *
 * @param {Float64Array} featureVector — from extractFeatures()
 * @returns {{ category: string, confidence: number, scores: Object }}
 */
export function classifyNaiveBayes(featureVector) {
  if (!_model) trainNaiveBayes();

  const { logPriors, logLikelihoods, vocabSize } = _model;

  // Compute log posterior for each category
  // log P(cat | features) ∝ log P(cat) + Σ feature_i * log P(feature_i | cat)
  const logPosteriors = {};

  for (const cat of CATEGORIES) {
    let logProb = logPriors[cat];

    for (let i = 0; i < vocabSize; i++) {
      if (featureVector[i] > 0) {
        logProb += featureVector[i] * logLikelihoods[cat][i];
      }
    }

    logPosteriors[cat] = logProb;
  }

  // Convert log posteriors to probabilities using log-sum-exp trick
  const maxLog = Math.max(...Object.values(logPosteriors));
  let sumExp = 0;
  const expScores = {};

  for (const cat of CATEGORIES) {
    expScores[cat] = Math.exp(logPosteriors[cat] - maxLog);
    sumExp += expScores[cat];
  }

  const probabilities = {};
  for (const cat of CATEGORIES) {
    probabilities[cat] = expScores[cat] / sumExp;
  }

  // Find best category
  let bestCat = 'neutral';
  let bestProb = 0;

  for (const cat of CATEGORIES) {
    if (probabilities[cat] > bestProb) {
      bestProb = probabilities[cat];
      bestCat = cat;
    }
  }

  return {
    category: bestCat,
    confidence: bestProb,
    scores: probabilities,
  };
}

/**
 * Check if the model is trained / ready.
 */
export function isModelReady() {
  return _model !== null;
}
