const session = require('./session');
const { getUserActiveRoom, updateMemberStatus } = require('./db');

let scorerInterval = null;
let previousScores = [];

/**
 * Clamp a number between min and max
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Compute focus score from last 60 seconds of IN-MEMORY session events
 */
function computeScore() {
  if (!session.isActive()) {
    return null; // No score when no session
  }

  const events = session.getRecentSessionEvents(60);

  if (events.length === 0) {
    return 75; // Default score when session just started
  }

  const now = Date.now();

  // ─── Calculate time spent in each category using timestamp intervals ───
  let productiveMs = 0;
  let distractionMs = 0;
  let browserMs = 0;
  let neutralMs = 0;
  let idleMs = 0;
  let appSwitches = 0;
  let lastCategory = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextTime = (i + 1 < events.length) ? events[i + 1].timestamp : now;
    const duration = Math.max(0, Math.min(nextTime - event.timestamp, 60000));

    if (duration <= 0) continue;

    const cat = event.category || 'neutral';

    // Count distinct category switches
    if (cat !== lastCategory && lastCategory !== null) {
      appSwitches++;
    }
    lastCategory = cat;

    if (event.is_idle) idleMs += duration;
    else if (cat === 'productive') productiveMs += duration;
    else if (cat === 'distraction') distractionMs += duration;
    else if (cat === 'browser') browserMs += duration;
    else neutralMs += duration;
  }

  const totalMs = productiveMs + distractionMs + browserMs + neutralMs + idleMs;
  if (totalMs === 0) return 75;

  // ─── Compute score ───
  let score = 100;

  // Penalty for app switches (context switching cost) — each beyond 2 costs 3 points
  score -= Math.max(0, appSwitches - 2) * 3;

  // Penalty for idle time
  score -= (idleMs / 60000) * 10;

  // Penalty for distraction time (heavy)
  const distractionPct = (distractionMs / totalMs) * 100;
  score -= distractionPct * 0.5;

  // Penalty for browser (lighter)
  const browserPct = (browserMs / totalMs) * 100;
  score -= browserPct * 0.15;

  // Bonus for productive time
  const productivePct = (productiveMs / totalMs) * 100;
  if (productivePct > 80) score += 5;

  score = clamp(Math.round(score), 0, 100);

  // ─── Logging ───
  const totalSec = Math.round(totalMs / 1000);
  console.log(
    `[Scorer] prod=${Math.round(productiveMs/1000)}s dist=${Math.round(distractionMs/1000)}s ` +
    `brw=${Math.round(browserMs/1000)}s ntrl=${Math.round(neutralMs/1000)}s ` +
    `idle=${Math.round(idleMs/1000)}s sw=${appSwitches} (${totalSec}s)`
  );

  return score;
}

/**
 * Detect focus spiral
 */
function detectSpiral(currentScore) {
  if (previousScores.length < 2) return false;
  const prev1 = previousScores[previousScores.length - 1];
  const prev2 = previousScores[previousScores.length - 2];
  return (prev2 - prev1) >= 15 && (prev1 - currentScore) >= 15 && currentScore < 50;
}

function getInterventionMessage(score) {
  if (score < 20) return "🚨 You've been distracted for a while. Take a 2-minute break, then try a focused sprint.";
  if (score < 35) return "⚠️ Focus spiral detected. Close distracting tabs and set a small goal.";
  return "📉 Your focus is slipping. Try switching to a concrete task.";
}

/**
 * Start the scoring engine
 */
function startScorer(broadcastFn) {
  console.log('[Scorer] Ready — will score when a session is active');

  scorerInterval = setInterval(() => {
    if (!session.isActive() || session.isPaused()) return; // Skip during breaks

    const score = computeScore();
    if (score === null) return;

    // Record score in session memory
    session.addScore(score);

    previousScores.push(score);
    if (previousScores.length > 10) previousScores.shift();

    const label = score >= 70 ? 'Deep work' : score >= 50 ? 'Moderate' : 'Distracted';
    console.log(`[Scorer] ★ Focus Score: ${score} (${label})`);

    // Broadcast to UI
    broadcastFn({
      type: 'score',
      score,
      timestamp: Date.now(),
      label,
      session: session.getStatus(),
    });

    // Update Focus Room status if user is in a room
    updateRoomStatus(score).catch(() => {});

    // Check for spiral
    if (detectSpiral(score)) {
      const message = getInterventionMessage(score);
      console.log(`[Scorer] 🚨 SPIRAL: ${message}`);
      broadcastFn({ type: 'intervention', message, score, timestamp: Date.now() });
    }
  }, 10000); // Score every 10 seconds for more responsive feedback
}

function stopScorer() {
  if (scorerInterval) {
    clearInterval(scorerInterval);
    scorerInterval = null;
  }
}

/**
 * Update user's Focus Room status based on current score
 */
async function updateRoomStatus(score) {
  try {
    const roomId = await getUserActiveRoom();
    if (!roomId) return;

    let status = 'focused';
    if (score < 50) status = 'distracted';
    // Break mode check — the session won't be active during break,
    // so the scorer won't run. But we handle it explicitly for safety.

    await updateMemberStatus(roomId, status, score);
  } catch (err) {
    // Non-fatal: room status update failure shouldn't crash the scorer
  }
}

module.exports = { startScorer, stopScorer, computeScore };
