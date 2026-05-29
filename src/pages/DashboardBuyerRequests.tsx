import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserProfileRow } from '../types/database';
import AppPageHeader from '../components/AppPageHeader';
import { BuyerDashboard } from './Dashboard';
import './Dashboard.css';

export default function DashboardBuyerRequests() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const prof = data as UserProfileRow | null;
        if (!prof) {
          navigate('/onboarding', { replace: true });
          return;
        }
        if (prof.account_type?.toLowerCase() !== 'buyer') {
          navigate('/dashboard', { replace: true });
          return;
        }
        setUserProfile(prof);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  if (authLoading || loading || !userProfile) {
    return (
      <div className="dashboard-page app-workspace">
        <div className="dashboard-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page app-workspace">
      <AppPageHeader
        eyebrow="Buyer workspace"
        title="My Requests"
        subtitle="Track your MicroBuild requests, review creators, and manage project progress."
        actions={
          <>
            <Link to="/request" className="btn btn-primary btn-sm">
              New Request
            </Link>
            <Link to="/browse" className="btn btn-ghost btn-sm">
              Browse Workflows
            </Link>
          </>
        }
      />
      <div className="container dashboard-body">
        <BuyerDashboard userProfile={userProfile} mode="requests" />
      </div>
    </div>
  );
}
