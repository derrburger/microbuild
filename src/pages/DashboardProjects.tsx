import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { CreatorProfileRow, UserProfileRow } from '../types/database';
import AppPageHeader from '../components/AppPageHeader';
import CreatorProjectsPanel from '../components/creator/CreatorProjectsPanel';
import './Dashboard.css';

export default function DashboardProjects() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const uid = user!.id;
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', uid)
        .maybeSingle();

      if (cancelled) return;
      const prof = up as UserProfileRow | null;
      if (!prof) {
        navigate('/onboarding', { replace: true });
        return;
      }
      if (prof.account_type?.toLowerCase() !== 'creator') {
        navigate('/dashboard', { replace: true });
        return;
      }

      const cpId = prof.creator_profile_id;
      if (cpId) {
        const { data: cp } = await supabase.from('creator_profiles').select('id').eq('id', cpId).maybeSingle();
        if (!cancelled && cp) setCreatorProfile(cp as CreatorProfileRow);
      } else {
        const { data: cp } = await supabase
          .from('creator_profiles')
          .select('id')
          .eq('auth_user_id', uid)
          .maybeSingle();
        if (!cancelled && cp) setCreatorProfile(cp as CreatorProfileRow);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  if (authLoading || loading) {
    return (
      <div className="dashboard-page app-workspace">
        <div className="dashboard-loading">Loading projects…</div>
      </div>
    );
  }

  if (!creatorProfile?.id) {
    return (
      <div className="dashboard-page app-workspace">
        <AppPageHeader title="My Projects" subtitle="Complete your creator profile to see assigned projects." />
        <div className="container dashboard-body">
          <p className="subtle">No creator profile linked yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page app-workspace">
      <AppPageHeader
        eyebrow="Creator workspace"
        title="My Projects"
        subtitle="Assigned and in-progress MicroBuilds — open a workspace to deliver or message the buyer."
      />
      <div className="container dashboard-body">
        <CreatorProjectsPanel creatorProfileId={creatorProfile.id} />
      </div>
    </div>
  );
}
