import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserProfileRow } from '../types/database';
import './Dashboard.css';

/** Legacy `/dashboard/browse` — redirects creators to Applications, buyers/admin to workflows Browse. */
export default function DashboardBrowse() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/signin', { replace: true });
      return;
    }

    let cancelled = false;

    const uid = user.id;

    async function redirect() {
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', uid)
        .maybeSingle();

      if (cancelled) return;
      const prof = (up ?? null) as UserProfileRow | null;

      if (!prof) {
        navigate('/onboarding', { replace: true });
        return;
      }

      const t = prof.account_type?.toLowerCase();
      if (t === 'creator') navigate('/dashboard/applications', { replace: true });
      else navigate('/browse', { replace: true });
    }

    void redirect();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  return (
    <div className="dashboard-page">
      <div className="container dashboard-body">
        <div className="dash-loading">Redirecting…</div>
      </div>
    </div>
  );
}
