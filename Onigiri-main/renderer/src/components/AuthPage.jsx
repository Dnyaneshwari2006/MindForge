import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function AuthPage() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let result;
      if (mode === 'signup') {
        result = await signUp(email, password);
        if (result.error) {
          setError(result.error.message);
        } else {
          setSuccess('Account created! You are now signed in.');
        }
      } else {
        result = await signIn(email, password);
        if (result.error) {
          setError(result.error.message);
        }
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Background decoration */}
      <div className="auth-bg-glow" />

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="auth-title">MindForge</h1>
          <p className="auth-subtitle">Focus Engine</p>
        </div>

        {/* Card */}
        <div className="auth-card">
          {/* Tab switcher */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => { setMode('signin'); setError(''); setSuccess(''); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label htmlFor="auth-email" className="auth-label">Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="auth-input"
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password" className="auth-label">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-input"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="auth-message auth-error animate-slide-up">
                <span>⚠</span> {error}
              </div>
            )}

            {success && (
              <div className="auth-message auth-success animate-slide-up">
                <span>✓</span> {success}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : (
                mode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p className="auth-footer">
            {mode === 'signin' ? (
              <>Don&apos;t have an account?{' '}
                <button className="auth-link" onClick={() => { setMode('signup'); setError(''); }}>
                  Sign up
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button className="auth-link" onClick={() => { setMode('signin'); setError(''); }}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        <p className="auth-version">v1.0.0</p>
      </div>
    </div>
  );
}
