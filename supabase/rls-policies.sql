-- ============================================================
-- MicroBuild — Row Level Security Policies (MVP)
-- ============================================================
-- Run this after schema.sql.
-- These policies are the minimum required for the frontend to:
--   1. Read templates and categories anonymously (Browse, BuildDetail)
--   2. Submit buyer requests and creator applications without auth
--
-- What is NOT covered here (deferred to Phase 2 with Auth):
--   - Buyers reading their own requests
--   - Creators reading their assigned orders / build packets
--   - Admin access (use service-role key in a server function)
-- ============================================================


-- ─── microbuild_categories — public read ─────────────────────────────────────

CREATE POLICY "categories_public_read"
  ON public.microbuild_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ─── microbuild_templates — public read (active only) ────────────────────────

CREATE POLICY "templates_public_read"
  ON public.microbuild_templates
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);


-- ─── buyer_requests — anonymous insert only ──────────────────────────────────
-- Guests can submit a request without an account.
-- Only admins (service-role key) can SELECT these rows until Phase 2.

CREATE POLICY "buyer_requests_anon_insert"
  ON public.buyer_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ─── creator_applications — anonymous insert only ────────────────────────────
-- Same pattern as buyer_requests — insert allowed, select locked down.

CREATE POLICY "creator_applications_anon_insert"
  ON public.creator_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ─── Verify policies are active (run as a quick check) ───────────────────────
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
