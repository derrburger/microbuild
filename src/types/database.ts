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

export type TemplateStatus = 'available' | 'popular' | 'new' | 'coming-soon';

export type RequestStatus =
  | 'new'
  | 'in-review'
  | 'proposal-sent'
  | 'accepted'
  | 'rejected';

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

// ─── Row types (what you get back from SELECT) ───────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface CreatorProfileRow {
  id: string;
  user_id: string | null;
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
  // Tier fields (added by migration: add_creator_tiers.sql)
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
}

export interface OrderRow {
  id: string;
  request_id: string;
  buyer_id: string;
  creator_id: string | null;
  template_id: string | null;
  build_packet_id: string | null;
  amount_cents: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
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
  generated_at: string;
  generated_by: string;
}

export interface DeliverableRow {
  id: string;
  order_id: string;
  creator_id: string;
  live_url: string;
  preview_url: string | null;
  source_files_url: string | null;
  notes: string | null;
  submitted_at: string;
  approved_at: string | null;
  revision_count: number;
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
  // Tier fields (optional — pre-migration rows will default to 'free')
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
}

export interface OrderInsert {
  id?: string;
  request_id: string;
  buyer_id: string;
  creator_id?: string | null;
  template_id: string;
  build_packet_id?: string | null;
  price_cents: number;
  status?: OrderStatus;
  notes?: string | null;
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
