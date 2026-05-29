/**
 * Human-readable workflow lifecycle labels for creator dashboard (UI-only).
 */

import type { PublishedWorkflowRow, WorkflowAiPublishReadiness } from '../types/database';

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export type WorkflowListFilter = 'all' | 'draft' | 'needs' | 'approved' | 'published' | 'archive';

export type WorkflowSortKey = 'updated' | 'score' | 'published';

export function getWorkflowListFilter(w: PublishedWorkflowRow): WorkflowListFilter {
  const ws = norm(w.workflow_status);
  const vis = norm(w.visibility_status);
  const ai = norm(w.ai_review_status ?? 'not_reviewed');

  if (ws === 'archived' || ws === 'rejected') return 'archive';
  if (ws === 'hidden') return 'archive';
  if (ai === 'risk_flagged') return 'archive';
  if (ws === 'published' && vis === 'public') return 'published';
  if (ai === 'ai_approved' || ws === 'submitted_for_review') return 'approved';
  if (ai === 'needs_improvement') return 'needs';
  return 'draft';
}

export function formatWorkflowStatusLabel(status: string | null | undefined): string {
  const s = norm(status);
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'submitted_for_review':
      return 'Submitted';
    case 'published':
      return 'Published';
    case 'hidden':
      return 'Hidden';
    case 'archived':
      return 'Archived';
    case 'rejected':
      return 'Rejected';
    default:
      return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Draft';
  }
}

export function formatWorkflowVisibilityLabel(status: string | null | undefined): string {
  const s = norm(status);
  switch (s) {
    case 'public':
      return 'Public';
    case 'hidden':
      return 'Hidden';
    case 'private':
      return 'Private';
    default:
      return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Hidden';
  }
}

export function formatWorkflowAiReviewLabel(status: string | null | undefined): string {
  const s = norm(status);
  switch (s) {
    case 'not_reviewed':
      return 'Not reviewed';
    case 'needs_improvement':
      return 'Needs improvement';
    case 'ai_approved':
      return 'AI approved';
    case 'published':
      return 'Published';
    case 'risk_flagged':
      return 'Risk flagged';
    case 'submitted_for_review':
      return 'Submitted';
    default:
      return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not reviewed';
  }
}

export function formatWorkflowReadinessPlain(
  readiness: WorkflowAiPublishReadiness | string | null | undefined,
  opts?: { score?: number; missingCount?: number },
): string {
  const r = norm(readiness);
  const missing = opts?.missingCount ?? 0;
  const score = opts?.score ?? 0;

  switch (r) {
    case 'public_ready':
      return 'Ready to publish';
    case 'ready':
      return score >= 70 ? 'Almost ready' : 'Getting close';
    case 'needs_work':
      if (missing > 2) return 'Needs clearer deliverables';
      return 'Needs improvement';
    case 'not_ready':
      if (score < 30) return 'Description is too vague';
      if (missing > 0) return 'Missing preview or proof';
      return 'Not ready yet';
    default:
      return 'Not reviewed yet';
  }
}

export function workflowMatchesSearch(w: PublishedWorkflowRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q.length) return true;
  const hay = [
    w.title,
    w.category,
    w.target_industry,
    w.description,
    w.included_features,
  ]
    .map((x) => (typeof x === 'string' ? x : ''))
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function sortWorkflows(
  rows: PublishedWorkflowRow[],
  sortKey: WorkflowSortKey,
): PublishedWorkflowRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortKey === 'score') {
      const sa = typeof a.ai_quality_score === 'number' ? a.ai_quality_score : -1;
      const sb = typeof b.ai_quality_score === 'number' ? b.ai_quality_score : -1;
      return sb - sa;
    }
    if (sortKey === 'published') {
      const pa = getWorkflowListFilter(a) === 'published' ? 1 : 0;
      const pb = getWorkflowListFilter(b) === 'published' ? 1 : 0;
      if (pb !== pa) return pb - pa;
    }
    const ta = Date.parse(typeof a.updated_at === 'string' ? a.updated_at : '');
    const tb = Date.parse(typeof b.updated_at === 'string' ? b.updated_at : '');
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return copy;
}

export interface WorkflowCardActions {
  edit: boolean;
  runAi: boolean;
  submitAi: boolean;
  preview: boolean;
  publish: boolean;
  hide: boolean;
  archive: boolean;
}

export function getWorkflowCardActions(w: PublishedWorkflowRow): WorkflowCardActions {
  const bucket = getWorkflowListFilter(w);
  const ai = norm(w.ai_review_status);
  const ws = norm(w.workflow_status);
  const risks = Array.isArray(w.ai_risk_flags) ? w.ai_risk_flags : [];
  const canPublish = ai === 'ai_approved' && ws !== 'published' && risks.length === 0;
  const wasHidden = ws === 'hidden';

  switch (bucket) {
    case 'draft':
      return { edit: true, runAi: true, submitAi: true, preview: false, publish: false, hide: false, archive: false };
    case 'needs':
      return { edit: true, runAi: true, submitAi: true, preview: false, publish: false, hide: false, archive: false };
    case 'approved':
      return { edit: true, runAi: true, submitAi: false, preview: true, publish: canPublish, hide: false, archive: false };
    case 'published':
      return { edit: true, runAi: false, submitAi: false, preview: true, publish: false, hide: true, archive: true };
    case 'archive':
      return {
        edit: ws !== 'archived',
        runAi: wasHidden || ai === 'needs_improvement',
        submitAi: false,
        preview: true,
        publish: canPublish && wasHidden,
        hide: false,
        archive: wasHidden,
      };
    default:
      return { edit: true, runAi: true, submitAi: false, preview: false, publish: false, hide: false, archive: false };
  }
}

export function fmtWorkflowMoney(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function fmtWorkflowDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function computeWorkflowFormCompletion(fields: {
  title: string;
  category: string;
  targetIndustry: string;
  description: string;
  includedFeatures: string;
  setupRequirements: string;
  startingPrice: string;
  estimatedTurnaround: string;
  previewUrl: string;
}): { filled: number; total: number; percent: number } {
  const checks = [
    fields.title.trim().length >= 3,
    fields.category.trim().length >= 2,
    fields.targetIndustry.trim().length >= 2,
    fields.description.trim().length >= 40,
    fields.includedFeatures.trim().length >= 15,
    fields.setupRequirements.trim().length >= 8,
    fields.startingPrice.trim().length > 0 && Number(fields.startingPrice) > 0,
    fields.estimatedTurnaround.trim().length >= 3,
    /^https?:\/\//i.test(fields.previewUrl.trim()),
  ];
  const filled = checks.filter(Boolean).length;
  const total = checks.length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}
