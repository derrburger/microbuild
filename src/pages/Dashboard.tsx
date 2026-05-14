import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  analyzeProfileStrength,
  getStrengthColor,
  getStrengthBarWidth,
} from '../lib/profileAI';
import type { UserProfileRow, CreatorProfileRow } from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './Dashboard.css';

// ─── Safe helpers ──────────────────────────────────────────────────────────────

function safeStr(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb; }
function safeNum(v: unknown, fb = 0): number { const n = Number(v); return isFinite(n) ? n : fb; }
function safeArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

// ─── Shared color maps ─────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  free: 'Free', professional: 'Professional', verified: 'Verified ✓',
};
const TIER_COLORS: Record<string, string> = {
  free: '#8a94a6', professional: '#63b3ed', verified: '#f9b032',
};
const APPROVAL_COLORS: Record<string, string> = {
  active: '#00d478', approved_pending_payment: '#63b3ed',
  draft: '#8a94a6', hidden: '#8a94a6', suspended: '#ef4444',
  rejected: '#ef4444', needs_more_info: '#f9b032', reviewing: '#63b3ed', new: '#63b3ed',
};
const STATUS_COLORS: Record<string, string> = {
  new: '#63b3ed', in_review: '#f9b032', 'in-review': '#f9b032',
  proposal_sent: '#a78bfa', completed: '#00d478', rejected: '#ef4444',
};

// ─── Dashboard helper logic ────────────────────────────────────────────────────

function getPublicReadinessLabel(score: number): string {
  if (score >= 80) return 'Public-ready';
  if (score >= 65) return 'Ready for public review';
  if (score >= 45) return 'Almost ready';
  if (score >= 25) return 'Needs work';
  return 'Not ready';
}

function getPublicReadinessColor(score: number): string {
  if (score >= 80) return '#00d478';
  if (score >= 65) return '#63b3ed';
  if (score >= 45) return '#f9b032';
  return '#ef4444';
}

function getMissingProfileFields(profile: CreatorProfileRow): { label: string; key: string; complete: boolean }[] {
  return [
    { label: 'Display name',           key: 'display_name',     complete: !!safeStr(profile.display_name) },
    { label: 'Strong bio (80+ chars)', key: 'bio',              complete: safeStr(profile.bio).length >= 80 },
    { label: 'Tools & platforms',      key: 'tools',            complete: safeArr(profile.tools).length > 0 },
    { label: 'Industry niches',        key: 'niches',           complete: safeArr(profile.niches).length > 0 },
    { label: 'Portfolio links',        key: 'portfolio_links',  complete: safeArr(profile.portfolio_links).length > 0 },
    { label: 'GitHub or LinkedIn',     key: 'github_linkedin',  complete: !!safeStr(profile.github_url) || !!safeStr(profile.linkedin_url) },
    { label: 'Proof / certifications', key: 'certifications',   complete: safeArr(profile.certifications).length > 0 || safeArr(profile.credential_links).length > 0 },
    { label: 'Weekly availability',    key: 'available_hours',  complete: !!safeStr(profile.available_hours) },
  ];
}

function getCreatorDashboardWarnings(
  profile: CreatorProfileRow,
  appStatus: AppStatus | null,
): string[] {
  const warnings: string[] = [];
  if (!safeStr(profile.bio)) warnings.push('Bio is empty — profile will look incomplete publicly.');
  if (safeArr(profile.portfolio_links).length === 0) warnings.push('No portfolio links — buyer credibility is low.');
  if (appStatus?.status === 'needs_more_info' && appStatus.needs_info_reason) {
    warnings.push(`Admin note: ${appStatus.needs_info_reason}`);
  }
  if (profile.public_profile_status === 'public' && safeArr(profile.tools).length === 0) {
    warnings.push('Your public profile has no tools listed.');
  }
  if (profile.tier === 'verified' && safeArr(profile.credential_links).length === 0) {
    warnings.push('Verified tier requires credential links for verification review.');
  }
  return warnings;
}

// ─── AppStatus type ────────────────────────────────────────────────────────────

