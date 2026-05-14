/**
 * MicroBuild — Admin Auth Helpers
 *
 * Provides:
 *   - Email allowlist (VITE_ADMIN_EMAILS env var, comma-separated)
 *   - Thin wrappers over supabase.auth for sign-in / sign-out / session read
 *
 * Security notes:
 *   - VITE_ADMIN_EMAILS is a client-side check only. The anon key is still
 *     publicly visible. Replace dev RLS policies with auth.uid()-based or
 *     service-role policies before public launch.
 *   - Never put secret keys in VITE_* env vars.
 */

import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

// ─── Admin email allowlist ────────────────────────────────────────────────────
// Set VITE_ADMIN_EMAILS=you@example.com,other@example.com in your .env file.
// Emails are compared case-insensitively.

const rawAdminEmails = (import.meta.env.VITE_ADMIN_EMAILS ?? '') as string;

export const ADMIN_EMAILS: string[] = rawAdminEmails
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Returns true if the given email is in the VITE_ADMIN_EMAILS allowlist.
 * Always returns false (and warns) if the env var is not set.
 */
export function isAdminEmail(email: string): boolean {
  if (ADMIN_EMAILS.length === 0) {
    console.warn(
      '[MicroBuild] VITE_ADMIN_EMAILS is not set. ' +
      'Add it to your .env file to grant admin access.\n' +
      'Example: VITE_ADMIN_EMAILS=you@example.com',
    );
    return false;
  }
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// ─── Auth wrappers ────────────────────────────────────────────────────────────

/** Returns the current Supabase session, or null if not signed in. */
export async function getAdminSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Signs in with email + password using Supabase Auth.
 * Returns { error: null } on success, or { error: string } on failure.
 */
export async function signInAdmin(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { error: null };
}

/** Signs out the current Supabase session. */
export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
}
