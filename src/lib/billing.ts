/**
 * Billing helpers — Stripe-ready placeholders. No real checkout until backend is connected.
 */

import type { CreatorTier } from '../types';
import type { CreatorProfileRow, UserProfileRow } from '../types/database';
import {
  getBuyerPlanEntitlements,
  getCreatorPlanEntitlements,
  getLockedFeaturesForPlan,
  getPlanLimitLabel,
  resolveBuyerPlanFromProfile,
  resolveCreatorPlanFromProfile,
  type PlanUsageCounts,
} from './entitlements';
import {
  BUYER_PLAN_LABELS,
  CREATOR_TIER_LABELS,
  getBuyerPlan,
  getCreatorPlan,
  type BuyerPlanId,
  type CreatorPlanId,
} from './pricingPlans';
import { formatCreatorApprovalStatus } from './statusLabels';

export type StripeConnectionStatus = 'not_connected' | 'connected';

/** Stripe is not connected in this phase — flip when backend is ready. */
export const STRIPE_STATUS: StripeConnectionStatus = 'not_connected';

export function isStripeConnected(): boolean {
  return STRIPE_STATUS === 'connected';
}

export function getStripeStatusLabel(): string {
  return isStripeConnected() ? 'Stripe connected' : 'Stripe not connected yet';
}

export type BillingActionResult =
  | { ok: true; redirectUrl?: string }
  | { ok: false; message: string };

/** Future: redirect to Stripe Checkout for buyer subscription. */
export function startBuyerCheckout(_planId: BuyerPlanId): BillingActionResult {
  if (_planId === 'free' || _planId === 'pro') {
    return { ok: false, message: 'This plan does not use checkout here.' };
  }
  if (!isStripeConnected()) {
    return {
      ok: false,
      message: 'Checkout coming soon — Stripe is not connected yet.',
    };
  }
  return { ok: false, message: 'Checkout is not configured yet.' };
}

/** Future: redirect to Stripe Checkout for creator subscription. */
export function startCreatorCheckout(_planId: CreatorPlanId): BillingActionResult {
  if (!isStripeConnected()) {
    return {
      ok: false,
      message: 'Checkout coming soon — Stripe is not connected yet.',
    };
  }
  return {
    ok: false,
    message: 'Checkout is not configured yet.',
  };
}

/** Future: open Stripe Customer Portal for subscription management. */
export function openBillingPortal(): BillingActionResult {
  if (!isStripeConnected()) {
    return {
      ok: false,
      message: 'Billing portal coming soon — Stripe is not connected yet.',
    };
  }
  return {
    ok: false,
    message: 'Billing portal is not configured yet.',
  };
}

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export function getCreatorPaymentStatusLabel(
  tier: CreatorTier,
  subscriptionStatus?: string | null,
  approvalStatus?: string | null,
  applicationStatus?: string | null,
): string {
  if (tier === 'free') return 'Not required';

  const appSt = safeStr(applicationStatus);
  if (appSt === 'approved_pending_payment') return 'Setup coming soon';

  const sub = safeStr(subscriptionStatus, 'not_started');
  if (sub === 'active') return isStripeConnected() ? 'Active' : 'Active (Stripe pending)';
  if (sub === 'pending_payment') return 'Setup coming soon';
  if (sub === 'past_due') return 'Past due';
  if (sub === 'canceled') return 'Canceled';

  const approval = safeStr(approvalStatus, 'draft');
  if (approval === 'active' || approval === 'approved') {
    return isStripeConnected() ? 'Subscription required' : 'Stripe not connected yet';
  }

  return 'Not yet set up';
}

export type BillingStatusState = {
  headline: string;
  message: string;
  showUpgradeProfessional: boolean;
  showApplyVerified: boolean;
  showManageBilling: boolean;
  stripeNotice: string;
};

export function getCreatorBillingStatus(
  profile: Pick<
    CreatorProfileRow,
    'tier' | 'approval_status' | 'subscription_status' | 'public_profile_status' | 'verification_status'
  > | null,
): BillingStatusState {
  const tier = (profile?.tier ?? 'free') as CreatorPlanId;
  const plan = getCreatorPlan(tier);
  const planName = plan?.shortName ?? CREATOR_TIER_LABELS[tier] ?? 'Free';
  const stripeNotice = isStripeConnected()
    ? 'Checkout is available when you upgrade.'
    : 'Billing is not connected yet. Plans are visible now. Checkout will activate when Stripe is connected.';

  const base: BillingStatusState = {
    headline: `Current plan: ${planName}`,
    message: '',
    showUpgradeProfessional: tier === 'free',
    showApplyVerified: tier !== 'verified',
    showManageBilling: tier !== 'free',
    stripeNotice,
  };

  if (!isStripeConnected() && tier !== 'free') {
    base.message = 'Your plan is selected, but Stripe is not connected yet. No charges will occur until checkout is live.';
    return base;
  }

  if (tier === 'free') {
    base.message =
      'Upgrade for more workflow publishing and applications. Verified requires admin approval.';
    return base;
  }

  if (tier === 'professional') {
    base.message =
      'Professional Creator unlocks more applications, workflows, analytics, and AI monitor access.';
    return base;
  }

  base.message =
    'Verified Creator includes a verified badge (after admin approval) and priority buyer trust placement.';
  return base;
}

