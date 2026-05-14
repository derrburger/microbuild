import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analyzeProfileStrength, analyzeCreatorReadiness, getStrengthColor, getStrengthBarWidth } from '../lib/profileAI';
import type { UserProfileRow, CreatorProfileRow } from '../types/database';
import './Dashboard.css';

function safeStr(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb; }

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

// ─── Creator Dashboard ────────────────────────────────────────────────────────

function CreatorDashboard({ profile }: { profile: CreatorProfileRow }) {
  const strength  = analyzeProfileStrength(profile);
  const readiness = analyzeCreatorReadiness(profile);
  const color     = getStrengthColor(strength.score);
  const tierLabels: Record<string, string> = { free: 'Free', professional: 'Professional', verified: 'Verified ✓' };
  const tierColors: Record<string, string> = { free: '#8a94a6', professional: '#63b3ed', verified: '#f9b032' };
  const tierLabel = tierLabels[profile.tier] ?? 'Free';
  const tierColor = tierColors[profile.tier] ?? '#8a94a6';

  const approvalColors: Record<string, string> = {
    active: '#00d478', approved_pending_payment: '#63b3ed', draft: '#8a94a6',
    hidden: '#8a94a6', suspended: '#ef4444', rejected: '#ef4444',
  };

  return (
    <div className="dash-creator">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="dash-creator-header">
        <div className="dash-creator-avatar">
          {profile.profile_photo_url
            ? <img src={profile.profile_photo_url} alt="" className="dash-avatar-img" />
            : <span className="dash-avatar-initials">
                {safeStr(profile.display_name || profile.full_name, '?').slice(0, 2).toUpperCase()}
              </span>
          }
        </div>
        <div className="dash-creator-info">
          <h2 className="dash-creator-name">{profile.display_name ?? profile.full_name}</h2>
          <div className="dash-creator-badges">
            <span className="dash-tier-badge" style={{ color: tierColor, borderColor: tierColor + '44', background: tierColor + '10' }}>
              {tierLabel}
            </span>
            <span className="dash-status-badge" style={{ color: approvalColors[profile.approval_status] ?? '#8a94a6' }}>
              {profile.approval_status.replace(/_/g, ' ')}
            </span>
            {profile.public_profile_status === 'public' && (
              <span className="dash-status-badge" style={{ color: '#00d478' }}>🟢 Public</span>
            )}
          </div>
        </div>
        <div className="dash-creator-actions">
          <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile</Link>
          {profile.public_profile_status === 'public' && profile.slug && (
            <Link to={`/creator/${profile.id}`} className="btn btn-ghost btn-sm" target="_blank">
              View Public →
            </Link>
          )}
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="dash-stats-grid">
        <StatCard label="Profile Strength" value={`${strength.score}%`} sub={strength.label} color={color} />
        <StatCard label="Builds Completed" value={profile.completed_builds_count} />
        <StatCard label="Avg Rating" value={profile.average_rating ? profile.average_rating.toFixed(1) + ' ★' : '—'} />
        <StatCard label="Readiness Score" value={`${readiness.score}%`} sub={readiness.ready ? 'Ready' : 'In Progress'} color={readiness.ready ? '#00d478' : '#f9b032'} />
      </div>

      {/* ── Profile strength bar ───────────────────────────────── */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Profile Strength</h3>
          <span className="dash-section-score" style={{ color }}>{strength.score}/100 — {strength.label}</span>
        </div>
        <div className="dash-strength-bars">
          {Object.entries(strength.sections).map(([key, val]) => (
            <div key={key} className="dash-strength-row">
              <span className="dash-strength-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              <div className="dash-strength-track">
                <div
                  className="dash-strength-fill"
                  style={{ width: getStrengthBarWidth(val), background: getStrengthColor(val) }}
                />
              </div>
              <span className="dash-strength-pct" style={{ color: getStrengthColor(val) }}>{val}%</span>
            </div>
          ))}
        </div>
        <p className="dash-strength-summary">{strength.summary}</p>
      </div>

      {/* ── Missing info checklist ─────────────────────────────── */}
      {strength.missingItems.length > 0 && (
        <div className="dash-section">
          <h3 className="dash-section-title">Complete Your Profile</h3>
          <ul className="dash-checklist">
            {strength.missingItems.slice(0, 6).map((item) => (
              <li key={item} className="dash-checklist-item">
                <span className="dash-check-icon">○</span>
                {item}
              </li>
            ))}
          </ul>
          <Link to="/dashboard/profile" className="dash-fix-link">Fix these in Profile Editor →</Link>
        </div>
      )}

      {/* ── Strengths ─────────────────────────────────────────── */}
      {strength.strengths.length > 0 && (
        <div className="dash-section">
          <h3 className="dash-section-title">Your Strengths</h3>
          <div className="dash-chips-row">
            {strength.strengths.map((s) => (
              <span key={s} className="dash-strength-chip">✓ {s}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommendations ───────────────────────────────────── */}
      <div className="dash-section dash-section--dim">
        <h3 className="dash-section-title">AI Recommendations</h3>
        <div className="dash-ai-note">
          <p className="dash-ai-badge">Rule-based — no external AI API</p>
          <p>{readiness.verdict}</p>
          <p className="dash-ai-path">{strength.verificationPath}</p>
        </div>
      </div>

      {/* ── Quick links ───────────────────────────────────────── */}
      <div className="dash-quick-links">
        <Link to="/dashboard/profile" className="dash-quick-card">
          <span className="dash-quick-icon">✏️</span>
          <span>Edit Profile</span>
        </Link>
        <Link to="/dashboard/analytics" className="dash-quick-card">
          <span className="dash-quick-icon">📊</span>
          <span>Analytics</span>
        </Link>
        <Link to="/creators/apply" className="dash-quick-card">
          <span className="dash-quick-icon">📋</span>
          <span>View Application</span>
        </Link>
        <Link to="/creators" className="dash-quick-card">
          <span className="dash-quick-icon">🔍</span>
          <span>Creator Directory</span>
        </Link>
      </div>
    </div>
  );
}

// ─── Buyer Dashboard ──────────────────────────────────────────────────────────

function BuyerDashboard({ userProfile }: { userProfile: UserProfileRow }) {
  const [requests, setRequests] = useState<{ id: string; business_name: string; build_type: string; status: string; created_at: string }[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);

  useEffect(() => {
    supabase
      .from('buyer_requests')
      .select('id, business_name, build_type, status, created_at')
      .eq('email', userProfile.email)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRequests((data as typeof requests) ?? []);
        setLoadingReqs(false);
      });
  }, [userProfile.email]);

  return (
    <div className="dash-buyer">
      <div className="dash-buyer-header">
        <h2 className="dash-buyer-title">
          Welcome back, {userProfile.display_name ?? userProfile.email.split('@')[0]}
        </h2>
        <div className="dash-buyer-actions">
          <Link to="/request" className="btn btn-primary btn-sm">+ New Request</Link>
          <Link to="/browse" className="btn btn-ghost btn-sm">Browse Builds</Link>
        </div>
      </div>

      <div className="dash-stats-grid">
        <StatCard label="Requests Submitted" value={requests.length} />
        <StatCard label="Active Requests" value={requests.filter(r => !['rejected','completed'].includes(r.status)).length} color="#00d478" />
        <StatCard label="Completed Builds" value={requests.filter(r => r.status === 'completed').length} />
        <StatCard label="Account Type" value="Buyer" />
      </div>

      <div className="dash-section">
        <h3 className="dash-section-title">Your Requests</h3>
        {loadingReqs ? (
          <div className="dash-loading">Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="dash-empty">
            <p>No requests yet.</p>
            <Link to="/request" className="dash-fix-link">Submit your first request →</Link>
          </div>
        ) : (
          <div className="dash-requests-list">
            {requests.map((r) => (
              <div key={r.id} className="dash-request-row">
                <div className="dash-request-info">
                  <span className="dash-request-name">{r.business_name}</span>
                  <span className="dash-request-type">{r.build_type}</span>
                </div>
                <span className="dash-request-status" data-status={r.status}>
                  {r.status.replace(/-/g, ' ')}
                </span>
                <span className="dash-request-date">
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-section dash-section--dim">
        <h3 className="dash-section-title">Recommended Next Steps</h3>
        <div className="dash-recommendations">
          <Link to="/browse" className="dash-rec-card">
            <span className="dash-rec-icon">🔍</span>
            <div>
              <div className="dash-rec-title">Browse All MicroBuilds</div>
              <div className="dash-rec-sub">Find the right tool for your business</div>
            </div>
          </Link>
          <Link to="/request" className="dash-rec-card">
            <span className="dash-rec-icon">📋</span>
            <div>
              <div className="dash-rec-title">Submit a New Request</div>
              <div className="dash-rec-sub">Get a quote for a specific MicroBuild</div>
            </div>
          </Link>
          <Link to="/how-it-works" className="dash-rec-card">
            <span className="dash-rec-icon">⚡</span>
            <div>
              <div className="dash-rec-title">How MicroBuild Works</div>
              <div className="dash-rec-sub">Understand the delivery process</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

// ─── Creator Application Status Banner ───────────────────────────────────────

interface AppStatus {
  id: string;
  status: string;
  tier: string;
  needs_info_reason: string | null;
  rejected_reason: string | null;
  linked_creator_profile_id: string | null;
}

function CreatorApplicationStatus({
  appStatus,
  hasProfile,
}: {
  appStatus: AppStatus | null;
  hasProfile: boolean;
}) {
  if (hasProfile) return null; // CreatorDashboard handles the full view

  const tierLabels: Record<string, string> = { free: 'Free', professional: 'Professional', verified: 'Verified' };

  type StatusInfo = { icon: string; title: string; message: string; color: string; action?: React.ReactNode };
  function getInfo(): StatusInfo {
    if (!appStatus) {
      return {
        icon: '📋',
        title: 'No application submitted',
        message: 'Start your creator journey by submitting an application. Choose your tier and tell us about your work.',
        color: '#8a94a6',
        action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Apply as a Creator →</Link>,
      };
    }
    const tierLabel = tierLabels[appStatus.tier] ?? appStatus.tier;
    switch (appStatus.status) {
      case 'new':
      case 'reviewing':
      case 'needs_portfolio_review':
        return {
          icon: '⏳',
          title: `${tierLabel} application under review`,
          message: 'Your application has been received and is in the review queue. We\'ll reach out within 3–5 business days.',
          color: '#63b3ed',
        };
      case 'needs_more_info':
        return {
          icon: '💬',
          title: 'Admin requested more information',
          message: appStatus.needs_info_reason
            ? `The MicroBuild team needs: ${appStatus.needs_info_reason}`
            : 'The MicroBuild team needs additional information before proceeding. Check your email for details.',
          color: '#f9b032',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Update Profile →</Link>,
        };
      case 'approved_pending_payment':
        return {
          icon: '✅',
          title: `${tierLabel} application approved — payment setup coming soon`,
          message: `Your ${tierLabel} Creator application was approved! Subscription activation for ${appStatus.tier === 'professional' ? '$15/mo' : '$25/mo'} is not yet available. We'll notify you when payment setup is ready.`,
          color: '#00d478',
        };
      case 'active':
        return {
          icon: '🟢',
          title: 'Creator account active',
          message: 'Your creator account is active. Your profile will appear in the directory once an admin publishes it.',
          color: '#00d478',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile →</Link>,
        };
      case 'rejected':
        return {
          icon: '❌',
          title: 'Application not approved',
          message: appStatus.rejected_reason
            ? `Reason: ${appStatus.rejected_reason}`
            : 'Your application was not approved at this time. You\'re welcome to reapply as your portfolio grows.',
          color: '#ef4444',
        };
      case 'suspended':
        return {
          icon: '⊘',
          title: 'Account suspended',
          message: 'Your creator account has been suspended. Please contact MicroBuild support for more information.',
          color: '#a78bfa',
        };
      default:
        return {
          icon: '📋',
          title: `Application status: ${appStatus.status.replace(/_/g, ' ')}`,
          message: 'Check back soon for updates on your application.',
          color: '#8a94a6',
        };
    }
  }

  const info = getInfo();
  return (
    <div className="dash-application-status" style={{ borderColor: info.color + '44' }}>
      <div className="das-icon">{info.icon}</div>
      <div className="das-body">
        <div className="das-title" style={{ color: info.color }}>{info.title}</div>
        <div className="das-message">{info.message}</div>
        {info.action && <div className="das-action">{info.action}</div>}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfileRow | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [creatorApplication, setCreatorApplication] = useState<AppStatus | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin', { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    async function loadDashboard() {
      // 1. Fetch user profile
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      if (!up) {
        navigate('/onboarding', { replace: true });
        return;
      }
      setUserProfile(up as UserProfileRow);

      // 2. If creator, fetch creator_profiles AND creator_application
      if ((up as UserProfileRow).account_type === 'creator') {
        // Fetch creator profile (linked by user_id OR auth_user_id)
        const { data: cp } = await supabase
          .from('creator_profiles')
          .select('id, user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
          .or(`user_id.eq.${user!.id},auth_user_id.eq.${user!.id}`)
          .maybeSingle();

        if (cp) {
          const normalized = { ...cp } as Record<string, unknown>;
          ['tools','niches','badges','portfolio_links','credential_links','certifications','proof_links','skills']
            .forEach(k => { if (!Array.isArray(normalized[k])) normalized[k] = []; });
          setCreatorProfile(normalized as unknown as CreatorProfileRow);
        }

        // Fetch creator application — by auth_user_id first, then email
        const { data: appByAuth } = await supabase
          .from('creator_applications')
          .select('id, status, tier, needs_info_reason, rejected_reason, linked_creator_profile_id')
          .eq('auth_user_id', user!.id)
          .not('status', 'in', '("rejected","suspended")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (appByAuth) {
          setCreatorApplication(appByAuth as AppStatus);
        } else {
          // Fallback by email
          const { data: appByEmail } = await supabase
            .from('creator_applications')
            .select('id, status, tier, needs_info_reason, rejected_reason, linked_creator_profile_id')
            .eq('email', user!.email ?? '')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (appByEmail) setCreatorApplication(appByEmail as AppStatus);
        }
      }

      setProfileLoading(false);
    }

    loadDashboard();
  }, [user, navigate]);

  if (authLoading || profileLoading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          <div className="dashboard-spinner" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!user || !userProfile) return null;

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container">
          <div className="dashboard-eyebrow">My Dashboard</div>
          <h1 className="dashboard-title">
            {userProfile.account_type === 'creator' ? 'Creator Dashboard' : 'Buyer Dashboard'}
          </h1>
        </div>
      </div>

      <div className="container dashboard-body">
        {/* Creator view */}
        {userProfile.account_type === 'creator' && (
          creatorProfile
            ? <CreatorDashboard profile={creatorProfile} />
            : (
              <CreatorApplicationStatus
                appStatus={creatorApplication}
                hasProfile={false}
              />
            )
        )}

        {/* Buyer view */}
        {userProfile.account_type === 'buyer' && (
          <BuyerDashboard userProfile={userProfile} />
        )}
      </div>
    </div>
  );
}
