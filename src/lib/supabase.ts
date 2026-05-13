import { createClient } from '@supabase/supabase-js';
import type { BuyerRequestInsert, CreatorApplicationInsert } from '../types/database';

// Strip any accidental path suffix (e.g. /rest/v1/) — createClient expects the
// bare project URL: https://<ref>.supabase.co
const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[MicroBuild] Supabase env vars are not set.\n' +
      'Copy .env.example → .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
      'The app will render with mock data until a Supabase project is connected.'
  );
}

/**
 * Supabase client — not typed with the Database generic because the
 * hand-authored Database type does not satisfy Supabase's GenericSchema
 * constraint with all table variants.  Typed insert helpers below provide
 * compile-time safety for write operations.
 *
 * Requires supabase/rls-policies.sql to be run in the Supabase SQL editor
 * before guest inserts will succeed (RLS is enabled on all tables).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey);

/**
 * Full error shape returned by Supabase / PostgREST.
 *
 * Common codes:
 *   42501  — RLS policy violation ("new row violates row-level security policy")
 *            → run supabase/rls-policies.sql in the Supabase SQL editor
 *   23502  — NOT NULL violation (a required column was sent as null)
 *   23503  — FK violation (referenced row does not exist)
 *   23505  — Unique violation (duplicate email, slug, etc.)
 *   PGRST* — PostgREST-level errors (auth, schema cache, etc.)
 */
export interface SupabaseInsertError {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
}

/** Insert a buyer request row.  Logs full error details to console on failure. */
export async function insertBuyerRequest(
  data: BuyerRequestInsert
): Promise<{ error: SupabaseInsertError | null }> {
  const { error } = await supabase.from('buyer_requests').insert([data]);

  if (error) {
    console.error('[MicroBuild] buyer_requests INSERT failed', {
      code:    error.code    ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint:    error.hint    ?? null,
      payload: data,
    });
    // 42501 = RLS violation — give a specific hint
    if ((error.code ?? '') === '42501') {
      console.error(
        '[MicroBuild] Fix: run supabase/rls-policies.sql in the Supabase SQL editor.\n' +
        'The buyer_requests table has RLS enabled but no INSERT policy for the anon role.'
      );
    }
  }

  return {
    error: error
      ? { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null }
      : null,
  };
}

/** Insert a creator application row.  Logs full error details to console on failure. */
export async function insertCreatorApplication(
  data: CreatorApplicationInsert
): Promise<{ error: SupabaseInsertError | null }> {
  const { error } = await supabase.from('creator_applications').insert([data]);

  if (error) {
    console.error('[MicroBuild] creator_applications INSERT failed', {
      code:    error.code    ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint:    error.hint    ?? null,
      payload: data,
    });
    if ((error.code ?? '') === '42501') {
      console.error(
        '[MicroBuild] Fix: run supabase/rls-policies.sql in the Supabase SQL editor.\n' +
        'The creator_applications table has RLS enabled but no INSERT policy for the anon role.'
      );
    }
  }

  return {
    error: error
      ? { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null }
      : null,
  };
}
