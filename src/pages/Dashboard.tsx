import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  analyzeProfileStrength,
  getStrengthColor,
  getStrengthBarWidth,
} from '../lib/profileAI';
import {
  getMissingInfoFlags,
  analyzeBuyerDashboard,
} from '../lib/buyerAI';
import {
  fetchOrdersByRequestIds,
  fetchDeliverablesByOrderIds,
} from '../lib/orders';
import type { OrderPipelineRow, DeliverablePlaceholder } from '../lib/orders';
import type { UserProfileRow, CreatorProfileRow } from '../types/database';
import type { CreatorTier } from '../types';
import CreatorProjectsPanel from '../components/creator/CreatorProjectsPanel';
import AppPageHeader from '../components/AppPageHeader';
import BuyerMyRequestsPanel from '../components/buyer/BuyerMyRequestsPanel';
import BuyerProposalSection from '../components/BuyerProposalSection';
import StatusBadge from '../components/StatusBadge';
import {
  formatBuyerRequestHeadline,
  formatCreatorApprovalStatus,
  normalizeStatusKey,
} from '../lib/statusLabels';
import {
  CREATOR_TIER_LABELS,
  CREATOR_TIER_COLORS,
} from '../lib/pricingPlans';
import {
  getCreatorPaymentStatusLabel,
  isStripeConnected,
} from '../lib/billing';
import { getCreatorApplicationsWithBuyerRequests } from '../lib/marketplace';
import './Dashboard.css';

// ─── Safe helpers ──────────────────────────────────────────────────────────────

function safeStr(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb; }
function safeNum(v: unknown, fb = 0): number { const n = Number(v); return isFinite(n) ? n : fb; }
function safeArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

// ─── Shared color maps (from centralized pricing) ─────────────────────────────

const TIER_LABELS = CREATOR_TIER_LABELS;
const TIER_COLORS = CREATOR_TIER_COLORS;

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
  } else if (safeStr(profile.tier, 'free') === 'free') {
    icon = '⬆️'; title = 'Upgrade your creator plan';
    message = 'Free Creator includes basic marketplace access. View plans to compare Professional and Verified options.';
    cta = <Link to="/dashboard/billing" className="dash-nba-btn">View Plans →</Link>;
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

function CreatorMarketplaceOverview({ creatorProfileId }: { creatorProfileId: string }) {
  const [appCount, setAppCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: apps } = await getCreatorApplicationsWithBuyerRequests(creatorProfileId);
      if (cancelled) return;
      const rows = (apps ?? []).filter(Boolean);
      setAppCount(rows.length);
      let sel = 0;
      let pend = 0;
      for (const a of rows) {
        const st = normalizeStatusKey(a?.application_status);
        if (st === 'buyer_selected') sel++;
        if (st === 'submitted' || st === 'shortlisted') pend++;
      }
      setSelectedCount(sel);
      setPendingCount(pend);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [creatorProfileId]);

  return (
    <div className="cd-marketplace-overview" aria-label="Marketplace summary">
      <Link to="/browse" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">{loading ? '…' : '→'}</div>
        <div className="cd-marketplace-overview-label">Available buyer requests</div>
      </Link>
      <Link to="/dashboard/applications" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">{loading ? '…' : appCount}</div>
        <div className="cd-marketplace-overview-label">My applications</div>
      </Link>
      <Link to="/dashboard/applications#my-applications-list" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">{loading ? '…' : pendingCount}</div>
        <div className="cd-marketplace-overview-label">Waiting for buyer</div>
      </Link>
      <Link to="/dashboard" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">{loading ? '…' : selectedCount}</div>
        <div className="cd-marketplace-overview-label">Selected projects</div>
      </Link>
      <Link to="/dashboard/workflows" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">+</div>
        <div className="cd-marketplace-overview-label">Publish a workflow</div>
      </Link>
      <Link to="/messages" className="cd-marketplace-overview-card">
        <div className="cd-marketplace-overview-val">✉</div>
        <div className="cd-marketplace-overview-label">Message buyers</div>
      </Link>
    </div>
  );
}

