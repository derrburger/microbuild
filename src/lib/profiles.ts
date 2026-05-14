/**
 * MicroBuild — Profile System Helpers
 *
 * Rule-based helpers for creator profiles. No external AI API is used.
 * All scoring and summaries are deterministic from profile data.
 */

import type { CreatorProfileRow, CreatorProfileInsert, CreatorApplicationRow } from '../types/database';
import type { CreatorTier, ProfileApprovalStatus, PublicProfileStatus, VerificationStatus } from '../types';

// ─── Safe accessors ───────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeCreatorProfile(raw: Record<string, unknown>): CreatorProfileRow {
  return {
    id:                      safeStr(raw.id, 'unknown'),
    user_id:                 raw.user_id != null ? safeStr(raw.user_id) : null,
    auth_user_id:            raw.auth_user_id != null ? safeStr(raw.auth_user_id) : null,
    user_profile_id:         raw.user_profile_id != null ? safeStr(raw.user_profile_id) : null,
    creator_application_id:  raw.creator_application_id != null ? safeStr(raw.creator_application_id) : null,
    display_name:            raw.display_name != null ? safeStr(raw.display_name) : null,
    full_name:               safeStr(raw.full_name, 'Unknown Creator'),
    profile_photo_url:       raw.profile_photo_url != null ? safeStr(raw.profile_photo_url) : null,
    slug:                    raw.slug != null ? safeStr(raw.slug) : null,
    bio:                     raw.bio != null ? safeStr(raw.bio) : null,
    tier:                    (safeStr(raw.tier, 'free')) as CreatorTier,
    verification_status:     (safeStr(raw.verification_status, 'unverified')) as VerificationStatus,
    approval_status:         (safeStr(raw.approval_status, 'draft')) as ProfileApprovalStatus,
    subscription_status:     safeStr(raw.subscription_status, 'not_required') as CreatorProfileRow['subscription_status'],
    public_profile_status:   (safeStr(raw.public_profile_status, 'hidden')) as PublicProfileStatus,
    badges:                  safeArr<string>(raw.badges),
    tools:                   safeArr<string>(raw.tools),
    niches:                  safeArr<string>(raw.niches),
    portfolio_links:         safeArr<string>(raw.portfolio_links),
    credential_links:        safeArr<string>(raw.credential_links),
    certifications:          safeArr<string>(raw.certifications),
    proof_links:             safeArr<string>(raw.proof_links),
    education_or_coursework: raw.education_or_coursework != null ? safeStr(raw.education_or_coursework) : null,
    github_url:              raw.github_url != null ? safeStr(raw.github_url) : null,
    linkedin_url:            raw.linkedin_url != null ? safeStr(raw.linkedin_url) : null,
    case_studies:            raw.case_studies != null ? safeStr(raw.case_studies) : null,
    portfolio_url:           raw.portfolio_url != null ? safeStr(raw.portfolio_url) : null,
    skills:                  safeArr<string>(raw.skills),
    available_hours:         safeStr(raw.available_hours, ''),
    is_active:               Boolean(raw.is_active ?? true),
    admin_notes:             raw.admin_notes != null ? safeStr(raw.admin_notes) : null,
    ai_profile_score:        raw.ai_profile_score != null ? safeNum(raw.ai_profile_score) : null,
    ai_profile_summary:      raw.ai_profile_summary != null ? safeStr(raw.ai_profile_summary) : null,
    completed_builds_count:  safeNum(raw.completed_builds_count, 0),
    average_rating:          raw.average_rating != null ? safeNum(raw.average_rating) : null,
    rating:                  safeNum(raw.rating, 0),
    builds_completed:        safeNum(raw.builds_completed, 0),
    created_at:              safeStr(raw.created_at, new Date().toISOString()),
    updated_at:              safeStr(raw.updated_at, new Date().toISOString()),
  };
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

export function getCreatorTierLabel(tier: CreatorTier | string): string {
  switch (tier) {
    case 'professional': return 'Professional';
    case 'verified':     return 'Verified';
    default:             return 'Free';
  }
}

export function getVerificationLabel(status: VerificationStatus | string): string {
  switch (status) {
    case 'pending':  return 'Verification Pending';
    case 'verified': return 'Verified ✓';
    case 'rejected': return 'Verification Rejected';
    default:         return 'Not Verified';
  }
}

export function getProfileVisibilityLabel(status: PublicProfileStatus | string): string {
  switch (status) {
    case 'public': return 'Public';
    case 'paused': return 'Paused';
    default:       return 'Hidden';
  }
}

