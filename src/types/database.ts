/**
 * MicroBuild — Database Types
 *
 * Hand-authored TypeScript types mirroring the planned Supabase/PostgreSQL schema.
 * These will be replaced by auto-generated types (`supabase gen types typescript`)
 * once the Supabase project is provisioned and schema is applied.
 *
 * Follows the standard Supabase client type shape:
 *   Database['public']['Tables']['table_name']['Row' | 'Insert' | 'Update']
 */

// ─── Enum-like string unions ────────────────────────────────────────────────

export type UserRole = 'buyer' | 'creator' | 'admin';
export type AccountType = 'buyer' | 'creator' | 'admin';
export type OnboardingStatus = 'pending' | 'complete';

export type TemplateStatus = 'available' | 'popular' | 'new' | 'coming-soon';

export type RequestStatus =
  | 'new'
  | 'in-review'
  | 'proposal-sent'
  | 'accepted'
  | 'rejected';

/** Lifecycle for marketplace openness (migration: buyer_requests.visibility_status) */
export type BuyerRequestVisibilityStatus =
  | 'draft'
  | 'open'
  | 'reviewing_applicants'
  | 'creator_selected'
  | 'in_progress'
  | 'completed'
  | 'closed';

/** Alias for readability — same constrained values as visibility in current migration */
export type BuyerRequestMarketplaceApplicationStatus =
  | 'draft'
  | 'open'
  | 'reviewing_applicants'
  | 'creator_selected'
  | 'in_progress'
  | 'completed'
  | 'closed';

export type RequestApplicationStatus =
  | 'submitted'
  | 'shortlisted'
  | 'buyer_selected'
  | 'rejected'
  | 'withdrawn'
  | 'admin_blocked';

export type PublishedWorkflowStatus =
  | 'draft'
  | 'submitted_for_review'
  | 'published'
  | 'hidden'
  | 'rejected'
  | 'archived';

export type PublishedWorkflowVisibilityStatus = 'hidden' | 'public' | 'paused';

/** Rules-based AI workflow review lifecycle (workflow-ai-review-fields.sql) */
export type WorkflowAiReviewStatus =
  | 'not_reviewed'
  | 'needs_review'
  | 'ai_approved'
  | 'needs_improvement'
  | 'risk_flagged'
  | 'published'
  | 'hidden'
  | 'rejected'
  | 'archived';

export type WorkflowAiPublishReadiness =
  | 'not_ready'
  | 'needs_work'
  | 'almost_ready'
  | 'ready'
  | 'public_ready';

export type ProjectMessageType =
  | 'general'
  | 'question'
  | 'proposal'
  | 'revision'
  | 'admin_note'
  | 'system_update';

export type ProjectMessageVisibility =
  | 'participant'
  | 'admin_only'
  | 'buyer_creator'
  | 'public_safe';

export type OrderSelectionMethod =
  | 'buyer_selected'
  | 'admin_assigned'
  | 'system_recommended';

export type CreatorTier = 'free' | 'professional' | 'verified';

export type ApplicationStatus =
  | 'new'
  | 'reviewing'
  | 'needs_portfolio_review'
  | 'needs_more_info'
  | 'approved_pending_payment'
  | 'active'
  | 'rejected'
  | 'suspended';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ProfileApprovalStatus = 'draft' | 'approved_pending_payment' | 'active' | 'hidden' | 'suspended' | 'rejected';
export type PublicProfileStatus = 'hidden' | 'public' | 'paused';
export type SubscriptionStatus = 'not_required' | 'not_started' | 'pending_payment' | 'active' | 'past_due' | 'canceled';

export type OrderStatus =
  | 'pending'
  | 'in-progress'
  | 'delivered'
  | 'approved'
  | 'disputed'
  | 'refunded';

/** Extended pipeline status added by project-pipeline-foundation.sql */
export type OrderPipelineStatus =
  | 'draft'
  | 'ready_to_quote'
  | 'pending_payment'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'delivered'
  | 'completed'
  | 'rejected'
  | 'canceled';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';