function CreatorDashboard({
  profile,
  appStatus,
}: {
  profile: CreatorProfileRow;
  appStatus: AppStatus | null;
}) {
  const strength   = analyzeProfileStrength(profile);
  const scoreColor = getStrengthColor(strength.score);
  const tier       = safeStr(profile.tier, 'free') as CreatorTier;
  const approval   = safeStr(profile.approval_status, 'draft');
  const visibility = safeStr(profile.public_profile_status, 'hidden');
  const verif      = safeStr(profile.verification_status, 'unverified');
  const appSt      = appStatus?.status ?? null;
  const tierColor  = TIER_COLORS[tier]  ?? '#8a94a6';
  const warnings   = getCreatorDashboardWarnings(profile, appStatus);

  const visLabel = visibility === 'public' ? '🟢 Public' : visibility === 'paused' ? '⏸ Paused' : '🔴 Hidden';
  const visColor = visibility === 'public' ? '#00d478' : visibility === 'paused' ? '#f9b032' : '#8a94a6';

  const paymentLabel = getCreatorPaymentStatusLabel(
    tier,
    profile.subscription_status,
    approval,
    appSt ?? undefined,
  );
  const paymentSub = tier !== 'free' && !isStripeConnected()
    ? 'Stripe not connected yet'
    : tier === 'free'
      ? 'No subscription required'
      : 'Managed on Billing & Plans';

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
            <StatusBadge display={formatCreatorApprovalStatus(approval)} className="cd-approval-badge" />
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

      <CreatorMarketplaceOverview creatorProfileId={profile.id} />

      <div className="cd-market-banner">
        <div>
          <strong>Your marketplace hub</strong> — apply to open buyer requests, track applications, and open workspaces when
          selected.
        </div>
        <Link to="/browse" className="btn btn-primary btn-sm">
          Browse buyer requests →
        </Link>
      </div>

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
          value={formatCreatorApprovalStatus(approval).label}
          sub="Admin review state"
          color={formatCreatorApprovalStatus(approval).color}
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
          sub={paymentSub}
          color="#8a94a6"
        />
      </div>

      <div className="cd-billing-strip">
        <div className="cd-billing-strip-body">
          <div className="cd-billing-strip-title">
            Current plan: {TIER_LABELS[tier] ?? tier}
          </div>
          <div className="cd-billing-strip-meta">
            <span>Payment: {paymentLabel}</span>
            <span>Approval: {formatCreatorApprovalStatus(approval).label}</span>
            <span>Visibility: {visLabel.replace(/^[^\s]+\s/, '')}</span>
            <span>Profile: {strength.score}/100</span>
          </div>
        </div>
        <Link to="/dashboard/billing" className="btn btn-primary btn-sm">
          View Plans
        </Link>
      </div>

      {/* ── Main two-column section ───────────────────────────────── */}
      <div className="cd-main-grid">

        {/* Left column */}
        <div className="cd-main-left">
          <NextBestActionCard profile={profile} appStatus={appStatus} />
          <ProfileReadinessCard profile={profile} />
        </div>

        {/* Right column */}
        <div className="cd-main-right" id="creator-projects">
          <CreatorProjectsPanel creatorProfileId={profile.id} compact />
          <EarningsPreview completedCount={completedBuilds} avgRating={avgRating} />
        </div>

      </div>

      {/* ── Growth checklist ─────────────────────────────────────── */}
      <GrowthChecklist profile={profile} />

    </div>
  );
}

// ─── Buyer request row type ────────────────────────────────────────────────────

interface BuyerRequest {
  id: string;
  business_name: string;
  build_type: string;
  status: string;
  visibility_status?: string | null;
  created_at: string;
  budget: string | null;
  deadline: string | null;
  main_goal: string | null;
  current_problem?: string | null;
  industry: string | null;
  website_social: string | null;
  style_notes?: string | null;
  applications_count?: number | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  user_id?: string | null;
  source_type?: string | null;
  source_workflow_id?: string | null;
  source_workflow_title?: string | null;
  source_creator_profile_id?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
  archived_at?: string | null;
  canceled_at?: string | null;
  deleted_at?: string | null;
  cancellation_reason?: string | null;
  request_visibility?: string | null;
}

