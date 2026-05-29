-- ============================================================
-- MicroBuild — Buyer request management (cancel / archive / soft-delete)
-- Additive only — no destructive schema changes
-- ============================================================

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.buyer_requests
  ADD COLUMN IF NOT EXISTS request_visibility text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_buyer_requests_request_visibility
  ON public.buyer_requests (request_visibility);

CREATE INDEX IF NOT EXISTS idx_buyer_requests_archived_at
  ON public.buyer_requests (archived_at)
  WHERE archived_at IS NOT NULL;
