export type CreatorTier = 'free' | 'professional' | 'verified';
export type AccountType = 'buyer' | 'creator' | 'admin';
export type OnboardingStatus = 'pending' | 'complete';
export type ProfileApprovalStatus = 'draft' | 'approved_pending_payment' | 'active' | 'hidden' | 'suspended' | 'rejected';
export type PublicProfileStatus = 'hidden' | 'public' | 'paused';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type MicroBuildCategory =
  | 'Quote Funnel'
  | 'Booking Page'
  | 'Review Booster'
  | 'Trust Page'
  | 'Package Selector';

export type BuildStatus = 'available' | 'popular' | 'new' | 'coming-soon';

export interface MicroBuildListing {
  id: string;
  title: string;
  slug: string;
  category: MicroBuildCategory;
  targetIndustry: string;
  mainGoal: string;
  startingPrice: number;
  estimatedTurnaround: string;
  description: string;
  features: string[];
  setupRequirements: string[];
  status: BuildStatus;
  imageAlt?: string;
}

export interface BuyerRequest {
  // Contact
  fullName: string;
  email: string;
  phone: string;
  // Business
  businessName: string;
  industry: string;
  websiteSocial: string;
  // Project
  buildType: MicroBuildCategory | 'Not sure' | '';
  mainGoal: string;
  currentProblem: string;
  // Details
  budget: string;
  deadline: string;
  styleNotes: string;
}

export interface CreatorApplication {
  // Contact
  fullName: string;
  email: string;
  // Work
  tools: string[];
  portfolioUrl: string;
  portfolioUrl2: string;
  niches: string[];
  // Experience
  experience: string;
  availableHours: string;
  message: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  industry: string;
  buildType: MicroBuildCategory;
  problem: string;
  solution: string;
  result: string;
  resultMetric: string;
  clientName?: string;
}

export interface PricingTier {
  name: string;
  price: number | 'Custom';
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}