interface AppStatus {
  id: string;
  status: string;
  tier: string;
  needs_info_reason: string | null;
  rejected_reason: string | null;
  linked_creator_profile_id: string | null;
}

// ─── Status summary card ───────────────────────────────────────────────────────

function SummaryStatusCard({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="cd-status-card">
      <div className="cd-status-val" style={{ color }}>{value}</div>
      <div className="cd-status-label">{label}</div>
      <div className="cd-status-sub">{sub}</div>
    </div>
  );
}

// ─── Next Best Action card ─────────────────────────────────────────────────────

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

  let icon = '🎯', title = 'Profile looks strong', cta: React.ReactNode | null = null;
  let message = 'Your profile is in good shape. Stay active and keep your availability updated.';
  cta = <Link to="/dashboard/profile" className="dash-nba-btn">Review Profile →</Link>;

  if (appSt === 'needs_more_info') {
    icon = '💬'; title = 'Admin needs more information';
    message = appStatus?.needs_info_reason ?? 'The MicroBuild team needs additional information. Check your email.';
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Update Profile →</Link>;
  } else if (appSt === 'approved_pending_payment') {
    icon = '💳'; title = 'Approved — payment setup coming soon';
    message = `Your application was approved! Subscription activation for ${appStatus?.tier === 'professional' ? '$15/mo' : '$25/mo'} is not yet available. We'll notify you when it's ready.`;
    cta = null;
  } else if (appSt === 'rejected') {
    icon = '❌'; title = 'Application not approved';
    message = appStatus?.rejected_reason ?? "Your application wasn't approved at this time. You're welcome to reapply as your portfolio grows.";
    cta = <Link to="/creators/apply" className="dash-nba-btn">Reapply →</Link>;
  } else if (visibility === 'public' && strength.score >= 70) {
    icon = '✅'; title = 'Profile is live — keep it updated';
    message = 'Your profile is public and strong. Keep your availability, tools, and portfolio current to stay visible to buyers.';
    cta = <Link to={`/creator/${profile.id}`} className="dash-nba-btn" target="_blank">View Public Profile →</Link>;
  } else if (visibility === 'public' && strength.score < 70) {
    icon = '📈'; title = "Improve your profile while it's live";
    message = `Your profile is public but scoring ${strength.score}/100. ${strength.improvements[0] ?? 'Add more details'} would improve match quality.`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Strengthen Profile →</Link>;
  } else if (visibility !== 'public' && appSt === 'active') {
    icon = '⏳'; title = 'Profile ready — waiting for admin to publish';
    message = 'Your account is active. An admin will review and publish your profile to the creator directory.';
    cta = strength.missingItems.length > 0
      ? <Link to="/dashboard/profile" className="dash-nba-btn">Complete Missing Fields →</Link>
      : null;
  } else if (!appSt) {
    icon = '📋'; title = 'No application submitted yet';
    message = 'Start your creator journey by submitting an application. Choose your tier and tell us about your work.';
    cta = <Link to="/creators/apply" className="dash-nba-btn">Apply as a Creator →</Link>;
  } else if (appSt === 'new' || appSt === 'reviewing') {
    icon = '⏳'; title = 'Application under review';
    message = "Your application is in the review queue. We'll reach out within 3–5 business days.";
    cta = null;
  } else if (strength.score < 40) {
    icon = '🔧'; title = 'Complete your profile to improve match quality';
    message = `Your profile scores ${strength.score}/100. ${strength.improvements[0] ?? 'Add more information to attract buyers.'}`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Edit Profile →</Link>;
  } else if (strength.missingItems.length > 0) {
    icon = '📝'; title = 'A few items would strengthen your profile';
    message = `Top improvement: ${strength.improvements[0]?.toLowerCase() ?? 'add portfolio links'}.`;
    cta = <Link to="/dashboard/profile" className="dash-nba-btn">Edit Profile →</Link>;
  }

  return (
    <div className="cd-nba-card">
      <div className="cd-nba-icon">{icon}</div>
      <div className="cd-nba-body">
        <div className="cd-nba-eyebrow">Next Best Action</div>
        <div className="cd-nba-title">{title}</div>
        <p className="cd-nba-message">{message}</p>
        {cta && <div className="cd-nba-cta">{cta}</div>}
      </div>
    </div>
  );
}

