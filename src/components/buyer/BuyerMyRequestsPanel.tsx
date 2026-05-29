import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeProfileStrength } from '../../lib/profileAI';
import CentralMessageLauncher from '../CentralMessageLauncher';
import StatusBadge from '../StatusBadge';
import type { CreatorProfileRow, UserProfileRow, BuyerRequestRow } from '../../types/database';
import type { OrderPipelineRow, DeliverablePlaceholder } from '../../lib/orders';
import { supabase } from '../../lib/supabase';
import {
  creatorDisplayName,
  getRequestApplicantsForBuyer,
  selectCreatorForRequest,
  updateRequestApplicationStatus,
  verifyBuyerOwnsRequest,
  type BuyerApplicantResolved,
} from '../../lib/marketplace';
import { analyzeApplicantForBuyerReview } from '../../lib/buyerApplicantReviewAI';
import { formatRequestApplicationStatusForBuyer, statusPillClassName } from '../../lib/statusLabels';
import {
  getMissingInfoFlags,
  previewBuyerRequest,
} from '../../lib/buyerAI';
import {
  agreementStatusLabel,
  analyzeBuyerRequestMonitor,
  buildMarketplaceRequestTimeline,
  computeBuyerRequestNextAction,
  computeBuyerRequestsSummary,
  deliveryStatusLabel,
  getBuyerRequestAiSummary,
  isWorkflowBackedRequest,
  parseStyleNotesFromBuyerRequest,
  requestDisplayTitle,
  requestMatchesFilter,
  searchMatchesBuyerRequest,
  buyerRequestStatusHeadline,
  type BuyerRequestFilterId,
  type BuyerRequestSnap,
} from '../../lib/buyerRequestMonitor';
import './BuyerMyRequestsPanel.css';

const FILTER_OPTIONS: { id: BuyerRequestFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'waiting_for_creators', label: 'Waiting for Creators' },
  { id: 'review_applicants', label: 'Review Applicants' },
  { id: 'creator_selected', label: 'Creator Selected' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'needs_action', label: 'Needs Action' },
];

export type { BuyerRequestSnap };