export type DeliveryStatus = 'draft' | 'submitted' | 'revision_needed' | 'approved';

// ─── Row types (what you get back from SELECT) ───────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

/** Row returned from the user_profiles table (created during onboarding). */
export interface UserProfileRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  account_type: AccountType;
  onboarding_status: OnboardingStatus;
  privacy_status: string;
  // Account approval fields (account-approval-workflow.sql)
  account_status: string | null;
  creator_application_id: string | null;
  creator_application_status: string | null;
  creator_profile_id: string | null;
  approval_status: string | null;
  // Profile fields (email-account-profile-fields.sql)
  github_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInsert {
  id?: string;
  auth_user_id?: string | null;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  account_type?: AccountType;
  onboarding_status?: OnboardingStatus;
  privacy_status?: string;
  github_url?: string | null;
}

export interface BusinessProfileRow {
  id: string;
  user_id: string | null;
  contact_name: string | null;
  business_name: string;
  industry: string;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
  // Extended (added by profile-system-foundation.sql)
  website_url: string | null;
  instagram_url: string | null;
  google_business_url: string | null;
  main_goal: string | null;
  preferred_microbuild_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MicroBuildCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  display_order: number;
}

export interface MicroBuildTemplateRow {
  id: string;
  title: string;
  slug: string;
  category_id: string;
  target_industry: string;
  main_goal: string;
  starting_price: number;
  estimated_turnaround: string;
  description: string;
  features: string[];
  setup_requirements: string[];
  status: TemplateStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuyerRequestRow {
  id: string;
  user_id: string | null;
  business_profile_id: string | null;
  template_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  business_name: string;
  industry: string;
  website_social: string | null;
  build_type: string;
  main_goal: string;
  current_problem: string;
  budget: string | null;
  deadline: string | null;
  style_notes: string | null;
  status: RequestStatus;
  visibility_status?: BuyerRequestVisibilityStatus | string | null;
  application_status?: BuyerRequestMarketplaceApplicationStatus | string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  applications_count?: number | null;
  /** workflow-request-linking.sql — default custom_request; workflow = reusable workflow customization */
  source_type?: string | null;
  source_workflow_id?: string | null;
  source_workflow_title?: string | null;
  source_creator_profile_id?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorProfileRow {
  id: string;
  user_id: string | null;
  auth_user_id: string | null;
  user_profile_id: string | null;
  creator_application_id: string | null;
  // Display
  display_name: string | null;
  full_name: string;
  profile_photo_url: string | null;
  slug: string | null;
  bio: string | null;
  // Tier & status
  tier: CreatorTier;
  verification_status: VerificationStatus;
  approval_status: ProfileApprovalStatus;
  subscription_status: SubscriptionStatus;
  public_profile_status: PublicProfileStatus;
  // Marketplace data
  badges: string[];
  tools: string[];
  niches: string[];
  portfolio_links: string[];
  credential_links: string[];
  certifications: string[];
  proof_links: string[];
  education_or_coursework: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  case_studies: string | null;
  // Legacy columns kept for compat
  portfolio_url: string | null;
  skills: string[];
  available_hours: string;
  is_active: boolean;
  // Admin & scoring
  admin_notes: string | null;
  ai_profile_score: number | null;
  ai_profile_summary: string | null;
  /** Rules-based/client-computed strength (account-profile-foundation migration) */
  profile_strength_score?: number | null;
  profile_strength_summary?: string | null;
  // Stats
  completed_builds_count: number;
  average_rating: number | null;
  rating: number;
  builds_completed: number;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface CreatorProfileInsert {
  id?: string;
  user_id?: string | null;
  auth_user_id?: string | null;
  user_profile_id?: string | null;
  creator_application_id?: string | null;
  display_name?: string | null;
  full_name: string;
  profile_photo_url?: string | null;
  slug?: string | null;
  bio?: string | null;
  tier?: CreatorTier;
  verification_status?: VerificationStatus;
  approval_status?: ProfileApprovalStatus;
  subscription_status?: SubscriptionStatus;
  public_profile_status?: PublicProfileStatus;
  badges?: string[];
  tools?: string[];
  niches?: string[];
  portfolio_links?: string[];
  credential_links?: string[];
  certifications?: string[];
  proof_links?: string[];
  education_or_coursework?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  case_studies?: string | null;
  // Legacy
  portfolio_url?: string | null;
  skills?: string[];
  available_hours?: string;
  is_active?: boolean;
  admin_notes?: string | null;
  ai_profile_score?: number | null;
  ai_profile_summary?: string | null;
  completed_builds_count?: number;
  average_rating?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatorApplicationRow {
  id: string;
  full_name: string;
  email: string;
  tools: string[];
  portfolio_url: string | null;
  portfolio_url_2: string | null;
  niches: string[];
  experience: string;
  available_hours: string;
  message: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  // Tier fields
  tier: CreatorTier;
  requested_plan_price: number;
  top_projects: string | null;
  service_capabilities: string[];
  fulfillment_speed: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  certifications: string | null;
  credential_links: string[];
  case_studies: string | null;
  // Auth linking (account-approval-workflow.sql)
  auth_user_id: string | null;
  user_profile_id: string | null;
  approval_status: ApplicationStatus | null;
  admin_notes: string | null;
  admin_decision_at: string | null;
  rejected_reason: string | null;
  needs_info_reason: string | null;
  linked_creator_profile_id: string | null;
}

export interface OrderRow {
  id: string;
  request_id: string | null;
  buyer_id: string | null;          // nullable since project-pipeline-foundation.sql
  creator_id: string | null;        // FK → creator_profiles.id
  template_id: string | null;
  build_packet_id: string | null;
  amount_cents: number;
  status: OrderStatus;              // legacy field — kept for compat
  // Fields added by project-pipeline-foundation.sql
  order_status: OrderPipelineStatus;
  payment_status: PaymentStatus;
  project_title: string | null;
  project_type: string | null;
  admin_notes: string | null;
  microbuild_fee: string | null;
  creator_payout: string | null;
  request_application_id?: string | null;
  selected_by_buyer?: boolean | null;
  selection_method?: OrderSelectionMethod | string | null;
  /** proposal-pricing-foundation.sql */
  proposal_id?: string | null;
  /** Mirrors primary proposal lifecycle: not_started | draft | sent | buyer_* … */
  proposal_status?: string | null;
  /** Buyer decision on scope/pricing proposal — pending | buyer_approved | changes_requested | buyer_rejected */
  buyer_approval_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestApplicationRow {
  id: string;
  buyer_request_id: string;
  order_id: string | null;
  creator_profile_id: string;
  creator_user_profile_id: string | null;
  buyer_user_profile_id: string | null;
  application_status: RequestApplicationStatus | string;
  proposal_message: string | null;
  fit_reason: string | null;
  estimated_timeline: string | null;
  proposed_price: number | string | null;
  relevant_workflow_id: string | null;
  creator_questions: string | null;
  creator_fit_summary: string | null;
  admin_notes: string | null;
  buyer_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishedWorkflowRow {
  id: string;
  creator_profile_id: string;
  title: string;
  slug: string | null;
  category: string | null;
  target_industry: string | null;
  description: string | null;
  included_features: string | null;
  setup_requirements: string | null;
  starting_price: number | string | null;
  estimated_turnaround: string | null;
  preview_url: string | null;
  cover_image_url: string | null;
  workflow_status: PublishedWorkflowStatus | string;
  visibility_status: PublishedWorkflowVisibilityStatus | string;
  admin_notes: string | null;
  ai_review_status?: WorkflowAiReviewStatus | string | null;
  ai_quality_score?: number | null;
  ai_publish_readiness?: WorkflowAiPublishReadiness | string | null;
  ai_review_summary?: string | null;
  ai_missing_items?: string[] | null;
  ai_risk_flags?: string[] | null;
  ai_suggested_improvements?: string[] | null;
  ai_recommended_action?: string | null;
  ai_reviewed_at?: string | null;
  auto_publish_eligible?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** project_proposals — proposal-pricing-foundation.sql */
export interface ProjectProposalRow {
  id: string;
  buyer_request_id: string | null;
  order_id: string | null;
  request_application_id: string | null;
  creator_profile_id: string | null;
  buyer_user_profile_id: string | null;
  proposal_title: string;
  scope_summary: string;
  included_deliverables: string;
  timeline: string;
  revision_limit: number;
  proposed_price: number | string | null;
  platform_fee: number | string | null;
  creator_payout: number | string | null;
  proposal_status: string;
  buyer_approval_status: string;
  admin_approval_status: string;
  buyer_feedback: string | null;
  admin_notes: string | null;
  workflow_context_snapshot: string | null;
  /** project-agreement-fields.sql */
  agreement_status?: string | null;
  buyer_confirmed_at?: string | null;
  creator_confirmed_at?: string | null;
  creator_approval_status?: string | null;
  ai_agreement_summary?: string | null;
  ai_missing_scope_items?: string[] | null;
  ai_risk_flags?: string[] | null;
  ai_recommended_next_step?: string | null;
  locked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectProposalInsert {
  id?: string;
  buyer_request_id?: string | null;
  order_id?: string | null;
  request_application_id?: string | null;
  creator_profile_id?: string | null;
  buyer_user_profile_id?: string | null;
  proposal_title?: string;
  scope_summary?: string;
  included_deliverables?: string;
  timeline?: string;
  revision_limit?: number;
  proposed_price?: number | string | null;
  platform_fee?: number | string | null;
  creator_payout?: number | string | null;
  proposal_status?: string;
  buyer_approval_status?: string;
  admin_approval_status?: string;
  buyer_feedback?: string | null;
  admin_notes?: string | null;
  workflow_context_snapshot?: string | null;
  agreement_status?: string | null;
  buyer_confirmed_at?: string | null;
  creator_confirmed_at?: string | null;
  creator_approval_status?: string | null;
  ai_agreement_summary?: string | null;
  ai_missing_scope_items?: string[] | null;
  ai_risk_flags?: string[] | null;
  ai_recommended_next_step?: string | null;
  locked_at?: string | null;
}

export interface ProjectMessageRow {
  id: string;
  buyer_request_id: string | null;
  order_id: string | null;
  sender_user_profile_id: string | null;
  recipient_user_profile_id: string | null;
  sender_role: string | null;
  message_body: string;
  message_type: ProjectMessageType | string;
  visibility: ProjectMessageVisibility | string;
  created_at: string;
}

export interface RequestApplicationInsert {
  id?: string;
  buyer_request_id: string;
  order_id?: string | null;
  creator_profile_id: string;
  creator_user_profile_id?: string | null;
  buyer_user_profile_id?: string | null;
  application_status?: RequestApplicationStatus | string;
  proposal_message?: string | null;
  fit_reason?: string | null;
  estimated_timeline?: string | null;
  proposed_price?: number | string | null;
  relevant_workflow_id?: string | null;
  creator_questions?: string | null;
  creator_fit_summary?: string | null;
  admin_notes?: string | null;
  buyer_message?: string | null;
}

export interface PublishedWorkflowInsert {
  id?: string;
  creator_profile_id: string;
  title: string;
  slug?: string | null;
  category?: string | null;
  target_industry?: string | null;
  description?: string | null;
  included_features?: string | null;
  setup_requirements?: string | null;
  starting_price?: number | string | null;
  estimated_turnaround?: string | null;
  preview_url?: string | null;
  cover_image_url?: string | null;
  workflow_status?: PublishedWorkflowStatus | string;
  visibility_status?: PublishedWorkflowVisibilityStatus | string;
  ai_review_status?: WorkflowAiReviewStatus | string;
  ai_quality_score?: number | null;
  ai_publish_readiness?: WorkflowAiPublishReadiness | string;
  ai_review_summary?: string | null;
  ai_missing_items?: string[] | null;
  ai_risk_flags?: string[] | null;
  ai_suggested_improvements?: string[] | null;
  ai_recommended_action?: string | null;
  ai_reviewed_at?: string | null;
  auto_publish_eligible?: boolean | null;
}

export interface ProjectMessageInsert {
  id?: string;
  buyer_request_id?: string | null;
  order_id?: string | null;
  sender_user_profile_id?: string | null;
  recipient_user_profile_id?: string | null;
  sender_role?: string | null;
  message_body: string;
  message_type?: ProjectMessageType | string;
  visibility?: ProjectMessageVisibility | string;
}

export interface BuildPacketRow {
  id: string;
  request_id: string;
  order_id: string | null;
  business_summary: string;
  recommended_build: string;
  customer_problem: string;
  suggested_copy: Record<string, string>;
  form_fields: Array<Record<string, unknown>>;
  design_direction: string;
  automation_needs: string | null;
  creator_instructions: string;
  quality_checklist: string[];
  // Fields added by project-pipeline-foundation.sql
  launch_checklist: string[];
  ai_summary: string | null;
  suggested_page_sections: string[];
  generated_at: string;
  generated_by: string;
  updated_at: string;
}

export interface DeliverableRow {
  id: string;
  order_id: string;
  creator_id: string;             // original FK, kept for compat
  creator_profile_id: string | null; // added by project-pipeline-foundation.sql
  live_url: string;               // original live URL field
  preview_url: string | null;
  source_files_url: string | null;
  notes: string | null;
  // Fields added by project-pipeline-foundation.sql
  github_url: string | null;
  delivery_status: DeliveryStatus;
  submitted_at: string;
  approved_at: string | null;
  revision_count: number;
  /** Admin → creator feedback when delivery_status is revision_needed (deliverables-revision-note.sql) */
  revision_note: string | null;
  updated_at: string;
}

export interface ReviewRow {
  id: string;
  order_id: string;
  buyer_id: string;
  creator_id: string;
  rating: number;
  comment: string | null;
  is_public: boolean;
  created_at: string;
}

// ─── Insert types (explicit flat interfaces — avoids Omit-intersection issues) ─

export interface BuyerRequestInsert {
  id?: string;
  user_id?: string | null;
  business_profile_id?: string | null;
  template_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name: string;
  industry: string;
  website_social?: string | null;
  build_type: string;
  main_goal: string;
  current_problem: string;
  budget?: string | null;
  deadline?: string | null;
  style_notes?: string | null;
  status?: RequestStatus;
  visibility_status?: BuyerRequestVisibilityStatus | string | null;
  application_status?: BuyerRequestMarketplaceApplicationStatus | string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  applications_count?: number | null;
  source_type?: string | null;
  source_workflow_id?: string | null;
  source_workflow_title?: string | null;
  source_creator_profile_id?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatorApplicationInsert {
  id?: string;
  full_name: string;
  email: string;
  tools: string[];
  portfolio_url?: string | null;
  portfolio_url_2?: string | null;
  niches: string[];
  experience: string;
  available_hours: string;
  message?: string | null;
  status?: ApplicationStatus;
  created_at?: string;
  // Tier fields
  tier?: CreatorTier;
  requested_plan_price?: number;
  top_projects?: string | null;
  service_capabilities?: string[];
  fulfillment_speed?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  certifications?: string | null;
  credential_links?: string[];
  case_studies?: string | null;
  // Auth linking (set when logged-in user submits)
  auth_user_id?: string | null;
  user_profile_id?: string | null;
  approval_status?: ApplicationStatus;
}

export interface OrderInsert {
  id?: string;
  request_id?: string | null;
  buyer_id?: string | null;
  creator_id?: string | null;
  template_id?: string | null;
  build_packet_id?: string | null;
  amount_cents?: number;
  status?: OrderStatus;
  // Pipeline fields
  order_status?: OrderPipelineStatus;
  payment_status?: PaymentStatus;
  project_title?: string | null;
  project_type?: string | null;
  admin_notes?: string | null;
  microbuild_fee?: string | null;
  creator_payout?: string | null;
  request_application_id?: string | null;
  selected_by_buyer?: boolean | null;
  selection_method?: OrderSelectionMethod | string | null;
  proposal_id?: string | null;
  proposal_status?: string | null;
  buyer_approval_status?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Database shape — passed as generic to createClient<Database> ────────────
// Each table includes Relationships: [] to satisfy the GenericSchema constraint
// in @supabase/supabase-js (foreign-key relationship definitions, none defined yet).

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: { id: string; email: string; role?: UserRole; created_at?: string };
        Update: Partial<Omit<UserRow, 'id'>>;
        Relationships: [];
      };
      business_profiles: {
        Row: BusinessProfileRow;
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          industry: string;
          city?: string | null;
          state?: string | null;
          website?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<BusinessProfileRow, 'id'>>;
        Relationships: [];
      };
      microbuild_categories: {
        Row: MicroBuildCategoryRow;
        Insert: { id?: string; name: string; slug: string; description: string; icon: string; display_order: number };
        Update: Partial<Omit<MicroBuildCategoryRow, 'id'>>;
        Relationships: [];
      };
      microbuild_templates: {
        Row: MicroBuildTemplateRow;
        Insert: {
          id?: string;
          title: string;
          slug: string;
          category_id: string;
          target_industry: string;
          main_goal: string;
          starting_price: number;
          estimated_turnaround: string;
          description: string;
          features: string[];
          setup_requirements: string[];
          status?: TemplateStatus;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<MicroBuildTemplateRow, 'id'>>;
        Relationships: [];
      };
      buyer_requests: {
        Row: BuyerRequestRow;
        Insert: BuyerRequestInsert;
        Update: Partial<Omit<BuyerRequestRow, 'id'>>;
        Relationships: [];
      };
      request_applications: {
        Row: RequestApplicationRow;
        Insert: RequestApplicationInsert;
        Update: Partial<Omit<RequestApplicationRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      published_workflows: {
        Row: PublishedWorkflowRow;
        Insert: PublishedWorkflowInsert;
        Update: Partial<Omit<PublishedWorkflowRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      project_proposals: {
        Row: ProjectProposalRow;
        Insert: ProjectProposalInsert;
        Update: Partial<Omit<ProjectProposalRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      project_messages: {
        Row: ProjectMessageRow;
        Insert: ProjectMessageInsert;
        Update: Partial<Omit<ProjectMessageRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      creator_profiles: {
        Row: CreatorProfileRow;
        Insert: CreatorProfileInsert;
        Update: Partial<Omit<CreatorProfileRow, 'id'>>;
        Relationships: [];
      };
      creator_applications: {
        Row: CreatorApplicationRow;
        Insert: CreatorApplicationInsert;
        Update: Partial<Omit<CreatorApplicationRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: OrderInsert;
        Update: Partial<Omit<OrderRow, 'id'>>;
        Relationships: [];
      };
      build_packets: {
        Row: BuildPacketRow;
        Insert: {
          id?: string;
          order_id: string;
          template_id: string;
          buyer_summary: string;
          target_audience: string;
          suggested_copy: Record<string, string>;
          form_fields: Array<Record<string, unknown>>;
          design_direction: string;
          automation_needs?: string | null;
          creator_instructions: string;
          quality_checklist: string[];
          generated_at?: string;
          generated_by: string;
        };
        Update: Partial<Omit<BuildPacketRow, 'id'>>;
        Relationships: [];
      };
      deliverables: {
        Row: DeliverableRow;
        Insert: {
          id?: string;
          order_id: string;
          creator_id: string;
          live_url: string;
          preview_url?: string | null;
          source_files_url?: string | null;
          notes?: string | null;
          submitted_at?: string;
          approved_at?: string | null;
          revision_count?: number;
        };
        Update: Partial<Omit<DeliverableRow, 'id'>>;
        Relationships: [];
      };
      reviews: {
        Row: ReviewRow;
        Insert: {
          id?: string;
          order_id: string;
          buyer_id: string;
          creator_id: string;
          rating: number;
          comment?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: Partial<Omit<ReviewRow, 'id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
