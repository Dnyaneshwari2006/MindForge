const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabase = null;
let currentUser = null;
let authChangeCallbacks = [];

// ─── Persistent file-based auth storage ───
// Saves tokens to a JSON file so sessions survive app restarts
const AUTH_FILE = path.join(
  process.env.APPDATA || process.env.HOME || '/tmp',
  '.mindforge-auth-session.json'
);

let authCache = {};
try {
  if (fs.existsSync(AUTH_FILE)) {
    authCache = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
} catch (_) {
  authCache = {};
}

function saveAuthToDisk() {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authCache), 'utf8');
  } catch (e) {
    console.warn('[Auth] Could not persist session to disk:', e.message);
  }
}

const authStorage = {
  getItem: (key) => authCache[key] || null,
  setItem: (key, value) => { authCache[key] = value; saveAuthToDisk(); },
  removeItem: (key) => { delete authCache[key]; saveAuthToDisk(); },
};

/**
 * Initialize the auth-only Supabase client.
 */
function initAuth() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    console.error('[Auth] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    return false;
  }

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: authStorage,
    },
  });

  // Listen for auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    console.log(`[Auth] State change: ${event}, user: ${currentUser?.email || 'none'}`);
    authChangeCallbacks.forEach(cb => {
      try { cb(event, session); } catch (e) { console.error('[Auth] Callback error:', e); }
    });
  });

  console.log('[Auth] Supabase auth client initialized');
  return true;
}

/**
 * Sign up with email & password
 */
async function signUp(email, password) {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error('[Auth] Sign up error:', error.message);
    return { user: null, error: { message: error.message } };
  }

  currentUser = data.user;
  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign in with email & password
 */
async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[Auth] Sign in error:', error.message);
    return { user: null, error: { message: error.message } };
  }

  currentUser = data.user;
  return {
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    error: null,
  };
}

/**
 * Sign out the current user
 */
async function signOut() {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[Auth] Sign out error:', error.message);
    return { error: { message: error.message } };
  }

  currentUser = null;
  return { error: null };
}

/**
 * Get the current logged-in user
 */
function getUser() {
  return currentUser;
}

/**
 * Get current user's ID (for RLS/inserts)
 */
function getUserId() {
  return currentUser?.id || null;
}

/**
 * Get current session (for passing tokens to the DB client)
 */
async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/**
 * Register a callback for auth state changes
 */
function onAuthStateChange(callback) {
  authChangeCallbacks.push(callback);
}

/**
 * Get the auth Supabase client (for admin ops like migration)
 */
function getAuthClient() {
  return supabase;
}

module.exports = {
  initAuth,
  signUp,
  signIn,
  signOut,
  getUser,
  getUserId,
  getSession,
  onAuthStateChange,
  getAuthClient,
};