interface Props {
  buyerProfile: UserProfileRow;
  requests: BuyerRequestSnap[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  deliverablesByOrderId?: Record<string, DeliverablePlaceholder | null | undefined>;
  creatorProfileLabels?: Record<string, string>;
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
}

function oneProfile(edge: CreatorProfileRow | CreatorProfileRow[] | null | undefined): CreatorProfileRow | null {
  if (!edge) return null;
  return Array.isArray(edge) ? (edge[0] ?? null) : edge;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(t);
}

function fmtSubmittedAt(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(t);
}

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function normalize(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

function readableTier(t: unknown): string {
  const s = typeof t === 'string' ? t.trim() : '';
  if (!s) return 'Standard';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function formatMoney(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!isFinite(n)) return 'Not specified';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function dedupeApplicants(apps: BuyerApplicantResolved[]): BuyerApplicantResolved[] {
  const seen = new Set<string>();
  const out: BuyerApplicantResolved[] = [];
  for (const a of apps) {
    const id = safeStr(a.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(a);
  }
  return out;
}

export default function BuyerMyRequestsPanel({
  buyerProfile,
  requests,
  ordersByRequestId,
  deliverablesByOrderId = {},
  creatorProfileLabels = {},
  loading = false,
  onRefresh,
}: Props) {
  const [filter, setFilter] = useState<BuyerRequestFilterId>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applicantMap, setApplicantMap] = useState<Record<string, BuyerApplicantResolved[]>>({});
  const [loadingReq, setLoadingReq] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const summary = useMemo(
    () => computeBuyerRequestsSummary(requests, ordersByRequestId, deliverablesByOrderId),
    [requests, ordersByRequestId, deliverablesByOrderId],
  );

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const ord = ordersByRequestId[r.id];
      const del = ord?.id ? deliverablesByOrderId[ord.id] : null;
      if (!requestMatchesFilter(filter, r, ord, del ?? null)) return false;
      return searchMatchesBuyerRequest(search, r);
    });
  }, [requests, filter, search, ordersByRequestId, deliverablesByOrderId]);

  const selectedIds = useMemo(
    () =>
      [...new Set(
        requests
          .map((r) => r.selected_creator_profile_id)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      )],
    [requests],
  );

  useEffect(() => {
    const missing = selectedIds.filter((id) => !creatorProfileLabels[id] && !extraLabels[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase
      .from('creator_profiles')
      .select('id, display_name, full_name')
      .in('id', missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as { id: string; display_name?: string | null; full_name?: string | null }[]) {
          map[row.id] = safeStr(row.display_name).trim() || safeStr(row.full_name).trim() || 'Creator';
        }
        setExtraLabels((prev) => ({ ...prev, ...map }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIds.join('|'), creatorProfileLabels]);

  const allLabels = useMemo(() => ({ ...creatorProfileLabels, ...extraLabels }), [creatorProfileLabels, extraLabels]);

  const loadApplicants = useCallback(
    async (requestId: string) => {
      setLoadingReq(requestId);
      const own = await verifyBuyerOwnsRequest(requestId, buyerProfile.email, {
        authUserId: buyerProfile.auth_user_id ?? null,
      });
      if (!own) {
        setToast({ type: 'err', msg: 'You cannot view applicants on this request.' });
        setLoadingReq(null);
        return;
      }
      const apps = await getRequestApplicantsForBuyer(requestId);
      setApplicantMap((m) => ({ ...m, [requestId]: dedupeApplicants(apps) }));
      setLoadingReq(null);
    },
    [buyerProfile.email, buyerProfile.auth_user_id],
  );

  const refreshAll = useCallback(async () => {
    await onRefresh?.();
  }, [onRefresh]);

  async function toggleExpand(requestId: string) {
    if (expandedId === requestId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(requestId);
    if (!applicantMap[requestId]) await loadApplicants(requestId);
  }

  if (loading) {
    return <div className="dash-loading bmr-root">Loading your requests…</div>;
  }

  if (requests.length === 0) {
    return (
      <div className="bmr-root" id="buyer-my-requests-applicants">
        <div className="bmr-empty-page">
          <span className="buyer-empty-icon" aria-hidden>
            📋
          </span>
          <h3>You have not requested a MicroBuild yet.</h3>
          <p className="subtle">Start with a reusable workflow or create a custom request.</p>
          <div className="bmr-empty-actions">
            <Link to="/browse" className="btn btn-ghost btn-sm">
              Browse Workflows
            </Link>
            <Link to="/request" className="btn btn-primary btn-sm">
              New Request
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bmr-root" id="buyer-my-requests-applicants">
      <div className="bmr-summary-grid" aria-label="Request summary">
        <SummaryCard label="Total Requests" value={summary.total} />
        <SummaryCard label="Waiting for Applicants" value={summary.waitingForApplicants} tone="warn" />
        <SummaryCard label="Applicants to Review" value={summary.applicantsToReview} tone="info" />
        <SummaryCard label="Creator Selected" value={summary.creatorSelected} tone="ok" />
        <SummaryCard label="In Progress" value={summary.inProgress} tone="info" />
        <SummaryCard label="Delivery / Review" value={summary.deliveryReview} tone="warn" />
      </div>

      <div className="bmr-toolbar">
        <div className="bmr-filters" role="tablist" aria-label="Filter requests">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`bmr-filter-btn${filter === f.id ? ' bmr-filter-btn--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="bmr-search"
          placeholder="Search business, workflow, MicroBuild type, industry…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search requests"
        />
      </div>

      {toast ?
        <div className={`mb-form-alert mb-form-alert--${toast.type === 'ok' ? 'muted' : 'error'}`} role="status">
          {toast.msg}
        </div>
      : null}

      {filteredRequests.length === 0 ?
        <div className="bmr-empty-inline">
          No requests match this filter{search.trim() ? ' or search' : ''}. Try <strong>All</strong> or clear search.
        </div>
      : (
        <div className="bmr-list">
          {filteredRequests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              buyerProfile={buyerProfile}
              order={ordersByRequestId[r.id]}
              deliverable={
                ordersByRequestId[r.id]?.id ? deliverablesByOrderId[ordersByRequestId[r.id]!.id] ?? null : null
              }
              creatorLabels={allLabels}
              expanded={expandedId === r.id}
              applicants={applicantMap[r.id] ?? []}
              loadingApplicants={loadingReq === r.id}
              showApplicantHistory={Boolean(historyOpen[r.id])}
              onToggleHistory={() => setHistoryOpen((h) => ({ ...h, [r.id]: !h[r.id] }))}
              onToggleExpand={() => void toggleExpand(r.id)}
              busyId={busyId}
              onBusy={setBusyId}
              onToast={setToast}
              onReloadApplicants={async () => {
                await loadApplicants(r.id);
                await refreshAll();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'ok' | 'info';
}) {
  const toneClass =
    tone === 'warn' ? ' bmr-summary-val--warn'
    : tone === 'ok' ? ' bmr-summary-val--ok'
    : tone === 'info' ? ' bmr-summary-val--info'
    : '';
  return (
    <div className="bmr-summary-card">
      <div className={`bmr-summary-val${toneClass}`}>{value}</div>
      <div className="bmr-summary-label">{label}</div>
    </div>
  );
}

function RequestCard({
  request: r,
  buyerProfile,
  order,
  deliverable,
  creatorLabels,
  expanded,
  applicants,
  loadingApplicants,
  showApplicantHistory,
  onToggleHistory,
  onToggleExpand,
  busyId,
  onBusy,
  onToast,
  onReloadApplicants,
}: {
  request: BuyerRequestSnap;
  buyerProfile: UserProfileRow;
  order?: OrderPipelineRow;
  deliverable: DeliverablePlaceholder | null | undefined;
  creatorLabels: Record<string, string>;
  expanded: boolean;
  applicants: BuyerApplicantResolved[];
  loadingApplicants: boolean;
  showApplicantHistory: boolean;
  onToggleHistory: () => void;
  onToggleExpand: () => void;
  busyId: string | null;
  onBusy: (id: string | null) => void;
  onToast: (t: { type: 'ok' | 'err'; msg: string }) => void;
  onReloadApplicants: () => Promise<void>;
}) {
  const wf = isWorkflowBackedRequest(r);
  const headline = buyerRequestStatusHeadline(r, order, deliverable ?? null);
  const next = computeBuyerRequestNextAction(r, order, deliverable ?? null);
  const monitor = analyzeBuyerRequestMonitor(r, order, deliverable ?? null);
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : applicants.length;
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
  const selectedName =
    r.selected_creator_profile_id ? creatorLabels[r.selected_creator_profile_id] ?? 'Selected creator' : null;
  const sourceCreatorName =
    r.source_creator_profile_id ? creatorLabels[r.source_creator_profile_id] ?? null : null;
  const parsedNotes = parseStyleNotesFromBuyerRequest(r.style_notes);
  const missing = getMissingInfoFlags({
    business_name: r.business_name,
    industry: r.industry ?? '',
    build_type: r.build_type,
    main_goal: r.main_goal ?? '',
    current_problem: r.current_problem ?? '',
    budget: r.budget,
    deadline: r.deadline,
    website_social: r.website_social,
    source_type: r.source_type,
    source_workflow_title: r.source_workflow_title,
    customization_notes: r.customization_notes,
  });
  const preview = previewBuyerRequest({
    business_name: r.business_name,
    industry: r.industry ?? '',
    build_type: r.build_type,
    main_goal: r.main_goal ?? '',
    current_problem: r.current_problem ?? '',
    budget: r.budget,
    deadline: r.deadline,
    website_social: r.website_social,
    source_type: r.source_type,
    source_workflow_title: r.source_workflow_title,
    customization_notes: r.customization_notes,
  });

  const mktLocked = hasSelected && ['creator_selected', 'in_progress', 'completed', 'closed'].includes(
    normalize(r.application_status),
  );
  const showApplicantsPanel = !mktLocked || showApplicantHistory;
  const activeApplicants = applicants.filter((a) => normalize(a.application_status) !== 'rejected');

  const nextToneClass =
    next.tone === 'warning' ? ' bmr-next-action--warn'
    : next.tone === 'success' ? ' bmr-next-action--ok'
    : '';

  const monitorClass =
    monitor.severity === 'needs_action' ? ' bmr-monitor--action'
    : monitor.severity === 'ready' ? ' bmr-monitor--ready'
    : ' bmr-monitor--info';

  const timeline = buildMarketplaceRequestTimeline(r, order, deliverable ?? null);

  const wfTitle = safeStr(r.source_workflow_title).trim();

  return (
    <article className="bmr-card" id={`mb-buyer-applicants-${r.id}`}>
      <header className="bmr-card-head">
        <div className="bmr-card-title-block">
          <h3 className="bmr-card-title">{requestDisplayTitle(r)}</h3>
          <div className="bmr-card-badges">
            <span className={`bmr-source-badge${wf ? ' bmr-source-badge--wf' : ''}`}>
              {wf ? 'Workflow Customization' : 'Custom Request'}
            </span>
            <StatusBadge display={headline} />
            {wf ?
              <span className="subtle" style={{ fontSize: '0.72rem' }}>
                Request / Customize
              </span>
            : null}
          </div>
        </div>
        <span className="bmr-card-date">Submitted {fmtDate(r.created_at)}</span>
      </header>

      <div className="bmr-card-body">
        {wf ?
          <div className="bmr-wf-banner">
            <strong>Requested from reusable workflow</strong>
            {wfTitle ?
              <> — {wfTitle}</>
            : (
              <> — <em>Workflow source unavailable.</em></>
            )}
            {sourceCreatorName ?
              <> · Original creator: {sourceCreatorName}</>
            : r.source_creator_profile_id ?
              <> · Original creator profile unavailable</>
            : null}
          </div>
        : null}

        <div className="bmr-detail-grid">
          <DetailItem label="MicroBuild" value={r.build_type?.trim() || '—'} />
          <DetailItem label="Industry" value={r.industry?.trim() || '—'} />
          <DetailItem label="Goal" value={r.main_goal?.trim() || '—'} />
          <DetailItem label="Challenge" value={r.current_problem?.trim() ? truncate(r.current_problem, 120) : '—'} />
          <DetailItem label="Budget" value={r.budget?.trim() || '—'} />
          <DetailItem label="Deadline" value={r.deadline?.trim() || '—'} />
          {wf && wfTitle ?
            <DetailItem label="Workflow" value={wfTitle} />
          : null}
        </div>

        {wf && safeStr(r.customization_notes).trim() ?
          <p className="bmr-notes-preview">
            <strong>Customization:</strong> {truncate(r.customization_notes, 180)}
          </p>
        : null}

        <div className="bmr-status-row">
          <span className="bmr-status-chip">
            <strong>Applicants</strong> {cnt}
          </span>
          <span className="bmr-status-chip">
            <strong>Selected</strong> {selectedName ?? (hasSelected ? 'Creator profile loading…' : '—')}
          </span>
          <span className="bmr-status-chip">
            <strong>Project</strong> {order?.order_status ? order.order_status.replace(/_/g, ' ') : 'No project yet'}
          </span>
          {order ?
            <>
              <span className="bmr-status-chip">
                <strong>Agreement</strong> {agreementStatusLabel(order)}
              </span>
              <span className="bmr-status-chip">
                <strong>Delivery</strong> {deliveryStatusLabel(order, deliverable ?? null)}
              </span>
            </>
          : null}
        </div>

        <div className={`bmr-next-action${nextToneClass}`}>
          <div>
            <div className="bmr-next-label">Next: {next.label}</div>
            {next.hint ?
              <p className="bmr-next-hint">{next.hint}</p>
            : null}
          </div>
        </div>

        <div className="bmr-card-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleExpand}>
            {expanded ? 'Hide Details' : 'View Details'}
          </button>
          {!hasSelected && cnt > 0 ?
            <button type="button" className="btn btn-primary btn-sm" onClick={onToggleExpand}>
              Review Applicants ({cnt})
            </button>
          : null}
          {hasSelected && r.selected_creator_profile_id ?
            <CentralMessageLauncher
              buyerRequestId={r.id}
              creatorProfileId={r.selected_creator_profile_id}
              orderId={order?.id ?? null}
              label="Message Creator"
              className="btn btn-ghost btn-sm"
            />
          : null}
          {order?.id ?
            <Link to={`/dashboard/projects/${order.id}`} className="btn btn-ghost btn-sm">
              Open Project
            </Link>
          : null}
          {order && normalize(order.order_status) === 'delivered' ?
            <Link to={`/dashboard/projects/${order.id}#delivery`} className="btn btn-primary btn-sm">
              Review Delivery
            </Link>
          : null}
          <Link to="/browse" className="btn btn-ghost btn-sm">
            Browse Similar Workflows
          </Link>
        </div>
      </div>

      {expanded ?
        <div className="bmr-expanded">
          <section>
            <h4 className="bmr-section-title">AI Request Monitor</h4>
            <div className={`bmr-monitor${monitorClass}`}>
              <p className="bmr-monitor-insight">{monitor.insight}</p>
              <p className="bmr-monitor-step">{monitor.recommendedStep}</p>
            </div>
          </section>

          <section>
            <h4 className="bmr-section-title">Request details</h4>
            {r.main_goal?.trim() ?
              <p className="bmr-text-block">
                <strong>Goal</strong>
                {'\n'}
                {r.main_goal.trim()}
              </p>
            : null}
            {r.current_problem?.trim() ?
              <p className="bmr-text-block">
                <strong>Problem</strong>
                {'\n'}
                {r.current_problem.trim()}
              </p>
            : null}
            <div className="bmr-detail-grid">
              {r.website_social?.trim() ?
                <DetailItem label="Website / social" value={r.website_social.trim()} />
              : null}
              {parsedNotes.googleBusiness ?
                <DetailItem label="Google Business" value={parsedNotes.googleBusiness} />
              : null}
              {parsedNotes.instagram ?
                <DetailItem label="Instagram" value={parsedNotes.instagram} />
              : null}
              {parsedNotes.services ?
                <DetailItem label="Services offered" value={parsedNotes.services} />
              : null}
              {parsedNotes.targetCustomer ?
                <DetailItem label="Target customer" value={parsedNotes.targetCustomer} />
              : null}
              {parsedNotes.preferredCta ?
                <DetailItem label="Preferred CTA" value={parsedNotes.preferredCta} />
              : null}
            </div>
          </section>

          <section>
            <h4 className="bmr-section-title">AI request summary</h4>
            <p className="bmr-text-block">{getBuyerRequestAiSummary(r)}</p>
            <p className="subtle" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
              Quote readiness: {preview.readinessLabel} ({preview.readinessScore}/100)
            </p>
          </section>

          {missing.length > 0 ?
            <section>
              <h4 className="bmr-section-title">Missing info checklist</h4>
              <ul className="bmr-checklist">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          : null}

          {order ?
            <section>
              <h4 className="bmr-section-title">Project timeline</h4>
              <div className="bmr-timeline" aria-label="Request progress">
                {timeline.map((step) => (
                  <div
                    key={step.id}
                    className={`bmr-tl-step${step.done ? ' bmr-tl-step--done' : ''}${step.active ? ' bmr-tl-step--active' : ''}`}
                  >
                    <div className="bmr-tl-dot" />
                    <span className="bmr-tl-label">{step.label}</span>
                    {step.dateLabel ?
                      <span className="bmr-tl-date">{step.dateLabel}</span>
                    : null}
                  </div>
                ))}
              </div>
            </section>
          : null}

          {hasSelected ?
            <section className="bmr-selected-card">
              <h4 className="bmr-section-title" style={{ marginBottom: '0.35rem' }}>
                Selected creator
              </h4>
              <div className="bmr-selected-name">{selectedName ?? 'Creator'}</div>
              <p className="subtle" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0.65rem' }}>
                Project: {order ? order.order_status.replace(/_/g, ' ') : 'Creator selected. Project setup is being prepared.'}
                {' · '}
                Agreement: {agreementStatusLabel(order)}
                {' · '}
                Delivery: {deliveryStatusLabel(order, deliverable ?? null)}
              </p>
              <div className="bmr-card-actions">
                {r.selected_creator_profile_id ?
                  <CentralMessageLauncher
                    buyerRequestId={r.id}
                    creatorProfileId={r.selected_creator_profile_id}
                    orderId={order?.id ?? null}
                    label="Message Creator"
                    className="btn btn-ghost btn-sm"
                  />
                : null}
                {order?.id ?
                  <Link to={`/dashboard/projects/${order.id}`} className="btn btn-primary btn-sm">
                    Open Project
                  </Link>
                : null}
              </div>
            </section>
          : null}

          <section className="bmr-applicants-section">
            <div className="buyer-section-header" style={{ marginBottom: '0.5rem' }}>
              <h4 className="bmr-section-title" style={{ margin: 0 }}>
                {mktLocked ? 'Applicant history' : 'Creator applicants'}
              </h4>
              {mktLocked ?
                <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleHistory}>
                  {showApplicantHistory ? 'Hide history' : 'View applicant history'}
                </button>
              : null}
            </div>

            {showApplicantsPanel ?
              <>
                {loadingApplicants ?
                  <div className="dash-loading">Loading applicants…</div>
                : activeApplicants.length === 0 && !loadingApplicants ?
                  <div className="bmr-empty-inline">
                    {cnt === 0 ?
                      <>
                        <strong>Waiting for creators to apply.</strong>
                        <br />
                        Add more details to your goal and budget to make this request easier to quote.
                      </>
                    : (
                      'Creators will appear here after they apply to build this request.'
                    )}
                  </div>
                : (
                  activeApplicants.map((a) => (
                    <ApplicantCard
                      key={a.id}
                      app={a}
                      buyerProfile={buyerProfile}
                      request={r}
                      orderId={order?.id ?? null}
                      busy={busyId === a.id}
                      onBusy={(v) => onBusy(v ? a.id : null)}
                      onToast={onToast}
                      onReload={onReloadApplicants}
                      selectionLocked={mktLocked}
                    />
                  ))
                )}
              </>
            : (
              <p className="subtle" style={{ fontSize: '0.8rem' }}>
                Creator selected — expand <strong>View applicant history</strong> to see other applicants.
              </p>
            )}
          </section>
        </div>
      : (
        <button type="button" className="bmr-expand-btn" onClick={onToggleExpand}>
          View full details & applicants
        </button>
      )}
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bmr-detail-item">
      <span className="bmr-detail-k">{label}</span>
      <span className="bmr-detail-v">{value}</span>
    </div>
  );
}

function truncate(text: string | null | undefined, max: number): string {
  const t = safeStr(text).trim();
  if (t.length <= max) return t || '—';
  return `${t.slice(0, max)}…`;
}

function ApplicantCard({
  app,
  buyerProfile,
  request,
  orderId,
  busy,
  onBusy,
  onToast,
  onReload,
  selectionLocked,
}: {
  app: BuyerApplicantResolved;
  buyerProfile: UserProfileRow;
  request: BuyerRequestSnap;
  orderId: string | null;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onToast: (t: { type: 'ok' | 'err'; msg: string }) => void;
  onReload: () => Promise<void>;
  selectionLocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmSelect, setConfirmSelect] = useState(false);
  const prof = oneProfile(app.creator_profiles ?? null);
  const name = creatorDisplayName(app.creator_profiles ?? null);
  const sourceCreatorId = safeStr(request.source_creator_profile_id).trim();
  const applicantCreatorId = safeStr(prof?.id).trim();
  const showOriginalBadge = Boolean(sourceCreatorId && applicantCreatorId && sourceCreatorId === applicantCreatorId);
  const tierLabel = readableTier(prof?.tier);
  const isVerified = normalize(prof?.verification_status) === 'verified';
  const isPublic = normalize(prof?.public_profile_status) === 'public';
  const strengthScore =
    typeof prof?.profile_strength_score === 'number'
      ? prof.profile_strength_score
      : prof ? analyzeProfileStrength(prof as CreatorProfileRow).score
      : null;

  const insight = useMemo(
    () =>
      analyzeApplicantForBuyerReview(app, prof, {
        ...request,
        industry: request.industry ?? '',
        main_goal: request.main_goal ?? undefined,
        current_problem: request.current_problem ?? undefined,
      } as Partial<BuyerRequestRow>),
    [app, prof, request],
  );

  const appSt = normalize(app.application_status ?? '');
  const canAct = !selectionLocked && (appSt === 'submitted' || appSt === 'shortlisted');
  const buyerVerify = { email: buyerProfile.email, authUserId: buyerProfile.auth_user_id ?? null };
  const effectiveOrderId =
    (typeof orderId === 'string' && orderId.trim()) || (typeof app.order_id === 'string' && app.order_id.trim()) || null;

  async function doShortlist() {
    if (!canAct) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'shortlisted', buyerVerify);
    onBusy(false);
    onToast(ok ? { type: 'ok', msg: 'Applicant shortlisted.' } : { type: 'err', msg: 'Could not update shortlist.' });
    await onReload();
  }

  async function doReject() {
    if (!canAct) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'rejected', buyerVerify);
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant marked not selected.' } : { type: 'err', msg: 'Could not update applicant.' },
    );
    await onReload();
  }

  async function confirmDoSelect() {
    if (!canAct || !app.id?.trim()) return;
    setConfirmSelect(false);
    onBusy(true);
    const res = await selectCreatorForRequest({
      buyerRequestId: request.id,
      requestApplicationId: app.id,
      buyerEmail: buyerProfile.email,
      buyerProfile,
    });
    onBusy(false);
    onToast(
      res.ok ? { type: 'ok', msg: 'Creator selected — project is in your pipeline.' } : (
        { type: 'err', msg: res.error ?? 'Could not finalize selection.' }
      ),
    );
    await onReload();
  }

  const rowClass =
    appSt === 'buyer_selected' ? ' mb-applicant-row--winner'
    : appSt === 'shortlisted' ? ' mb-applicant-row--shortlisted'
    : appSt === 'rejected' ? ' mb-applicant-row--rejected'
    : '';

  return (
    <div className={`bmr-applicant-card mb-applicant-card--scan${rowClass}`}>
      <button type="button" className="bmr-applicant-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div>
          <strong>{name}</strong>
          <div className="subtle" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
            {formatRequestApplicationStatusForBuyer(appSt).label}
            {app.proposed_price != null ? ` · ${formatMoney(app.proposed_price)}` : ''}
            {app.estimated_timeline?.trim() ? ` · ${app.estimated_timeline.trim()}` : ''}
          </div>
        </div>
        <span className="subtle">{open ? '▲' : '▼'}</span>
      </button>

      {open ?
        <div className="bmr-applicant-expanded mb-applicant-row">
          <div className="mb-applicant-badges" style={{ marginBottom: '0.5rem' }}>
            <span className="mb-badge mb-badge-tier">Tier: {tierLabel}</span>
            {isVerified ?
              <span className="mb-badge mb-badge-verified-buyer">Verified</span>
            : (
              <span className="mb-badge mb-badge-muted">Not verified</span>
            )}
            {showOriginalBadge ?
              <span className="mb-badge-original-creator">Original Workflow Creator</span>
            : null}
            <span className="mb-badge">
              Profile: {typeof strengthScore === 'number' ? `${strengthScore}/100` : 'Not scored'}
            </span>
            <span className={`${statusPillClassName('info')} mb-badge-fit`}>Fit {insight.fitScore}/100</span>
          </div>

          <blockquote className="mb-applicant-proposal">
            <span className="subtle buyer-muted-hint">Proposal</span>
            <p>{app.proposal_message?.trim() || 'Not provided yet.'}</p>
          </blockquote>
          <p className="mb-applicant-line subtle">
            <strong>Fit reason:</strong> {app.fit_reason?.trim() || 'Not provided.'}
          </p>
          <p className="mb-applicant-line subtle">
            <strong>Timeline:</strong> {app.estimated_timeline?.trim() || 'Not specified'}
            {' · '}
            <strong>Price:</strong>{' '}
            {app.proposed_price != null ? formatMoney(app.proposed_price) : 'Not specified'}
          </p>
          <p className="subtle" style={{ fontSize: '0.75rem' }}>
            Submitted {fmtSubmittedAt(app.created_at)} · {insight.recommendedBuyerDecision}
          </p>

          <div className="mb-applicant-actions mb-applicant-actions--primary">
            <CentralMessageLauncher
              buyerRequestId={request.id}
              creatorProfileId={prof?.id ?? null}
              orderId={effectiveOrderId}
              label="Message creator"
              className="mb-applicant-msg-thread"
            />
            {prof?.id && isPublic ?
              <Link to={`/creator/${prof.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                View profile
              </Link>
            : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !canAct}
              onClick={() => setConfirmSelect(true)}
            >
              Select creator
            </button>
          </div>
          <div className="mb-applicant-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !canAct} onClick={() => void doShortlist()}>
              Shortlist
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !canAct} onClick={() => void doReject()}>
              Reject
            </button>
          </div>

          {confirmSelect ?
            <div
              className="mb-select-confirm-backdrop"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget && !busy) setConfirmSelect(false);
              }}
            >
              <div className="mb-select-confirm-card">
                <h4 className="mb-select-confirm-title">Start project with {name}?</h4>
                <p className="mb-select-confirm-copy subtle">
                  This assigns your MicroBuild, updates marketplace status, and creates or updates your pipeline order.
                </p>
                <div className="mb-select-confirm-actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmSelect(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void confirmDoSelect()}>
                    {busy ? 'Saving…' : 'Confirm selection'}
                  </button>
                </div>
              </div>
            </div>
          : null}
        </div>
      : null}
    </div>
  );
}
