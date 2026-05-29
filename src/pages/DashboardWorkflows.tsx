import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  archiveCreatorWorkflow,
  getCreatorPublishedWorkflows,
  hideCreatorWorkflow,
  insertCreatorWorkflowDraft,
  publishCreatorWorkflowAfterAIApproval,
  resolveCreatorProfileForMarketplace,
  runStoredWorkflowAIReviewOnly,
  submitStoredWorkflowForAIReview,
} from '../lib/marketplace';
import { creatorEligibleForWorkflowAuthoring } from '../lib/marketplaceEligibility';
import {
  fmtWorkflowDate,
  fmtWorkflowMoney,
  formatWorkflowAiReviewLabel,
  formatWorkflowReadinessPlain,
  formatWorkflowStatusLabel,
  formatWorkflowVisibilityLabel,
  getWorkflowCardActions,
  getWorkflowListFilter,
  sortWorkflows,
  workflowMatchesSearch,
  type WorkflowListFilter,
  type WorkflowSortKey,
} from '../lib/workflowLabels';
import WorkflowBuyerPreview from '../components/creator/WorkflowBuyerPreview';
import DashboardNav from '../components/DashboardNav';
import type { CreatorProfileRow, PublishedWorkflowRow, UserProfileRow } from '../types/database';
import './Dashboard.css';
import './DashboardWorkflows.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function excerpt(text: string, max: number): string {
  const t = safeStr(text).trim();
  if (!t.length) return '';
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
}

const FILTER_CHIPS: { id: WorkflowListFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'needs', label: 'Needs Improvement' },
  { id: 'approved', label: 'AI Approved' },
  { id: 'published', label: 'Published' },
  { id: 'archive', label: 'Hidden / Archived' },
];

