/**
 * MicroBuild plan entitlements — single source of truth for feature access.
 *
 * SECURITY NOTE (v1): This module drives frontend and helper-level gating only.
 * Before a real paid launch, enforce the same rules via:
 * - Supabase RLS policies keyed on subscription_status / plan columns
 * - Edge Functions for mutations (create request, apply, publish workflow)
 * - Stripe webhooks syncing buyer_plan, creator tier, and subscription_status
 */

import type { AccountType } from '../types/database';
import type { BuyerPlanId, CreatorPlanId } from './pricingPlans';
import { BUYER_PLAN_LABELS, CREATOR_TIER_LABELS } from './pricingPlans';

export type UserRole = AccountType;

export type FeatureKey =
  | 'buyer_create_request'
  | 'buyer_workflow_customization'
  | 'buyer_applicant_review_basic'
  | 'buyer_applicant_review_advanced'
  | 'buyer_ai_request_overview'
  | 'buyer_ai_request_monitor_advanced'
  | 'buyer_project_agreement'
  | 'buyer_messaging'
  | 'buyer_delivery_tracking'
  | 'buyer_request_management_basic'
  | 'buyer_request_management_full'
  | 'buyer_priority_visibility'
  | 'buyer_team_multi_project'
  | 'creator_apply_to_request'
  | 'creator_publish_workflow'
  | 'creator_workflow_ai_review_full'
  | 'creator_analytics_full'
  | 'creator_analytics_basic'
  | 'creator_ai_monitor_full'
  | 'creator_ai_monitor_limited'
  | 'creator_verified_badge'
  | 'creator_priority_visibility'
  | 'creator_buyer_preview_enhanced';

export type PlanUsageCounts = {
  buyerActiveRequests?: number;
  buyerMonthlyRequests?: number;
  creatorApplicationsThisMonth?: number;
  creatorActiveApplications?: number;
  creatorPublishedWorkflows?: number;
};

export type AccessLevel = 'none' | 'limited' | 'basic' | 'full';

export interface BuyerPlanEntitlements {
  planId: BuyerPlanId;
  priceMonthly: number | 'custom';
  activeRequestsLimit: number | null;
  monthlyRequestLimit: number | null;
  workflowCustomization: AccessLevel;
  applicantReview: AccessLevel;
  aiRequestOverview: AccessLevel;
  aiRequestMonitor: AccessLevel;
  projectAgreement: boolean;
  messaging: boolean;
  deliveryTracking: AccessLevel;
  requestManagement: AccessLevel;
  priorityRequestVisibility: boolean;
  teamMultiProject: boolean;
  upgradePitch: string;
}

export interface CreatorPlanEntitlements {
  planId: CreatorPlanId;
  priceMonthly: number;
  applicationsPerMonth: number;
  activeApplicationsLimit: number;
  publishedWorkflows: number;
  workflowAiReview: AccessLevel;
  analytics: AccessLevel;
  aiMonitor: AccessLevel;
  verifiedBadge: boolean;
  priorityVisibility: boolean;
  buyerPreviewEnhanced: boolean;
  upgradePitch: string;
}

const BUYER_ENTITLEMENTS: Record<BuyerPlanId, BuyerPlanEntitlements> = {
  free: {
    planId: 'free',
    priceMonthly: 0,
    activeRequestsLimit: 1,
    monthlyRequestLimit: 1,
    workflowCustomization: 'limited',
    applicantReview: 'basic',
    aiRequestOverview: 'limited',
    aiRequestMonitor: 'none',
    projectAgreement: true,
    messaging: true,
    deliveryTracking: 'basic',
    requestManagement: 'none',
    priorityRequestVisibility: false,
    teamMultiProject: false,
    upgradePitch: 'Good for trying one request. Upgrade for more active requests and AI tools.',
  },
  starter: {
    planId: 'starter',
    priceMonthly: 19,
    activeRequestsLimit: 3,
    monthlyRequestLimit: 5,
    workflowCustomization: 'full',
    applicantReview: 'full',
    aiRequestOverview: 'full',
    aiRequestMonitor: 'limited',
    projectAgreement: true,
    messaging: true,
    deliveryTracking: 'full',
    requestManagement: 'basic',
    priorityRequestVisibility: false,
    teamMultiProject: false,
    upgradePitch: 'Best for small businesses starting to request MicroBuilds.',
  },
  growth: {
    planId: 'growth',
    priceMonthly: 49,
    activeRequestsLimit: 10,
    monthlyRequestLimit: 20,
    workflowCustomization: 'full',
    applicantReview: 'full',
    aiRequestOverview: 'full',
    aiRequestMonitor: 'full',
    projectAgreement: true,
    messaging: true,
    deliveryTracking: 'full',
    requestManagement: 'full',
    priorityRequestVisibility: true,
    teamMultiProject: true,
    upgradePitch: 'Best for businesses managing multiple requests and projects.',
  },
  pro: {
    planId: 'pro',
    priceMonthly: 'custom',
    activeRequestsLimit: null,
    monthlyRequestLimit: null,
    workflowCustomization: 'full',
    applicantReview: 'full',
    aiRequestOverview: 'full',
    aiRequestMonitor: 'full',
    projectAgreement: true,
    messaging: true,
    deliveryTracking: 'full',
    requestManagement: 'full',
    priorityRequestVisibility: true,
    teamMultiProject: true,
    upgradePitch: 'For higher-volume businesses — contact us for custom limits and support.',
  },
};

