/**
 * MindForge Web Server — Standalone entry point (replaces Electron main.js)
 * 
 * Starts the Express + WebSocket backend, system watcher, scorer, and Django
 * without any Electron dependencies. The React frontend runs separately via Vite.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDB, setAuthSession } = require('./core/db');
const { initAuth, onAuthStateChange } = require('./core/auth');
const { startServer, broadcast } = require('./core/server');
const { startWatcher } = require('./core/watcher');
const { startDjango, stopDjango } = require('./core/djangoHandler');
const { startEmailScheduler } = require('./core/emailScheduler');

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       MindForge — Web Server         ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Initialize Supabase Auth
  const authReady = initAuth();
  if (!authReady) {
    console.error('[FATAL] Could not initialize Supabase Auth. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  // Initialize Supabase DB connection
  const dbReady = initDB();
  if (!dbReady) {
    console.error('[FATAL] Could not connect to Supabase. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  // When auth state changes, update the DB client with the user's session
  onAuthStateChange(async (event, session) => {
    if (session) {
      setAuthSession(session.access_token, session.refresh_token);
    }
  });

  // Start Express + WebSocket server
  try {
    await startServer();
    console.log('[Server] ✓ Express + WebSocket backend is running');
  } catch (err) {
    console.error(`[FATAL] Could not start server: ${err.message}`);
    process.exit(1);
  }

  // Start system watcher
  await startWatcher(broadcast);
  console.log('[Watcher] ✓ System activity watcher is running');

  // Start Django backend
  try {
    await startDjango();
    console.log('[Django] ✓ Django backend is running');
  } catch (err) {
    console.warn(`[WARN] Django server could not start: ${err.message}`);
    console.warn('[WARN] Mobile phone session bridging will not be available.');
    // Don't exit — the main app still works without Django
  }

  // Start daily email scheduler (6 PM IST)
  startEmailScheduler();

  console.log('\n[MindForge] ✓ All services started successfully');
  console.log('[MindForge] Open http://localhost:5174 in your browser\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[MindForge] Shutting down...');
  stopDjango();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopDjango();
  process.exit(0);
});

main().catch((err) => {
  console.error('[FATAL] Unhandled error:', err);
  process.exit(1);
});