function WorkflowCard({
  row,
  creatorProfile,
  creatorDisplayName,
  requestCount,
  onDidMutate,
}: {
  row: PublishedWorkflowRow;
  creatorProfile: CreatorProfileRow | null;
  creatorDisplayName: string;
  requestCount: number;
  onDidMutate: () => void;
}) {
  const actions = getWorkflowCardActions(row);
  const bucket = getWorkflowListFilter(row);
  const missing = Array.isArray(row.ai_missing_items) ? row.ai_missing_items.length : 0;
  const risks = Array.isArray(row.ai_risk_flags) ? row.ai_risk_flags.length : 0;
  const score =
    typeof row.ai_quality_score === 'number' && Number.isFinite(row.ai_quality_score)
      ? row.ai_quality_score
      : null;
  const readiness = formatWorkflowReadinessPlain(row.ai_publish_readiness, {
    score: score ?? 0,
    missingCount: missing,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function run(
    action: 'ai' | 'submit' | 'publish' | 'hide' | 'archive',
  ) {
    if (!creatorProfile?.id || busy) return;
    if (action === 'hide' && !window.confirm('Hide this workflow from buyer Browse?')) return;
    if (action === 'archive' && !window.confirm('Archive this workflow? It will stay hidden from buyers.')) return;

    setBusy(action);
    setNotice(null);
    let errMsg: string | null = null;
    let okMsg: string | null = null;

    if (action === 'ai') {
      const res = await runStoredWorkflowAIReviewOnly({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
        creatorProfile,
      });
      errMsg = res.ok ? null : (res.error ?? 'AI review failed.');
      okMsg = res.ok ? 'AI review updated.' : null;
    } else if (action === 'submit') {
      const res = await submitStoredWorkflowForAIReview({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
        creatorProfile,
      });
      errMsg = res.ok ? null : (res.error ?? 'Submit failed.');
      okMsg = res.ok ? 'Submitted for AI review.' : null;
    } else if (action === 'publish') {
      const res = await publishCreatorWorkflowAfterAIApproval({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
      });
      errMsg = res.ok ? null : (res.error ?? 'Publish failed.');
      okMsg = res.ok ? 'Published — visible on buyer Browse when public.' : null;
    } else if (action === 'hide') {
      const res = await hideCreatorWorkflow({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
      });
      errMsg = res.ok ? null : (res.error ?? 'Could not hide workflow.');
      okMsg = res.ok ? 'Workflow hidden from buyers.' : null;
    } else {
      const res = await archiveCreatorWorkflow({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
      });
      errMsg = res.ok ? null : (res.error ?? 'Could not archive workflow.');
      okMsg = res.ok ? 'Workflow archived.' : null;
    }

    setBusy(null);
    if (errMsg) setNotice({ kind: 'err', text: errMsg });
    else if (okMsg) setNotice({ kind: 'ok', text: okMsg });
    onDidMutate();
  }

  const desc = excerpt(safeStr(row.description), 140);
  const visLabel = formatWorkflowVisibilityLabel(row.visibility_status);
  const isPublic = bucket === 'published';

  return (
    <article className="wf-v2-card">
      <div className="wf-v2-card-head">
        <h3 className="wf-v2-card-title">{safeStr(row.title, 'Untitled workflow')}</h3>
        <span className="wf-v2-card-date" title="Last updated">
          {fmtWorkflowDate(row.updated_at)}
        </span>
      </div>

      <div className="wf-v2-card-meta">
        {row.category ? <span>{row.category}</span> : null}
        {row.target_industry ? <span>{row.target_industry}</span> : null}
      </div>

      <div className="wf-v2-badges">
        <span className="wf-v2-badge wf-v2-badge--status">{formatWorkflowStatusLabel(row.workflow_status)}</span>
        <span className={`wf-v2-badge${isPublic ? ' wf-v2-badge--public' : ' wf-v2-badge--hidden'}`}>
          {visLabel}
        </span>
        <span className="wf-v2-badge wf-v2-badge--ai">{formatWorkflowAiReviewLabel(row.ai_review_status)}</span>
        {score != null ? <span className="wf-v2-badge wf-v2-badge--score">AI {score}/100</span> : null}
        <span className="wf-v2-badge wf-v2-badge--warn">{readiness}</span>
        {missing > 0 ? <span className="wf-v2-badge wf-v2-badge--warn">{missing} missing</span> : null}
        {risks > 0 ? <span className="wf-v2-badge wf-v2-badge--risk">{risks} risks</span> : null}
      </div>

      {desc ? <p className="wf-v2-desc">{desc}</p> : null}

      <dl className="wf-v2-metrics">
        <div>
          <dt>Price</dt>
          <dd>{fmtWorkflowMoney(row.starting_price)}</dd>
        </div>
        <div>
          <dt>Turnaround</dt>
          <dd>{safeStr(row.estimated_turnaround) || '—'}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>{requestCount}</dd>
        </div>
      </dl>

      <div className="wf-v2-actions">
        {actions.edit ?
          (
            <Link to={`/dashboard/workflows/${row.id}/edit`} className="btn btn-primary btn-sm">
              Edit
            </Link>
          )
        : null}
        {actions.runAi ?
          (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void run('ai')}
            >
              {busy === 'ai' ? 'Running…' : 'Run AI Review'}
            </button>
          )
        : null}
        {actions.submitAi ?
          (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void run('submit')}
            >
              {busy === 'submit' ? 'Submitting…' : 'Submit for AI Review'}
            </button>
          )
        : null}
        {actions.preview ?
          (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? 'Hide preview' : 'Preview as Buyer'}
            </button>
          )
        : null}
        {actions.publish ?
          (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy !== null}
              onClick={() => void run('publish')}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )
        : null}
        {actions.hide ?
          (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void run('hide')}
            >
              {busy === 'hide' ? 'Hiding…' : 'Hide'}
            </button>
          )
        : null}
        {actions.archive ?
          (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void run('archive')}
            >
              {busy === 'archive' ? 'Archiving…' : 'Archive'}
            </button>
          )
        : null}
      </div>

      {previewOpen ?
        (
          <WorkflowBuyerPreview
            workflow={row}
            creatorDisplayName={creatorDisplayName}
            previewMode
          />
        )
      : null}

      {notice ?
        (
          <p className={`wf-v2-notice wf-v2-notice--${notice.kind}`}>{notice.text}</p>
        )
      : null}
    </article>
  );
}

