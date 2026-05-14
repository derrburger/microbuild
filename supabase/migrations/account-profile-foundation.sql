-- ============================================================
-- MicroBuild — Account & User Profile Foundation
-- ============================================================
-- Run order:
--   1. schema.sql
--   2. seed.sql
--   3. policies.sql
--   4. migrations/creator-tier-fields.sql
--   5. migrations/profile-system-foundation.sql
--   6. migrations/admin-auth-notes.sql       (comments only)
--   7. THIS FILE
--
-- Safe to rerun: all statements use IF NOT EXISTS / IF EXISTS guards.
-- ============================================================


-- ─── user_profiles table ──────────────────────────────────────────────────────
-- Central account record linked to Supabase auth.users.
-- One row per registered user (buyer, creator, or admin).
-- Created during onboarding after first sign-in.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id       uuid UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  email              text NOT NULL,
  display_name       text,
  avatar_url         text,
  account_type       text NOT NULL DEFAULT 'buyer'
    CHECK (account_type IN ('buyer', 'creator', 'admin')),
  onboarding_status  text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'complete')),
  privacy_status     text NOT NULL DEFAULT 'private'
    CHECK (privacy_status IN ('private', 'public')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Updated-at trigger
DROP TRIGGER IF EXISTS set_updated_at_user_profiles ON public.user_profiles;
CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id
  ON public.user_profiles (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles (email);

CREATE INDEX IF NOT EXISTS idx_user_profiles_account_type
  ON public.user_profiles (account_type);


-- ─── creator_profiles: add platform v2 columns ────────────────────────────────

-- Link creator_profiles to user_profiles (populated after creator signs in)
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS user_profile_id uuid
    REFERENCES public.user_profiles (id) ON DELETE SET NULL;

-- GitHub identity columns
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS github_username text;

-- AI/platform profile scoring (v2 — separate from admin ai_profile_score)
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS profile_strength_score integer;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS profile_strength_summary text;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS profile_completion_items jsonb;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS creator_settings jsonb;


-- ─── RLS for user_profiles ────────────────────────────────────────────────────

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS user_profiles_self_read ON public.user_profiles;
CREATE POLICY user_profiles_self_read ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Users can insert their own profile (onboarding)
DROP POLICY IF EXISTS user_profiles_self_insert ON public.user_profiles;
CREATE POLICY user_profiles_self_insert ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

-- Users can update their own profile
DROP POLICY IF EXISTS user_profiles_self_update ON public.user_profiles;
CREATE POLICY user_profiles_self_update ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- ⚠️ TEMP DEV — anon can read any user_profile (for local admin testing only)
-- REMOVE before public deployment.
DROP POLICY IF EXISTS user_profiles_dev_admin_read ON public.user_profiles;
CREATE POLICY user_profiles_dev_admin_read ON public.user_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ─── creator_profiles: self-edit policy ──────────────────────────────────────
-- Creators can update their own profile once linked (user_id = auth.uid()).
-- admin_notes, ai_profile_score, approval_status, public_profile_status
-- are intentionally excluded from the self-edit surface via app-level logic;
-- this policy grants broad UPDATE so the app controls which columns to write.

DROP POLICY IF EXISTS creator_profiles_self_update ON public.creator_profiles;
CREATE POLICY creator_profiles_self_update ON public.creator_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── Verify (uncomment to check) ─────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'user_profiles'
-- ORDER  BY ordinal_position;
