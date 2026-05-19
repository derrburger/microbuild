-- ============================================================
-- MicroBuild — Buyer request ↔ published workflow linking (additive only)
-- ============================================================

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'custom_request';

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS source_workflow_id uuid;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS source_workflow_title text;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS source_creator_profile_id uuid;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS customization_notes text;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS requested_from_workflow boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_buyer_requests_source_workflow_id
  ON public.buyer_requests (source_workflow_id);

CREATE INDEX IF NOT EXISTS idx_buyer_requests_source_creator_profile_id
  ON public.buyer_requests (source_creator_profile_id);
