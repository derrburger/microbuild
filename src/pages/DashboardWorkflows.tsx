import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getCreatorPublishedWorkflows,
  insertCreatorWorkflowDraft,
  publishCreatorWorkflowAfterAIApproval,
  resolveCreatorProfileForMarketplace,
  runStoredWorkflowAIReviewOnly,
  submitStoredWorkflowForAIReview,
} from '../lib/marketplace';
import { creatorEligibleForWorkflowAuthoring } from '../lib/marketplaceEligibility';
import DashboardNav from '../components/DashboardNav';
import type { CreatorProfileRow, PublishedWorkflowRow, UserProfileRow } from '../types/database';
import './Dashboard.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function norm(s: unknown): string {
  return safeStr(s).trim().toLowerCase();
}

type WorkflowBucket = 'draft' | 'needs' | 'approved' | 'published' | 'archive';

function workflowBucket(w: PublishedWorkflowRow): WorkflowBucket {
  const ws = norm(w.workflow_status);
  const vis = norm(w.visibility_status);
  const ai = norm(w.ai_review_status ?? 'not_reviewed');

  if (ws === 'archived' || ws === 'rejected') return 'archive';
  if (ai === 'risk_flagged') return 'archive';
  if (ws === 'hidden') return 'archive';
  if (ws === 'published' && vis === 'public') return 'published';
  if (ws === 'published' && vis !== 'public') return 'archive';
  if (ai === 'ai_approved' || ws === 'submitted_for_review') return 'approved';
  if (ai === 'needs_improvement') return 'needs';
  return 'draft';
}

