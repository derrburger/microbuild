import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isAdminEmail, signOutAdmin } from '../lib/admin';
import '../pages/AdminLogin.css';

type AuthState = 'checking' | 'no_session' | 'not_allowed' | 'authorized';

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps any route that requires admin access.
 *
 * Behavior:
 *   - 'checking'    → shows a spinner while verifying the Supabase session
 *   - 'no_session'  → redirects to /admin/login
 *   - 'not_allowed' → signed in, but email is not in VITE_ADMIN_EMAILS allowlist
 *   - 'authorized'  → renders children
 *
 * Also subscribes to onAuthStateChange so that an expired session or
 * a sign-out in another tab immediately kicks the user back to /admin/login.
 */
export default function AdminRouteGuard({ children }: Props) {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // 1. Immediate synchronous check from the local session cache
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        setAuthState('no_session');
        return;
      }
      const email = session.user?.email ?? '';
      setUserEmail(email);
      setAuthState(isAdminEmail(email) ? 'authorized' : 'not_allowed');
    });

    // 2. Keep auth state in sync with any future changes
    //    (session expiry, sign-out from another tab, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setAuthState('no_session');
          setUserEmail(null);
          return;
        }
        const email = session.user?.email ?? '';
        setUserEmail(email);
        setAuthState(isAdminEmail(email) ? 'authorized' : 'not_allowed');
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  if (authState === 'checking') {
    return (
      <div className="admin-guard-checking">
        <div className="admin-guard-spinner" />
        <p>Verifying access…</p>
      </div>
    );
  }

  if (authState === 'no_session') {
    return <Navigate to="/admin/login" replace />;
  }

  if (authState === 'not_allowed') {
    return (
      <div className="admin-guard-denied">
        <div className="admin-guard-denied-icon">🔒</div>
        <h2>Not Authorized</h2>
        <p>
          <strong>{userEmail}</strong> is not in the admin allowlist.
          Add it to <code>VITE_ADMIN_EMAILS</code> in your <code>.env</code> file,
          or sign in with a different account.
        </p>
        <button
          className="admin-guard-signout-btn"
          onClick={() => signOutAdmin()}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
