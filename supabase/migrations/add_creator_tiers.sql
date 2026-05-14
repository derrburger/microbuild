-- ============================================================
-- MicroBuild — Creator Tier System Migration
-- ============================================================
-- Run AFTER schema.sql, seed.sql, and policies.sql.
-- This file is idempotent (uses IF NOT EXISTS / IF EXISTS guards)
-- and safe to run even if some columns already exist.
--
-- Do NOT run schema.sql again after running this migration —
-- it will attempt to recreate tables that already have data.
--
-- What this migration adds:
--   1. creator_applications — tier, proof, and credential columns
--   2. creator_applications — extended status CHECK constraint
--   3. creator_profiles     — tier, verification, badge, subscription columns
-- ============================================================


-- ─── 1. creator_applications: tier and proof fields ──────────────────────────
-- All new columns have safe defaults so existing rows are unaffected.

ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS tier                 text
    NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'professional', 'verified')),

  ADD COLUMN IF NOT EXISTS requested_plan_price int
    NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS top_projects         text,

  ADD COLUMN IF NOT EXISTS service_capabilities text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS fulfillment_speed    text,

  ADD COLUMN IF NOT EXISTS github_url           text,

  ADD COLUMN IF NOT EXISTS linkedin_url         text,

  ADD COLUMN IF NOT EXISTS certifications       text,

  ADD COLUMN IF NOT EXISTS credential_links     text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS case_studies         text;


-- ─── 2. creator_applications: extend status CHECK constraint ─────────────────
--
-- The original inline CHECK was auto-named "creator_applications_status_check".
-- If the DROP fails, find the correct name with:
--
--   SELECT conname
--   FROM   pg_constraint
--   WHERE  conrelid = 'public.creator_applications'::regclass
--     AND  contype  = 'c'
--     AND  conname  LIKE '%status%';
--
-- Then replace the name in the DROP CONSTRAINT line below.

ALTER TABLE public.creator_applications
  DROP CONSTRAINT IF EXISTS creator_applications_status_check;

ALTER TABLE public.creator_applications
  ADD CONSTRAINT creator_applications_status_check
  CHECK (status IN (
    'new',
    'reviewing',
    'needs_portfolio_review',
    'needs_more_info',
    'approved_pending_payment',
    'active',
    'rejected',
    'suspended'
  ));


-- ─── 3. creator_profiles: tier, verification, and subscription fields ─────────
-- All columns have safe defaults; the table may be empty at this stage
-- since creator_profiles require a users.id FK (Phase 2 auth).

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS display_name          text,

  ADD COLUMN IF NOT EXISTS profile_photo_url     text,

  ADD COLUMN IF NOT EXISTS tier                  text
    NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'professional', 'verified')),

  ADD COLUMN IF NOT EXISTS verification_status   text
    NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'revoked')),

  ADD COLUMN IF NOT EXISTS badges                text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS tools                 text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS niches                text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS portfolio_links       text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS credential_links      text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS certifications        text,

  ADD COLUMN IF NOT EXISTS admin_notes           text,

  ADD COLUMN IF NOT EXISTS public_profile_status text
    NOT NULL DEFAULT 'hidden'
    CHECK (public_profile_status IN ('hidden', 'pending', 'active', 'suspended')),

  ADD COLUMN IF NOT EXISTS subscription_status   text
    NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'pending_payment', 'active', 'past_due', 'cancelled'));


-- ─── Verification query ───────────────────────────────────────────────────────
-- Run to confirm columns were added:
--
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name IN ('creator_applications', 'creator_profiles')
-- ORDER  BY table_name, ordinal_position;
