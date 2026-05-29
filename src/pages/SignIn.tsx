import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SignIn.css';

type Mode = 'signin' | 'signup';
type UIState = 'idle' | 'loading' | 'check-email';

const PASSWORD_MIN = 8;

export default function SignIn() {
  const [searchParams] = useSearchParams();
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';

  const [mode, setMode]               = useState<Mode>(initialMode);
  const [uiState, setUiState]         = useState<UIState>('idle');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [showPwd, setShowPwd]         = useState(false);

  const { user, loading, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  const redirectTo = searchParams.get('redirect');
  const redirectReason = searchParams.get('reason');

  const postAuthPath = (() => {
    if (!redirectTo || !redirectTo.startsWith('/')) return '/dashboard';
    return redirectTo;
  })();

  // Already signed in → go to redirect or dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate(postAuthPath, { replace: true });
    }
  }, [user, loading, navigate, postAuthPath]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirm('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setUiState('loading');

    if (mode === 'signup') {
      const { error: err, needsConfirmation } = await signUpWithEmail(email.trim(), password);
      if (err) {
        setError(err);
        setUiState('idle');
        return;
      }
      if (needsConfirmation) {
        // Supabase email confirmation is enabled — user must click the link
        setUiState('check-email');
      } else {
        // Email confirmation disabled (local dev) — immediately signed in
        // Dashboard will redirect to /onboarding if no profile exists yet
        navigate(postAuthPath, { replace: true });
      }
    } else {
      const { error: err } = await signInWithEmail(email.trim(), password);
      if (err) {
        setError(err.includes('Invalid login credentials')
          ? 'Incorrect email or password. Please try again.'
          : err
        );
        setUiState('idle');
        return;
      }
      navigate(postAuthPath, { replace: true });
    }
  }

  // ── "Check your email" confirmation state ────────────────────────────────
  if (uiState === 'check-email') {
    return (
      <div className="signin-page">
        <div className="signin-card">
          <Link to="/" className="signin-logo">Micro<span>Build</span></Link>
          <div className="signin-confirm-icon">✉️</div>
          <h1 className="signin-title">Check your email</h1>
          <p className="signin-sub">
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then sign in here.
          </p>
          <div className="signin-confirm-note">
            <strong>Local dev?</strong> Disable email confirmation in Supabase:
            Dashboard → Authentication → Settings → Email → turn off
            "Enable email confirmations".
          </div>
          <button className="signin-back-btn" onClick={() => { setUiState('idle'); setMode('signin'); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="signin-page">
        <div className="signin-checking"><div className="signin-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        <Link to="/" className="signin-logo">Micro<span>Build</span></Link>

        {/* ── Mode tabs ─────────────────────────────────────────────── */}
        <div className="signin-tabs">
          <button
            className={`signin-tab${mode === 'signin' ? ' active' : ''}`}
            onClick={() => switchMode('signin')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`signin-tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => switchMode('signup')}
            type="button"
          >
            Create Account
          </button>
        </div>

        <p className="signin-sub">
          {redirectReason === 'workflow' ?
            'Create an account or sign in to request and customize this workflow.'
          : mode === 'signin' ?
            'Sign in to access your dashboard, profile, and requests.'
          : 'Create a free account to get started as a buyer or creator.'}
        </p>

        {/* ── Form ──────────────────────────────────────────────────── */}
        <form className="signin-form" onSubmit={handleSubmit} noValidate>
          <div className="signin-field">
            <label className="signin-label" htmlFor="si-email">Email address</label>
            <input
              id="si-email"
              className="signin-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              disabled={uiState === 'loading'}
            />
          </div>

          <div className="signin-field">
            <div className="signin-label-row">
              <label className="signin-label" htmlFor="si-password">Password</label>
              {mode === 'signin' && (
                <span className="signin-forgot">Forgot password? Coming soon.</span>
              )}
            </div>
            <div className="signin-pwd-wrap">
              <input
                id="si-password"
                className="signin-input"
                type={showPwd ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={mode === 'signup' ? `Min ${PASSWORD_MIN} characters` : ''}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                disabled={uiState === 'loading'}
              />
              <button
                type="button"
                className="signin-show-pwd"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="signin-field">
              <label className="signin-label" htmlFor="si-confirm">Confirm password</label>
              <input
                id="si-confirm"
                className="signin-input"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={e => { setConfirm(e.target.value); setError(null); }}
                disabled={uiState === 'loading'}
              />
            </div>
          )}

          {error && <div className="signin-error" role="alert">{error}</div>}

          <button
            type="submit"
            className="signin-submit-btn"
            disabled={uiState === 'loading'}
          >
            {uiState === 'loading'
              ? <span className="signin-btn-spinner" />
              : mode === 'signin' ? 'Sign In' : 'Create Account'
            }
          </button>
        </form>

        {/* ── Switch mode ───────────────────────────────────────────── */}
        <p className="signin-switch">
          {mode === 'signin' ? (
            <>No account? <button className="signin-switch-btn" onClick={() => switchMode('signup')}>Create one free</button></>
          ) : (
            <>Already have an account? <button className="signin-switch-btn" onClick={() => switchMode('signin')}>Sign in</button></>
          )}
        </p>

        {/* ── GitHub coming soon ────────────────────────────────────── */}
        <div className="signin-github-deferred">
          <span className="signin-github-icon-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </span>
          GitHub sign-in coming after domain setup — add your GitHub URL in your profile for now.
        </div>

        <div className="signin-footer-links">
          <Link to="/browse" className="signin-link">Browse Builds</Link>
          <span>·</span>
          <Link to="/creators/apply" className="signin-link">Apply as Creator</Link>
          <span>·</span>
          <Link to="/request" className="signin-link">Request a Build</Link>
        </div>
      </div>
    </div>
  );
}
