/**
 * MicroBuild — Auth Utilities
 *
 * Primary auth method: email/password via Supabase Auth.
 *
 * GitHub OAuth is intentionally deferred until MicroBuild has an established
 * production domain. GitHub profile URL is stored as a plain text field on
 * user_profiles/creator_profiles — not used for authentication.
 *
 * No secrets are stored in the frontend.
 */

import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

export type { User, Session };

// ─── Email / Password ─────────────────────────────────────────────────────────

/**
 * Create a new account with email + password.
 *
 * Returns `{ error: null }` on success.
 * If Supabase email confirmation is enabled, the user receives an email but is
 * NOT immediately signed in — the caller should show a "check your email" message.
 * Detect this case by checking whether the session is null after sign-up.
 *
 * To disable email confirmation for local dev:
 *   Supabase Dashboard → Authentication → Settings → Email
 *   → toggle off "Enable email confirmations"
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message, needsConfirmation: false };
  // If session is null after sign-up, email confirmation is required
  return { error: null, needsConfirmation: data.session === null };
}

/**
 * Sign in with email + password.
 * Returns `{ error: null }` on success; the AuthContext picks up the new session
 * automatically via `onAuthStateChange`.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

/** Sign out the current session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Returns the current session from local cache (fast, no network). */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Returns the current auth user, verified from the server. */
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// ─── GitHub OAuth — DEFERRED ──────────────────────────────────────────────────
// GitHub OAuth will be added after MicroBuild has a stable production domain
// configured in GitHub's OAuth app settings.
// See docs/profile-account-system-audit.md — "Next Build Phase Recommendation"
//
// export async function signInWithGitHub(): Promise<void> {
//   await supabase.auth.signInWithOAuth({
//     provider: 'github',
//     options: { redirectTo: `${window.location.origin}/dashboard` },
//   });
// }