function fmtMoney(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n}` : '—';
}

function WorkflowDashCard({
  row,
  creatorProfile,
  customizationRequestCount,
  onDidMutate,
}: {
  row: PublishedWorkflowRow;
  creatorProfile: CreatorProfileRow | null;
  /** buyer_requests with source_workflow_id = this workflow (v1 dashboard telemetry) */
  customizationRequestCount?: number;
  onDidMutate: () => void;
}) {
  const ws = safeStr(row.workflow_status, 'draft');
  const vis = safeStr(row.visibility_status, 'hidden');
  const aiSt = safeStr(row.ai_review_status ?? 'not_reviewed');
  const score =
    typeof row.ai_quality_score === 'number' && Number.isFinite(row.ai_quality_score)
      ? row.ai_quality_score
      : 0;
  const readiness = safeStr(row.ai_publish_readiness ?? 'not_ready').replace(/_/g, ' ');
  const summary = safeStr(row.ai_review_summary, 'No AI summary yet — save your draft and run review.');
  const missing = Array.isArray(row.ai_missing_items) ? row.ai_missing_items : [];
  const risks = Array.isArray(row.ai_risk_flags) ? row.ai_risk_flags : [];

  const canPublish =
    aiSt === 'ai_approved'
    && ws !== 'published'
    && risks.length === 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function run(action: 'ai' | 'submit' | 'publish') {
    if (!creatorProfile?.id || busy) return;
    setBusy(action);
    setNotice(null);
    let okMsg: string | null = null;
    let errMsg: string | null = null;

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
    } else {
      const res = await publishCreatorWorkflowAfterAIApproval({
        workflowId: row.id,
        creatorProfileId: creatorProfile.id,
      });
      errMsg = res.ok ? null : (res.error ?? 'Publish failed.');
      okMsg = res.ok ? 'Published.' : null;
    }

    setBusy(null);
    if (errMsg) setNotice({ kind: 'err', text: errMsg });
    else if (okMsg) setNotice({ kind: 'ok', text: okMsg });
    onDidMutate();
  }

  return (
    <article className="wf-dash-card">
      <div className="wf-dash-card-head">
        <h3 className="wf-dash-card-title">{safeStr(row.title, 'Untitled workflow')}</h3>
        <div className="wf-dash-card-meta">
          <span>{safeStr(row.category, '—')}</span>
          <span>{safeStr(row.target_industry, '—')}</span>
        </div>
      </div>
      <dl className="wf-dash-dl">
        <div>
          <dt>Starting price</dt>
          <dd>{fmtMoney(row.starting_price)}</dd>
        </div>
        <div>
          <dt>Turnaround</dt>
          <dd>{safeStr(row.estimated_turnaround, '—')}</dd>
        </div>
        <div>
          <dt>Workflow status</dt>
          <dd>{ws}</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>{vis}</dd>
        </div>
        <div>
          <dt>AI score</dt>
          <dd>{score}/100</dd>
        </div>
        <div>
          <dt>AI readiness</dt>
          <dd>{readiness}</dd>
        </div>
        <div>
          <dt>Buyer customization requests</dt>
          <dd>
            {typeof customizationRequestCount === 'number' ?
              customizationRequestCount
            : '—'}
          </dd>
        </div>
      </dl>
      <p className="wf-dash-summary subtle">{summary}</p>
      {missing.length > 0 && (
        <div className="wf-dash-list-block">
          <strong>Missing</strong>
          <ul className="wf-dash-ul">
            {missing.slice(0, 6).map((m) => (
              <li key={m}>{safeStr(m)}</li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div className="wf-dash-list-block wf-dash-list-block--risk">
          <strong>Risk flags</strong>
          <ul className="wf-dash-ul">
            {risks.map((r) => (
              <li key={r}>{safeStr(r)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="wf-dash-actions">
        <Link to={`/dashboard/workflows/${row.id}/edit`} className="btn btn-primary btn-sm">
          Edit
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy !== null}
          onClick={() => void run('ai')}
        >
          {busy === 'ai' ? 'Running…' : 'Run AI review'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy !== null}
          onClick={() => void run('submit')}
        >
          {busy === 'submit' ? 'Submitting…' : 'Submit for AI review'}
        </button>
        {canPublish ?
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
      </div>
      {notice ?
        <p
          className={`wf-dash-inline-msg${notice.kind === 'err' ? ' wf-dash-inline-msg--err' : ''}`}
        >
          {notice.text}
        </p>
      : null}
      {canPublish && (
        <p className="wf-dash-hint subtle">
          AI approved — open the editor to publish when you are ready (instant publish ran if your score cleared the
          auto threshold).
        </p>
      )}
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
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

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

  const buckets = useMemo(() => {
    const draft: PublishedWorkflowRow[] = [];
    const needs: PublishedWorkflowRow[] = [];
    const approved: PublishedWorkflowRow[] = [];
    const published: PublishedWorkflowRow[] = [];
    const archive: PublishedWorkflowRow[] = [];

    for (const w of rows) {
      switch (workflowBucket(w)) {
        case 'draft':
          draft.push(w);
          break;
        case 'needs':
          needs.push(w);
          break;
        case 'approved':
          approved.push(w);
          break;
        case 'published':
          published.push(w);
          break;
        default:
          archive.push(w);
      }
    }

    return { draft, needs, approved, published, archive };
  }, [rows]);

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
          <div className="dash-loading">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container">
          <div className="dashboard-eyebrow">Marketplace · Workflows</div>
          <h1 className="dashboard-title">Published workflows</h1>
          <p className="dashboard-sub mb-browse-intro">
            Reusable storefront listings use rules-based AI review first — admins stay available for overrides only.
          </p>
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
        :
          (
            <>
              <div className="wf-dash-toolbar">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={createBusy}
                  onClick={() => void handleNewWorkflow()}
                >
                  {createBusy ? 'Creating…' : 'New workflow'}
                </button>
                <Link to="/browse" className="btn btn-ghost btn-sm">
                  View buyer Browse
                </Link>
              </div>

              <section className="wf-dash-section">
                <h2 className="wf-dash-section-title">Draft</h2>
                {buckets.draft.length === 0 ?
                  <p className="subtle">No drafts.</p>
                : (
                  <div className="wf-dash-grid">
                    {buckets.draft.map((w) => (
                      <WorkflowDashCard
                        key={w.id}
                        row={w}
                        creatorProfile={creatorProfile}
                        customizationRequestCount={workflowCustomizationCounts[w.id] ?? 0}
                        onDidMutate={() => void reload()}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="wf-dash-section">
                <h2 className="wf-dash-section-title">Needs improvement</h2>
                {buckets.needs.length === 0 ?
                  <p className="subtle">Nothing flagged for improvements.</p>
                : (
                  <div className="wf-dash-grid">
                    {buckets.needs.map((w) => (
                      <WorkflowDashCard
                        key={w.id}
                        row={w}
                        creatorProfile={creatorProfile}
                        customizationRequestCount={workflowCustomizationCounts[w.id] ?? 0}
                        onDidMutate={() => void reload()}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="wf-dash-section">
                <h2 className="wf-dash-section-title">AI approved</h2>
                {buckets.approved.length === 0 ?
                  <p className="subtle">Run AI review on a draft to land approved workflows here.</p>
                : (
                  <div className="wf-dash-grid">
                    {buckets.approved.map((w) => (
                      <WorkflowDashCard
                        key={w.id}
                        row={w}
                        creatorProfile={creatorProfile}
                        customizationRequestCount={workflowCustomizationCounts[w.id] ?? 0}
                        onDidMutate={() => void reload()}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="wf-dash-section">
                <h2 className="wf-dash-section-title">Published</h2>
                {buckets.published.length === 0 ?
                  <p className="subtle">Published storefront rows appear here.</p>
                : (
                  <div className="wf-dash-grid">
                    {buckets.published.map((w) => (
                      <WorkflowDashCard
                        key={w.id}
                        row={w}
                        creatorProfile={creatorProfile}
                        customizationRequestCount={workflowCustomizationCounts[w.id] ?? 0}
                        onDidMutate={() => void reload()}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="wf-dash-section">
                <h2 className="wf-dash-section-title">Hidden / archived</h2>
                {buckets.archive.length === 0 ?
                  <p className="subtle">No hidden workflows.</p>
                : (
                  <div className="wf-dash-grid">
                    {buckets.archive.map((w) => (
                      <WorkflowDashCard
                        key={w.id}
                        row={w}
                        creatorProfile={creatorProfile}
                        customizationRequestCount={workflowCustomizationCounts[w.id] ?? 0}
                        onDidMutate={() => void reload()}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
      </div>
    </div>
  );
}
