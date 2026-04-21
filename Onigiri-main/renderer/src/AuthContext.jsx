import { createContext, useContext, useState, useEffect } from 'react';
import supabase from './supabaseClient';

const AuthContext = createContext(null);

// Sync auth session to the Express backend so it can use the user's JWT for RLS
async function syncSessionToBackend(session) {
  if (!session) return;
  try {
    await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });
  } catch (err) {
    console.warn('[Auth] Could not sync session to backend:', err.message);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ? { id: data.user.id, email: data.user.email } : null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Also sync existing session to backend on load
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        syncSessionToBackend(data.session);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
      if (session) {
        syncSessionToBackend(session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { user: null, error: { message: error.message } };
    const u = data.user;
    if (u) setUser({ id: u.id, email: u.email });
    if (data.session) syncSessionToBackend(data.session);
    return { user: u ? { id: u.id, email: u.email } : null, error: null };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: { message: error.message } };
    const u = data.user;
    if (u) setUser({ id: u.id, email: u.email });
    if (data.session) syncSessionToBackend(data.session);
    return { user: u ? { id: u.id, email: u.email } : null, error: null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) setUser(null);
    return { error: error ? { message: error.message } : null };
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

