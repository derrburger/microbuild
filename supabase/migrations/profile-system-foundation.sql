-- ============================================================
-- MicroBuild — Profile System Foundation Migration
-- ============================================================
-- Run this in the Supabase SQL editor after:
--   1. schema.sql
--   2. seed.sql
--   3. policies.sql
--   4. migrations/creator-tier-fields.sql   (adds tier cols to creator_applications)
--   5. THIS FILE
--
-- Safe to rerun: all statements use IF NOT EXISTS or IF EXISTS guards.
-- This migration does NOT drop or rename existing columns to avoid
-- breaking existing data. New columns get safe defaults.
-- ============================================================


-- ─── creator_profiles: drop NOT NULL on user_id ──────────────────────────────
-- Admin needs to create profiles before auth users exist.
-- UNIQUE constraint remains: once a user links their account, one profile per user.

ALTER TABLE public.creator_profiles
  ALTER COLUMN user_id DROP NOT NULL;


-- ─── creator_profiles: link to creator_applications ──────────────────────────

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS creator_application_id uuid
    REFERENCES public.creator_applications (id) ON DELETE SET NULL;


-- ─── creator_profiles: display / branding ────────────────────────────────────

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_url text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE;


-- ─── creator_profiles: tier & status columns ─────────────────────────────────

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'professional', 'verified'));

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN (
      'draft', 'approved_pending_payment', 'active', 'hidden', 'suspended', 'rejected'
    ));

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'not_required'
    CHECK (subscription_status IN (
      'not_required', 'not_started', 'pending_payment', 'active', 'past_due', 'canceled'
    ));

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS public_profile_status text NOT NULL DEFAULT 'hidden'
    CHECK (public_profile_status IN ('hidden', 'public', 'paused'));


-- ─── creator_profiles: marketplace data ──────────────────────────────────────
-- 'tools' mirrors the creator_applications column but lives on the profile.
-- The original 'skills' column is left in place for backward compatibility.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS badges text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS niches text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS portfolio_links text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS credential_links text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS certifications text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS proof_links text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS education_or_coursework text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS github_url text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS case_studies text;


-- ─── creator_profiles: admin & AI scoring ────────────────────────────────────

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS admin_notes text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS ai_profile_score integer;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS ai_profile_summary text;


-- ─── creator_profiles: marketplace stats ─────────────────────────────────────
-- Rename semantic columns. Keep original names for backward compat; use
-- completed_builds_count and average_rating as the canonical names going forward.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS completed_builds_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2);


-- ─── creator_profiles: timestamps ────────────────────────────────────────────

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();


-- ─── creator_profiles: updated_at trigger ────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_creator_profiles ON public.creator_profiles;
CREATE TRIGGER set_updated_at_creator_profiles
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ─── creator_profiles: indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_profiles_public_status
  ON public.creator_profiles (public_profile_status);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_tier
  ON public.creator_profiles (tier);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_slug
  ON public.creator_profiles (slug);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_app_id
  ON public.creator_profiles (creator_application_id);


-- ─── business_profiles: make user_id nullable ────────────────────────────────
-- Allows future "guest-style" business profiles before full Supabase Auth.

ALTER TABLE public.business_profiles
  ALTER COLUMN user_id DROP NOT NULL;


-- ─── business_profiles: add missing contact / social columns ─────────────────

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS contact_name text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS website_url text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS instagram_url text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS google_business_url text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS main_goal text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS preferred_microbuild_type text;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS notes text;


-- ─── Verification query ───────────────────────────────────────────────────────
-- Uncomment to confirm columns were added:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   IN ('creator_profiles', 'business_profiles')
-- ORDER  BY table_name, ordinal_position;
