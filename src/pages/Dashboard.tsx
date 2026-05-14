import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analyzeProfileStrength, analyzeCreatorReadiness, getStrengthColor, getStrengthBarWidth } from '../lib/profileAI';
import type { UserProfileRow, CreatorProfileRow } from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './Dashboard.css';

// ─── Safe helpers ──────────────────────────────────────────────────────────────

function safeStr(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb; }
function safeNum(v: unknown, fb = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fb;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

// ─── Shared color maps ─────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = { free: 'Free', professional: 'Professional', verified: 'Verified ✓' };
const TIER_COLORS: Record<string, string> = { free: '#8a94a6', professional: '#63b3ed', verified: '#f9b032' };
const APPROVAL_COLORS: Record<string, string> = {
  active: '#00d478', approved_pending_payment: '#63b3ed',
  draft: '#8a94a6', hidden: '#8a94a6', suspended: '#ef4444',
  rejected: '#ef4444', needs_more_info: '#f9b032',
};
const STATUS_COLORS: Record<string, string> = {
  new: '#63b3ed', in_review: '#f9b032', 'in-review': '#f9b032',
  proposal_sent: '#a78bfa', completed: '#00d478', rejected: '#ef4444',
};

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

// ─── Account Status Panel ──────────────────────────────────────────────────────

interface AppStatus {
  id: string;
  status: string;
  tier: string;
  needs_info_reason: string | null;
  rejected_reason: string | null;
  linked_creator_profile_id: string | null;
}

function AccountStatusPanel({
  profile,
  appStatus,
}: {
  profile: CreatorProfileRow;
  appStatus: AppStatus | null;
}) {
  const tier       = safeStr(profile.tier, 'free');
  const approval   = safeStr(profile.approval_status, 'draft');
  const visibility = safeStr(profile.public_profile_status, 'hidden');
  const verif      = safeStr(profile.verification_status, 'unverified');
  const appSt      = appStatus ? appStatus.status : null;

  const visLabel =
    visibility === 'public' ? '🟢 Public' :
    visibility === 'paused' ? '⏸ Paused'  :
                              '🔴 Hidden';
  const visColor =
    visibility === 'public' ? '#00d478' :
    visibility === 'paused' ? '#f9b032'  :
                              '#8a94a6';

  const paymentLabel =
    tier === 'free'
      ? 'Not required'
      : appSt === 'approved_pending_payment'
        ? 'Setup coming soon'
        : approval === 'active'
          ? 'Active'
          : 'Not yet set up';

  const cells = [
    { label: 'Tier',           value: TIER_LABELS[tier]  ?? tier,                  color: TIER_COLORS[tier] ?? '#8a94a6' },
    { label: 'Account Status', value: approval.replace(/_/g, ' '),                 color: APPROVAL_COLORS[approval] ?? '#8a94a6' },
    { label: 'Visibility',     value: visLabel,                                     color: visColor },
    { label: 'Verification',   value: verif.replace(/_/g, ' '),                    color: verif === 'verified' ? '#00d478' : '#8a94a6' },
    { label: 'Application',    value: appSt ? appSt.replace(/_/g, ' ') : 'Not submitted', color: APPROVAL_COLORS[appSt ?? ''] ?? '#8a94a6' },
    { label: 'Payment',        value: paymentLabel,                                color: '#8a94a6' },
  ];

  return (
    <div className="dash-section dash-account-status-panel">
      <h3 className="dash-section-title">Account Status</h3>
      <div className="das-status-grid">
        {cells.map((c) => (
          <div key={c.label} className="das-status-cell">
            <span className="das-status-label">{c.label}</span>
            <span className="das-status-val" style={{ color: c.color }}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Next Best Action Card ─────────────────────────────────────────────────────

function NextBestActionCard({
  profile,
  appStatus,
}: {
  profile: CreatorProfileRow;
  appStatus: AppStatus | null;
}) {
  const strength   = analyzeProfileStrength(profile);
  const visibility = safeStr(profile.public_profile_status, 'hidden');
  const appSt      = appStatus?.status;

  let icon    = '🎯';
  let title   = 'Profile looks strong';
  let message = 'Your profile is in good shape. Stay active and keep your availability updated.';
  let cta: React.ReactNode | null = (
    <Link to="/dashboard/profile" className="dash-nba-btn">Review Profile →</Link>
  );

  if (appSt === 'needs_more_info') {
    icon    = '💬';
    title   = 'Admin needs more information';
    message = appStatus?.needs_info_reason
      ?? 'The MicroBuild team needs additional information. Check your email and update your profile.';
    cta     = <Link to="/dashboard/profile" className="dash-nba-btn">Update Profile →</Link>;
  } else if (appSt === 'approved_pending_payment') {
    icon    = '💳';
    title   = 'Approved — payment setup coming soon';
    message = `Your application was approved! Subscription activation for ${appStatus?.tier === 'professional' ? '$15/mo' : '$25/mo'} is not yet available. We'll notify you when it's ready.`;
    cta     = null;
  } else if (appSt === 'rejected') {
    icon    = '❌';
    title   = 'Application not approved';
    message = appStatus?.rejected_reason
      ?? "Your application wasn't approved at this time. You're welcome to reapply as your portfolio grows.";
    cta = <Link to="/creators/apply" className="dash-nba-btn">Reapply →</Link>;
  } else if (visibility === 'public' && strength.score >= 70) {
    icon    = '✅';
    title   = 'Your profile is live — keep it updated';
    message = 'Your profile is public and strong. Keep your availability, tools, and portfolio current to maintain match quality.';
  } else if (visibility === 'public' && strength.score < 70) {
    icon    = '📈';
    title   = "Improve your profile while you're live";
    message = `Your profile is public but scoring ${strength.score}/100. ${strength.improvements[0] ?? 'Add more details'} would improve your match quality.`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Strengthen Profile →</Link>;
  } else if (visibility !== 'public' && appSt === 'active') {
    icon    = '⏳';
    title   = 'Profile ready — waiting for admin to publish';
    message = 'Your account is active. An admin will review and publish your profile to the creator directory. In the meantime, complete any missing profile fields.';
    cta = strength.missingItems.length > 0
      ? <Link to="/dashboard/profile" className="dash-nba-btn">Add Missing Info →</Link>
      : null;
  } else if (strength.score < 40) {
    icon    = '🔧';
    title   = 'Complete your profile to improve match quality';
    message = `Your profile is ${strength.score}% complete. ${strength.improvements[0] ?? 'Add more information to get matched with buyers.'}`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Edit Profile →</Link>;
  } else if (strength.missingItems.length > 0) {
    icon    = '📝';
    title   = 'Good start — a few items would strengthen your profile';
    message = `Top improvement: ${strength.improvements[0]?.toLowerCase() ?? 'add portfolio links'}.`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Edit Profile →</Link>;
  }

  return (
    <div className="dash-nba-card">
      <div className="dash-nba-icon">{icon}</div>
      <div className="dash-nba-body">
        <div className="dash-nba-label">Next Best Action</div>
        <div className="dash-nba-title">{title}</div>
        <p className="dash-nba-message">{message}</p>
        {cta && <div className="dash-nba-cta">{cta}</div>}
      </div>
    </div>
  );
}

// ─── Project Pipeline Placeholder ─────────────────────────────────────────────

function ProjectPipelinePlaceholder() {
  const STAGES = [
    { label: 'Available',   note: 'Open opportunities' },
    { label: 'Assigned',    note: 'Projects matched to you' },
    { label: 'In Progress', note: "Builds you're working on" },
    { label: 'In Review',   note: 'Awaiting buyer approval' },
    { label: 'Completed',   note: 'Finished builds' },
  ];

  return (
    <div className="dash-section dash-section--dim">
      <div className="dash-section-header">
        <h3 className="dash-section-title">Project Pipeline</h3>
        <span className="dash-coming-soon-badge">Phase 2</span>
      </div>
      <div className="dash-pipeline">
        {STAGES.map((s, i) => (
          <div key={s.label} className="dash-pipeline-wrap">
            <div className="dash-pipeline-stage">
              <div className="dash-pipeline-count">—</div>
              <div className="dash-pipeline-label">{s.label}</div>
              <div className="dash-pipeline-note">{s.note}</div>
            </div>
            {i < STAGES.length - 1 && <div className="dash-pipeline-arrow">›</div>}
          </div>
        ))}
      </div>
      <p className="dash-pipeline-footer">
        Project matching requires the build order system. Coming in Phase 2.
      </p>
    </div>
  );
}

// ─── Creator Dashboard ─────────────────────────────────────────────────────────

function CreatorDashboard({
  profile,
  appStatus,
}: {
  profile: CreatorProfileRow;
  appStatus: AppStatus | null;
}) {
  const strength  = analyzeProfileStrength(profile);
  const readiness = analyzeCreatorReadiness(profile);
  const color     = getStrengthColor(strength.score);
  const tierLabel = TIER_LABELS[profile.tier] ?? 'Free';
  const tierColor = TIER_COLORS[profile.tier] ?? '#8a94a6';
  const approval  = safeStr(profile.approval_status, 'draft');

  return (
    <div className="dash-creator">

      {/* ── Creator header card ──────────────────────────────────── */}
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
            <span className="dash-status-badge" style={{ color: APPROVAL_COLORS[approval] ?? '#8a94a6' }}>
              {approval.replace(/_/g, ' ')}
            </span>
            {profile.public_profile_status === 'public' && (
              <span className="dash-status-badge" style={{ color: '#00d478' }}>🟢 Public</span>
            )}
          </div>
        </div>
        <div className="dash-creator-actions">
          <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile</Link>
          {profile.public_profile_status === 'public' && profile.id && (
            <Link to={`/creator/${profile.id}`} className="btn btn-ghost btn-sm" target="_blank">
              View Public →
            </Link>
          )}
        </div>
      </div>

      {/* ── Next best action ─────────────────────────────────────── */}
      <NextBestActionCard profile={profile} appStatus={appStatus} />

      {/* ── Account status panel ────────────────────────────────── */}
      <AccountStatusPanel profile={profile} appStatus={appStatus} />

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="dash-stats-grid">
        <StatCard label="Profile Strength"  value={`${strength.score}/100`} sub={strength.label} color={color} />
        <StatCard label="Builds Completed"  value={safeNum(profile.completed_builds_count, 0)} />
        <StatCard label="Avg Rating"        value={profile.average_rating ? profile.average_rating.toFixed(1) + ' ★' : '—'} />
        <StatCard label="Readiness"         value={`${readiness.score}/100`} sub={readiness.ready ? 'Ready' : 'Building'} color={readiness.ready ? '#00d478' : '#f9b032'} />
      </div>

      {/* ── Profile strength ───────────────────────────────────── */}
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
                <div className="dash-strength-fill" style={{ width: getStrengthBarWidth(val), background: getStrengthColor(val) }} />
              </div>
              <span className="dash-strength-pct" style={{ color: getStrengthColor(val) }}>{val}%</span>
            </div>
          ))}
        </div>
        <p className="dash-strength-summary">{strength.summary}</p>
      </div>

      {/* ── Missing items ──────────────────────────────────────── */}
      {strength.missingItems.length > 0 && (
        <div className="dash-section">
          <h3 className="dash-section-title">Complete Your Profile</h3>
          <ul className="dash-checklist">
            {strength.missingItems.slice(0, 6).map((item) => (
              <li key={item} className="dash-checklist-item">
                <span className="dash-check-icon">○</span>{item}
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

      {/* ── Suggested badges ──────────────────────────────────── */}
      {strength.recommendedBadges.length > 0 && (
        <div className="dash-section dash-badges-section">
          <h3 className="dash-section-title">Suggested Badges</h3>
          <div className="dash-chips-row">
            {strength.recommendedBadges.map((b) => (
              <span key={b} className="dash-badge-chip">{b}</span>
            ))}
          </div>
          <p className="dash-badge-note">Badges are awarded by the admin team based on your tier and activity.</p>
        </div>
      )}

      {/* ── AI readiness / verification path ─────────────────── */}
      <div className="dash-section dash-section--dim">
        <div className="dash-section-header">
          <h3 className="dash-section-title">AI Readiness Assessment</h3>
          <span className="dash-ai-badge-label">Rules-based · no external AI</span>
        </div>
        <div className="dash-readiness-row">
          <span className="dash-readiness-verdict" style={{ color: readiness.ready ? '#00d478' : '#f9b032' }}>
            {readiness.verdict}
          </span>
        </div>
        {readiness.blockers.length > 0 && (
          <ul className="dash-checklist dash-checklist--warn">
            {readiness.blockers.map((b) => (
              <li key={b} className="dash-checklist-item">
                <span className="dash-check-icon">⚠</span>{b}
              </li>
            ))}
          </ul>
        )}
        <p className="dash-ai-path">{strength.verificationPath}</p>
      </div>

      {/* ── Project pipeline placeholder ───────────────────────── */}
      <ProjectPipelinePlaceholder />

      {/* ── Analytics preview placeholders ────────────────────── */}
      <div className="dash-section dash-section--dim">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Creator Analytics</h3>
          <span className="dash-coming-soon-badge">Preview Metrics</span>
        </div>
        <div className="dash-analytics-preview-grid">
          <div className="dash-analytics-cell dash-analytics-cell--placeholder">
            <span className="dac-val">—</span>
            <span className="dac-label">Profile Views</span>
            <span className="dac-note">Requires tracking</span>
          </div>
          <div className="dash-analytics-cell dash-analytics-cell--placeholder">
            <span className="dac-val">—</span>
            <span className="dac-label">Buyer Interest</span>
            <span className="dac-note">Requires matching system</span>
          </div>
          <div className="dash-analytics-cell">
            <span className="dac-val">{safeNum(profile.completed_builds_count, 0)}</span>
            <span className="dac-label">Completed Builds</span>
            <span className="dac-note">Live</span>
          </div>
          <div className="dash-analytics-cell dash-analytics-cell--placeholder">
            <span className="dac-val">—</span>
            <span className="dac-label">Est. Earnings</span>
            <span className="dac-note">Requires Stripe</span>
          </div>
          <div className="dash-analytics-cell dash-analytics-cell--placeholder">
            <span className="dac-val">—</span>
            <span className="dac-label">Monthly Revenue</span>
            <span className="dac-note">Requires Stripe</span>
          </div>
          <div className="dash-analytics-cell">
            <span className="dac-val">{profile.average_rating ? profile.average_rating.toFixed(1) : '—'}</span>
            <span className="dac-label">Avg Rating</span>
            <span className="dac-note">{profile.average_rating ? 'Live' : 'No ratings yet'}</span>
          </div>
        </div>
        <Link to="/dashboard/analytics" className="dash-fix-link" style={{ marginTop: '0.75rem', display: 'block' }}>
          View full analytics →
        </Link>
      </div>

      {/* ── Quick links ───────────────────────────────────────── */}
      <div className="dash-quick-links">
        <Link to="/dashboard/profile"   className="dash-quick-card"><span className="dash-quick-icon">✏️</span><span>Edit Profile</span></Link>
        <Link to="/dashboard/analytics" className="dash-quick-card"><span className="dash-quick-icon">📊</span><span>Analytics</span></Link>
        <Link to="/dashboard/settings"  className="dash-quick-card"><span className="dash-quick-icon">⚙️</span><span>Settings</span></Link>
        <Link to="/creators"            className="dash-quick-card"><span className="dash-quick-icon">🔍</span><span>Directory</span></Link>
      </div>
    </div>
  );
}

// ─── Buyer Dashboard ───────────────────────────────────────────────────────────

const MICROBUILD_RECS = [
  { type: 'quote-funnel',              label: 'Quote Funnel',        icon: '💰', desc: 'Convert visitors into leads with instant price estimates' },
  { type: 'auto-detailing-package-selector', label: 'Package Selector', icon: '📦', desc: 'Let customers self-select and book a service tier' },
  { type: 'review-booster-page',       label: 'Review Booster',      icon: '⭐', desc: 'Route happy customers to Google reviews automatically' },
  { type: 'before-after-trust-page',   label: 'Trust Page',          icon: '🏆', desc: 'Before/after gallery with testimonials and a strong CTA' },
  { type: 'painter-estimate-page',     label: 'Estimate Page',       icon: '🖌️', desc: 'Capture project leads with an instant estimate form' },
];

interface BuyerRequest {
  id: string;
  business_name: string;
  build_type: string;
  status: string;
  created_at: string;
  budget: string | null;
  deadline: string | null;
  main_goal: string | null;
  industry: string | null;
}

function RecommendedBuildCard({ requests }: { requests: BuyerRequest[] }) {
  const requestedTypes = new Set(
    requests.map((r) => r.build_type.toLowerCase().replace(/\s+/g, '-'))
  );
  const untried = MICROBUILD_RECS.filter((b) => !requestedTypes.has(b.type));
  const rec     = untried[0] ?? MICROBUILD_RECS[0];

  return (
    <div className="dash-section dash-rec-build-section">
      <h3 className="dash-section-title">Recommended Next MicroBuild</h3>
      <div className="dash-rec-build-card">
        <span className="dash-rec-build-icon">{rec.icon}</span>
        <div className="dash-rec-build-body">
          <div className="dash-rec-build-type">{rec.label}</div>
          <p className="dash-rec-build-desc">{rec.desc}</p>
        </div>
        <Link to={`/builds/${rec.type}`} className="dash-rec-build-btn">Learn More →</Link>
      </div>
      {untried.length > 1 && (
        <div className="dash-rec-build-others">
          <span className="dash-rec-others-label">Other options:</span>
          {untried.slice(1, 4).map((b) => (
            <Link key={b.type} to={`/builds/${b.type}`} className="dash-rec-other-link">
              {b.icon} {b.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BuyerMissingInfoPanel({ requests }: { requests: BuyerRequest[] }) {
  if (requests.length === 0) return null;
  const latest  = requests[0];
  const missing: string[] = [];
  if (!latest.budget)    missing.push('Budget range not specified — helps us scope the project');
  if (!latest.deadline)  missing.push('Deadline not specified — helps us prioritize your request');
  if (!latest.industry)  missing.push('Industry or business type not included');
  if (missing.length === 0) return null;

  return (
    <div className="dash-section dash-missing-info-panel">
      <h3 className="dash-section-title">Missing Info — Latest Request</h3>
      <p className="dash-missing-sub">
        Adding these details to your next submission helps us prepare your proposal faster:
      </p>
      <ul className="dash-checklist">
        {missing.map((m) => (
          <li key={m} className="dash-checklist-item">
            <span className="dash-check-icon">○</span>{m}
          </li>
        ))}
      </ul>
      <Link to="/request" className="dash-fix-link">Submit updated request →</Link>
    </div>
  );
}

function BuyerDashboard({ userProfile }: { userProfile: UserProfileRow }) {
  const [requests,    setRequests]    = useState<BuyerRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);

  useEffect(() => {
    supabase
      .from('buyer_requests')
      .select('id, business_name, build_type, status, created_at, budget, deadline, main_goal, industry')
      .eq('email', userProfile.email)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRequests((data as BuyerRequest[]) ?? []);
        setLoadingReqs(false);
      });
  }, [userProfile.email]);

  const activeCount    = requests.filter((r) => !['rejected', 'completed'].includes(r.status)).length;
  const completedCount = requests.filter((r) => r.status === 'completed').length;

  return (
    <div className="dash-buyer">

      {/* ── Welcome header ─────────────────────────────────────── */}
      <div className="dash-buyer-header">
        <div>
          <h2 className="dash-buyer-title">
            Welcome back, {userProfile.display_name ?? userProfile.email.split('@')[0]}
          </h2>
          <p className="dash-buyer-sub">Manage your MicroBuild requests and track your projects.</p>
        </div>
        <div className="dash-buyer-actions">
          <Link to="/request" className="btn btn-primary btn-sm">+ New Request</Link>
          <Link to="/browse"  className="btn btn-ghost  btn-sm">Browse Builds</Link>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="dash-stats-grid">
        <StatCard label="Requests Submitted" value={requests.length} />
        <StatCard label="Active Requests"    value={activeCount}    color={activeCount    > 0 ? '#00d478' : undefined} />
        <StatCard label="Completed Builds"   value={completedCount} color={completedCount > 0 ? '#63b3ed' : undefined} />
        <StatCard label="Account Type"       value="Buyer" />
      </div>

      {/* ── Request list ──────────────────────────────────────── */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Your Requests</h3>
          {!loadingReqs && requests.length > 0 && (
            <Link to="/request" className="dash-section-action">+ New Request</Link>
          )}
        </div>
        {loadingReqs ? (
          <div className="dash-loading">Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="dash-empty">
            <p>No requests yet.</p>
            <Link to="/request" className="dash-fix-link">Submit your first MicroBuild request →</Link>
          </div>
        ) : (
          <div className="dash-requests-list">
            {requests.map((r) => (
              <div key={r.id} className="dash-request-row">
                <div className="dash-request-info">
                  <span className="dash-request-name">{r.business_name}</span>
                  <span className="dash-request-type">{r.build_type}</span>
                  {r.industry && <span className="dash-request-industry">{r.industry}</span>}
                </div>
                <div className="dash-request-meta">
                  {r.budget   && <span className="dash-request-budget">{r.budget}</span>}
                  {r.deadline && <span className="dash-request-deadline">by {r.deadline}</span>}
                  <span className="dash-request-date">{fmtDate(r.created_at)}</span>
                </div>
                <span
                  className="dash-request-status"
                  style={{ color: STATUS_COLORS[r.status] ?? '#8a94a6' }}
                >
                  {r.status.replace(/[-_]/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Missing info panel (shown when latest request has gaps) */}
      {!loadingReqs && <BuyerMissingInfoPanel requests={requests} />}

      {/* ── Recommended next build ─────────────────────────────── */}
      {!loadingReqs && <RecommendedBuildCard requests={requests} />}

      {/* ── CTAs ──────────────────────────────────────────────── */}
      <div className="dash-section dash-section--dim">
        <h3 className="dash-section-title">Quick Actions</h3>
        <div className="dash-recommendations">
          <Link to="/request" className="dash-rec-card">
            <span className="dash-rec-icon">📋</span>
            <div>
              <div className="dash-rec-title">Submit a New Request</div>
              <div className="dash-rec-sub">Get a quote for a specific MicroBuild</div>
            </div>
          </Link>
          <Link to="/browse" className="dash-rec-card">
            <span className="dash-rec-icon">🔍</span>
            <div>
              <div className="dash-rec-title">Browse All Builds</div>
              <div className="dash-rec-sub">Find the right tool for your business</div>
            </div>
          </Link>
          <Link to="/how-it-works" className="dash-rec-card">
            <span className="dash-rec-icon">⚡</span>
            <div>
              <div className="dash-rec-title">How It Works</div>
              <div className="dash-rec-sub">Understand the delivery process</div>
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}

// ─── Creator Application Status Banner ────────────────────────────────────────
// Shown when a creator account exists but no creator_profile has been created yet.

function CreatorApplicationStatus({
  appStatus,
  hasProfile,
}: {
  appStatus: AppStatus | null;
  hasProfile: boolean;
}) {
  if (hasProfile) return null;

  const tierLabels: Record<string, string> = { free: 'Free', professional: 'Professional', verified: 'Verified' };

  type StatusInfo = { icon: string; title: string; message: string; color: string; action?: React.ReactNode };
  function getInfo(): StatusInfo {
    if (!appStatus) {
      return {
        icon: '📋', title: 'No application submitted', color: '#8a94a6',
        message: 'Start your creator journey by submitting an application. Choose your tier and tell us about your work.',
        action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Apply as a Creator →</Link>,
      };
    }
    const tierLabel = tierLabels[appStatus.tier] ?? appStatus.tier;
    switch (appStatus.status) {
      case 'new': case 'reviewing': case 'needs_portfolio_review':
        return {
          icon: '⏳', title: `${tierLabel} application under review`, color: '#63b3ed',
          message: "Your application has been received and is in the review queue. We'll reach out within 3–5 business days.",
        };
      case 'needs_more_info':
        return {
          icon: '💬', title: 'Admin requested more information', color: '#f9b032',
          message: appStatus.needs_info_reason
            ? `The MicroBuild team needs: ${appStatus.needs_info_reason}`
            : 'The MicroBuild team needs additional information. Check your email for details.',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Update Profile →</Link>,
        };
      case 'approved_pending_payment':
        return {
          icon: '✅', title: `${tierLabel} application approved — payment setup coming soon`, color: '#00d478',
          message: `Your ${tierLabel} Creator application was approved! Subscription activation for ${appStatus.tier === 'professional' ? '$15/mo' : '$25/mo'} is not yet available. We'll notify you when payment setup is ready.`,
        };
      case 'active':
        return {
          icon: '🟢', title: 'Creator account active', color: '#00d478',
          message: 'Your creator account is active. Your profile will appear in the directory once an admin publishes it.',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile →</Link>,
        };
      case 'rejected':
        return {
          icon: '❌', title: 'Application not approved', color: '#ef4444',
          message: appStatus.rejected_reason
            ? `Reason: ${appStatus.rejected_reason}`
            : "Your application was not approved at this time. You're welcome to reapply as your portfolio grows.",
        };
      case 'suspended':
        return {
          icon: '⊘', title: 'Account suspended', color: '#a78bfa',
          message: 'Your creator account has been suspended. Please contact MicroBuild support for more information.',
        };
      default:
        return {
          icon: '📋', title: `Application status: ${appStatus.status.replace(/_/g, ' ')}`, color: '#8a94a6',
          message: 'Check back soon for updates on your application.',
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

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [userProfile,        setUserProfile]        = useState<UserProfileRow | null>(null);
  const [creatorProfile,     setCreatorProfile]      = useState<CreatorProfileRow | null>(null);
  const [creatorApplication, setCreatorApplication]  = useState<AppStatus | null>(null);
  const [profileLoading,     setProfileLoading]      = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    async function loadDashboard() {
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      if (!up) { navigate('/onboarding', { replace: true }); return; }
      setUserProfile(up as UserProfileRow);

      if ((up as UserProfileRow).account_type === 'creator') {
        const { data: cp } = await supabase
          .from('creator_profiles')
          .select('id, user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
          .or(`user_id.eq.${user!.id},auth_user_id.eq.${user!.id}`)
          .maybeSingle();

        if (cp) {
          const normalized = { ...cp } as Record<string, unknown>;
          ['tools','niches','badges','portfolio_links','credential_links','certifications','proof_links','skills']
            .forEach((k) => { if (!Array.isArray(normalized[k])) normalized[k] = []; });
          if (!normalized.tier)                 normalized.tier                 = 'free';
          if (!normalized.approval_status)      normalized.approval_status      = 'draft';
          if (!normalized.public_profile_status)normalized.public_profile_status = 'hidden';
          if (!normalized.verification_status)  normalized.verification_status  = 'unverified';
          if (!normalized.full_name)            normalized.full_name            = 'Unknown Creator';
          setCreatorProfile(normalized as unknown as CreatorProfileRow);
        }

        // Fetch creator application by auth_user_id first, then email
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

  const isCreator = userProfile.account_type === 'creator';

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container">
          <div className="dashboard-eyebrow">My Account</div>
          <h1 className="dashboard-title">
            {isCreator ? 'Creator Dashboard' : 'Buyer Dashboard'}
          </h1>
          <p className="dashboard-sub">
            {isCreator
              ? 'Manage your profile, track applications, and grow your creator presence.'
              : 'Track your MicroBuild requests and manage your account.'}
          </p>
        </div>
      </div>

      <div className="container dashboard-body">
        <DashboardNav />

        {/* Creator view */}
        {isCreator && (
          creatorProfile
            ? <CreatorDashboard profile={creatorProfile} appStatus={creatorApplication} />
            : <CreatorApplicationStatus appStatus={creatorApplication} hasProfile={false} />
        )}

        {/* Buyer view */}
        {!isCreator && userProfile.account_type === 'buyer' && (
          <BuyerDashboard userProfile={userProfile} />
        )}

        {/* Unknown account type */}
        {!isCreator && userProfile.account_type !== 'buyer' && (
          <div className="dash-empty">
            <p>Account type not configured.</p>
            <Link to="/onboarding" className="dash-fix-link">Complete onboarding →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