export default function DashboardWorkflows() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [rows, setRows] = useState<PublishedWorkflowRow[]>([]);
  const [workflowCustomizationCounts, setWorkflowCustomizationCounts] = useState<Record<string, number>>({});
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [creatorDisplayName, setCreatorDisplayName] = useState('You');
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [filter, setFilter] = useState<WorkflowListFilter | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<WorkflowSortKey>('updated');

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  const reload = useCallback(async () => {
    if (!user) return;
    const authUid = user.id;
    const { data: up } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', authUid)
      .maybeSingle();

    const prof = (up ?? null) as UserProfileRow | null;
    if (!prof) {
      navigate('/onboarding', { replace: true });
      return;
    }
    if (safeStr(prof.account_type).toLowerCase() !== 'creator') {
      navigate('/dashboard', { replace: true });
      return;
    }

    const cp = await resolveCreatorProfileForMarketplace(authUid, prof);
    setCreatorProfile(cp);
    setCreatorDisplayName(
      safeStr(cp?.display_name) || safeStr(cp?.full_name) || 'You',
    );

    const gate = creatorEligibleForWorkflowAuthoring(cp);
    setGateMsg(gate.ok ? null : gate.message);

    if (cp?.id) {
      const list = await getCreatorPublishedWorkflows(cp.id);
      setRows(list);

      const counts: Record<string, number> = {};
      if (list.length > 0) {
        const ids = list.map((w) => w.id);
        const { data: brData, error: brErr } = await supabase
          .from('buyer_requests')
          .select('source_workflow_id')
          .in('source_workflow_id', ids);
        if (brErr) {
          console.error('[DashboardWorkflows] buyer_requests workflow counts:', brErr);
        } else {
          for (const raw of (brData ?? []) as { source_workflow_id?: string | null }[]) {
            const sid = raw.source_workflow_id;
            if (!sid) continue;
            counts[sid] = (counts[sid] ?? 0) + 1;
          }
        }
      }
      setWorkflowCustomizationCounts(counts);
    } else {
      setRows([]);
      setWorkflowCustomizationCounts({});
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user || authLoading) return;
    let cancelled = false;
    setBusy(true);
    void reload().finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, reload]);

  const stats = useMemo(() => {
    const published = rows.filter((w) => getWorkflowListFilter(w) === 'published').length;
    const needs = rows.filter((w) => getWorkflowListFilter(w) === 'needs').length;
    const draft = rows.filter((w) => getWorkflowListFilter(w) === 'draft').length;
    const requests = Object.values(workflowCustomizationCounts).reduce((a, b) => a + b, 0);
    return { total: rows.length, published, needs, draft, requests };
  }, [rows, workflowCustomizationCounts]);

  const filteredRows = useMemo(() => {
    let list = rows.filter((w) => workflowMatchesSearch(w, searchQuery));
    if (filter !== 'all') {
      list = list.filter((w) => getWorkflowListFilter(w) === filter);
    }
    return sortWorkflows(list, sortKey);
  }, [rows, searchQuery, filter, sortKey]);

  async function handleNewWorkflow() {
    if (!creatorProfile?.id || createBusy || gateMsg) return;
    setCreateBusy(true);
    const res = await insertCreatorWorkflowDraft({
      creatorProfileId: creatorProfile.id,
      title: 'Untitled workflow',
    });
    setCreateBusy(false);
    if (res.ok && res.row?.id) navigate(`/dashboard/workflows/${res.row.id}/edit`);
  }

  if (authLoading || busy || !user) {
    return (
      <div className="dashboard-page">
        <div className="container dashboard-body">
          <DashboardNav />
          <div className="dash-loading">Loading workflows…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container wf-v2-header">
          <div>
            <div className="dashboard-eyebrow">Marketplace · Workflows</div>
            <h1 className="dashboard-title">My Workflows</h1>
            <p className="dashboard-sub mb-browse-intro">
              Create reusable MicroBuild workflows buyers can request and customize.
            </p>
          </div>
          <div className="wf-v2-header-actions">
            {!gateMsg ?
              (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={createBusy || !creatorProfile?.id}
                  onClick={() => void handleNewWorkflow()}
                >
                  {createBusy ? 'Creating…' : 'Create Workflow'}
                </button>
              )
            : null}
            <Link to="/browse" className="btn btn-ghost btn-sm">
              View buyer Browse
            </Link>
          </div>
        </div>
      </div>

      <div className="container dashboard-body">
        <DashboardNav />

        {gateMsg ?
          (
            <section className="dash-empty wf-dash-gate">
              <p>{gateMsg}</p>
            </section>
          )
        : (
            <>
              {rows.length > 0 ?
                (
                  <div className="wf-v2-stats" aria-label="Workflow statistics">
                    <div className="wf-v2-stat">
                      <span className="wf-v2-stat-value">{stats.total}</span>
                      <span className="wf-v2-stat-label">Total workflows</span>
                    </div>
                    <div className="wf-v2-stat">
                      <span className="wf-v2-stat-value">{stats.published}</span>
                      <span className="wf-v2-stat-label">Published</span>
                    </div>
                    <div className="wf-v2-stat">
                      <span className="wf-v2-stat-value">{stats.needs}</span>
                      <span className="wf-v2-stat-label">Needs improvement</span>
                    </div>
                    <div className="wf-v2-stat">
                      <span className="wf-v2-stat-value">{stats.draft}</span>
                      <span className="wf-v2-stat-label">Drafts</span>
                    </div>
                    <div className="wf-v2-stat">
                      <span className="wf-v2-stat-value">{stats.requests}</span>
                      <span className="wf-v2-stat-label">Buyer requests</span>
                    </div>
                  </div>
                )
              : null}

              {rows.length === 0 ?
                (
                  <section className="wf-v2-empty">
                    <h2 className="wf-v2-card-title">Create your first reusable workflow</h2>
                    <p className="subtle">
                      Package a MicroBuild you deliver often so buyers can request and customize it from Browse.
                    </p>
                    <div className="wf-v2-empty-examples" aria-hidden>
                      <span className="wf-v2-example-pill">Quote funnel</span>
                      <span className="wf-v2-example-pill">Booking page</span>
                      <span className="wf-v2-example-pill">Review booster</span>
                      <span className="wf-v2-example-pill">Before/after trust page</span>
                    </div>
                    <p style={{ marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={createBusy || !creatorProfile?.id}
                        onClick={() => void handleNewWorkflow()}
                      >
                        {createBusy ? 'Creating…' : 'Create Workflow'}
                      </button>
                    </p>
                  </section>
                )
              : (
                  <>
                    <div className="wf-v2-toolbar">
                      <input
                        type="search"
                        className="wf-v2-search"
                        placeholder="Search title, category, industry…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search workflows"
                      />
                      <select
                        className="wf-v2-sort"
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as WorkflowSortKey)}
                        aria-label="Sort workflows"
                      >
                        <option value="updated">Recently updated</option>
                        <option value="score">Highest AI score</option>
                        <option value="published">Published first</option>
                      </select>
                      <div className="wf-v2-filters" role="tablist" aria-label="Filter workflows">
                        {FILTER_CHIPS.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            role="tab"
                            aria-selected={filter === chip.id}
                            className={`wf-v2-filter-chip${filter === chip.id ? ' is-active' : ''}`}
                            onClick={() => setFilter(chip.id)}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredRows.length === 0 ?
                      (
                        <section className="wf-v2-empty">
                          <p className="subtle">
                            {filter === 'published' && stats.published === 0
                              ? 'Run AI review and publish your strongest workflow.'
                              : filter === 'needs' && stats.needs === 0
                                ? 'No workflow needs fixes right now.'
                                : 'No workflows match this filter. Try All or clear your search.'}
                          </p>
                        </section>
                      )
                    : (
                        <div className="wf-v2-grid">
                          {filteredRows.map((w) => (
                            <WorkflowCard
                              key={w.id}
                              row={w}
                              creatorProfile={creatorProfile}
                              creatorDisplayName={creatorDisplayName}
                              requestCount={workflowCustomizationCounts[w.id] ?? 0}
                              onDidMutate={() => void reload()}
                            />
                          ))}
                        </div>
                      )}
                  </>
                )}
            </>
          )}
      </div>
    </div>
  );
}
