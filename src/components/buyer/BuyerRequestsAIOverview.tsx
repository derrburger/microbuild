import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BuyerRequestsOverview, BuyerRequestInsight, InsightSeverity } from '../../lib/buyerRequestAI';

const SEVERITY_CLASS: Record<InsightSeverity, string> = {
  urgent: 'bmr-ai-sev--urgent',
  warning: 'bmr-ai-sev--warn',
  ready: 'bmr-ai-sev--ready',
  info: 'bmr-ai-sev--info',
  positive: 'bmr-ai-sev--ok',
};

function InsightAction({ insight, onAnchor }: { insight: BuyerRequestInsight; onAnchor?: (anchor: string) => void }) {
  if (insight.targetHref) {
    return (
      <Link to={insight.targetHref} className="btn btn-ghost btn-sm bmr-ai-insight-btn">
        {insight.targetLabel ?? 'Open'}
      </Link>
    );
  }
  if (insight.targetAnchor && onAnchor) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm bmr-ai-insight-btn"
        onClick={() => onAnchor(insight.targetAnchor!)}
      >
        {insight.targetLabel ?? 'View'}
      </button>
    );
  }
  return null;
}

export default function BuyerRequestsAIOverview({
  overview,
  onInsightAnchor,
}: {
  overview: BuyerRequestsOverview;
  onInsightAnchor?: (anchor: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { counts, nextBestAction, insights, emptyState } = overview;

  if (emptyState && insights.length === 0 && !nextBestAction) {
    return (
      <section className="bmr-ai-overview" aria-label="AI Request Overview">
        <header className="bmr-ai-overview-head">
          <div>
            <h2 className="bmr-ai-overview-title">AI Request Overview</h2>
            <p className="bmr-ai-overview-sub">
              MicroBuild reviews your requests and highlights what needs attention.
            </p>
          </div>
        </header>
        <div className="bmr-ai-empty-card">
          <span className={`bmr-ai-sev ${SEVERITY_CLASS[emptyState.severity]}`}>{emptyState.severity}</span>
          <h3 className="bmr-ai-empty-title">{emptyState.title}</h3>
          <p className="bmr-ai-empty-copy">{emptyState.explanation}</p>
          {emptyState.targetHref ?
            <Link to={emptyState.targetHref} className="btn btn-primary btn-sm">
              {emptyState.targetLabel ?? 'Get started'}
            </Link>
          : null}
        </div>
      </section>
    );
  }

  const visibleInsights = showAll ? insights.slice(0, 8) : insights.slice(0, 4);

  return (
    <section className="bmr-ai-overview" aria-label="AI Request Overview">
      <header className="bmr-ai-overview-head">
        <div>
          <h2 className="bmr-ai-overview-title">AI Request Overview</h2>
          <p className="bmr-ai-overview-sub">
            MicroBuild reviews your requests and highlights what needs attention.
          </p>
        </div>
      </header>

      <div className="bmr-ai-count-grid">
        <AiCountCard label="Needs Review" value={counts.needsReview} tone="warn" />
        <AiCountCard label="Waiting for Creators" value={counts.waitingForCreators} tone="neutral" />
        <AiCountCard label="Ready to Select" value={counts.readyToSelect} tone="info" />
        <AiCountCard label="Active Projects" value={counts.activeProjects} tone="info" />
        <AiCountCard label="Delivery Waiting" value={counts.deliveryWaiting} tone="warn" />
        <AiCountCard label="Missing Info" value={counts.missingInfo} tone="warn" />
      </div>

      {nextBestAction ?
        <div className="bmr-ai-next-card">
          <span className="bmr-ai-next-eyebrow">Next best action</span>
          <span className={`bmr-ai-sev ${SEVERITY_CLASS[nextBestAction.severity]}`}>
            {nextBestAction.severity}
          </span>
          <h3 className="bmr-ai-next-title">{nextBestAction.title}</h3>
          <p className="bmr-ai-next-explain">{nextBestAction.explanation}</p>
          <p className="bmr-ai-next-rec">{nextBestAction.recommendedAction}</p>
          <InsightAction insight={nextBestAction} onAnchor={onInsightAnchor} />
        </div>
      : null}

      {visibleInsights.length > 0 ?
        (
          <div className="bmr-ai-insights-grid">
            {visibleInsights.map((ins) => (
              <div key={ins.id} className="bmr-ai-insight-card">
                <span className={`bmr-ai-sev ${SEVERITY_CLASS[ins.severity]}`}>{ins.severity}</span>
                <h4 className="bmr-ai-insight-title">{ins.title}</h4>
                <p className="bmr-ai-insight-explain">{ins.explanation}</p>
                <InsightAction insight={ins} onAnchor={onInsightAnchor} />
              </div>
            ))}
          </div>
        )
      : null}

      {insights.length > 4 ?
        (
          <button type="button" className="bmr-ai-view-all" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer insights' : `View all insights (${insights.length})`}
          </button>
        )
      : null}
    </section>
  );
}

function AiCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'info' | 'neutral';
}) {
  const cls =
    tone === 'warn' ? ' bmr-ai-count-val--warn'
    : tone === 'info' ? ' bmr-ai-count-val--info'
    : '';
  return (
    <div className="bmr-ai-count-card">
      <div className={`bmr-ai-count-val${cls}`}>{value}</div>
      <div className="bmr-ai-count-label">{label}</div>
    </div>
  );
}
