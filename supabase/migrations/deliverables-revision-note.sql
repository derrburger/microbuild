-- MicroBuild — Deliverable revision feedback for creators (workspace v1)
-- Safe idempotent DDL: ADD COLUMN IF NOT EXISTS only.
-- Run after project-pipeline-foundation.sql

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS revision_note text;
