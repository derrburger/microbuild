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

        {/* ── Analytics header notice ─────────────────────────────── */}
        <div className="da-header-notice">
          <span className="da-notice-icon">ℹ</span>
          <span>
            <strong>These are preview metrics.</strong> Real analytics will activate when project matching,
            profile tracking, and payments are connected.
          </span>
        </div>

        {/* ── Metric cards row ────────────────────────────────────── */}
        <div className="da-metrics-grid">
          <div className="da-metric-card">
            <div className="da-metric-val da-metric-val--preview">Preview</div>
            <div className="da-metric-label">Profile Views</div>
            <div className="da-metric-note">Tracking not connected</div>
          </div>
          <div className="da-metric-card">
            <div className="da-metric-val da-metric-val--preview">Preview</div>
            <div className="da-metric-label">Buyer Interest</div>
            <div className="da-metric-note">Requires profile discovery</div>
          </div>
          <div className="da-metric-card">
            <div className="da-metric-val" style={{ color: '#00d478' }}>
              {isCreator
                ? (creatorProfile?.completed_builds_count as number | null) ?? 0
                : requestCount}
            </div>
            <div className="da-metric-label">{isCreator ? 'Completed Builds' : 'Requests Submitted'}</div>
            <div className="da-metric-note">Live data</div>
          </div>
          <div className="da-metric-card">
            <div className="da-metric-val">$0</div>
            <div className="da-metric-label">Est. Earnings</div>
            <div className="da-metric-note">Preview only</div>
          </div>
          <div className="da-metric-card da-metric-card--soon">
            <div className="da-metric-val da-metric-val--soon">—</div>
            <div className="da-metric-label">Response Rate</div>
            <div className="da-metric-note">Coming soon</div>
          </div>
          <div className="da-metric-card da-metric-card--soon">
            <div className="da-metric-val da-metric-val--soon">—</div>
            <div className="da-metric-label">Client Satisfaction</div>
            <div className="da-metric-note">Coming soon</div>
          </div>
        </div>

        {/* ── Profile completion (live for creators) ──────────────── */}
        {isCreator && strength && (
          <div className="da-section">
            <h2 className="da-section-title">Profile Completion</h2>
            <div className="da-bars">
              <Bar label="Identity"     value={strength.sections.identity}     max={100} color={getStrengthColor(strength.sections.identity)} />
              <Bar label="Expertise"    value={strength.sections.expertise}    max={100} color={getStrengthColor(strength.sections.expertise)} />
              <Bar label="Portfolio"    value={strength.sections.portfolio}    max={100} color={getStrengthColor(strength.sections.portfolio)} />
              <Bar label="Credentials" value={strength.sections.credentials}  max={100} color={getStrengthColor(strength.sections.credentials)} />
              <Bar label="Availability" value={strength.sections.availability} max={100} color={getStrengthColor(strength.sections.availability)} />
            </div>
          </div>
        )}

        {/* ── Earnings over time placeholder ──────────────────────── */}
        <div className="da-section">
          <h2 className="da-section-title">Earnings Over Time</h2>
          <div className="da-graph-placeholder">
            <div className="da-graph-bars">
              {['Jan','Feb','Mar','Apr','May','Jun'].map((m, i) => (
                <div key={m} className="da-graph-bar-col">
                  <div className="da-graph-bar" style={{ height: `${14 + i * 5}%`, opacity: 0.3 }} />
                  <span className="da-graph-month">{m}</span>
                </div>
              ))}
            </div>
            <p className="da-graph-note">
              Earnings data will populate when Stripe and project matching are live.
              No money has been transacted through these projections.
            </p>
          </div>
        </div>

        {/* ── Project Pipeline breakdown ───────────────────────────── */}
        <div className="da-section">
          <h2 className="da-section-title">Project Pipeline Breakdown <span className="da-phase-badge">Phase 2</span></h2>
          <div className="da-pipeline-grid">
            {[
              { label: 'Available',   count: 0, note: 'Open opportunities' },
              { label: 'Assigned',    count: 0, note: 'Matched to you' },
              { label: 'In Progress', count: 0, note: 'Active builds' },
              { label: 'In Review',   count: 0, note: 'Buyer review' },
              { label: 'Delivered',   count: 0, note: 'Awaiting sign-off' },
              { label: 'Completed',   count: isCreator ? ((creatorProfile?.completed_builds_count as number | null) ?? 0) : 0, note: 'Finished' },
            ].map((s) => (
              <div key={s.label} className={`da-pipeline-stage${s.count > 0 ? ' da-pipeline-stage--active' : ''}`}>
                <div className="da-pipeline-count" style={{ color: s.count > 0 ? '#00d478' : undefined }}>
                  {s.count > 0 ? s.count : '—'}
                </div>
                <div className="da-pipeline-label">{s.label}</div>
                <div className="da-pipeline-note">{s.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Improvement insights ────────────────────────────────── */}
        {isCreator && (
          <div className="da-section">
            <h2 className="da-section-title">Improvement Insights</h2>
            <div className="da-insights">
              {[
                strength && strength.sections.portfolio < 60 && 'Add portfolio links to improve profile trust and buyer confidence.',
                strength && strength.sections.identity  < 60 && 'Complete your bio to increase profile strength and search visibility.',
                creatorProfile?.public_profile_status !== 'public' && 'Public visibility is required before buyers can discover your profile.',
                strength && strength.sections.expertise < 60 && 'Add tools and industry niches to appear in relevant buyer searches.',
                strength && strength.sections.credentials < 40 && 'Add certifications or proof links to qualify for Verified tier.',
              ].filter(Boolean).map((insight) => (
                <div key={insight as string} className="da-insight-item">
                  <span className="da-insight-bullet">→</span>
                  <span>{insight}</span>
                </div>
              ))}
              {(!strength || (strength.score >= 75 && creatorProfile?.public_profile_status === 'public')) && (
                <div className="da-insight-item da-insight-item--positive">
                  <span className="da-insight-bullet">✓</span>
                  <span>Your profile is in strong shape. Keep your availability and portfolio updated.</span>
                </div>
              )}
            </div>
            {strength && strength.missingItems.length > 0 && (
              <Link to="/dashboard/profile" className="da-link">Fix missing profile fields →</Link>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