// ─── Profile Readiness card ────────────────────────────────────────────────────

function ProfileReadinessCard({ profile }: { profile: CreatorProfileRow }) {
  const strength      = analyzeProfileStrength(profile);
  const scoreColor    = getStrengthColor(strength.score);
  const readinessLabel = getPublicReadinessLabel(strength.score);
  const readinessColor = getPublicReadinessColor(strength.score);

  const recommendations = [
    strength.sections.portfolio < 60  && 'Add portfolio links to show your work',
    strength.sections.identity  < 60  && 'Write a strong bio (aim for 80+ characters)',
    !safeStr(profile.github_url)       && !safeStr(profile.linkedin_url) && 'Add your GitHub or LinkedIn profile',
    strength.sections.expertise < 60  && 'List your tools, platforms, and industry niches',
    strength.sections.credentials < 60 && profile.tier !== 'free' && 'Add proof links or certifications',
    safeArr(profile.niches).length === 0 && 'Specify your industry focus for better buyer matching',
  ].filter(Boolean) as string[];

  return (
    <div className="cd-readiness-card">
      <div className="cd-readiness-header">
        <div>
          <h3 className="cd-card-title">Profile Readiness</h3>
          <span className="cd-readiness-label" style={{ color: readinessColor }}>{readinessLabel}</span>
        </div>
        <div className="cd-readiness-score-block">
          <span className="cd-readiness-score-num" style={{ color: scoreColor }}>{strength.score}</span>
          <span className="cd-readiness-score-label">/ 100</span>
        </div>
      </div>

      {/* Overall bar */}
      <div className="cd-readiness-bar-track">
        <div
          className="cd-readiness-bar-fill"
          style={{ width: getStrengthBarWidth(strength.score), background: scoreColor }}
        />
      </div>

      {/* Section breakdown */}
      <div className="cd-readiness-sections">
        {Object.entries(strength.sections).map(([key, val]) => (
          <div key={key} className="cd-readiness-section-row">
            <span className="cd-readiness-section-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
            <div className="cd-readiness-section-bar">
              <div
                className="cd-readiness-section-fill"
                style={{ width: `${val}%`, background: getStrengthColor(val) }}
              />
            </div>
            <span className="cd-readiness-section-pct" style={{ color: getStrengthColor(val) }}>{val}%</span>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="cd-readiness-recs">
          <div className="cd-readiness-recs-title">Recommendations:</div>
          {recommendations.slice(0, 4).map((r) => (
            <div key={r} className="cd-readiness-rec-item">
              <span className="cd-rec-bullet">→</span> {r}
            </div>
          ))}
        </div>
      )}

      <Link to="/dashboard/profile" className="cd-readiness-link">Edit profile to improve score →</Link>
    </div>
  );
}

// ─── Project Pipeline preview ──────────────────────────────────────────────────

function ProjectPipelinePreview({ completedCount }: { completedCount: number }) {
  const STAGES = [
    { label: 'Available',   count: 0,              note: 'Open opportunities' },
    { label: 'Assigned',    count: 0,              note: 'Matched to you' },
    { label: 'In Progress', count: 0,              note: "You're building" },
    { label: 'In Review',   count: 0,              note: 'Buyer review' },
    { label: 'Delivered',   count: 0,              note: 'Awaiting payment' },
    { label: 'Completed',   count: completedCount, note: 'Finished builds' },
  ];

  return (
    <div className="cd-pipeline-card">
      <div className="cd-pipeline-header">
        <h3 className="cd-card-title">Project Pipeline</h3>
        <span className="cd-phase-badge">Phase 2</span>
      </div>
      <div className="cd-pipeline-stages">
        {STAGES.map((s) => (
          <div key={s.label} className={`cd-pipeline-stage${s.count > 0 ? ' cd-pipeline-stage--active' : ''}`}>
            <div className="cd-pipeline-count" style={{ color: s.count > 0 ? '#00d478' : undefined }}>
              {s.count > 0 ? s.count : '—'}
            </div>
            <div className="cd-pipeline-label">{s.label}</div>
            <div className="cd-pipeline-note">{s.note}</div>
          </div>
        ))}
      </div>
      <p className="cd-pipeline-note-main">
        Project matching and build assignment are coming in Phase 2.
      </p>
    </div>
  );
}

// ─── Earnings preview ─────────────────────────────────────────────────────────

function EarningsPreview({
  completedCount,
  avgRating,
}: {
  completedCount: number;
  avgRating: number | null;
}) {
  return (
    <div className="cd-earnings-card">
      <div className="cd-earnings-header">
        <h3 className="cd-card-title">Earnings Preview</h3>
        <span className="cd-phase-badge">Placeholder</span>
      </div>
      <div className="cd-earnings-grid">
        <div className="cd-earnings-cell">
          <span className="cd-earnings-val">$0</span>
          <span className="cd-earnings-label">Est. Earnings</span>
        </div>
        <div className="cd-earnings-cell">
          <span className="cd-earnings-val">{completedCount}</span>
          <span className="cd-earnings-label">Completed Builds</span>
        </div>
        <div className="cd-earnings-cell">
          <span className="cd-earnings-val">{avgRating ? avgRating.toFixed(1) + ' ★' : '—'}</span>
          <span className="cd-earnings-label">Avg Rating</span>
        </div>
        <div className="cd-earnings-cell cd-earnings-cell--placeholder">
          <span className="cd-earnings-val">—</span>
          <span className="cd-earnings-label">Monthly Revenue</span>
        </div>
      </div>
      <p className="cd-earnings-note">
        Payouts and earnings tracking will be added after approval workflows and Stripe are connected.
      </p>
    </div>
  );
}

// ─── Growth checklist ─────────────────────────────────────────────────────────

function GrowthChecklist({ profile }: { profile: CreatorProfileRow }) {
  const fields = getMissingProfileFields(profile);
  const completeCount = fields.filter((f) => f.complete).length;

  return (
    <div className="cd-growth-checklist">
      <div className="cd-growth-header">
        <h3 className="cd-card-title">Creator Growth Checklist</h3>
        <span className="cd-growth-progress">
          {completeCount}/{fields.length} complete
        </span>
      </div>
      <div className="cd-growth-items">
        {fields.map((f) => (
          <div key={f.key} className={`cd-growth-item${f.complete ? ' cd-growth-item--done' : ''}`}>
            <span className="cd-growth-check">{f.complete ? '✓' : '○'}</span>
            <span className="cd-growth-label">{f.label}</span>
            {!f.complete && <span className="cd-growth-incomplete">Incomplete</span>}
          </div>
        ))}
      </div>
      {completeCount < fields.length && (
        <Link to="/dashboard/profile" className="cd-growth-link">
          Complete remaining items in Profile Editor →
        </Link>
      )}
    </div>
  );
}

// ─── Warning banner ────────────────────────────────────────────────────────────

function WarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="cd-warnings">
      {warnings.map((w) => (
        <div key={w} className="cd-warning-item">
          <span className="cd-warning-icon">⚠</span> {w}
        </div>
      ))}
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
  const strength   = analyzeProfileStrength(profile);
  const scoreColor = getStrengthColor(strength.score);
  const tier       = safeStr(profile.tier, 'free');
  const approval   = safeStr(profile.approval_status, 'draft');
  const visibility = safeStr(profile.public_profile_status, 'hidden');
  const verif      = safeStr(profile.verification_status, 'unverified');
  const appSt      = appStatus?.status ?? null;
  const tierColor  = TIER_COLORS[tier]  ?? '#8a94a6';
  const warnings   = getCreatorDashboardWarnings(profile, appStatus);

  const visLabel = visibility === 'public' ? '🟢 Public' : visibility === 'paused' ? '⏸ Paused' : '🔴 Hidden';
  const visColor = visibility === 'public' ? '#00d478' : visibility === 'paused' ? '#f9b032' : '#8a94a6';

  const paymentLabel =
    tier === 'free' ? 'Not required' :
    appSt === 'approved_pending_payment' ? 'Setup coming soon' :
    approval === 'active' ? 'Active (Stripe pending)' : 'Not yet set up';

  const completedBuilds = safeNum(profile.completed_builds_count, 0);
  const avgRating       = profile.average_rating as number | null;

  return (
    <div className="dash-creator">

      {/* ── Creator identity header ──────────────────────────────── */}
      <div className="cd-identity-header">
        <div className="dash-creator-avatar">
          {profile.profile_photo_url
            ? <img src={profile.profile_photo_url} alt="" className="dash-avatar-img" />
            : <span className="dash-avatar-initials">
                {safeStr(profile.display_name || profile.full_name, '?').slice(0, 2).toUpperCase()}
              </span>
          }
        </div>
        <div className="cd-identity-info">
          <h2 className="cd-identity-name">{profile.display_name ?? profile.full_name ?? 'Creator'}</h2>
          <div className="cd-identity-badges">
            <span className="cd-tier-badge" style={{ color: tierColor, borderColor: tierColor + '44', background: tierColor + '10' }}>
              {TIER_LABELS[tier] ?? tier}
            </span>
            <span className="cd-approval-badge" style={{ color: APPROVAL_COLORS[approval] ?? '#8a94a6' }}>
              {approval.replace(/_/g, ' ')}
            </span>
            {visibility === 'public' && (
              <span className="cd-visibility-badge cd-visibility-badge--public">🟢 Public</span>
            )}
          </div>
        </div>
        <div className="cd-identity-actions">
          <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile</Link>
          {visibility === 'public' && (
            <Link to={`/creator/${profile.id}`} className="btn btn-ghost btn-sm" target="_blank">
              View Public →
            </Link>
          )}
        </div>
      </div>

      {/* ── Warning banners ──────────────────────────────────────── */}
      <WarningBanner warnings={warnings} />

      {/* ── Status summary row (6 cards) ─────────────────────────── */}
      <div className="cd-status-row">
        <SummaryStatusCard
          label="Creator Tier"
          value={TIER_LABELS[tier] ?? tier}
          sub="Current creator plan"
          color={tierColor}
        />
        <SummaryStatusCard
          label="Approval Status"
          value={approval.replace(/_/g, ' ')}
          sub="Admin review state"
          color={APPROVAL_COLORS[approval] ?? '#8a94a6'}
        />
        <SummaryStatusCard
          label="Profile Visibility"
          value={visLabel}
          sub="Controlled by admin"
          color={visColor}
        />
        <SummaryStatusCard
          label="Verification"
          value={verif.replace(/_/g, ' ')}
          sub="Trust badge status"
          color={verif === 'verified' ? '#00d478' : '#8a94a6'}
        />
        <SummaryStatusCard
          label="Profile Strength"
          value={`${strength.score}/100`}
          sub={getPublicReadinessLabel(strength.score)}
          color={scoreColor}
        />
        <SummaryStatusCard
          label="Payment Status"
          value={paymentLabel}
          sub="Stripe not connected yet"
          color="#8a94a6"
        />
      </div>

      {/* ── Main two-column section ───────────────────────────────── */}
      <div className="cd-main-grid">

        {/* Left column */}
        <div className="cd-main-left">
          <NextBestActionCard profile={profile} appStatus={appStatus} />
          <ProfileReadinessCard profile={profile} />
        </div>

        {/* Right column */}
        <div className="cd-main-right">
          <ProjectPipelinePreview completedCount={completedBuilds} />
          <EarningsPreview completedCount={completedBuilds} avgRating={avgRating} />
        </div>

      </div>

      {/* ── Growth checklist ─────────────────────────────────────── */}
      <GrowthChecklist profile={profile} />

    </div>
  );
}

