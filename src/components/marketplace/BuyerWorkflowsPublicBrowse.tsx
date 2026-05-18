import type { PublishedWorkflowRow } from '../../types/database';
import type { MicroBuildListing } from '../../types';
import MicroBuildCard from '../MicroBuildCard';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

interface Props {
  workflows: PublishedWorkflowRow[];
  creatorLabels: Record<string, string>;
  platformTemplates: MicroBuildListing[];
  platformLoading: boolean;
  platformNotice?: string | null;
}

export default function BuyerWorkflowsPublicBrowse({
  workflows,
  creatorLabels,
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
            Reusable storefront builds published by creators. Request and checkout arrive in a payments phase later.
          </p>
          <div className="mb-browse-grid">
            {workflows.map((wf) => {
              const price =
                wf.starting_price != null ? `$${wf.starting_price}` : 'Contact for estimate';
              const previewHref = wf.preview_url?.trim();

              return (
                <article key={wf.id} className="mb-card mb-card--workflow">
                  <h3 className="mb-card-title">{safe(wf.title, 'Workflow')}</h3>
                  <div className="mb-card-meta">
                    <span>Creator · {creatorLabels[wf.creator_profile_id] ?? 'Creator'}</span>
                    {wf.category ? <span>{wf.category}</span> : null}
                    {wf.target_industry ? <span>{wf.target_industry}</span> : null}
                  </div>
                  <div className="mb-card-row mb-card-grid-2">
                    <span className="mb-card-row-label">Starting price</span>
                    <span className="mb-card-row-val">{price}</span>
                    <span className="mb-card-row-label">Turnaround</span>
                    <span className="mb-card-row-val">{wf.estimated_turnaround ?? '—'}</span>
                  </div>
                  {previewHref ? (
                    <a
                      className="browse-preview-link subtle"
                      href={previewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview link →
                    </a>
                  ) : (
                    <span className="subtle buyer-muted-hint">Preview coming soon</span>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm mb-card-placeholder-btn" disabled>
                    Request customization — foundation placeholder
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
          <p><strong>Reusable workflows are coming soon.</strong></p>
          <p className="buyer-muted-hint subtle">
            When creators publish rows to <code>published_workflows</code> they will populate this section automatically.
          </p>
        </section>
      )}

      <section className="browse-section browse-section--templates">
        <h2 className="browse-section-title">Platform starter MicroBuilds</h2>
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
          <p className="subtle">Starter templates unavailable right now.</p>
        )}
      </section>
    </div>
  );
}
