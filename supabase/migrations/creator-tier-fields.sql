-- ============================================================
-- MicroBuild — creator_applications Tier Fields Migration
-- ============================================================
-- PURPOSE: The frontend (src/pages/CreatorsApply.tsx) and the
--   admin dashboard (src/pages/Admin.tsx) now reference columns
--   that do not exist in the original schema.sql table definition.
--   This migration adds every missing column safely.
--
-- Run order:
--   1. schema.sql          — original table creation
--   2. seed.sql            — template data
--   3. policies.sql        — RLS policies
--   4. THIS FILE           — creator tier columns + extended status
--
-- Safety: every ADD COLUMN uses IF NOT EXISTS so this file is
--   safe to rerun. Existing rows default to safe null/empty values.
--
-- DO NOT run schema.sql again after rows exist — it will not
--   drop/recreate tables (uses IF NOT EXISTS) but the status CHECK
--   drop below is irreversible on older data if rerun carelessly.
-- ============================================================


-- ─── Column audit ────────────────────────────────────────────────────────────
-- Original schema.sql columns (12):
--   id, full_name, email, tools, portfolio_url, portfolio_url_2,
--   niches, experience, available_hours, message, status, created_at
--
-- Frontend INSERT (CreatorsApply.tsx) adds these 10 new columns:
--   tier, requested_plan_price,
--   top_projects, service_capabilities, fulfillment_speed,      ← Professional+
--   github_url, linkedin_url, certifications,                   ← Verified only
--   credential_links, case_studies                              ← Verified only
--
-- Admin SELECT (Admin.tsx) reads ALL of the above 22 columns.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Add missing columns ─────────────────────────────────────────────────────

ALTER TABLE public.creator_applications
  -- Tier selection (all applicants)
  ADD COLUMN IF NOT EXISTS tier                  text
    NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'professional', 'verified')),

  -- Requested subscription price in dollars/month (0 for free tier)
  ADD COLUMN IF NOT EXISTS requested_plan_price  int
    NOT NULL DEFAULT 0,

  -- Professional+ fields
  ADD COLUMN IF NOT EXISTS top_projects          text,

  ADD COLUMN IF NOT EXISTS service_capabilities  text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS fulfillment_speed     text,

  -- Verified-only fields
  ADD COLUMN IF NOT EXISTS github_url            text,

  ADD COLUMN IF NOT EXISTS linkedin_url          text,

  ADD COLUMN IF NOT EXISTS certifications        text,

  ADD COLUMN IF NOT EXISTS credential_links      text[]
    NOT NULL DEFAULT '{}',

  ADD COLUMN IF NOT EXISTS case_studies          text;


-- ─── Extend status CHECK constraint ──────────────────────────────────────────
-- The original status CHECK only allows:
--   'new', 'reviewing', 'approved', 'rejected'
--
-- The admin dashboard now writes 8 status values:
--   'new', 'reviewing', 'needs_portfolio_review', 'needs_more_info',
--   'approved_pending_payment', 'active', 'rejected', 'suspended'
--
-- PostgreSQL auto-named the original inline CHECK as:
--   creator_applications_status_check
--
-- If the DROP below fails with "constraint does not exist", find
-- the actual constraint name with:
--   SELECT conname FROM pg_constraint
--   WHERE  conrelid = 'public.creator_applications'::regclass
--     AND  contype  = 'c'
--     AND  conname  LIKE '%status%';
-- Then replace the name in the DROP line.

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


-- ─── Verify (uncomment to check) ─────────────────────────────────────────────
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'creator_applications'
-- ORDER  BY ordinal_position;