export function getCreatorApprovalDisplay(approvalStatus?: string | null): string {
  return formatCreatorApprovalStatus(approvalStatus).label;
}

export function getPublicProfileDisplay(status?: string | null): string {
  const s = safeStr(status, 'hidden');
  if (s === 'public') return 'Public';
  if (s === 'paused') return 'Paused';
  return 'Hidden';
}

export function getVerificationDisplay(status?: string | null): string {
  const s = safeStr(status, 'unverified').replace(/_/g, ' ');
  if (s === 'verified') return 'Verified';
  if (s === 'pending') return 'Pending review';
  return 'Not verified';
}

/** Default buyer plan when profile is unavailable. */
export function getDefaultBuyerPlanId(): BuyerPlanId {
  return 'free';
}

/** Resolve buyer plan from user_profiles.buyer_plan (falls back to free). */
export function resolveBuyerPlanId(profile: UserProfileRow | null | undefined): BuyerPlanId {
  return resolveBuyerPlanFromProfile(profile);
}

/** Resolve creator plan from creator_profiles.tier (canonical) or user_profiles.creator_plan. */
export function resolveCreatorPlanId(
  creatorProfile: Pick<CreatorProfileRow, 'tier'> | null | undefined,
  userProfile?: UserProfileRow | null,
): CreatorPlanId {
  return resolveCreatorPlanFromProfile(creatorProfile, userProfile);
}

export type PlanUsageSummary = {
  buyer?: { active: string; monthly: string; locked: string[] };
  creator?: {
    applications: string;
    workflows: string;
    locked: string[];
  };
};

export function getPlanUsageSummary(
  role: 'buyer' | 'creator',
  plan: string,
  usage: PlanUsageCounts,
): PlanUsageSummary {
  if (role === 'buyer') {
    return {
      buyer: {
        active: getPlanLimitLabel(plan, 'buyer_create_request', usage, 'buyer'),
        monthly: getPlanLimitLabel(plan, 'buyer_create_request', usage, 'buyer'),
        locked: getLockedFeaturesForPlan('buyer', plan),
      },
    };
  }
  return {
    creator: {
      applications: getPlanLimitLabel(plan, 'creator_apply_to_request', usage, 'creator'),
      workflows: getPlanLimitLabel(plan, 'creator_publish_workflow', usage, 'creator'),
      locked: getLockedFeaturesForPlan('creator', plan),
    },
  };
}

export function getBuyerPlanUpgradeReason(planId: BuyerPlanId): string {
  return getBuyerPlanEntitlements(planId).upgradePitch;
}

export function getCreatorPlanUpgradeReason(planId: CreatorPlanId): string {
  return getCreatorPlanEntitlements(planId).upgradePitch;
}

export function getBuyerPaymentStatusLabel(planId: BuyerPlanId = 'free'): string {
  if (planId === 'free') return 'Not required';
  if (!isStripeConnected()) return 'Checkout not active yet';
  return 'Subscription required';
}

export type BuyerBillingStatusState = {
  headline: string;
  message: string;
  showUpgradeStarter: boolean;
  showUpgradeGrowth: boolean;
  showContactPro: boolean;
  showManageBilling: boolean;
  stripeNotice: string;
};

export function getBuyerBillingStatus(planId: BuyerPlanId = 'free'): BuyerBillingStatusState {
  const plan = getBuyerPlan(planId);
  const planName = plan?.shortName ?? BUYER_PLAN_LABELS[planId] ?? 'Free';
  const stripeNotice = isStripeConnected()
    ? 'Checkout is available when you upgrade.'
    : 'Checkout not active yet — Stripe is not connected. Plans are visible now.';

  return {
    headline: `Current plan: ${planName} Buyer`,
    message:
      planId === 'free'
        ? 'Buyer accounts can request and manage MicroBuilds. Upgrade for more active requests, AI overview, and advanced management.'
        : 'Your plan is selected. No charges until Stripe checkout is live.',
    showUpgradeStarter: planId === 'free',
    showUpgradeGrowth: planId === 'free' || planId === 'starter',
    showContactPro: planId !== 'pro',
    showManageBilling: planId !== 'free',
    stripeNotice,
  };
}
