-- ============================================================
-- MicroBuild — Marketplace Application Foundation v1
-- ============================================================
-- Safe to rerun: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--   CREATE INDEX IF NOT EXISTS only. No destructive DDL.
--
-- TEMP DEV policies are marked UNSAFE FOR PRODUCTION.
-- Replace with scoped RLS before any public deployment.
-- ============================================================


-- ─── buyer_requests — marketplace lifecycle fields ────────────────────────────

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS visibility_status text NOT NULL DEFAULT 'open';

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS application_status text NOT NULL DEFAULT 'open';

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS selected_creator_profile_id uuid
    REFERENCES public.creator_profiles (id) ON DELETE SET NULL;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS selected_request_application_id uuid;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS applications_count integer NOT NULL DEFAULT 0;

-- FK selected_request_application_id after request_applications exists (see below)


-- ─── published_workflows — creator reusable templates for buyer browse ────────

CREATE TABLE IF NOT EXISTS public.published_workflows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  creator_profile_id    uuid NOT NULL REFERENCES public.creator_profiles (id) ON DELETE CASCADE,
  title                 text NOT NULL,
  slug                  text UNIQUE,
  category              text,
  target_industry       text,
  description           text,
  included_features     text,
  setup_requirements    text,
  starting_price        numeric,
  estimated_turnaround  text,
  preview_url           text,
  cover_image_url       text,
  workflow_status       text NOT NULL DEFAULT 'draft'
    CHECK (workflow_status IN (
      'draft', 'submitted_for_review', 'published', 'hidden', 'rejected', 'archived'
    )),
  visibility_status     text NOT NULL DEFAULT 'hidden'
    CHECK (visibility_status IN ('hidden', 'public', 'paused')),
  admin_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now (),
  updated_at            timestamptz NOT NULL DEFAULT now ()
);

DROP TRIGGER IF EXISTS set_updated_at_published_workflows ON public.published_workflows;
CREATE TRIGGER set_updated_at_published_workflows
  BEFORE UPDATE ON public.published_workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at ();

ALTER TABLE public.published_workflows ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_published_workflows_creator
  ON public.published_workflows (creator_profile_id);

CREATE INDEX IF NOT EXISTS idx_published_workflows_workflow_status
  ON public.published_workflows (workflow_status);

CREATE INDEX IF NOT EXISTS idx_published_workflows_visibility
  ON public.published_workflows (visibility_status);


-- ─── request_applications ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.request_applications (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  buyer_request_id          uuid NOT NULL REFERENCES public.buyer_requests (id) ON DELETE CASCADE,
  order_id                  uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  creator_profile_id        uuid NOT NULL REFERENCES public.creator_profiles (id) ON DELETE CASCADE,
  creator_user_profile_id   uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  buyer_user_profile_id     uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  application_status        text NOT NULL DEFAULT 'submitted'
    CHECK (application_status IN (
      'submitted', 'shortlisted', 'buyer_selected', 'rejected', 'withdrawn', 'admin_blocked'
    )),
  proposal_message          text,
  fit_reason                text,
  estimated_timeline        text,
  proposed_price            numeric,
  relevant_workflow_id      uuid REFERENCES public.published_workflows (id) ON DELETE SET NULL,
  creator_questions         text,
  creator_fit_summary       text,
  admin_notes               text,
  buyer_message             text,
  created_at                timestamptz NOT NULL DEFAULT now (),
  updated_at                timestamptz NOT NULL DEFAULT now ()
);

-- One active application per (buyer_request, creator_profile)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_request_apps_active_creator
  ON public.request_applications (buyer_request_id, creator_profile_id)
  WHERE application_status IN ('submitted', 'shortlisted', 'buyer_selected');

DROP TRIGGER IF EXISTS set_updated_at_request_applications ON public.request_applications;
CREATE TRIGGER set_updated_at_request_applications
  BEFORE UPDATE ON public.request_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at ();

