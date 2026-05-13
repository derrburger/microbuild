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

export type ApplicationStatus = 'new' | 'reviewing' | 'approved' | 'rejected';

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
  user_id: string;
  business_name: string;
  industry: string;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
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
  user_id: string;
  full_name: string;
  bio: string | null;
  portfolio_url: string | null;
  skills: string[];
  available_hours: string;
  is_active: boolean;
  rating: number;
  builds_completed: number;
  created_at: string;
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

// ─── Insert types (what you send to INSERT) ──────────────────────────────────

export type BuyerRequestInsert = Omit<
  BuyerRequestRow,
  'id' | 'created_at' | 'updated_at'
> & {
  id?: string;
  status?: RequestStatus;
};

export type CreatorApplicationInsert = Omit<
  CreatorApplicationRow,
  'id' | 'created_at'
> & {
  id?: string;
  status?: ApplicationStatus;
};

export type OrderInsert = Omit<OrderRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  status?: OrderStatus;
};

// ─── Database shape — passed as generic to createClient<Database> ────────────

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, 'created_at'> & { created_at?: string };
        Update: Partial<Omit<UserRow, 'id'>>;
      };
      business_profiles: {
        Row: BusinessProfileRow;
        Insert: Omit<BusinessProfileRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<BusinessProfileRow, 'id'>>;
      };
      microbuild_categories: {
        Row: MicroBuildCategoryRow;
        Insert: Omit<MicroBuildCategoryRow, 'id'> & { id?: string };
        Update: Partial<Omit<MicroBuildCategoryRow, 'id'>>;
      };
      microbuild_templates: {
        Row: MicroBuildTemplateRow;
        Insert: Omit<MicroBuildTemplateRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<MicroBuildTemplateRow, 'id'>>;
      };
      buyer_requests: {
        Row: BuyerRequestRow;
        Insert: BuyerRequestInsert;
        Update: Partial<Omit<BuyerRequestRow, 'id'>>;
      };
      creator_profiles: {
        Row: CreatorProfileRow;
        Insert: Omit<CreatorProfileRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CreatorProfileRow, 'id'>>;
      };
      creator_applications: {
        Row: CreatorApplicationRow;
        Insert: CreatorApplicationInsert;
        Update: Partial<Omit<CreatorApplicationRow, 'id'>>;
      };
      orders: {
        Row: OrderRow;
        Insert: OrderInsert;
        Update: Partial<Omit<OrderRow, 'id'>>;
      };
      build_packets: {
        Row: BuildPacketRow;
        Insert: Omit<BuildPacketRow, 'id' | 'generated_at'> & {
          id?: string;
          generated_at?: string;
        };
        Update: Partial<Omit<BuildPacketRow, 'id'>>;
      };
      deliverables: {
        Row: DeliverableRow;
        Insert: Omit<DeliverableRow, 'id' | 'submitted_at'> & {
          id?: string;
          submitted_at?: string;
        };
        Update: Partial<Omit<DeliverableRow, 'id'>>;
      };
      reviews: {
        Row: ReviewRow;
        Insert: Omit<ReviewRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ReviewRow, 'id'>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
