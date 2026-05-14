/**
 * MicroBuild — Auth Context
 *
 * Provides the current Supabase auth user and email/password actions to the
 * whole app. Wrap <App /> with <AuthProvider>.
 *
 * Usage:
 *   const { user, loading, signInWithEmail, signUpWithEmail, signOut } = useAuth();
 *
 * GitHub OAuth is deferred — not exposed here yet.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  signUpWithEmail as _signUpWithEmail,
  signInWithEmail as _signInWithEmail,
  signOut as _signOut,
} from '../lib/auth';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current Supabase auth user, or null if not signed in. */
  user: User | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  /** Create a new account. */
  signUpWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /** Sign in to an existing account. */
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  /** Sign out the current session. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signUpWithEmail: async () => ({ error: null, needsConfirmation: false }),
  signInWithEmail: async () => ({ error: null }),
  signOut: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve current session immediately from local cache
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Keep state in sync with auth events (sign-in, sign-out, token refresh,
    // email confirmation callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUpWithEmail: _signUpWithEmail,
        signInWithEmail: _signInWithEmail,
        signOut: _signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
