import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analyzeProfileStrength, getStrengthColor } from '../lib/profileAI';
import type { CreatorProfileRow } from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './DashboardAnalytics.css';

// ─── Bar component ─────────────────────────────────────────────────────────────

interface BarProps { label: string; value: number; max?: number; color?: string; }

function Bar({ label, value, max = 100, color = '#00d478' }: BarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="da-bar-row">
      <span className="da-bar-label">{label}</span>
      <div className="da-bar-track">
        <div className="da-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="da-bar-val">{value}%</span>
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

  const [requestCount,    setRequestCount]    = useState(0);
  const [creatorProfile,  setCreatorProfile]  = useState<CreatorProfileRow | null>(null);
  const [accountType,     setAccountType]     = useState<string>('');
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      // Get user profile first to know account type
      const { data: up } = await supabase
        .from('user_profiles')
        .select('account_type, email')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      const acctType = (up as { account_type: string } | null)?.account_type ?? '';
      setAccountType(acctType);

      // Parallel: request count + creator profile (if creator)
      const [reqRes, cpRes] = await Promise.all([
        supabase
          .from('buyer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('email', user!.email ?? ''),
        acctType === 'creator'
          ? supabase
              .from('creator_profiles')
              .select('id, display_name, full_name, tier, approval_status, public_profile_status, verification_status, bio, tools, niches, portfolio_links, github_url, linkedin_url, available_hours, certifications, credential_links, proof_links, case_studies, education_or_coursework, skills, badges, completed_builds_count, average_rating, is_active')
              .or(`user_id.eq.${user!.id},auth_user_id.eq.${user!.id}`)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setRequestCount(reqRes.count ?? 0);

      if (cpRes.data) {
        const raw = { ...(cpRes.data as Record<string, unknown>) };
        ['tools','niches','badges','portfolio_links','credential_links','certifications','proof_links','skills']
          .forEach((k) => { if (!Array.isArray(raw[k])) raw[k] = []; });
        if (!raw.tier)                  raw.tier                  = 'free';
        if (!raw.approval_status)       raw.approval_status       = 'draft';
        if (!raw.public_profile_status) raw.public_profile_status = 'hidden';
        if (!raw.verification_status)   raw.verification_status   = 'unverified';
        setCreatorProfile(raw as unknown as CreatorProfileRow);
      }

      setLoading(false);
    }

    load();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="da-page">
        <div className="da-loading"><div className="da-spinner" /></div>
      </div>
    );
  }

  // Compute live profile strength if creator profile exists
  const strength    = creatorProfile ? analyzeProfileStrength(creatorProfile) : null;
  const isCreator   = accountType === 'creator';

  return (
    <div className="da-page">
      <div className="da-header">
        <div className="container">
          <Link to="/dashboard" className="da-back">← Dashboard</Link>
          <h1 className="da-title">Analytics</h1>
          <p className="da-sub">
            Live metrics where available. Placeholder data is clearly labeled.
          </p>
          <div className="da-placeholder-badge">⚠️ Some metrics are placeholders — live tracking coming in Phase 2</div>
        </div>
      </div>

      <div className="container da-body">
        <DashboardNav />

        {/* ── Live activity ──────────────────────────────────────── */}
        <div className="da-section">
          <h2 className="da-section-title">Activity (Live)</h2>
          <div className="da-live-grid">
            {!isCreator && (
              <div className="da-live-card">
                <div className="da-live-val">{requestCount}</div>
                <div className="da-live-label">Requests Submitted</div>
              </div>
            )}
            {isCreator && strength && (
              <>
                <div className="da-live-card">
                  <div className="da-live-val" style={{ color: getStrengthColor(strength.score) }}>
                    {strength.score}/100
                  </div>
                  <div className="da-live-label">Profile Strength — {strength.label}</div>
                </div>
                <div className="da-live-card">
                  <div className="da-live-val">
                    {(creatorProfile?.completed_builds_count as number | null) ?? 0}
                  </div>
                  <div className="da-live-label">Builds Completed</div>
                </div>
                <div className="da-live-card">
                  <div className="da-live-val">
                    {creatorProfile?.average_rating
                      ? (creatorProfile.average_rating as number).toFixed(1) + ' ★'
                      : '—'}
                  </div>
                  <div className="da-live-label">Average Rating</div>
                </div>
                <div className="da-live-card">
                  <div
                    className="da-live-val"
                    style={{
                      color: creatorProfile?.public_profile_status === 'public' ? '#00d478' : '#8a94a6',
                      fontSize: '1rem',
                    }}
                  >
                    {creatorProfile?.public_profile_status === 'public' ? '🟢 Public' : '🔴 Hidden'}
                  </div>
                  <div className="da-live-label">Profile Visibility</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Profile completion (live for creators, static for buyers) */}
        {isCreator && strength && (
          <div className="da-section">
            <h2 className="da-section-title">Profile Completion (Live)</h2>
            <div className="da-bars">
              <Bar label="Identity"     value={strength.sections.identity}     max={100} color={getStrengthColor(strength.sections.identity)} />
              <Bar label="Expertise"    value={strength.sections.expertise}    max={100} color={getStrengthColor(strength.sections.expertise)} />
              <Bar label="Portfolio"    value={strength.sections.portfolio}    max={100} color={getStrengthColor(strength.sections.portfolio)} />
              <Bar label="Credentials" value={strength.sections.credentials}  max={100} color={getStrengthColor(strength.sections.credentials)} />
              <Bar label="Availability" value={strength.sections.availability} max={100} color={getStrengthColor(strength.sections.availability)} />
            </div>
            {strength.missingItems.length > 0 && (
              <div className="da-missing-list">
                <p className="da-section-note">Top improvements:</p>
                <ul>
                  {strength.missingItems.slice(0, 3).map((m) => (
                    <li key={m} className="da-missing-item">○ {m}</li>
                  ))}
                </ul>
                <Link to="/dashboard/profile" className="da-link">Edit profile →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Placeholder metrics ─────────────────────────────────── */}
        <div className="da-section">
          <h2 className="da-section-title">Performance (Preview Metrics)</h2>
          <div className="da-placeholder-grid">
            <PlaceholderCard title="Profile Views"        note="Requires analytics integration" />
            <PlaceholderCard title="Monthly Earnings"     note="Requires Stripe integration" />
            <PlaceholderCard title="Project Pipeline"     note="Requires build matching system" />
            <PlaceholderCard title="Conversion Rate"      note="Requires event tracking" />
            <PlaceholderCard title="Avg Response Time"    note="Requires messaging system" />
            <PlaceholderCard title="Client Satisfaction"  note="Requires review system" />
          </div>
        </div>

        {/* ── Earnings graph placeholder ──────────────────────────── */}
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
            <p className="da-graph-note">Earnings data requires Stripe integration (Phase 4)</p>
          </div>
        </div>

      </div>
    </div>
  );
}