const CREATOR_ENTITLEMENTS: Record<CreatorPlanId, CreatorPlanEntitlements> = {
  free: {
    planId: 'free',
    priceMonthly: 0,
    applicationsPerMonth: 3,
    activeApplicationsLimit: 3,
    publishedWorkflows: 1,
    workflowAiReview: 'limited',
    analytics: 'basic',
    aiMonitor: 'limited',
    verifiedBadge: false,
    priorityVisibility: false,
    buyerPreviewEnhanced: false,
    upgradePitch: 'Good for testing. Upgrade when you want more applications and workflow publishing.',
  },
  professional: {
    planId: 'professional',
    priceMonthly: 15,
    applicationsPerMonth: 20,
    activeApplicationsLimit: 20,
    publishedWorkflows: 5,
    workflowAiReview: 'full',
    analytics: 'full',
    aiMonitor: 'full',
    verifiedBadge: false,
    priorityVisibility: false,
    buyerPreviewEnhanced: true,
    upgradePitch: 'Best for active creators trying to win buyer projects.',
  },
  verified: {
    planId: 'verified',
    priceMonthly: 25,
    applicationsPerMonth: 50,
    activeApplicationsLimit: 50,
    publishedWorkflows: 15,
    workflowAiReview: 'full',
    analytics: 'full',
    aiMonitor: 'full',
    verifiedBadge: true,
    priorityVisibility: true,
    buyerPreviewEnhanced: true,
    upgradePitch: 'Best for creators who want trust signals and priority visibility.',
  },
};

const BUYER_PLAN_ALIASES: Record<string, BuyerPlanId> = {
  free: 'free',
  'free buyer': 'free',
  starter: 'starter',
  'starter buyer': 'starter',
  growth: 'growth',
  'growth buyer': 'growth',
  pro: 'pro',
  'pro buyer': 'pro',
};

const CREATOR_PLAN_ALIASES: Record<string, CreatorPlanId> = {
  free: 'free',
  'free creator': 'free',
  professional: 'professional',
  pro: 'professional',
  'professional creator': 'professional',
  verified: 'verified',
  'verified creator': 'verified',
};

const FEATURE_REQUIRED_BUYER_PLAN: Partial<Record<FeatureKey, BuyerPlanId>> = {
  buyer_workflow_customization: 'starter',
  buyer_applicant_review_advanced: 'growth',
  buyer_ai_request_overview: 'starter',
  buyer_ai_request_monitor_advanced: 'growth',
  buyer_request_management_basic: 'starter',
  buyer_request_management_full: 'growth',
  buyer_priority_visibility: 'growth',
  buyer_team_multi_project: 'growth',
};

const FEATURE_REQUIRED_CREATOR_PLAN: Partial<Record<FeatureKey, CreatorPlanId>> = {
  creator_workflow_ai_review_full: 'professional',
  creator_analytics_full: 'professional',
  creator_ai_monitor_full: 'professional',
  creator_buyer_preview_enhanced: 'professional',
  creator_verified_badge: 'verified',
  creator_priority_visibility: 'verified',
};

