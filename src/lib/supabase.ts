import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[MicroBuild] Supabase env vars are not set.\n' +
      'Copy .env.example → .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
      'The app will run with mock data until a real Supabase project is connected.'
  );
}

/**
 * Supabase client — typed against the MicroBuild Database schema.
 *
 * Usage:
 *   import { supabase } from '../lib/supabase'
 *   const { data, error } = await supabase.from('buyer_requests').select('*')
 *
 * Not connected to any data source yet — env vars must be set first.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
