-- ============================================================
-- MicroBuild — Published workflows: AI review fields (additive only)
-- ============================================================
-- Safe to rerun: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS only.

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_review_status text NOT NULL DEFAULT 'not_reviewed';

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_quality_score integer NOT NULL DEFAULT 0;

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_publish_readiness text NOT NULL DEFAULT 'not_ready';

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_review_summary text;

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_missing_items text[] DEFAULT '{}'::text[];

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_risk_flags text[] DEFAULT '{}'::text[];

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_suggested_improvements text[] DEFAULT '{}'::text[];

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_recommended_action text;

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS ai_reviewed_at timestamptz;

ALTER TABLE public.published_workflows
  ADD COLUMN IF NOT EXISTS auto_publish_eligible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_published_workflows_ai_review_status
  ON public.published_workflows (ai_review_status);

CREATE INDEX IF NOT EXISTS idx_published_workflows_buyer_browse
  ON public.published_workflows (workflow_status, visibility_status, ai_review_status);