const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = {
  buyer_create_request: 'Create new request',
  buyer_workflow_customization: 'Workflow customization requests',
  buyer_applicant_review_basic: 'Applicant review',
  buyer_applicant_review_advanced: 'Advanced applicant review',
  buyer_ai_request_overview: 'AI Request Overview',
  buyer_ai_request_monitor_advanced: 'Advanced AI Request Monitor',
  buyer_request_management_basic: 'Request management (cancel / archive)',
  buyer_request_management_full: 'Advanced request management',
  buyer_priority_visibility: 'Priority request visibility',
  buyer_team_multi_project: 'Team / multi-project tools',
  creator_apply_to_request: 'Apply to buyer requests',
  creator_publish_workflow: 'Publish workflows',
  creator_workflow_ai_review_full: 'Full workflow AI review',
  creator_analytics_full: 'Full analytics',
  creator_ai_monitor_full: 'Full AI monitor',
  creator_verified_badge: 'Verified badge',
  creator_priority_visibility: 'Priority marketplace visibility',
  creator_buyer_preview_enhanced: 'Enhanced buyer preview',
};

export function normalizePlanName(
  plan: string | null | undefined,
  role: 'buyer' | 'creator',
): BuyerPlanId | CreatorPlanId {
  const raw = (plan ?? '').trim().toLowerCase();
  if (!raw) return role === 'buyer' ? 'free' : 'free';
  if (role === 'buyer') {
    return BUYER_PLAN_ALIASES[raw] ?? 'free';
  }
  return CREATOR_PLAN_ALIASES[raw] ?? 'free';
}

export function getDefaultPlanForRole(role: UserRole): BuyerPlanId | CreatorPlanId {
  if (role === 'creator') return 'free';
  if (role === 'buyer') return 'free';
  return 'free';
}

export function getBuyerPlanEntitlements(plan: BuyerPlanId | string | null | undefined): BuyerPlanEntitlements {
  const id = normalizePlanName(plan ?? 'free', 'buyer') as BuyerPlanId;
  return BUYER_ENTITLEMENTS[id] ?? BUYER_ENTITLEMENTS.free;
}

export function getCreatorPlanEntitlements(plan: CreatorPlanId | string | null | undefined): CreatorPlanEntitlements {
  const id = normalizePlanName(plan ?? 'free', 'creator') as CreatorPlanId;
  return CREATOR_ENTITLEMENTS[id] ?? CREATOR_ENTITLEMENTS.free;
}

function buyerHasFeature(ent: BuyerPlanEntitlements, key: FeatureKey): boolean {
  switch (key) {
    case 'buyer_create_request':
      return true;
    case 'buyer_workflow_customization':
      return ent.workflowCustomization === 'full';
    case 'buyer_applicant_review_basic':
      return ent.applicantReview !== 'none';
    case 'buyer_applicant_review_advanced':
      return ent.applicantReview === 'full';
    case 'buyer_ai_request_overview':
      return ent.aiRequestOverview === 'full' || ent.aiRequestOverview === 'limited';
    case 'buyer_ai_request_monitor_advanced':
      return ent.aiRequestMonitor === 'full';
    case 'buyer_project_agreement':
      return ent.projectAgreement;
    case 'buyer_messaging':
      return ent.messaging;
    case 'buyer_delivery_tracking':
      return ent.deliveryTracking !== 'none';
    case 'buyer_request_management_basic':
      return ent.requestManagement === 'basic' || ent.requestManagement === 'full';
    case 'buyer_request_management_full':
      return ent.requestManagement === 'full';
    case 'buyer_priority_visibility':
      return ent.priorityRequestVisibility;
    case 'buyer_team_multi_project':
      return ent.teamMultiProject;
    default:
      return false;
  }
}

function creatorHasFeature(ent: CreatorPlanEntitlements, key: FeatureKey): boolean {
  switch (key) {
    case 'creator_apply_to_request':
      return true;
    case 'creator_publish_workflow':
      return true;
    case 'creator_workflow_ai_review_full':
      return ent.workflowAiReview === 'full';
    case 'creator_analytics_basic':
      return ent.analytics !== 'none';
    case 'creator_analytics_full':
      return ent.analytics === 'full';
    case 'creator_ai_monitor_limited':
      return ent.aiMonitor === 'limited' || ent.aiMonitor === 'full';
    case 'creator_ai_monitor_full':
      return ent.aiMonitor === 'full';
    case 'creator_verified_badge':
      return ent.verifiedBadge;
    case 'creator_priority_visibility':
      return ent.priorityVisibility;
    case 'creator_buyer_preview_enhanced':
      return ent.buyerPreviewEnhanced;
    default:
      return false;
  }
}

