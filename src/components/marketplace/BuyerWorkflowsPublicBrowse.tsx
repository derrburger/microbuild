import type { PublishedWorkflowRow } from '../../types/database';
import type { MicroBuildListing } from '../../types';
import MicroBuildCard from '../MicroBuildCard';

function safe(v: unknown, fb = ''): string {
  if (v == null) return fb;
  return typeof v === 'string' ? v : fb;
}

function excerpt(text: string, max: number): string {
  const t = safe(text).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export interface BuyerWorkflowCreatorMeta {
  displayName: string;
  tier: string;
  verification_status: string;
}

interface Props {
  workflows: PublishedWorkflowRow[];
  creatorMeta: Record<string, BuyerWorkflowCreatorMeta>;
  platformTemplates: MicroBuildListing[];
  platformLoading: boolean;
  platformNotice?: string | null;
}

export default function BuyerWorkflowsPublicBrowse({
  workflows,
  creatorMeta,
  platformTemplates,
  platformLoading,
  platformNotice,
}: Props) {
  return (
    <div className="browse-buyer-role">
      {workflows.length > 0 && (
        <section className="browse-section">
          <h2 className="browse-section-title">Creator workflows</h2>
          <p className="browse-section-intro subtle">
            Reusable storefront builds published by creators. Request / customize flows connect to payments in a later
            phase.
          </p>
          <div className="mb-browse-grid">
            {workflows.map((wf) => {
              const price =
                wf.starting_price != null ? `$${wf.starting_price}` : 'Contact for estimate';
              const previewHref = wf.preview_url?.trim();
              const meta = creatorMeta[wf.creator_profile_id];
              const creatorLabel = meta?.displayName ?? 'Creator';
              const tier = safe(meta?.tier, '').toLowerCase();
              const verified = safe(meta?.verification_status, '').toLowerCase() === 'verified';
              const score =
                typeof wf.ai_quality_score === 'number' && Number.isFinite(wf.ai_quality_score)
                  ? wf.ai_quality_score
                  : null;
              const readiness = safe(wf.ai_publish_readiness ?? '').replace(/_/g, ' ') || '—';
              const desc = excerpt(safe(wf.description), 220);
              const feats = excerpt(safe(wf.included_features), 140);

              return (
                <article key={wf.id} className="mb-card mb-card--workflow">
                  <div className="mb-workflow-badges">
                    {score != null ?
                      <span className="mb-workflow-ai-pill">AI {score}/100</span>
                    : null}
                    {readiness !== '—' ?
                      <span className="mb-workflow-ai-pill mb-workflow-ai-pill--muted">{readiness}</span>
                    : null}
                  </div>
                  <h3 className="mb-card-title">{safe(wf.title, 'Workflow')}</h3>
                  <div className="mb-card-meta">
                    <span>{creatorLabel}</span>
                    {tier ?
                      <span className="mb-workflow-tier">{tier}</span>
                    : null}
                    {verified ?
                      <span className="mb-workflow-verified">Verified</span>
                    : null}
                    {wf.category ? <span>{wf.category}</span> : null}
                    {wf.target_industry ? <span>{wf.target_industry}</span> : null}
                  </div>
                  {desc ?
                    <p className="mb-workflow-desc subtle">{desc}</p>
                  : null}
                  {feats ?
                    <p className="mb-workflow-features subtle">
                      <strong>Includes:</strong> {feats}
                    </p>
                  : null}
                  <div className="mb-card-row mb-card-grid-2">
                    <span className="mb-card-row-label">Starting price</span>
                    <span className="mb-card-row-val">{price}</span>
                    <span className="mb-card-row-label">Turnaround</span>
                    <span className="mb-card-row-val">{wf.estimated_turnaround ?? '—'}</span>
                  </div>
                  {previewHref ?
                    <a
                      className="browse-preview-link subtle"
                      href={previewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview link →
                    </a>
                  : (
                    <span className="subtle buyer-muted-hint">Preview coming soon</span>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm mb-card-placeholder-btn" disabled>
                    Request / Customize — coming soon
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!workflows.length && (
        <section className="browse-section buyer-empty-state mb-browse-empty">
          <span className="buyer-empty-icon">🧩</span>
          <p><strong>Reusable creator workflows are coming soon.</strong></p>
          <p className="buyer-muted-hint subtle">
            When creators publish AI-reviewed workflows they will appear here automatically.
          </p>
        </section>
      )}

      <section className="browse-section browse-section--templates">
        <h2 className="browse-section-title">Platform starter examples</h2>
        <p className="browse-section-intro subtle">{platformNotice}</p>
        {platformLoading ?
          (
            <div className="browse-loading">
              <div className="cards-grid">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="card-skeleton" />
                ))}
              </div>
            </div>
          )
        : platformTemplates.length > 0 ?
          (
            <div className="cards-grid">
              {platformTemplates.slice(0, 8).map((listing) => (
                <MicroBuildCard key={`pf-${listing.id}`} listing={listing} />
              ))}
            </div>
          )
        : (
          <p className="subtle">Starter examples unavailable right now.</p>
        )}
      </section>
    </div>
  );
}