// ─── Buyer status overview cards ───────────────────────────────────────────────

function BuyerStatusOverview({
  requests,
  loadingReqs,
  orderByRequestId,
  deliverables,
}: {
  requests: BuyerRequest[];
  loadingReqs: boolean;
  orderByRequestId: Record<string, OrderPipelineRow>;
  deliverables: Record<string, DeliverablePlaceholder>;
}) {
  if (loadingReqs) {
    return <div className="dash-loading buyer-status-loading">Loading your requests…</div>;
  }

  let waiting = 0;
  let review = 0;
  let selected = 0;
  let inProgress = 0;
  let completed = 0;

  for (const r of requests) {
    const ord = orderByRequestId[r.id];
    const del = ord?.id ? deliverables[ord.id] : null;
    const headline = formatBuyerRequestHeadline(r, ord ?? null, del ?? null);
    const label = headline.label;
    if (label === 'Waiting for creators') waiting++;
    else if (label === 'Review applicants') review++;
    else if (label === 'Creator selected') selected++;
    else if (label === 'Project in progress' || label === 'In progress' || label === 'In review') inProgress++;
    else if (label === 'Completed' || label === 'Delivery submitted') completed++;
  }

  return (
    <div className="buyer-status-row" aria-label="My requests at a glance">
      <div className="buyer-sc">
        <div className="buyer-sc-val">{requests.length}</div>
        <div className="buyer-sc-label">My requests</div>
        <div className="buyer-sc-sub">Total submitted</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: waiting > 0 ? '#f9b032' : undefined }}>{waiting}</div>
        <div className="buyer-sc-label">Waiting for creators</div>
        <div className="buyer-sc-sub">Open to applications</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: review > 0 ? '#63b3ed' : undefined }}>{review}</div>
        <div className="buyer-sc-label">Review applicants</div>
        <div className="buyer-sc-sub">Compare proposals</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: selected > 0 ? '#00d478' : undefined }}>{selected}</div>
        <div className="buyer-sc-label">Creator selected</div>
        <div className="buyer-sc-sub">Assignment confirmed</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: inProgress > 0 ? '#63b3ed' : undefined }}>{inProgress}</div>
        <div className="buyer-sc-label">Project in progress</div>
        <div className="buyer-sc-sub">Active builds</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: completed > 0 ? '#00d478' : undefined }}>{completed}</div>
        <div className="buyer-sc-label">Completed / delivered</div>
        <div className="buyer-sc-sub">Finished MicroBuilds</div>
      </div>
    </div>
  );
}

// ─── Business profile completeness ────────────────────────────────────────────

function BusinessProfilePanel({ requests }: { requests: BuyerRequest[] }) {
  if (requests.length === 0) return null;
  const r = requests[0];
  const missing = getMissingInfoFlags({
    business_name:  r.business_name,
    industry:       r.industry ?? '',
    build_type:     r.build_type,
    main_goal:      r.main_goal ?? '',
    budget:         r.budget,
    deadline:       r.deadline,
    website_social: r.website_social,
  });
  const bizMissing = [
    !r.website_social && 'Website or social profile URL',
    !r.budget         && 'Budget range for future requests',
    !r.deadline       && 'Preferred timeline',
  ].filter(Boolean) as string[];

  if (bizMissing.length === 0 && missing.length === 0) return null;

  return (
    <div className="buyer-profile-panel">
      <h3 className="buyer-panel-title">Complete Your Business Profile</h3>
      <p className="buyer-panel-sub">Adding these details helps us prepare faster, more accurate proposals.</p>
      <div className="buyer-panel-items">
        {bizMissing.map((m) => (
          <div key={m} className="buyer-panel-item">
            <span className="buyer-panel-check">○</span>
            <span>{m}</span>
          </div>
        ))}
      </div>
      <Link to="/request" className="buyer-panel-link">Submit new request with full details →</Link>
    </div>
  );
}

