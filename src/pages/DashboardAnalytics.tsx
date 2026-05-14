import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './DashboardAnalytics.css';

interface BarProps { label: string; value: number; max?: number; color?: string; }

function Bar({ label, value, max = 100, color = '#00d478' }: BarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="da-bar-row">
      <span className="da-bar-label">{label}</span>
      <div className="da-bar-track">
        <div className="da-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="da-bar-val">{value}</span>
    </div>
  );
}

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="da-placeholder-card">
      <div className="da-placeholder-title">{title}</div>
      <div className="da-placeholder-val">—</div>
      <div className="da-placeholder-note">{note}</div>
    </div>
  );
}

export default function DashboardAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [requestCount, setRequestCount] = useState(0);
  const [profileScore, setProfileScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from('buyer_requests')
        .select('id', { count: 'exact', head: true })
        .eq('email', user.email ?? ''),
      supabase
        .from('creator_profiles')
        .select('ai_profile_score')
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle(),
    ]).then(([reqRes, cpRes]) => {
      setRequestCount(reqRes.count ?? 0);
      const score = (cpRes.data as { ai_profile_score: number | null } | null)?.ai_profile_score;
      setProfileScore(score ?? null);
      setLoading(false);
    });
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="da-page">
        <div className="da-loading"><div className="da-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="da-page">
      <div className="da-header">
        <div className="container">
          <Link to="/dashboard" className="da-back">← Dashboard</Link>
          <h1 className="da-title">Analytics</h1>
          <p className="da-sub">
            Platform analytics are in early access. Most metrics are placeholders
            until real tracking is connected.
          </p>
          <div className="da-placeholder-badge">⚠️ Placeholder data — live tracking coming soon</div>
        </div>
      </div>

      <div className="container da-body">
        {/* Live data */}
        <div className="da-section">
          <h2 className="da-section-title">Activity (Live)</h2>
          <div className="da-live-grid">
            <div className="da-live-card">
              <div className="da-live-val">{requestCount}</div>
              <div className="da-live-label">Requests Submitted</div>
            </div>
            {profileScore !== null && (
              <div className="da-live-card">
                <div className="da-live-val">{profileScore}</div>
                <div className="da-live-label">Admin AI Score</div>
              </div>
            )}
          </div>
        </div>

        {/* Profile completion */}
        <div className="da-section">
          <h2 className="da-section-title">Profile Completion</h2>
          <div className="da-bars">
            <Bar label="Bio" value={50} max={100} color="#63b3ed" />
            <Bar label="Portfolio" value={30} max={100} color="#f9b032" />
            <Bar label="Tools" value={70} max={100} color="#00d478" />
            <Bar label="Credentials" value={20} max={100} color="#8a94a6" />
          </div>
          <p className="da-note">Completion bars reflect placeholder estimates. Edit your <Link to="/dashboard/profile" className="da-link">profile</Link> to improve your score.</p>
        </div>

        {/* Placeholder metrics */}
        <div className="da-section">
          <h2 className="da-section-title">Performance (Placeholder)</h2>
          <div className="da-placeholder-grid">
            <PlaceholderCard title="Profile Views" note="Requires tracking integration" />
            <PlaceholderCard title="Monthly Earnings" note="Requires Stripe integration" />
            <PlaceholderCard title="Project Pipeline" note="Requires build matching system" />
            <PlaceholderCard title="Conversion Rate" note="Requires event tracking" />
            <PlaceholderCard title="Avg Response Time" note="Requires messaging system" />
            <PlaceholderCard title="Client Satisfaction" note="Requires review system" />
          </div>
        </div>

        {/* Earnings graph placeholder */}
        <div className="da-section">
          <h2 className="da-section-title">Earnings Over Time (Placeholder)</h2>
          <div className="da-graph-placeholder">
            <div className="da-graph-bars">
              {['Jan','Feb','Mar','Apr','May','Jun'].map((m, i) => (
                <div key={m} className="da-graph-bar-col">
                  <div className="da-graph-bar" style={{ height: `${20 + i * 8}%`, opacity: 0.35 }} />
                  <span className="da-graph-month">{m}</span>
                </div>
              ))}
            </div>
            <p className="da-graph-note">Earnings data requires Stripe integration</p>
          </div>
        </div>
      </div>
    </div>
  );
}