export function getApprovalStatusLabel(status: ProfileApprovalStatus | string): string {
  switch (status) {
    case 'approved_pending_payment': return 'Approved — Pending Payment';
    case 'active':                   return 'Active';
    case 'hidden':                   return 'Hidden';
    case 'suspended':                return 'Suspended';
    case 'rejected':                 return 'Rejected';
    default:                         return 'Draft';
  }
}

// ─── Badge computation ────────────────────────────────────────────────────────

export function getCreatorBadges(profile: Pick<CreatorProfileRow, 'tier' | 'verification_status' | 'completed_builds_count' | 'average_rating'>): string[] {
  const badges: string[] = [];

  if (profile.tier === 'verified' && profile.verification_status === 'verified') {
    badges.push('Verified Creator ✓');
  } else if (profile.tier === 'professional') {
    badges.push('MicroBuild Pro');
  } else {
    badges.push('MicroBuild Creator');
  }

  const builds = profile.completed_builds_count ?? 0;
  if (builds >= 25)      badges.push('25+ Builds');
  else if (builds >= 10) badges.push('10+ Builds');
  else if (builds >= 5)  badges.push('5+ Builds');

  const rating = profile.average_rating ?? 0;
  if (rating >= 4.8 && builds >= 3) badges.push('Top Rated');

  return badges;
}

// ─── Slug generation ──────────────────────────────────────────────────────────

export function generateCreatorSlug(displayName: string, id: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return `${base || 'creator'}-${id.slice(0, 8)}`;
}

// ─── Profile preview from application data ────────────────────────────────────
// Builds a "preview" of how the creator profile would look from their application,
// before a real creator_profiles row is created.

export interface CreatorProfilePreview {
  displayName: string;
  tier: CreatorTier;
  tierLabel: string;
  tierColor: string;
  tools: string[];
  niches: string[];
  portfolioLinks: string[];
  githubUrl: string | null;
  linkedinUrl: string | null;
  availableHours: string;
  fulfillmentSpeed: string | null;
  suggestedBadges: string[];
  missingProfileInfo: string[];
  recommendedApprovalPath: string;
  aiProfileScore: number;
  approvalStatus: ProfileApprovalStatus;
  subscriptionStatus: CreatorProfileRow['subscription_status'];
  verificationStatus: VerificationStatus;
  publicProfileStatus: PublicProfileStatus;
}

const TIER_COLORS: Record<string, string> = {
  free:         '#8a94a6',
  professional: '#63b3ed',
  verified:     '#f9b032',
};

export function normalizeCreatorApplicationToProfilePreview(
  app: CreatorApplicationRow,
  fitScore: number,
): CreatorProfilePreview {
  const tier = (safeStr(app.tier, 'free')) as CreatorTier;
  const tools = safeArr<string>(app.tools);
  const niches = safeArr<string>(app.niches);

  const portfolioLinks: string[] = [
    app.portfolio_url,
    app.portfolio_url_2,
    ...safeArr<string>(app.credential_links),
  ].filter(Boolean) as string[];

  // Compute missing info
  const missing: string[] = [];
  if (!app.portfolio_url) missing.push('Portfolio URL');
  if (tools.length === 0)  missing.push('Tool list');
  if (niches.length === 0) missing.push('Niche specializations');
  if (!app.message)        missing.push('Personal statement');
  if (tier === 'professional') {
    if (!app.top_projects) missing.push('Top project descriptions');
  }
  if (tier === 'verified') {
    if (!app.github_url && !app.linkedin_url) missing.push('Professional profile link (GitHub or LinkedIn)');
    if (!app.certifications && safeArr(app.credential_links).length === 0) missing.push('Credentials or certifications');
    if (!app.case_studies) missing.push('Case studies');
  }

  // Compute suggested badges
  const suggestedBadges: string[] = [];
  if (tier === 'verified' && fitScore >= 65 && app.github_url) {
    suggestedBadges.push('Verified Creator ✓');
  } else if (tier === 'professional' && fitScore >= 55) {
    suggestedBadges.push('MicroBuild Pro');
  } else {
    suggestedBadges.push('MicroBuild Creator');
  }

  // Compute recommended approval path
  let recommendedApprovalPath: string;
  if (missing.length >= 3) {
    recommendedApprovalPath = 'Needs more info before approval decision';
  } else if (tier === 'verified') {
    recommendedApprovalPath = fitScore >= 65
      ? 'Approve as Verified — set status to approved_pending_payment'
      : 'Request additional verified-tier proof before approving';
  } else if (tier === 'professional') {
    recommendedApprovalPath = fitScore >= 55
      ? 'Approve as Professional — set status to approved_pending_payment'
      : 'Request portfolio review before approving at Pro tier';
  } else {
    recommendedApprovalPath = fitScore >= 50
      ? 'Approve as Free Creator — activate account'
      : 'Request portfolio before final approval';
  }

  // New profiles always start as draft; admin explicitly activates them
  // via the admin UI after reviewing the application.
  const approvalStatus: ProfileApprovalStatus = 'draft';
  const subscriptionStatus: CreatorProfileRow['subscription_status'] =
    tier === 'free' ? 'not_required' : 'not_started';
  const verificationStatus: VerificationStatus =
    tier === 'verified' ? 'pending' : 'unverified';

  return {
    displayName:           safeStr(app.full_name, 'Unknown'),
    tier,
    tierLabel:             getCreatorTierLabel(tier),
    tierColor:             TIER_COLORS[tier] ?? '#8a94a6',
    tools,
    niches,
    portfolioLinks,
    githubUrl:             app.github_url ?? null,
    linkedinUrl:           app.linkedin_url ?? null,
    availableHours:        safeStr(app.available_hours, 'Not specified'),
    fulfillmentSpeed:      app.fulfillment_speed ?? null,
    suggestedBadges,
    missingProfileInfo:    missing,
    recommendedApprovalPath,
    aiProfileScore:        fitScore,
    approvalStatus,
    subscriptionStatus,
    verificationStatus,
    publicProfileStatus:   'hidden',
  };
}