// ─── Buyer Dashboard ───────────────────────────────────────────────────────────

export function BuyerDashboard({
  userProfile,
  mode = 'overview',
}: {
  userProfile: UserProfileRow;
  mode?: 'overview' | 'requests';
}) {
  const [requests,     setRequests]     = useState<BuyerRequest[]>([]);
  const [orders,       setOrders]       = useState<OrderPipelineRow[]>([]);
  const [deliverables, setDeliverables] = useState<Record<string, DeliverablePlaceholder>>({});
  const [loadingReqs,  setLoadingReqs]  = useState(true);
  const [creatorProfileLabels, setCreatorProfileLabels] = useState<Record<string, string>>({});

  const loadBuyerRequests = useCallback(async () => {
    setLoadingReqs(true);
    const email = userProfile.email;
    const uid = userProfile.auth_user_id;

    let q = supabase
      .from('buyer_requests')
      .select(
        'id, business_name, build_type, status, visibility_status, created_at, budget, deadline, main_goal, current_problem, industry, website_social, style_notes, applications_count, application_status, selected_creator_profile_id, selected_request_application_id, user_id, source_type, source_workflow_id, source_workflow_title, source_creator_profile_id, customization_notes, requested_from_workflow, archived_at, canceled_at, deleted_at, cancellation_reason, request_visibility',
      )
      .order('created_at', { ascending: false })
      .limit(20);

    if (uid) {
      q = q.or(`email.eq.${email},user_id.eq.${uid}`);
    } else {
      q = q.eq('email', email);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[Dashboard] buyer_requests load:', error);
      setRequests([]);
      setOrders([]);
      setDeliverables({});
      setCreatorProfileLabels({});
      setLoadingReqs(false);
      return;
    }

    const reqs = (data as BuyerRequest[]) ?? [];

    const creatorIdsForLabels = [
      ...new Set(
        reqs
          .flatMap((r) => [r.source_creator_profile_id, r.selected_creator_profile_id])
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0),
      ),
    ];
    let profileLabels: Record<string, string> = {};
    if (creatorIdsForLabels.length > 0) {
      const { data: cpRows, error: cpErr } = await supabase
        .from('creator_profiles')
        .select('id, display_name, full_name')
        .in('id', creatorIdsForLabels);
      if (cpErr) console.error('[Dashboard] creator_profiles (proposal/source labels):', cpErr);
      for (const row of (cpRows ?? []) as { id: string; display_name?: string | null; full_name?: string | null }[]) {
        const label = safeStr(row.display_name).trim() || safeStr(row.full_name).trim() || 'Creator';
        profileLabels[row.id] = label;
      }
    }
    setCreatorProfileLabels(profileLabels);

    setRequests(reqs);

    if (reqs.length > 0) {
      const ords = await fetchOrdersByRequestIds(reqs.map((r) => r.id));
      setOrders(ords);
      const oids = ords.map((o) => o.id);
      if (oids.length > 0) {
        const dels = await fetchDeliverablesByOrderIds(oids);
        setDeliverables(dels);
      } else {
        setDeliverables({});
      }
    } else {
      setOrders([]);
      setDeliverables({});
    }

    setLoadingReqs(false);
  }, [userProfile.email, userProfile.auth_user_id]);

  useEffect(() => {
    void loadBuyerRequests();
  }, [loadBuyerRequests]);

  const orderByRequestId = useMemo<Record<string, OrderPipelineRow>>(() => {
    const map: Record<string, OrderPipelineRow> = {};
    for (const o of orders) { if (o.request_id) map[o.request_id] = o; }
    return map;
  }, [orders]);

  const displayName = userProfile.display_name ?? userProfile.email.split('@')[0];

  // Buyer AI analysis
  const dashAnalysis = !loadingReqs ? analyzeBuyerDashboard(
    requests.map((r) => ({
      business_name: r.business_name, industry: r.industry ?? '',
      build_type: r.build_type, main_goal: r.main_goal ?? '',
      budget: r.budget, deadline: r.deadline, website_social: r.website_social,
    })),
    requests[0] ? {
      business_name: requests[0].business_name, industry: requests[0].industry ?? '',
      build_type: requests[0].build_type, main_goal: requests[0].main_goal ?? '',
      budget: requests[0].budget, deadline: requests[0].deadline, website_social: requests[0].website_social,
    } : undefined,
  ) : null;

  return (
    <div className="dash-buyer">
      {mode === 'overview' ? (
        <>
          <div className="dash-buyer-header">
            <div>
              <h2 className="dash-buyer-title">Welcome back, {displayName}</h2>
              <p className="dash-buyer-sub">
                Your marketplace overview — open My Requests to review applicants and track delivery.
              </p>
            </div>
            <div className="dash-buyer-actions">
              <Link to="/request" className="btn btn-primary btn-sm">New Request</Link>
              <Link to="/dashboard/requests" className="btn btn-ghost btn-sm">My Requests</Link>
            </div>
          </div>
          <BuyerStatusOverview
            requests={requests}
            loadingReqs={loadingReqs}
            orderByRequestId={orderByRequestId}
            deliverables={deliverables}
          />
          {!loadingReqs && dashAnalysis ? (
            <div className="buyer-rec-section">
              <div className="buyer-rec-card">
                <span className="buyer-rec-icon">💡</span>
                <div className="buyer-rec-body">
                  <div className="buyer-rec-eyebrow">Recommended Next MicroBuild</div>
                  <div className="buyer-rec-build">{dashAnalysis.recommendedBuild}</div>
                  <p className="buyer-rec-reason">{dashAnalysis.recommendedReason}</p>
                </div>
                <Link
                  to={`/request?build=${dashAnalysis.recommendedBuild.toLowerCase().replace(/\s+/g, '-')}`}
                  className="buyer-rec-btn"
                >
                  Request This Build →
                </Link>
              </div>
            </div>
          ) : null}
          {!loadingReqs ? <BusinessProfilePanel requests={requests} /> : null}
          <div className="buyer-section buyer-section--dim">
            <h3 className="buyer-section-title">Quick Actions</h3>
            <div className="buyer-quick-actions">
              <Link to="/request" className="buyer-qa-card"><span>📋</span><span>New Request</span></Link>
              <Link to="/dashboard/requests" className="buyer-qa-card"><span>📋</span><span>My Requests</span></Link>
              <Link to="/browse" className="buyer-qa-card"><span>🔍</span><span>Browse Workflows</span></Link>
            </div>
          </div>
        </>
      ) : null}

      {mode === 'requests' ?
        (
          <>
            <BuyerMyRequestsPanel
              buyerProfile={userProfile}
              requests={requests}
              ordersByRequestId={orderByRequestId}
              deliverablesByOrderId={deliverables}
              creatorProfileLabels={creatorProfileLabels}
              loading={loadingReqs}
              onRefresh={loadBuyerRequests}
            />
            {!loadingReqs && requests.length > 0 ?
              (
                <BuyerProposalSection
                  userProfile={userProfile}
                  requests={requests}
                  ordersByRequestId={orderByRequestId}
                  creatorProfileLabels={creatorProfileLabels}
                />
              )
            : null}
          </>
        )
      : null}
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
      default: {
        const approvalLabel = formatCreatorApprovalStatus(appStatus.status).label;
        return {
          icon: '📋',
          title: `Application status: ${approvalLabel}`,
          color: '#8a94a6',
          message: 'Check back soon for updates on your application.',
        };
      }
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
    <div className="dashboard-page app-workspace">
      <AppPageHeader
        eyebrow={isCreator ? 'Creator workspace' : 'Buyer workspace'}
        title="Overview"
        subtitle={
          isCreator
            ? 'Status, next actions, and a snapshot of applications, projects, and workflows.'
            : 'Your marketplace summary — use My Requests for applicants and delivery tracking.'
        }
      />

      <div className="container dashboard-body">
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
