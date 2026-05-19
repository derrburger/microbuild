-- ============================================================
-- MicroBuild — Proposal / Pricing Foundation v1 (MVP, no Stripe)
-- ============================================================
-- Safe to rerun: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--   CREATE INDEX IF NOT EXISTS only. No destructive DDL.
--
-- Adds `project_proposals` plus linkage columns on `orders`.
-- ⚠️  TEMP DEV RLS on project_proposals — UNSAFE FOR PRODUCTION.
-- ============================================================

-- ─── orders — proposal linkage (payment_status may already exist) ──────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS proposal_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS proposal_status text NOT NULL DEFAULT 'not_started';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_approval_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

-- ─── project_proposals (create before FK from orders) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.project_proposals (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  buyer_request_id          uuid REFERENCES public.buyer_requests (id) ON DELETE SET NULL,
  order_id                  uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  request_application_id    uuid REFERENCES public.request_applications (id) ON DELETE SET NULL,
  creator_profile_id        uuid REFERENCES public.creator_profiles (id) ON DELETE SET NULL,
  buyer_user_profile_id     uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  proposal_title            text NOT NULL DEFAULT 'MicroBuild proposal',
  scope_summary             text NOT NULL DEFAULT '',
  included_deliverables     text NOT NULL DEFAULT '',
  timeline                  text NOT NULL DEFAULT '',
  revision_limit            integer NOT NULL DEFAULT 1,
  proposed_price            numeric,
  platform_fee              numeric,
  creator_payout            numeric,
  proposal_status           text NOT NULL DEFAULT 'draft',
  buyer_approval_status     text NOT NULL DEFAULT 'pending',
  admin_approval_status     text NOT NULL DEFAULT 'pending',
  buyer_feedback            text,
  admin_notes               text,
  workflow_context_snapshot text,
  created_at                timestamptz NOT NULL DEFAULT now (),
  updated_at                timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT project_proposals_status_chk CHECK (
    proposal_status IN (
      'draft',
      'sent',
      'buyer_approved',
      'buyer_changes_requested',
      'buyer_rejected',
      'expired',
      'canceled'
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_project_proposals_proposal_id'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_project_proposals_proposal_id
      FOREIGN KEY (proposal_id) REFERENCES public.project_proposals (id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_project_proposals ON public.project_proposals;
CREATE TRIGGER set_updated_at_project_proposals
  BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at ();

CREATE INDEX IF NOT EXISTS idx_project_proposals_buyer_request
  ON public.project_proposals (buyer_request_id);

CREATE INDEX IF NOT EXISTS idx_project_proposals_order
  ON public.project_proposals (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_project_proposals_one_order
  ON public.project_proposals (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_project_proposals_full_access" ON public.project_proposals;
CREATE POLICY "dev_project_proposals_full_access"
  ON public.project_proposals FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

COMMENT ON POLICY "dev_project_proposals_full_access" ON public.project_proposals IS
  'TEMP DEV — UNSAFE: full access for local testing. Replace before production.';

COMMENT ON TABLE public.project_proposals IS
  'Scope & pricing proposals — MVP placeholders until Stripe/checkout.';