ALTER TABLE public.request_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_buyer_requests_selected_application'
      AND conrelid = 'public.buyer_requests'::regclass
  ) THEN
    ALTER TABLE public.buyer_requests
      ADD CONSTRAINT fk_buyer_requests_selected_application
      FOREIGN KEY (selected_request_application_id)
      REFERENCES public.request_applications (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_request_applications_buyer_request
  ON public.request_applications (buyer_request_id);

CREATE INDEX IF NOT EXISTS idx_request_applications_creator
  ON public.request_applications (creator_profile_id);

CREATE INDEX IF NOT EXISTS idx_request_applications_status
  ON public.request_applications (application_status);


-- ─── project_messages ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_messages (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  buyer_request_id          uuid REFERENCES public.buyer_requests (id) ON DELETE CASCADE,
  order_id                  uuid REFERENCES public.orders (id) ON DELETE CASCADE,
  sender_user_profile_id    uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  recipient_user_profile_id uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  sender_role               text,
  message_body              text NOT NULL,
  message_type              text NOT NULL DEFAULT 'general'
    CHECK (message_type IN (
      'general', 'question', 'proposal', 'revision', 'admin_note', 'system_update'
    )),
  visibility                text NOT NULL DEFAULT 'participant'
    CHECK (visibility IN ('participant', 'admin_only', 'buyer_creator', 'public_safe')),
  created_at                timestamptz NOT NULL DEFAULT now ()
);

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_messages_buyer_request
  ON public.project_messages (buyer_request_id);

CREATE INDEX IF NOT EXISTS idx_project_messages_order
  ON public.project_messages (order_id);


-- ─── orders — buyer selection lineage ──────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS request_application_id uuid REFERENCES public.request_applications (id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS selected_by_buyer boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS selection_method text NOT NULL DEFAULT 'admin_assigned'
    CHECK (selection_method IN ('buyer_selected', 'admin_assigned', 'system_recommended'));

CREATE INDEX IF NOT EXISTS idx_orders_request_application_id
  ON public.orders (request_application_id);


-- ─── TEMP DEV — UNSAFE FOR PRODUCTION — request_applications ─────────────────

DROP POLICY IF EXISTS "TEMP_DEV_market_request_applications_anon_authed_all"
  ON public.request_applications;

CREATE POLICY "TEMP_DEV_market_request_applications_anon_authed_all" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.request_applications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ─── TEMP DEV — published_workflows (public browse + dev writes) ────────────

-- Public read: workflows that are explicitly published AND public visibility
DROP POLICY IF EXISTS "TEMP_DEV_market_published_workflows_public_select"
  ON public.published_workflows;

CREATE POLICY "TEMP_DEV_market_published_workflows_public_select" -- TEMP DEV — UNSAFE FOR PRODUCTION (broad anon read subset)
  ON public.published_workflows FOR SELECT TO anon, authenticated
  USING (workflow_status = 'published' AND visibility_status = 'public');

DROP POLICY IF EXISTS "TEMP_DEV_market_published_workflows_select_all_local"
  ON public.published_workflows;

CREATE POLICY "TEMP_DEV_market_published_workflows_select_all_local" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.published_workflows FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "TEMP_DEV_market_published_workflows_creator_dev_write"
  ON public.published_workflows;

CREATE POLICY "TEMP_DEV_market_published_workflows_creator_dev_write" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.published_workflows FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "TEMP_DEV_market_published_workflows_creator_dev_update"
  ON public.published_workflows;

CREATE POLICY "TEMP_DEV_market_published_workflows_creator_dev_update" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.published_workflows FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);


-- ─── TEMP DEV — project_messages ──────────────────────────────────────────────

DROP POLICY IF EXISTS "TEMP_DEV_market_project_messages_anon_authed_select"
  ON public.project_messages;

CREATE POLICY "TEMP_DEV_market_project_messages_anon_authed_select" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.project_messages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "TEMP_DEV_market_project_messages_anon_authed_insert"
  ON public.project_messages;

CREATE POLICY "TEMP_DEV_market_project_messages_anon_authed_insert" -- TEMP DEV — UNSAFE FOR PRODUCTION
  ON public.project_messages FOR INSERT TO anon, authenticated WITH CHECK (true);


-- ─── Done ─────────────────────────────────────────────────────────────────────
-- After applying: npm run build; run frontend manual tests listed in README.
