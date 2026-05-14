-- ============================================================
-- MicroBuild — Row Level Security Policies (MVP)
-- ============================================================
-- Run order:
--   1. schema.sql   — create tables, indexes, triggers
--   2. seed.sql     — insert categories and template listings
--   3. policies.sql — this file (enable RLS + create policies)
--
-- Safe to rerun: each policy is dropped before being recreated,
-- so running this file a second time is always a no-op.
--
-- What these policies cover (MVP / no-auth phase):
--   ✓ Public SELECT  on microbuild_categories
--   ✓ Public SELECT  on microbuild_templates  (active rows only)
--   ✓ Public INSERT  on buyer_requests        (guest form submissions)
--   ✓ Public INSERT  on creator_applications  (guest form submissions)
--   ✓ Public INSERT  on business_profiles     (stub for future use)
--
-- What is NOT covered here (deferred to Phase 2 — Auth):
--   ✗ Buyers reading their own requests
--   ✗ Creators reading assigned orders / build packets
--   ✗ Admin reads/writes (use service-role key in edge functions)
--   ✗ Authenticated-user SELECT on buyer_requests / creator_applications
-- ============================================================


-- ─── microbuild_categories — public read ─────────────────────────────────────

ALTER TABLE public.microbuild_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read" ON public.microbuild_categories;
CREATE POLICY "categories_public_read"
  ON public.microbuild_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ─── microbuild_templates — public read (active listings only) ───────────────

ALTER TABLE public.microbuild_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_public_read" ON public.microbuild_templates;
CREATE POLICY "templates_public_read"
  ON public.microbuild_templates
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);


-- ─── buyer_requests — anonymous insert ───────────────────────────────────────
-- Guests can submit a request without creating an account.
-- SELECT is intentionally locked down — only the service-role key (admin)
-- can read submissions until buyer auth is wired in Phase 2.

ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyer_requests_anon_insert" ON public.buyer_requests;
CREATE POLICY "buyer_requests_anon_insert"
  ON public.buyer_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ─── creator_applications — anonymous insert ─────────────────────────────────
-- Same pattern as buyer_requests.

ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_applications_anon_insert" ON public.creator_applications;
CREATE POLICY "creator_applications_anon_insert"
  ON public.creator_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ─── business_profiles — insert stub (Phase 2) ───────────────────────────────
-- business_profiles.user_id is NOT NULL and FKs into public.users, so this
-- policy only becomes usable once Supabase Auth is wired (Phase 2).
-- It is defined now so the RLS table is not fully locked when auth arrives.
-- Guests cannot use this path — buyer_requests stores business info inline.

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_profiles_owner_insert" ON public.business_profiles;
CREATE POLICY "business_profiles_owner_insert"
  ON public.business_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_owner_select" ON public.business_profiles;
CREATE POLICY "business_profiles_owner_select"
  ON public.business_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── DEVELOPMENT ONLY — Admin page read access ───────────────────────────────
-- These policies let the anon key SELECT from buyer_requests and
-- creator_applications, which makes the /admin page show real submissions.
--
-- ⚠️  SECURITY WARNING: These make ALL submissions readable to anyone who
--     knows the Supabase project URL and anon key. This is intentional for
--     LOCAL MVP DEVELOPMENT ONLY and must be removed or replaced before the
--     app is made publicly accessible.
--
-- STATUS: ACTIVE — These policies have been applied to the development
--     Supabase project so that /admin reads live data during MVP development.
--
-- BEFORE GOING PUBLIC:
--     1. Remove or comment out these policies.
--     2. Wire Supabase Auth (Phase 2) with admin role checks.
--     3. Replace with auth.uid() = admin_id scoped policies or use the
--        Supabase service-role key in a server-side API route.
--
-- Phase 2 will replace these with admin JWT role checks.

ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buyer_requests_dev_admin_read" ON public.buyer_requests;
CREATE POLICY "buyer_requests_dev_admin_read"
  ON public.buyer_requests
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator_applications_dev_admin_read" ON public.creator_applications;
CREATE POLICY "creator_applications_dev_admin_read"
  ON public.creator_applications
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ─── Verification query (uncomment to check active policies) ─────────────────
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM   pg_policies
-- WHERE  schemaname = 'public'
-- ORDER  BY tablename, cmd;
