import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublishedWorkflowRow } from '../../types/database';
import type { MicroBuildListing } from '../../types';
import type { BuyerBrowseCreatorMeta, BuyerBrowseSortKey } from '../../lib/marketplace';
import {
  parseBuyerBrowsePriceFilter,
  sortBuyerBrowseWorkflows,
} from '../../lib/marketplace';
import { getCreatorTierLabel } from '../../lib/profiles';
import {
  fmtWorkflowMoney,
  formatWorkflowReadinessPlain,
  workflowMatchesSearch,
} from '../../lib/workflowLabels';
import MicroBuildCard from '../MicroBuildCard';
import './BuyerWorkflowsPublicBrowse.css';

function safe(v: unknown, fb = ''): string {
  if (v == null) return fb;
  return typeof v === 'string' ? v.trim() : fb;
}

function excerpt(text: string, max: number): string {
  const t = safe(text);
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function listPreview(text: string, maxItems = 3): string[] {
  return safe(text)
    .split(/[\n,;•]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function requestHref(workflowId: string, isLoggedIn: boolean): string {
  const base = `/request?workflowId=${encodeURIComponent(workflowId)}`;
  if (isLoggedIn) return base;
  return `/signin?redirect=${encodeURIComponent(base)}&reason=workflow`;
}

interface Props {
  workflows: PublishedWorkflowRow[];
  creatorMeta: Record<string, BuyerBrowseCreatorMeta>;
  platformTemplates: MicroBuildListing[];
  platformLoading: boolean;
  platformNotice?: string | null;
  loadError?: string | null;
  isLoggedIn?: boolean;
}

export default function BuyerWorkflowsPublicBrowse({
  workflows,
  creatorMeta,
  platformTemplates,
  platformLoading,
  platformNotice,
  loadError,
  isLoggedIn = true,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [industry, setIndustry] = useState('all');
  const [priceFilter, setPriceFilter] = useState<'any' | 'under200' | '200_400' | '400plus'>('any');
  const [turnaroundFilter, setTurnaroundFilter] = useState('all');
  const [sortKey, setSortKey] = useState<BuyerBrowseSortKey>('recommended');
  const [detailId, setDetailId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const w of workflows) {
      const c = safe(w.category);
      if (c) set.add(c);
    }
    return [...set].sort();
  }, [workflows]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const w of workflows) {
      const i = safe(w.target_industry);
      if (i) set.add(i);
    }
    return [...set].sort();
  }, [workflows]);

  const turnaroundOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workflows) {
      const t = safe(w.estimated_turnaround);
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [workflows]);

  const filtered = useMemo(() => {
    let rows = workflows.filter((w) => workflowMatchesSearch(w, search));
    if (category !== 'all') rows = rows.filter((w) => safe(w.category) === category);
    if (industry !== 'all') rows = rows.filter((w) => safe(w.target_industry) === industry);
    if (turnaroundFilter !== 'all') {
      rows = rows.filter((w) => safe(w.estimated_turnaround) === turnaroundFilter);
    }
    rows = rows.filter((w) => parseBuyerBrowsePriceFilter(w, priceFilter));
    return sortBuyerBrowseWorkflows(rows, sortKey);
  }, [workflows, search, category, industry, turnaroundFilter, priceFilter, sortKey]);

  const stats = useMemo(() => {
    const aiReviewed = workflows.filter((w) => typeof w.ai_quality_score === 'number').length;
    return {
      published: workflows.length,
      categories: categories.length,
      aiReviewed,
      customizable: workflows.length,
    };
  }, [workflows, categories.length]);

  const detailWorkflow = detailId ? workflows.find((w) => w.id === detailId) ?? null : null;
  const detailMeta = detailWorkflow ? creatorMeta[detailWorkflow.creator_profile_id] : null;

  return (
    <div className="bw-browse">
      {loadError && (
        <div className="bw-error-banner" role="alert">
          {loadError} Published workflows may be unavailable until the connection is restored.
        </div>
      )}

      <div className="bw-stats-row">
        <div className="bw-stat">
          <span className="bw-stat-val">{stats.published}</span>
          <span className="bw-stat-label">Published workflows</span>
        </div>
        <div className="bw-stat">
          <span className="bw-stat-val">{stats.categories}</span>
          <span className="bw-stat-label">Categories</span>
        </div>
        <div className="bw-stat">
          <span className="bw-stat-val">{stats.aiReviewed}</span>
          <span className="bw-stat-label">AI-reviewed</span>
        </div>
        <div className="bw-stat">
          <span className="bw-stat-val">{stats.customizable}</span>
          <span className="bw-stat-label">Customization available</span>
        </div>
      </div>

      <div className="bw-toolbar">
        <input
          className="bw-search"
          type="search"
          placeholder="Search workflows, industries, features…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search workflows"
        />
        <div className="bw-filters">
          <select className="bw-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select className="bw-select" value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry">
            <option value="all">All industries</option>
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <select
            className="bw-select"
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as typeof priceFilter)}
            aria-label="Price range"
          >
            <option value="any">Any price</option>
            <option value="under200">Under $200</option>
            <option value="200_400">$200 – $400</option>
            <option value="400plus">$400+</option>
          </select>
          {turnaroundOptions.length > 0 && (
            <select
              className="bw-select"
              value={turnaroundFilter}
              onChange={(e) => setTurnaroundFilter(e.target.value)}
              aria-label="Turnaround"
            >
              <option value="all">Any turnaround</option>
              {turnaroundOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <select
            className="bw-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as BuyerBrowseSortKey)}
            aria-label="Sort workflows"
          >
            <option value="recommended">Recommended</option>
            <option value="score">Highest AI score</option>
            <option value="price_asc">Lowest starting price</option>
            <option value="turnaround">Fastest turnaround</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {workflows.length === 0 ? (
        <section className="bw-empty bw-empty--primary">
          <span className="bw-empty-icon" aria-hidden>🧩</span>
          <h2 className="bw-empty-title">Creator workflows are coming soon.</h2>
          <p className="bw-empty-text">
            When approved creators publish AI-reviewed workflows, they will appear here automatically.
            You can still explore platform starter examples below for inspiration.
          </p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="bw-empty">
          <p className="bw-empty-text">No workflows match your filters. Try clearing search or filters.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            setSearch('');
            setCategory('all');
            setIndustry('all');
            setPriceFilter('any');
            setTurnaroundFilter('all');
          }}>
            Clear filters
          </button>
        </section>
      ) : (
        <section className="bw-workflows-section">
          <div className="bw-section-head">
            <h2 className="bw-section-title">Creator-published workflows</h2>
            <p className="bw-section-sub">
              Reusable MicroBuild workflows from vetted creators. Request / Customize to tailor one for your business.
            </p>
          </div>
          <div className="bw-grid">
            {filtered.map((wf) => (
              <WorkflowMarketplaceCard
                key={wf.id}
                workflow={wf}
                meta={creatorMeta[wf.creator_profile_id]}
                isLoggedIn={isLoggedIn}
                onViewDetails={() => setDetailId(wf.id)}
              />
            ))}
          </div>
        </section>
      )}

      {detailWorkflow && (
        <WorkflowDetailPanel
          workflow={detailWorkflow}
          meta={detailMeta ?? undefined}
          isLoggedIn={isLoggedIn}
          onClose={() => setDetailId(null)}
        />
      )}

      <section className="bw-starters-section">
        <div className="bw-starters-head">
          <span className="bw-starters-badge">Platform starter examples</span>
          <h2 className="bw-starters-title">Illustrative MicroBuild templates</h2>
          <p className="bw-starters-sub subtle">
            {platformNotice ?? 'Curated platform examples — not live creator storefront listings.'}
          </p>
        </div>
        {platformLoading ? (
          <div className="bw-starters-loading">
            {[1, 2, 3].map((n) => (
              <div key={n} className="card-skeleton" />
            ))}
          </div>
        ) : platformTemplates.length > 0 ? (
          <div className="bw-starters-grid cards-grid">
            {platformTemplates.slice(0, 6).map((listing) => (
              <MicroBuildCard key={`starter-${listing.id}`} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="subtle">Starter examples unavailable right now.</p>
        )}
      </section>
    </div>
  );
}

function WorkflowMarketplaceCard({
  workflow,
  meta,
  isLoggedIn,
  onViewDetails,
}: {
  workflow: PublishedWorkflowRow;
  meta?: BuyerBrowseCreatorMeta;
  isLoggedIn: boolean;
  onViewDetails: () => void;
}) {
  const title = safe(workflow.title, 'Untitled workflow');
  const creatorName = meta?.displayName ?? 'MicroBuild Creator';
  const tierLabel = getCreatorTierLabel(meta?.tier ?? 'free');
  const verified = safe(meta?.verificationStatus).toLowerCase() === 'verified';
  const score =
    typeof workflow.ai_quality_score === 'number' && Number.isFinite(workflow.ai_quality_score)
      ? workflow.ai_quality_score
      : null;
  const missing = Array.isArray(workflow.ai_missing_items) ? workflow.ai_missing_items.length : 0;
  const readiness = formatWorkflowReadinessPlain(workflow.ai_publish_readiness, {
    score: score ?? 0,
    missingCount: missing,
  });
  const features = listPreview(safe(workflow.included_features), 3);
  const setup = excerpt(safe(workflow.setup_requirements), 90);
  const previewHref = safe(workflow.preview_url);
  const cover = safe(workflow.cover_image_url);
  const reqTo = requestHref(workflow.id, isLoggedIn);

  return (
    <article className="bw-card">
      {cover ? (
        <div className="bw-card-cover">
          <img src={cover} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className="bw-card-badges">
        {score != null ? <span className="bw-pill bw-pill--ai">AI {score}/100</span> : null}
        <span className="bw-pill bw-pill--muted">{readiness}</span>
      </div>
      <h3 className="bw-card-title">{title}</h3>
      <div className="bw-creator-row">
        {meta?.profilePhotoUrl ? (
          <img className="bw-creator-avatar" src={meta.profilePhotoUrl} alt="" />
        ) : (
          <span className="bw-creator-avatar bw-creator-avatar--fallback">{creatorName.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="bw-creator-info">
          <span className="bw-creator-name">{creatorName}</span>
          <span className="bw-creator-badges">
            <span className="bw-tier-badge">{tierLabel}</span>
            {verified ? <span className="bw-verified-badge">Verified</span> : null}
          </span>
        </div>
      </div>
      <div className="bw-card-tags">
        {workflow.category ? <span className="bw-tag">{workflow.category}</span> : null}
        {workflow.target_industry ? <span className="bw-tag bw-tag--muted">{workflow.target_industry}</span> : null}
      </div>
      {safe(workflow.description) ? (
        <p className="bw-card-desc">{excerpt(safe(workflow.description), 160)}</p>
      ) : null}
      {features.length > 0 && (
        <ul className="bw-feature-list">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {setup ? (
        <p className="bw-setup-preview"><strong>Setup:</strong> {setup}</p>
      ) : null}
      <div className="bw-card-pricing">
        <div>
          <span className="bw-price-label">Starting price</span>
          <span className="bw-price-val">{fmtWorkflowMoney(workflow.starting_price)}</span>
        </div>
        <div>
          <span className="bw-price-label">Turnaround</span>
          <span className="bw-price-val">{safe(workflow.estimated_turnaround) || '—'}</span>
        </div>
      </div>
      {previewHref ? (
        <a className="bw-preview-link" href={previewHref} target="_blank" rel="noopener noreferrer">
          View preview →
        </a>
      ) : null}
      <div className="bw-card-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onViewDetails}>
          View details
        </button>
        <Link to={reqTo} className="btn btn-primary btn-sm bw-cta-btn">
          {isLoggedIn ? 'Request / Customize' : 'Sign in to request'}
        </Link>
      </div>
    </article>
  );
}

function WorkflowDetailPanel({
  workflow,
  meta,
  isLoggedIn,
  onClose,
}: {
  workflow: PublishedWorkflowRow;
  meta?: BuyerBrowseCreatorMeta;
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  const title = safe(workflow.title, 'Workflow');
  const creatorName = meta?.displayName ?? 'MicroBuild Creator';
  const tierLabel = getCreatorTierLabel(meta?.tier ?? 'free');
  const verified = safe(meta?.verificationStatus).toLowerCase() === 'verified';
  const score =
    typeof workflow.ai_quality_score === 'number' && Number.isFinite(workflow.ai_quality_score)
      ? workflow.ai_quality_score
      : null;
  const aiSummary = safe(workflow.ai_review_summary);
  const reqTo = requestHref(workflow.id, isLoggedIn);

  return (
    <div className="bw-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="bw-detail-title">
      <button type="button" className="bw-detail-backdrop" aria-label="Close" onClick={onClose} />
      <div className="bw-detail-panel">
        <div className="bw-detail-header">
          <h2 id="bw-detail-title" className="bw-detail-title">{title}</h2>
          <button type="button" className="bw-detail-close" onClick={onClose} aria-label="Close details">×</button>
        </div>
        <div className="bw-detail-body">
          <div className="bw-detail-creator">
            {meta?.profilePhotoUrl ? (
              <img className="bw-creator-avatar bw-creator-avatar--lg" src={meta.profilePhotoUrl} alt="" />
            ) : (
              <span className="bw-creator-avatar bw-creator-avatar--lg bw-creator-avatar--fallback">
                {creatorName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <div className="bw-creator-name">{creatorName}</div>
              <div className="bw-creator-badges">
                <span className="bw-tier-badge">{tierLabel}</span>
                {verified ? <span className="bw-verified-badge">Verified</span> : null}
              </div>
              {workflow.creator_profile_id ? (
                <Link to={`/creator/${workflow.creator_profile_id}`} className="bw-detail-profile-link">
                  View creator profile →
                </Link>
              ) : null}
            </div>
          </div>
          <div className="bw-detail-tags">
            {workflow.category ? <span className="bw-tag">{workflow.category}</span> : null}
            {workflow.target_industry ? <span className="bw-tag">Ideal for: {workflow.target_industry}</span> : null}
            {score != null ? <span className="bw-pill bw-pill--ai">AI quality {score}/100</span> : null}
          </div>
          {safe(workflow.description) ? (
            <section className="bw-detail-block">
              <h3>Description</h3>
              <p>{safe(workflow.description)}</p>
            </section>
          ) : null}
          {safe(workflow.included_features) ? (
            <section className="bw-detail-block">
              <h3>Included features</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{safe(workflow.included_features)}</p>
            </section>
          ) : null}
          {safe(workflow.setup_requirements) ? (
            <section className="bw-detail-block">
              <h3>Setup requirements</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{safe(workflow.setup_requirements)}</p>
            </section>
          ) : null}
          {aiSummary ? (
            <section className="bw-detail-block bw-detail-block--ai">
              <h3>AI review summary</h3>
              <p>{aiSummary}</p>
            </section>
          ) : null}
          <div className="bw-detail-pricing">
            <div><span>Starting price</span><strong>{fmtWorkflowMoney(workflow.starting_price)}</strong></div>
            <div><span>Est. turnaround</span><strong>{safe(workflow.estimated_turnaround) || '—'}</strong></div>
          </div>
          <section className="bw-detail-block bw-detail-customize">
            <h3>Customization</h3>
            <p>
              Request / Customize opens a guided form pre-filled with this workflow&apos;s scope. You describe your
              business, branding, and changes — creators apply through the marketplace (no auto-assignment).
            </p>
          </section>
        </div>
        <div className="bw-detail-footer">
          {safe(workflow.preview_url) ? (
            <a
              className="btn btn-ghost btn-sm"
              href={safe(workflow.preview_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open preview
            </a>
          ) : null}
          <Link to={reqTo} className="btn btn-primary bw-cta-btn">
            {isLoggedIn ? 'Request / Customize' : 'Create account to request'}
          </Link>
        </div>
        {!isLoggedIn && (
          <p className="bw-detail-signin-note subtle">
            You&apos;ll be asked to sign in first. Guest submissions are also supported from the request form after sign-in.
          </p>
        )}
      </div>
    </div>
  );
}