function usageBlocksFeature(
  role: UserRole,
  plan: string,
  key: FeatureKey,
  usage: PlanUsageCounts,
): boolean {
  if (role === 'buyer') {
    const ent = getBuyerPlanEntitlements(plan);
    if (key === 'buyer_create_request') {
      const active = usage.buyerActiveRequests ?? 0;
      const monthly = usage.buyerMonthlyRequests ?? 0;
      if (ent.activeRequestsLimit != null && active >= ent.activeRequestsLimit) return true;
      if (ent.monthlyRequestLimit != null && monthly >= ent.monthlyRequestLimit) return true;
    }
    return false;
  }

  if (role === 'creator') {
    const ent = getCreatorPlanEntitlements(plan);
    if (key === 'creator_apply_to_request') {
      const monthly = usage.creatorApplicationsThisMonth ?? 0;
      if (monthly >= ent.applicationsPerMonth) return true;
      const active = usage.creatorActiveApplications ?? 0;
      if (active >= ent.activeApplicationsLimit) return true;
    }
    if (key === 'creator_publish_workflow') {
      const published = usage.creatorPublishedWorkflows ?? 0;
      if (published >= ent.publishedWorkflows) return true;
    }
    return false;
  }

  return false;
}

export function canUseFeature(
  userRole: UserRole,
  plan: string | null | undefined,
  featureKey: FeatureKey,
  usageCounts: PlanUsageCounts = {},
): boolean {
  if (userRole === 'admin') return true;

  const normalized =
    userRole === 'buyer'
      ? normalizePlanName(plan, 'buyer')
      : normalizePlanName(plan, 'creator');

  if (usageBlocksFeature(userRole, normalized, featureKey, usageCounts)) {
    return false;
  }

  if (userRole === 'buyer') {
    return buyerHasFeature(getBuyerPlanEntitlements(normalized), featureKey);
  }

  if (userRole === 'creator') {
    return creatorHasFeature(getCreatorPlanEntitlements(normalized), featureKey);
  }

  return false;
}

export function getRequiredPlanForFeature(
  userRole: UserRole,
  featureKey: FeatureKey,
): BuyerPlanId | CreatorPlanId | null {
  if (userRole === 'buyer') {
    return FEATURE_REQUIRED_BUYER_PLAN[featureKey] ?? null;
  }
  if (userRole === 'creator') {
    return FEATURE_REQUIRED_CREATOR_PLAN[featureKey] ?? null;
  }
  return null;
}

export function getUpgradeMessage(featureKey: FeatureKey, requiredPlan: string): string {
  const label = FEATURE_LABELS[featureKey] ?? 'This feature';
  const planName =
    requiredPlan in BUYER_PLAN_LABELS
      ? `${BUYER_PLAN_LABELS[requiredPlan as BuyerPlanId]} Buyer`
      : requiredPlan in CREATOR_TIER_LABELS
        ? `${CREATOR_TIER_LABELS[requiredPlan as CreatorPlanId]} Creator`
        : requiredPlan;

  if (featureKey === 'buyer_create_request') {
    return `You've reached your request limit on your current plan. Upgrade to ${planName} to open more requests.`;
  }
  if (featureKey === 'creator_apply_to_request') {
    return `You reached your Free Creator application limit. Upgrade to ${planName} to apply to more buyer requests.`;
  }
  if (featureKey === 'creator_publish_workflow') {
    return `You've reached your published workflow limit. Upgrade to ${planName} to publish more workflows.`;
  }

  return `${label} is available on ${planName} and above. Upgrade to unlock it.`;
}

