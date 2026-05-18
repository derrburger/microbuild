import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserProfileRow } from '../types/database';

/**
 * Lightweight user_profiles row loader for Navbar / dashboard nav branching.
 */
export function useUserProfileRow(): { profile: UserProfileRow | null; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  /** `undefined` means “still fetching for signed-in session” */
  const [profile, setProfile] = useState<UserProfileRow | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      return;
    }

    setProfile(undefined);
    let cancelled = false;

    const sessionUser = user;

    async function fetchProfile() {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', sessionUser.id)
        .maybeSingle();

      if (!cancelled) setProfile(error ? null : ((data ?? null) as UserProfileRow | null));
    }

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const loading = authLoading || (user != null && profile === undefined);

  return { profile: profile ?? null, loading };
}
