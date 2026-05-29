import type { PublishedWorkflowRow } from '../../types/database';
import {
  formatWorkflowAiReviewLabel,
  formatWorkflowReadinessPlain,
} from '../../lib/workflowLabels';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export interface WorkflowAIPanelProps {
  row: PublishedWorkflowRow | null;
  loading?: boolean;
}

export default function WorkflowAIPanel({ row, loading }: WorkflowAIPanelProps) {
  if (loading) {
    return (
      <aside className="wf-ai-panel">
        <h3 className="wf-ai-panel-title">AI review</h3>
        <p className="subtle">Loading review…</p>
      </aside>
    );
  }

  if (!row) {
    return (
      <aside className="wf-ai-panel">
        <h3 className="wf-ai-panel-title">AI review</h3>
        <p className="subtle">Save your draft and run AI review to see quality feedback.</p>
      </aside>
    );
  }

  const score =
    typeof row.ai_quality_score === 'number' && Number.isFinite(row.ai_quality_score)
      ? row.ai_quality_score
      : null;
  const missing = Array.isArray(row.ai_missing_items) ? row.ai_missing_items.filter(Boolean) : [];
  const risks = Array.isArray(row.ai_risk_flags) ? row.ai_risk_flags.filter(Boolean) : [];
  const suggestions = Array.isArray(row.ai_suggested_improvements)
    ? row.ai_suggested_improvements.filter(Boolean)
    : [];
  const readiness = formatWorkflowReadinessPlain(row.ai_publish_readiness, {
    score: score ?? 0,
    missingCount: missing.length,
  });
  const aiLabel = formatWorkflowAiReviewLabel(row.ai_review_status);
  const summary = safe(row.ai_review_summary, 'Run AI review to populate this panel.');
  const nextStep = safe(row.ai_recommended_action, '');
  const autoPub = row.auto_publish_eligible === true;

  return (
    <aside className="wf-ai-panel" aria-label="AI workflow review">
      <h3 className="wf-ai-panel-title">AI review</h3>

      <div className="wf-ai-panel-score-row">
        {score != null ?
          <div className="wf-ai-score-ring" data-tier={score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'}>
            <span className="wf-ai-score-num">{score}</span>
            <span className="wf-ai-score-of">/100</span>
          </div>
        : (
          <div className="wf-ai-score-ring wf-ai-score-ring--empty">—</div>
        )}
        <div>
          <p className="wf-ai-readiness-label">{readiness}</p>
          <p className="subtle wf-ai-status-line">Review status: {aiLabel}</p>
        </div>
      </div>

      {autoPub ?
        <p className="wf-ai-eligible">Eligible for auto-publish after submit (score 85+).</p>
      : null}

      {nextStep ? <p className="wf-ai-next-step"><strong>Recommended next step:</strong> {nextStep}</p> : null}

      <p className="wf-ai-summary">{summary}</p>

      {missing.length > 0 ?
        (
          <div className="wf-ai-block">
            <strong>Missing items ({missing.length})</strong>
            <ul className="wf-dash-ul">
              {missing.map((m) => (
                <li key={m}>{safe(m)}</li>
              ))}
            </ul>
          </div>
        )
      : (
          <p className="subtle wf-ai-none">No missing checklist items flagged.</p>
        )}

      {risks.length > 0 ?
        (
          <div className="wf-ai-block wf-ai-block--risk">
            <strong>Risk flags ({risks.length})</strong>
            <ul className="wf-dash-ul">
              {risks.map((r) => (
                <li key={r}>{safe(r)}</li>
              ))}
            </ul>
          </div>
        )
      : null}

      {suggestions.length > 0 ?
        (
          <div className="wf-ai-block">
            <strong>Suggested improvements</strong>
            <ul className="wf-dash-ul">
              {suggestions.map((s) => (
                <li key={s}>{safe(s)}</li>
              ))}
            </ul>
          </div>
        )
      : null}
    </aside>
  );
}