export function getPlanLimitLabel(
  plan: string | null | undefined,
  featureKey: FeatureKey,
  usageCounts: PlanUsageCounts = {},
  role: 'buyer' | 'creator' = 'buyer',
): string {
  const normalized = normalizePlanName(plan, role);

  if (role === 'buyer') {
    const ent = getBuyerPlanEntitlements(normalized);
    if (featureKey === 'buyer_create_request') {
      const active = usageCounts.buyerActiveRequests ?? 0;
      const monthly = usageCounts.buyerMonthlyRequests ?? 0;
      const activeCap = ent.activeRequestsLimit == null ? '∞' : String(ent.activeRequestsLimit);
      const monthlyCap = ent.monthlyRequestLimit == null ? '∞' : String(ent.monthlyRequestLimit);
      return `${active} / ${activeCap} active · ${monthly} / ${monthlyCap} this month`;
    }
    return '';
  }

  const ent = getCreatorPlanEntitlements(normalized);
  if (featureKey === 'creator_apply_to_request') {
    const used = usageCounts.creatorApplicationsThisMonth ?? 0;
    return `${used} / ${ent.applicationsPerMonth} applications this month`;
  }
  if (featureKey === 'creator_publish_workflow') {
    const pub = usageCounts.creatorPublishedWorkflows ?? 0;
    return `${pub} / ${ent.publishedWorkflows} published workflows`;
  }
  return '';
}

export function getPlanDisplayName(
  role: 'buyer' | 'creator',
  plan: string | null | undefined,
): string {
  const id = normalizePlanName(plan, role);
  if (role === 'buyer') return BUYER_PLAN_LABELS[id as BuyerPlanId] ?? 'Free';
  return CREATOR_TIER_LABELS[id as CreatorPlanId] ?? 'Free';
}

export function getLockedFeaturesForPlan(
  role: 'buyer' | 'creator',
  plan: string | null | undefined,
): string[] {
  if (role === 'buyer') {
    const id = normalizePlanName(plan, 'buyer') as BuyerPlanId;
    const checks: { key: FeatureKey; label: string }[] = [
      { key: 'buyer_ai_request_overview', label: 'AI Request Overview (full)' },
      { key: 'buyer_ai_request_monitor_advanced', label: 'Advanced AI Request Monitor' },
      { key: 'buyer_request_management_basic', label: 'Cancel / archive requests' },
      { key: 'buyer_request_management_full', label: 'Full request management' },
      { key: 'buyer_priority_visibility', label: 'Priority request visibility' },
      { key: 'buyer_team_multi_project', label: 'Team / multi-project view' },
    ];
    return checks.filter((c) => !buyerHasFeature(getBuyerPlanEntitlements(id), c.key)).map((c) => c.label);
  }

  const id = normalizePlanName(plan, 'creator') as CreatorPlanId;
  const checks: { key: FeatureKey; label: string }[] = [
    { key: 'creator_analytics_full', label: 'Full analytics' },
    { key: 'creator_ai_monitor_full', label: 'Full AI monitor' },
    { key: 'creator_workflow_ai_review_full', label: 'Full workflow AI review' },
    { key: 'creator_verified_badge', label: 'Verified badge' },
    { key: 'creator_priority_visibility', label: 'Priority visibility' },
  ];
  return checks.filter((c) => !creatorHasFeature(getCreatorPlanEntitlements(id), c.key)).map((c) => c.label);
}

/** Features that must remain available for in-flight projects (never hard-block). */
export const SAFETY_ALWAYS_AVAILABLE: readonly string[] = [
  'View existing requests and applications',
  'Messaging on active requests and projects',
  'Project agreements on selected projects',
  'Delivery review on active projects',
  'Cancel / archive / delete when needed for safety',
  'Edit workflow drafts and unpublish existing workflows',
  'Finish obligations on selected projects',
];

export function isBuyerAiOverviewLimited(plan: BuyerPlanId | string | null | undefined): boolean {
  const ent = getBuyerPlanEntitlements(plan);
  return ent.aiRequestOverview === 'limited';
}

export function isBuyerAiOverviewLocked(plan: BuyerPlanId | string | null | undefined): boolean {
  const ent = getBuyerPlanEntitlements(plan);
  return ent.aiRequestOverview === 'none';
}

export function resolveBuyerPlanFromProfile(
  profile: { buyer_plan?: string | null } | null | undefined,
): BuyerPlanId {
  return normalizePlanName(profile?.buyer_plan, 'buyer') as BuyerPlanId;
}

export function resolveCreatorPlanFromProfile(
  creatorProfile: { tier?: string | null } | null | undefined,
  userProfile?: { creator_plan?: string | null } | null,
): CreatorPlanId {
  const fromCreator = creatorProfile?.tier;
  const fromUser = userProfile?.creator_plan;
  if (fromCreator) return normalizePlanName(fromCreator, 'creator') as CreatorPlanId;
  if (fromUser) return normalizePlanName(fromUser, 'creator') as CreatorPlanId;
  return 'free';
}
