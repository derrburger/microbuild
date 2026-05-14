-- ============================================================
-- MicroBuild — Email Account Profile Fields
-- ============================================================
-- Run order: after account-profile-foundation.sql (migration #6)
-- This file adds additional fields needed for email/password auth
-- accounts and deferred GitHub OAuth.
--
-- Safe to rerun: all statements use IF NOT EXISTS / OR REPLACE guards.
-- ============================================================


-- ─── user_profiles: add github_url ───────────────────────────────────────────
-- Stores the user's public GitHub profile URL as a plain link.
-- Not used for OAuth — just for display on creator profiles.
-- GitHub OAuth is deferred until a stable production domain is established.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS github_url text;

-- ─── user_profiles: add avatar_url ───────────────────────────────────────────
-- Allow users to set a profile avatar URL manually (email auth users have none
-- auto-populated unlike GitHub OAuth users).
-- Note: creator_profiles already has profile_photo_url for public display.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;


-- ─── Verify (uncomment to check) ─────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'user_profiles'
-- ORDER  BY ordinal_position;
