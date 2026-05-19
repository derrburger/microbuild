-- ============================================================
-- MicroBuild — Project Agreement v1 (additive only)
-- ============================================================
-- Safe to rerun: ADD COLUMN IF NOT EXISTS only.
-- Buyer ↔ creator agreement on project_proposals + orders mirror.
-- ============================================================

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS creator_confirmed_at timestamptz;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS creator_approval_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS ai_agreement_summary text;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS ai_missing_scope_items text[];

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS ai_risk_flags text[];

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS ai_recommended_next_step text;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'not_started';

COMMENT ON COLUMN public.project_proposals.agreement_status IS
  'draft | buyer_confirmed | creator_confirmed | confirmed | changes_requested';

COMMENT ON COLUMN public.orders.agreement_status IS
  'not_started | draft | buyer_confirmed | creator_confirmed | confirmed | changes_requested';
