/**
 * Billing helpers — Stripe-ready placeholders. No real checkout until backend is connected.
 */

import type { CreatorTier } from '../types';
import type { CreatorProfileRow } from '../types/database';
import {
  CREATOR_TIER_LABELS,
  getCreatorPlan,
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