// ─── AI-style profile summary (rule-based, no external API) ──────────────────

export function generateCreatorProfileAISummary(
  profile: CreatorProfilePreview,
): string {
  const toolStr  = profile.tools.length > 0
    ? profile.tools.slice(0, 4).join(', ')
    : 'various tools';
  const nicheStr = profile.niches.length > 0
    ? profile.niches.slice(0, 3).join(', ')
    : 'local service businesses';

  const tierNote =
    profile.tier === 'verified'
      ? 'Verified-tier applicant with submitted credentials and professional proof.'
      : profile.tier === 'professional'
      ? 'Professional-tier applicant with portfolio and project history.'
      : 'Free-tier applicant with basic portfolio and availability.';

  const scoreNote =
    profile.aiProfileScore >= 70
      ? 'Strong overall application — high confidence in quality delivery.'
      : profile.aiProfileScore >= 50
      ? 'Good baseline application — minor gaps that can be addressed after approval.'
      : 'Developing application — review portfolio before approving.';

  const missingNote = profile.missingProfileInfo.length > 0
    ? ` Missing: ${profile.missingProfileInfo.slice(0, 3).join(', ')}.`
    : ' Profile information is complete.';

  return [
    `${profile.displayName} is a ${profile.tierLabel} Creator applicant`,
    `specializing in ${nicheStr} using ${toolStr}.`,
    tierNote,
    scoreNote + missingNote,
    `Recommended: ${profile.recommendedApprovalPath}.`,
  ].join(' ');
}

// ─── Build profile insert payload from creator application ───────────────────

export function buildCreatorProfileInsert(
  app: CreatorApplicationRow,
  fitScore: number,
): CreatorProfileInsert {
  const tier    = (safeStr(app.tier, 'free')) as CreatorTier;
  const tools   = safeArr<string>(app.tools);
  const niches  = safeArr<string>(app.niches);
  const name    = safeStr(app.full_name, 'Unknown Creator');
  const id_stub = app.id.slice(0, 8);
  const slug    = generateCreatorSlug(name, app.id);

  const portfolioLinks: string[] = [
    app.portfolio_url,
    app.portfolio_url_2,
  ].filter(Boolean) as string[];

  const certArr: string[] = app.certifications
    ? [app.certifications]
    : [];

  const preview  = normalizeCreatorApplicationToProfilePreview(app, fitScore);
  const summary  = generateCreatorProfileAISummary(preview);

  void id_stub; // used in slug above

  return {
    creator_application_id: app.id,
    user_id:                 null,
    display_name:            name,
    full_name:               name,
    slug,
    bio:                     safeStr(app.message) || safeStr(app.experience).slice(0, 280) || null,
    tier,
    verification_status:     preview.verificationStatus,
    approval_status:         preview.approvalStatus,
    subscription_status:     preview.subscriptionStatus,
    public_profile_status:   'hidden',
    badges:                  preview.suggestedBadges,
    tools,
    niches,
    portfolio_links:         portfolioLinks,
    credential_links:        safeArr<string>(app.credential_links),
    certifications:          certArr,
    proof_links:             [],
    education_or_coursework: null,
    github_url:              app.github_url ?? null,
    linkedin_url:            app.linkedin_url ?? null,
    case_studies:            app.case_studies ?? null,
    portfolio_url:           app.portfolio_url ?? null,
    skills:                  tools,
    available_hours:         safeStr(app.available_hours, ''),
    is_active:               false,
    ai_profile_score:        fitScore,
    ai_profile_summary:      summary,
    completed_builds_count:  0,
    average_rating:          null,
  };
}
