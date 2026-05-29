import type { PublishedWorkflowRow } from '../../types/database';
import {
  fmtWorkflowMoney,
  formatWorkflowReadinessPlain,
} from '../../lib/workflowLabels';

function safe(v: unknown, fb = ''): string {
  if (v == null) return fb;
  return typeof v === 'string' ? v.trim() : fb;
}

function excerpt(text: string, max: number): string {
  const t = safe(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export interface WorkflowBuyerPreviewProps {
  workflow: Pick<
    PublishedWorkflowRow,
    | 'title'
    | 'category'
    | 'target_industry'
    | 'description'
    | 'included_features'
    | 'starting_price'
    | 'estimated_turnaround'
    | 'preview_url'
    | 'cover_image_url'
    | 'ai_quality_score'
    | 'ai_publish_readiness'
    | 'ai_missing_items'
  >;
  creatorDisplayName?: string;
  /** When true, show buyer Browse styling without live CTA */
  previewMode?: boolean;
  className?: string;
}

/**
 * Shows how a workflow appears on buyer Browse — preview-only Request button.
 */
export default function WorkflowBuyerPreview({
  workflow,
  creatorDisplayName = 'You',
  previewMode = true,
  className = '',
}: WorkflowBuyerPreviewProps) {
  const title = safe(workflow.title, 'Untitled workflow');
  const desc = excerpt(safe(workflow.description), 220);
  const feats = excerpt(safe(workflow.included_features), 140);
  const score =
    typeof workflow.ai_quality_score === 'number' && Number.isFinite(workflow.ai_quality_score)
      ? workflow.ai_quality_score
      : null;
  const missing = Array.isArray(workflow.ai_missing_items) ? workflow.ai_missing_items.length : 0;
  const readiness = formatWorkflowReadinessPlain(workflow.ai_publish_readiness, {
    score: score ?? 0,
    missingCount: missing,
  });
  const previewHref = safe(workflow.preview_url);
  const cover = safe(workflow.cover_image_url);

  return (
    <div className={`wf-buyer-preview${className ? ` ${className}` : ''}`}>
      <p className="wf-buyer-preview-eyebrow">
        {previewMode ? 'Buyer preview — this is how buyers will see your workflow.' : 'Buyer view'}
      </p>
      <article className="mb-card mb-card--workflow wf-buyer-preview-card">
        {cover ?
          (
            <div className="wf-buyer-preview-cover">
              <img src={cover} alt="" loading="lazy" />
            </div>
          )
        : null}
        <div className="mb-workflow-badges">
          {score != null ? <span className="mb-workflow-ai-pill">AI {score}/100</span> : null}
          <span className="mb-workflow-ai-pill mb-workflow-ai-pill--muted">{readiness}</span>
        </div>
        <h3 className="mb-card-title">{title}</h3>
        <div className="mb-card-meta">
          <span>{creatorDisplayName}</span>
          {workflow.category ? <span>{workflow.category}</span> : null}
          {workflow.target_industry ? <span>{workflow.target_industry}</span> : null}
        </div>
        {desc ? <p className="mb-workflow-desc subtle">{desc}</p> : null}
        {feats ?
          (
            <p className="mb-workflow-features subtle">
              <strong>Includes:</strong> {feats}
            </p>
          )
        : null}
        <div className="mb-card-row mb-card-grid-2">
          <span className="mb-card-row-label">Starting price</span>
          <span className="mb-card-row-val">{fmtWorkflowMoney(workflow.starting_price)}</span>
          <span className="mb-card-row-label">Turnaround</span>
          <span className="mb-card-row-val">{safe(workflow.estimated_turnaround) || '—'}</span>
        </div>
        {previewHref ?
          (
            <a
              className="browse-preview-link subtle"
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview link →
            </a>
          )
        : (
          <span className="subtle buyer-muted-hint">Preview link not set</span>
        )}
        <button type="button" className="btn btn-primary btn-sm mb-card-placeholder-btn" disabled>
          {previewMode ? 'Request / Customize (preview)' : 'Request / Customize'}
        </button>
      </article>
    </div>
  );
}