// ─── Buyer stat card ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

// ─── Buyer: recommended build card ────────────────────────────────────────────

const MICROBUILD_RECS = [
  { type: 'pool-cleaning-quote-funnel',        label: 'Quote Funnel',     icon: '💰', desc: 'Convert visitors into leads with instant price estimates' },
  { type: 'auto-detailing-package-selector',   label: 'Package Selector', icon: '📦', desc: 'Let customers self-select and book a service tier' },
  { type: 'review-booster-page',               label: 'Review Booster',   icon: '⭐', desc: 'Route happy customers to Google reviews automatically' },
  { type: 'before-after-trust-page',           label: 'Trust Page',       icon: '🏆', desc: 'Before/after gallery with testimonials and a strong CTA' },
  { type: 'painter-estimate-page',             label: 'Estimate Page',    icon: '🖌️', desc: 'Capture project leads with an instant estimate form' },
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
  const requestedTypes = new Set(requests.map((r) => r.build_type.toLowerCase().replace(/\s+/g, '-')));
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
  const missing = [
    !latest.budget   && 'Budget range not specified — helps scope the project',
    !latest.deadline && 'Deadline not specified — helps prioritize your request',
    !latest.industry && 'Industry or business type not included',
  ].filter(Boolean) as string[];
  if (missing.length === 0) return null;
  return (
    <div className="dash-section dash-missing-info-panel">
      <h3 className="dash-section-title">Missing Info — Latest Request</h3>
      <p className="dash-missing-sub">Adding these details helps us prepare your proposal faster:</p>
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

// ─── Buyer Dashboard ───────────────────────────────────────────────────────────

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

      <div className="dash-stats-grid">
        <StatCard label="Requests Submitted" value={requests.length} />
        <StatCard label="Active Requests"    value={activeCount}    color={activeCount    > 0 ? '#00d478' : undefined} />
        <StatCard label="Completed Builds"   value={completedCount} color={completedCount > 0 ? '#63b3ed' : undefined} />
        <StatCard label="Account Type"       value="Buyer" />
      </div>

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
                <span className="dash-request-status" style={{ color: STATUS_COLORS[r.status] ?? '#8a94a6' }}>
                  {r.status.replace(/[-_]/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loadingReqs && <BuyerMissingInfoPanel requests={requests} />}
      {!loadingReqs && <RecommendedBuildCard requests={requests} />}

      <div className="dash-section dash-section--dim">
        <h3 className="dash-section-title">Quick Actions</h3>
        <div className="dash-recommendations">
          <Link to="/request"       className="dash-rec-card"><span className="dash-rec-icon">📋</span><div><div className="dash-rec-title">Submit a New Request</div><div className="dash-rec-sub">Get a quote for a specific MicroBuild</div></div></Link>
          <Link to="/browse"        className="dash-rec-card"><span className="dash-rec-icon">🔍</span><div><div className="dash-rec-title">Browse All Builds</div><div className="dash-rec-sub">Find the right tool for your business</div></div></Link>
          <Link to="/how-it-works"  className="dash-rec-card"><span className="dash-rec-icon">⚡</span><div><div className="dash-rec-title">How It Works</div><div className="dash-rec-sub">Understand the delivery process</div></div></Link>
        </div>
      </div>
    </div>
  );
}

// ─── Creator Application Status (no profile yet) ──────────────────────────────

function CreatorApplicationStatus({
  appStatus,
  hasProfile,
}: {
  appStatus: AppStatus | null;
  hasProfile: boolean;
}) {
  if (hasProfile) return null;

  const tierLabels: Record<string, string> = { free: 'Free', professional: 'Professional', verified: 'Verified' };
  type Info = { icon: string; title: string; message: string; color: string; action?: React.ReactNode };

  function getInfo(): Info {
    if (!appStatus) {
      return {
        icon: '📋', title: 'No application submitted', color: '#8a94a6',
        message: 'Start your creator journey by submitting an application.',
        action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Apply as a Creator →</Link>,
      };
    }
    const tl = tierLabels[appStatus.tier] ?? appStatus.tier;
    switch (appStatus.status) {
      case 'new': case 'reviewing': case 'needs_portfolio_review':
        return { icon: '⏳', title: `${tl} application under review`, color: '#63b3ed',
          message: "Your application has been received and is in the review queue. We'll reach out within 3–5 business days." };
      case 'needs_more_info':
        return { icon: '💬', title: 'Admin requested more information', color: '#f9b032',
          message: appStatus.needs_info_reason ? `The MicroBuild team needs: ${appStatus.needs_info_reason}` : 'The MicroBuild team needs additional information. Check your email.',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Update Profile →</Link> };
      case 'approved_pending_payment':
        return { icon: '✅', title: `${tl} application approved — payment setup coming soon`, color: '#00d478',
          message: `Your ${tl} Creator application was approved! Subscription activation is not yet available. We'll notify you when it's ready.` };
      case 'active':
        return { icon: '🟢', title: 'Creator account active', color: '#00d478',
          message: 'Your creator account is active. Your profile will appear in the directory once an admin publishes it.',
          action: <Link to="/dashboard/profile" className="btn btn-primary btn-sm">Edit Profile →</Link> };
      case 'rejected':
        return { icon: '❌', title: 'Application not approved', color: '#ef4444',
          message: appStatus.rejected_reason ? `Reason: ${appStatus.rejected_reason}` : "Your application was not approved at this time. You're welcome to reapply as your portfolio grows." };
      case 'suspended':
        return { icon: '⊘', title: 'Account suspended', color: '#a78bfa',
          message: 'Your creator account has been suspended. Contact MicroBuild support for more information.' };
      default:
        return { icon: '📋', title: `Application status: ${appStatus.status.replace(/_/g, ' ')}`, color: '#8a94a6',
          message: 'Check back soon for updates on your application.' };
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
      // 1. Fetch user profile
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      if (!up) { navigate('/onboarding', { replace: true }); return; }
      setUserProfile(up as UserProfileRow);

      if ((up as UserProfileRow).account_type === 'creator') {
        // ─── 3-tier creator profile lookup (mirrors DashboardProfile.tsx) ────
        let cpData: Record<string, unknown> | null = null;

        // Tier 1: follow user_profiles.creator_profile_id (most direct)
        const cpId = (up as { creator_profile_id: string | null }).creator_profile_id;
        if (cpId) {
          const { data } = await supabase
            .from('creator_profiles')
            .select('id, user_id, auth_user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
            .eq('id', cpId)
            .maybeSingle();
          cpData = data as Record<string, unknown> | null;
        }

        // Tier 2: by auth_user_id on creator_profiles
        if (!cpData) {
          const { data } = await supabase
            .from('creator_profiles')
            .select('id, user_id, auth_user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
            .eq('auth_user_id', user!.id)
            .maybeSingle();
          cpData = data as Record<string, unknown> | null;
        }

        // Tier 3: by legacy user_id
        if (!cpData) {
          const { data } = await supabase
            .from('creator_profiles')
            .select('id, user_id, auth_user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
            .eq('user_id', user!.id)
            .maybeSingle();
          cpData = data as Record<string, unknown> | null;
        }

        if (cpData) {
          const normalized = { ...cpData };
          ['tools','niches','badges','portfolio_links','credential_links','certifications','proof_links','skills']
            .forEach((k) => { if (!Array.isArray(normalized[k])) normalized[k] = []; });
          if (!normalized.tier)                  normalized.tier                  = 'free';
          if (!normalized.approval_status)       normalized.approval_status       = 'draft';
          if (!normalized.public_profile_status) normalized.public_profile_status = 'hidden';
          if (!normalized.verification_status)   normalized.verification_status   = 'unverified';
          if (!normalized.full_name)             normalized.full_name             = 'Creator';
          setCreatorProfile(normalized as unknown as CreatorProfileRow);
        }

        // Fetch creator application
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
              ? 'Manage your profile, track your status, and grow your creator presence.'
              : 'Track your MicroBuild requests and manage your account.'}
          </p>
        </div>
      </div>

      <div className="container dashboard-body">
        <DashboardNav />

        {isCreator && (
          creatorProfile
            ? <CreatorDashboard profile={creatorProfile} appStatus={creatorApplication} />
            : <CreatorApplicationStatus appStatus={creatorApplication} hasProfile={false} />
        )}

        {!isCreator && userProfile.account_type === 'buyer' && (
          <BuyerDashboard userProfile={userProfile} />
        )}

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
