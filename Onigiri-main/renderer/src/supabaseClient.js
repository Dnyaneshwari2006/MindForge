/**
 * Browser-side Supabase client for direct auth operations.
 * Uses VITE_ prefixed env vars that Vite exposes to the browser.
 *
 * DEMO MODE: When env vars are missing (e.g. deployed without Supabase),
 * exports a null client. Components must check `supabase` before using it.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when Supabase credentials are not configured */
export const IS_DEMO = !supabaseUrl || !supabaseAnonKey
  || supabaseUrl === 'https://your-project.supabase.co'
  || supabaseAnonKey === 'your_supabase_anon_key';

let supabase = null;

if (!IS_DEMO) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Uses localStorage by default in the browser
    },
  });
} else {
  console.info('[MindForge] Running in DEMO mode — no Supabase configured.');
}

export default supabase;
