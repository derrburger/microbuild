-- ============================================================
-- MicroBuild — Supabase Schema (MVP)
-- ============================================================
-- Run this in the Supabase SQL editor or via the CLI:
--   supabase db reset   (local dev)
--   supabase db push    (linked remote project)
--
-- Conventions:
--   - All primary keys are UUIDs using gen_random_uuid()
--   - All tables have created_at; mutable tables also have updated_at
--   - Status fields use text with CHECK constraints (no custom enums)
--     so they're easy to extend without migrations
--   - RLS is ENABLED on all tables but policies are left as TODO
--     blocks — implement in Phase 1 once auth is wired
-- ============================================================


-- ─── Extensions ──────────────────────────────────────────────────────────────

-- UUID generation (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─── users ───────────────────────────────────────────────────────────────────
-- Extends Supabase Auth (auth.users) with app-level role data.
-- The id here MUST match auth.users.id for the FK to work.

CREATE TABLE IF NOT EXISTS public.users (
  id          uuid        PRIMARY KEY,  -- mirrors auth.users.id
  email       text        NOT NULL UNIQUE,
  role        text        NOT NULL DEFAULT 'buyer'
                          CHECK (role IN ('buyer', 'creator', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — buyers can read/update own row; admins can read all
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);


-- ─── business_profiles ───────────────────────────────────────────────────────
-- Optional profile buyers can create. Not required for guest requests.

CREATE TABLE IF NOT EXISTS public.business_profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  business_name  text        NOT NULL,
  industry       text        NOT NULL,
  city           text,
  state          text,
  website        text,
  phone          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — users can only read/update their own profile
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON public.business_profiles (user_id);


-- ─── microbuild_categories ───────────────────────────────────────────────────
-- Reference table for the 5 build types. Seeded at setup.

CREATE TABLE IF NOT EXISTS public.microbuild_categories (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text    NOT NULL UNIQUE,
  slug           text    NOT NULL UNIQUE,
  description    text    NOT NULL,
  icon           text    NOT NULL DEFAULT '🔧',
  display_order  int     NOT NULL DEFAULT 0
);

-- RLS: TODO — public readable; admin-only writes
ALTER TABLE public.microbuild_categories ENABLE ROW LEVEL SECURITY;


-- ─── microbuild_templates ────────────────────────────────────────────────────
-- Marketplace listings shown on /browse and /builds/:slug.

CREATE TABLE IF NOT EXISTS public.microbuild_templates (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text        NOT NULL,
  slug                  text        NOT NULL UNIQUE,
  category_id           uuid        NOT NULL REFERENCES public.microbuild_categories (id),
  target_industry       text        NOT NULL,
  main_goal             text        NOT NULL,
  starting_price        int         NOT NULL CHECK (starting_price >= 0),  -- in dollars
  estimated_turnaround  text        NOT NULL,
  description           text        NOT NULL,
  features              text[]      NOT NULL DEFAULT '{}',
  setup_requirements    text[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'available'
                                    CHECK (status IN ('available', 'popular', 'new', 'coming-soon')),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — public readable; admin-only writes
ALTER TABLE public.microbuild_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_templates_category_id ON public.microbuild_templates (category_id);
CREATE INDEX IF NOT EXISTS idx_templates_status      ON public.microbuild_templates (status);
CREATE INDEX IF NOT EXISTS idx_templates_is_active   ON public.microbuild_templates (is_active);


-- ─── buyer_requests ──────────────────────────────────────────────────────────
-- Submitted via /request. user_id is nullable so guests can submit
-- without creating an account (reduces friction at early stage).

CREATE TABLE IF NOT EXISTS public.buyer_requests (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        REFERENCES public.users (id) ON DELETE SET NULL,
  business_profile_id  uuid        REFERENCES public.business_profiles (id) ON DELETE SET NULL,
  template_id          uuid        REFERENCES public.microbuild_templates (id) ON DELETE SET NULL,

  -- Contact & business
  full_name            text        NOT NULL,
  email                text        NOT NULL,
  phone                text,
  business_name        text        NOT NULL,
  industry             text        NOT NULL,
  website_social       text,

  -- Project scope
  build_type           text        NOT NULL,
  main_goal            text        NOT NULL,
  current_problem      text        NOT NULL,
  budget               text,
  deadline             text,
  style_notes          text,

  status               text        NOT NULL DEFAULT 'new'
                                   CHECK (status IN (
                                     'new', 'in-review', 'proposal-sent', 'accepted', 'rejected'
                                   )),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — buyers can read own requests (matched by email for guests);
--             admins can read/update all
ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_buyer_requests_status     ON public.buyer_requests (status);
CREATE INDEX IF NOT EXISTS idx_buyer_requests_email      ON public.buyer_requests (email);
CREATE INDEX IF NOT EXISTS idx_buyer_requests_user_id    ON public.buyer_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_requests_created_at ON public.buyer_requests (created_at DESC);


-- ─── creator_profiles ────────────────────────────────────────────────────────
-- Created for approved creator applications. One per user.

CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
  full_name         text        NOT NULL,
  bio               text,
  portfolio_url     text,
  skills            text[]      NOT NULL DEFAULT '{}',
  available_hours   text        NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  rating            numeric(3,2) NOT NULL DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
  builds_completed  int         NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — public readable (for marketplace listings); creator can update own;
--             admin can update all
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_is_active ON public.creator_profiles (is_active);


-- ─── creator_applications ────────────────────────────────────────────────────
-- Submitted via /creators/apply. Not linked to a user account yet.

CREATE TABLE IF NOT EXISTS public.creator_applications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text        NOT NULL,
  email            text        NOT NULL,
  tools            text[]      NOT NULL DEFAULT '{}',
  portfolio_url    text,
  portfolio_url_2  text,
  niches           text[]      NOT NULL DEFAULT '{}',
  experience       text        NOT NULL,
  available_hours  text        NOT NULL,
  message          text,
  status           text        NOT NULL DEFAULT 'new'
                               CHECK (status IN ('new', 'reviewing', 'approved', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — admin-only reads; no public read
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_creator_applications_status ON public.creator_applications (status);
CREATE INDEX IF NOT EXISTS idx_creator_applications_email  ON public.creator_applications (email);


-- ─── orders ──────────────────────────────────────────────────────────────────
-- Created when admin accepts a buyer request and assigns a creator.

CREATE TABLE IF NOT EXISTS public.orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid        NOT NULL REFERENCES public.buyer_requests (id),
  buyer_id         uuid        NOT NULL REFERENCES public.users (id),
  creator_id       uuid        REFERENCES public.creator_profiles (id) ON DELETE SET NULL,
  template_id      uuid        REFERENCES public.microbuild_templates (id) ON DELETE SET NULL,
  build_packet_id  uuid,       -- FK added after build_packets table exists (see below)
  amount_cents     int         NOT NULL CHECK (amount_cents >= 0),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending', 'in-progress', 'delivered',
                                 'approved', 'disputed', 'refunded'
                               )),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — buyers can read own orders; creators can read assigned orders;
--             admins can read/update all
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id   ON public.orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_creator_id ON public.orders (creator_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.orders (status);


-- ─── build_packets ───────────────────────────────────────────────────────────
-- Structured brief given to creators. Manually authored in Phase 0–1;
-- AI-generated in Phase 3.

CREATE TABLE IF NOT EXISTS public.build_packets (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid        NOT NULL REFERENCES public.buyer_requests (id),
  order_id              uuid        REFERENCES public.orders (id) ON DELETE SET NULL,
  business_summary      text        NOT NULL,
  recommended_build     text        NOT NULL,
  customer_problem      text        NOT NULL,
  suggested_copy        jsonb       NOT NULL DEFAULT '{}',
  form_fields           jsonb       NOT NULL DEFAULT '[]',
  design_direction      text        NOT NULL,
  automation_needs      text,
  creator_instructions  text        NOT NULL,
  quality_checklist     text[]      NOT NULL DEFAULT '{}',
  generated_at          timestamptz NOT NULL DEFAULT now(),
  generated_by          text        NOT NULL DEFAULT 'manual'
                                    CHECK (generated_by IN ('manual', 'gpt-4o', 'gpt-4-turbo'))
);

-- Now add the FK from orders → build_packets (circular reference resolved)
ALTER TABLE public.orders
  ADD CONSTRAINT fk_orders_build_packet
  FOREIGN KEY (build_packet_id) REFERENCES public.build_packets (id) ON DELETE SET NULL;

-- RLS: TODO — creator can read assigned packet; admin can read/write all
ALTER TABLE public.build_packets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_build_packets_request_id ON public.build_packets (request_id);
CREATE INDEX IF NOT EXISTS idx_build_packets_order_id   ON public.build_packets (order_id);


-- ─── deliverables ────────────────────────────────────────────────────────────
-- The finished MicroBuild submitted by a creator for buyer review.

CREATE TABLE IF NOT EXISTS public.deliverables (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid        NOT NULL REFERENCES public.orders (id),
  creator_id        uuid        NOT NULL REFERENCES public.creator_profiles (id),
  live_url          text        NOT NULL,
  preview_url       text,
  source_files_url  text,
  notes             text,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  approved_at       timestamptz,
  revision_count    int         NOT NULL DEFAULT 0 CHECK (revision_count >= 0)
);

-- RLS: TODO — buyers can read deliverables for their orders;
--             creators can read/update their own submissions; admin full access
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_deliverables_order_id   ON public.deliverables (order_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_creator_id ON public.deliverables (creator_id);


-- ─── reviews ─────────────────────────────────────────────────────────────────
-- Buyer rating and comment after approving a deliverable.

CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL UNIQUE REFERENCES public.orders (id),
  buyer_id    uuid        NOT NULL REFERENCES public.users (id),
  creator_id  uuid        NOT NULL REFERENCES public.creator_profiles (id),
  rating      int         NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     text,
  is_public   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: TODO — public can read public reviews; buyers can create/update own;
--             admin full access
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reviews_creator_id ON public.reviews (creator_id);
CREATE INDEX IF NOT EXISTS idx_reviews_is_public  ON public.reviews (is_public);


-- ─── updated_at trigger ──────────────────────────────────────────────────────
-- Automatically maintains updated_at on tables that have it.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_business_profiles
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_microbuild_templates
  BEFORE UPDATE ON public.microbuild_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_buyer_requests
  BEFORE UPDATE ON public.buyer_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
