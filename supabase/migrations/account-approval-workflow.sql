-- ============================================================
-- MicroBuild — Account Approval Workflow v1
-- ============================================================
-- Run after: account-profile-foundation.sql and email-account-profile-fields.sql
--
-- This migration:
--   1. Fixes the too-narrow CHECK constraint on creator_applications.status
--   2. Adds approval/auth linking columns to creator_applications
--   3. Adds approval status columns to user_profiles
--   4. Adds unique indexes for duplicate prevention
--   5. Ensures creator_profiles has auth/user linking columns
--
-- Safe to rerun: ADD COLUMN IF NOT EXISTS, DROP/CREATE CONSTRAINT patterns.
-- ============================================================


-- ─── 1. Fix creator_applications.status CHECK constraint ─────────────────────
-- The original schema only allowed: 'new','reviewing','approved','rejected'
-- The app uses a much larger set. Drop and recreate.

ALTER TABLE public.creator_applications
  DROP CONSTRAINT IF EXISTS creator_applications_status_check;

ALTER TABLE public.creator_applications
  ADD CONSTRAINT creator_applications_status_check CHECK (status IN (
    'new',
    'reviewing',
    'needs_portfolio_review',
    'needs_more_info',
    'approved_pending_payment',
    'active',
    'rejected',
    'suspended'
  ));


-- ─── 2. creator_applications: new columns ────────────────────────────────────

-- Auth linking — populated when logged-in user submits application
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS auth_user_id     uuid;

ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS user_profile_id  uuid
    REFERENCES public.user_profiles (id) ON DELETE SET NULL;

-- Approval tracking (mirrors status; set explicitly by admin)
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS approval_status  text
    DEFAULT 'new'
    CHECK (approval_status IN (
      'new','reviewing','needs_portfolio_review','needs_more_info',
      'approved_pending_payment','active','rejected','suspended'
    ));

-- Admin decision metadata
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS admin_notes         text;

ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS admin_decision_at   timestamptz;

ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS rejected_reason     text;

ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS needs_info_reason   text;

-- Cross-reference to the creator profile created after approval
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS linked_creator_profile_id uuid
    REFERENCES public.creator_profiles (id) ON DELETE SET NULL;

-- updated_at (if not already present)
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- ─── 3. Sync approval_status for existing rows ───────────────────────────────
-- Make sure existing rows have approval_status set from status.

UPDATE public.creator_applications
SET approval_status = status
WHERE approval_status IS NULL;


-- ─── 4. user_profiles: new columns ───────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS account_status             text DEFAULT 'active'
    CHECK (account_status IN ('active','suspended','deactivated'));

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS creator_application_id     uuid
    REFERENCES public.creator_applications (id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS creator_application_status text;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS creator_profile_id         uuid
    REFERENCES public.creator_profiles (id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS approval_status            text;


-- ─── 5. creator_profiles: ensure auth/user linking columns exist ─────────────
-- These may already exist from account-profile-foundation.sql;
-- ADD COLUMN IF NOT EXISTS is safe.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id      uuid;

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS user_profile_id   uuid
    REFERENCES public.user_profiles (id) ON DELETE SET NULL;


-- ─── 6. Duplicate prevention indexes ─────────────────────────────────────────

-- One active (non-rejected, non-suspended) application per auth user
-- (partial unique index — only enforces when auth_user_id is not null and
--  status is not a terminal rejected/suspended state)
DROP INDEX IF EXISTS uidx_creator_apps_auth_user_active;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_apps_auth_user_active
  ON public.creator_applications (auth_user_id)
  WHERE auth_user_id IS NOT NULL
    AND status NOT IN ('rejected', 'suspended');

-- One non-rejected application per email (case-insensitive fallback)
DROP INDEX IF EXISTS uidx_creator_apps_email_active;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_apps_email_active
  ON public.creator_applications (lower(email))
  WHERE status NOT IN ('rejected', 'suspended');

-- One creator_profile per creator_application_id (prevent duplicates)
DROP INDEX IF EXISTS uidx_creator_profiles_application;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_profiles_application
  ON public.creator_profiles (creator_application_id)
  WHERE creator_application_id IS NOT NULL;

-- One creator_profile per user_profile_id (prevent duplicates)
DROP INDEX IF EXISTS uidx_creator_profiles_user_profile;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_profiles_user_profile
  ON public.creator_profiles (user_profile_id)
  WHERE user_profile_id IS NOT NULL;


-- ─── 7. Additional indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_applications_auth_user_id
  ON public.creator_applications (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_creator_applications_user_profile_id
  ON public.creator_applications (user_profile_id);

CREATE INDEX IF NOT EXISTS idx_creator_applications_approval_status
  ON public.creator_applications (approval_status);


-- ─── Verify ──────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='creator_applications'
-- ORDER BY ordinal_position;
