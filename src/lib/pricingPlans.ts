/**
 * Centralized pricing — buyer subscription plans and creator subscription plans.
 * Import from here instead of hardcoding prices across pages.
 */

import type { CreatorTier } from '../types';

export type BuyerPlanId = 'free' | 'starter' | 'growth' | 'pro';
export type CreatorPlanId = CreatorTier;

export interface BuyerPricingPlan {
  id: BuyerPlanId;
  name: string;
  shortName: string;
  priceMonthly: number | 'custom';
  priceLabel: string;
  description: string;
  features: string[];
  cta: string;
  /** Safe route when Stripe checkout is not active */
  ctaPath: string;
  highlighted?: boolean;
}

export interface CreatorPlanLimits {
  applicationsPerMonth: number;
  publishedWorkflows: number;
  analyticsAccess: boolean;
  aiMonitor: boolean;
  verifiedBadge: boolean;
  buyerTrustSignals: string;
  profileLevel: string;
}

export interface CreatorPricingPlan {
  id: CreatorPlanId;
  name: string;
  shortName: string;
  priceMonthly: number;
  priceLabel: string;
  description: string;
  features: string[];
  limits: CreatorPlanLimits;
  cta: string;
  badgeColor: string;
  highlighted?: boolean;
  requiresAdminApproval?: boolean;
}

export const BUYER_PRICING_NOTE =
  'Monthly buyer plans unlock request and project tools on MicroBuild. Checkout is not active yet — Stripe will connect in a later phase.';

export const CREATOR_PRICING_NOTE =
  'Creator subscriptions are for marketplace access, workflow publishing, analytics, and trust signals. Verified requires admin approval.';

export const buyerPricingPlans: BuyerPricingPlan[] = [
  {
    id: 'free',
    name: 'Free Buyer',
    shortName: 'Free',
    priceMonthly: 0,
    priceLabel: '$0/mo',
    description: 'Browse workflows, submit requests, and manage projects with core marketplace tools.',
    features: [
      'Browse public workflows',
      'Submit limited requests',
      'Review creator applicants',
      'Basic messaging',
      'Basic project workspace',
    ],
    cta: 'Start Free',
    ctaPath: '/signin',
  },
  {
    id: 'starter',
    name: 'Starter Buyer',
    shortName: 'Starter',
    priceMonthly: 19,
    priceLabel: '$19/mo',
    description: 'For businesses actively requesting MicroBuilds and reviewing creators.',
    features: [
      'More active requests',
      'Workflow customization requests',
      'AI Request Overview',
      'Applicant review tools',
      'Project agreements',
      'Delivery tracking',
    ],
    cta: 'Choose Starter',
    ctaPath: '/signin?redirect=/dashboard/billing',
    highlighted: true,
  },
  {
    id: 'growth',
    name: 'Growth Buyer',
    shortName: 'Growth',
    priceMonthly: 49,
    priceLabel: '$49/mo',
    description: 'For teams running multiple requests with stronger management and visibility.',
    features: [
      'Higher request limits',
      'Priority request visibility',
      'Advanced request management',
      'More active projects',
      'Better AI monitoring',
      'Team-ready project tracking',
    ],
    cta: 'Choose Growth',
    ctaPath: '/signin?redirect=/dashboard/billing',
  },
  {
    id: 'pro',
    name: 'Pro Buyer',
    shortName: 'Pro',
    priceMonthly: 'custom',
    priceLabel: 'Custom',
    description: 'For higher-volume businesses that need priority support and custom sourcing.',
    features: [
      'Higher-volume business support',
      'Multiple locations or brands',
      'Priority marketplace support',
      'Custom workflow sourcing',
      'Contact required',
    ],
    cta: 'Contact Us',
    ctaPath: '/request',
  },
];

export const creatorPricingPlans: CreatorPricingPlan[] = [
  {
    id: 'free',
    name: 'Free Creator',
    shortName: 'Free',
    priceMonthly: 0,
    priceLabel: '$0/mo',
    description: 'Get started on the marketplace with a basic creator profile.',
    features: [
      'Basic creator profile',
      'Limited applications',
      '1 published workflow',
      'Basic messaging',
    ],
    limits: {
      applicationsPerMonth: 3,
      publishedWorkflows: 1,
      analyticsAccess: false,
      aiMonitor: false,
      verifiedBadge: false,
      buyerTrustSignals: 'Basic profile',
      profileLevel: 'Basic profile',
    },
    cta: 'Apply as Creator',
    badgeColor: '#8a94a6',
  },
  {
    id: 'professional',
    name: 'Professional Creator',
    shortName: 'Professional',
    priceMonthly: 15,
    priceLabel: '$15/mo',
    description: 'Upgrade for more workflow publishing, applications, and marketplace readiness.',
    features: [
      'More applications per month',
      'More published workflows',
      'Analytics and AI monitor',
      'Better marketplace readiness',
      'Stronger workflow publishing',
    ],
    limits: {
      applicationsPerMonth: 20,
      publishedWorkflows: 5,
      analyticsAccess: true,
      aiMonitor: true,
      verifiedBadge: false,
      buyerTrustSignals: 'Stronger workflow publishing',
      profileLevel: 'Enhanced profile',
    },
    cta: 'Upgrade to Professional',
    badgeColor: '#63b3ed',
    highlighted: true,
  },
  {
    id: 'verified',
    name: 'Verified Creator',
    shortName: 'Verified',
    priceMonthly: 25,
    priceLabel: '$25/mo',
    description: 'Highest trust signals — verified badge requires admin approval.',
    features: [
      'Verified badge after admin approval',
      'Stronger buyer trust signals',
      'More workflows and applications',
      'Priority visibility',
      'Priority buyer trust placement',
    ],
    limits: {
      applicationsPerMonth: 50,
      publishedWorkflows: 15,
      analyticsAccess: true,
      aiMonitor: true,
      verifiedBadge: true,
      buyerTrustSignals: 'Priority buyer trust placement',
      profileLevel: 'Verified profile',
    },
    cta: 'Apply for Verified',
    badgeColor: '#f9b032',
    requiresAdminApproval: true,
  },
];

export const BUYER_PLAN_LABELS: Record<BuyerPlanId, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
};

export const CREATOR_TIER_LABELS: Record<CreatorPlanId, string> = {
  free: 'Free',
  professional: 'Professional',
  verified: 'Verified',
};

export const CREATOR_TIER_COLORS: Record<CreatorPlanId, string> = {
  free: '#8a94a6',
  professional: '#63b3ed',
  verified: '#f9b032',
};

export function getBuyerPlan(id: BuyerPlanId): BuyerPricingPlan | undefined {
  return buyerPricingPlans.find((p) => p.id === id);
}

export function getCreatorPlan(id: CreatorPlanId): CreatorPricingPlan | undefined {
  return creatorPricingPlans.find((p) => p.id === id);
}

export function formatCreatorPlanPrice(plan: CreatorPricingPlan): string {
  if (plan.priceMonthly === 0) return '$0/mo';
  return `$${plan.priceMonthly}/mo`;
}

/** @deprecated Legacy export for mockListings — maps buyer subscriptions for any legacy consumers */
export function legacyPricingTierPrice(plan: BuyerPricingPlan): number | 'Custom' {
  if (plan.priceMonthly === 'custom') return 'Custom';
  return plan.priceMonthly;
}
