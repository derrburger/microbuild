import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeProfileStrength } from '../lib/profileAI';
import CentralMessageLauncher from './CentralMessageLauncher';
import type { BuyerRequestRow, CreatorProfileRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow, DeliverablePlaceholder } from '../lib/orders';
import { supabase } from '../lib/supabase';
import {
  creatorDisplayName,
  getRequestApplicantsForBuyer,
  selectCreatorForRequest,
  updateRequestApplicationStatus,
  verifyBuyerOwnsRequest,
  type BuyerApplicantResolved,
} from '../lib/marketplace';
import { analyzeApplicantForBuyerReview, summarizeApplicantRankingForBuyer } from '../lib/buyerApplicantReviewAI';
import StatusBadge from './StatusBadge';
import {
  formatBuyerMarketplaceStatus,
  formatBuyerRequestStatus,
  formatOrderStatus,
  formatRequestApplicationStatus,
} from '../lib/statusLabels';

function oneProfile(edge: CreatorProfileRow | CreatorProfileRow[] | null | undefined): CreatorProfileRow | null {
  if (!edge) return null;
  return Array.isArray(edge) ? (edge[0] ?? null) : edge;
}

export interface BuyerRequestMarketplaceBrief {
  id: string;
  business_name: string;
  build_type: string;
  main_goal?: string | null;
  current_problem?: string | null;
  budget?: string | null;
  deadline?: string | null;
  applications_count?: number | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  status?: string | null;
  visibility_status?: string | null;
  source_type?: string | null;
  source_workflow_title?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
  source_creator_profile_id?: string | null;
}

interface Props {
  buyerProfile: UserProfileRow;
  requests: BuyerRequestMarketplaceBrief[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  /** Deliverables keyed by order id — used for “approve delivery” next-action hints */
  deliverablesByOrderId?: Record<string, DeliverablePlaceholder | null | undefined>;
  onMarketplaceEvent?: () => void | Promise<void>;
}

function marketplaceRequestIsWorkflow(r: BuyerRequestMarketplaceBrief): boolean {
  const st = normalize(r.source_type);
  return st === 'workflow' || Boolean(r.requested_from_workflow) || Boolean(safeStr(r.source_workflow_title).trim());
}

function computeBuyerApplicantNextAction(
  r: BuyerRequestMarketplaceBrief,
  ord: OrderPipelineRow | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): { label: string; hint?: string } {
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const mkt = normalize(r.application_status);
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());

  if (ord?.id) {
    const os = normalize(ord.order_status);
    const ds = normalize(deliverable?.delivery_status ?? '');
    if (os === 'completed') {
      return { label: 'Project complete', hint: 'Build finished — thank you for using MicroBuild.' };
    }
    if (os === 'delivered' && ds !== 'approved') {
      return { label: 'Approve delivery', hint: 'Review preview or live links and approve when satisfied.' };
    }
    if (os === 'delivered' && ds === 'approved') {
      return { label: 'Track project delivery', hint: 'Delivery approved — links available from your project.' };
    }
    if (os === 'in_review') {
      return { label: 'Track project delivery', hint: 'Build is in review — preview links appear when ready.' };
    }
    if (os === 'in_progress' || ds === 'revision_needed') {
      return { label: 'Track project delivery', hint: 'Creator is actively working on your MicroBuild.' };
    }
    if (os === 'assigned') {
      return { label: 'Message selected creator', hint: 'Align on scope and timing in Messages.' };
    }
    if (['draft', 'ready_to_quote', 'pending_payment'].includes(os)) {
      return { label: 'Track project delivery', hint: 'Project is lining up — use Messages for questions.' };
    }
  }

  if (hasSelected && mkt === 'creator_selected') {
    return ord?.id ?
        { label: 'Track project delivery', hint: 'Creator assigned — open your project workspace.' }
      : { label: 'Project syncing', hint: 'Refresh shortly if the workspace link has not appeared yet.' };
  }

  if (cnt === 0 && !hasSelected) {
    return { label: 'Waiting for applicants', hint: 'Creators discover open requests from Buyer Requests browse.' };
  }

  if (!hasSelected && cnt > 0) {
    if (mkt === 'open') {
      return { label: 'Review creator applicants', hint: 'Expand this request to compare proposals.' };
    }
    if (mkt === 'reviewing_applicants') {
      return { label: 'Select a creator', hint: 'Choose who should receive the assignment.' };
    }
    return { label: 'Review creator applicants', hint: 'Applicants are listed below.' };
  }

  return { label: 'View request status', hint: 'Review marketplace status and timeline.' };
}

function readableTier(t: unknown): string {
  const s = typeof t === 'string' ? t.trim() : '';
  if (!s) return 'Standard';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function fmtSubmittedAt(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(t);
}

export default function MarketplaceApplicantsPanel({
  buyerProfile,
  requests,
  ordersByRequestId,
  deliverablesByOrderId = {},
  onMarketplaceEvent,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applicantMap, setApplicantMap] = useState<Record<string, BuyerApplicantResolved[]>>({});
  const [loadingReq, setLoadingReq] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [creatorLabels, setCreatorLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const actionable = useMemo(
    () => requests.filter((r) => {
      const legacy = normalize(r.status);
      return legacy !== 'rejected';
    }),
    [requests],
  );

  const selectedIds = useMemo(
    () =>
      [...new Set(
        actionable
          .map((r) => r.selected_creator_profile_id)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      )],
    [actionable],
  );

  useEffect(() => {
    if (selectedIds.length === 0) {
      setCreatorLabels({});
      return;
    }
    let cancelled = false;
    async function loadNames() {
      const { data } = await supabase
        .from('creator_profiles')
        .select('id, display_name, full_name')
        .in('id', selectedIds);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as { id: string; display_name?: string | null; full_name?: string | null }[]) {
        const label = safeStr(row.display_name).trim() || safeStr(row.full_name, 'Creator').trim() || 'Creator';
        map[row.id] = label;
      }
      setCreatorLabels(map);
    }
    void loadNames();
    return () => {
      cancelled = true;
    };
  }, [selectedIds.join('|')]);

  const refreshParent = useCallback(async () => {
    await onMarketplaceEvent?.();
  }, [onMarketplaceEvent]);

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
      setApplicantMap((m) => ({ ...m, [requestId]: apps }));
      setLoadingReq(null);
    },
    [buyerProfile.email, buyerProfile.auth_user_id],
  );

  async function toggle(requestId: string) {
    if (expanded === requestId) {
      setExpanded(null);
      return;
    }
    setExpanded(requestId);
    if (!applicantMap[requestId]) await loadApplicants(requestId);
  }

  if (requests.length === 0) {
    return (
      <section className="buyer-section mb-applicants-root" id="buyer-my-requests-applicants">
        <div className="buyer-empty-state">
          <span className="buyer-empty-icon">📋</span>
          <p>Request your first MicroBuild — creators will apply from Buyer Requests browse.</p>
          <Link to="/request" className="btn btn-primary btn-sm">
            Request a MicroBuild
          </Link>
        </div>
      </section>
    );
  }

  if (actionable.length === 0) return null;

  return (
    <section className="buyer-section mb-applicants-root" id="buyer-my-requests-applicants">
      <div className="buyer-section-header">
        <h3 className="buyer-section-title">My Requests & Applicants</h3>
        <span className="subtle buyer-muted-hint mb-applicants-hint">
          Review creators who applied — <strong>Select creator</strong> creates your pipeline project. Admin can still
          re-assign if needed.
        </span>
      </div>
      {toast && (
        <div className={`mb-form-alert mb-form-alert--${toast.type === 'ok' ? 'muted' : 'error'}`} role="status">
          {toast.msg}
        </div>
      )}
      <div className="mb-applicants-list">
        {actionable.map((r) => {
          const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
          const open = expanded === r.id;
          const mkt = normalize(r.application_status);
          const selectedName =
            r.selected_creator_profile_id ? creatorLabels[r.selected_creator_profile_id] ?? null : null;
          const ord = ordersByRequestId[r.id];
          const deliv = ord?.id ? deliverablesByOrderId[ord.id] ?? null : null;
          const nextAction = computeBuyerApplicantNextAction(r, ord, deliv ?? null);
          const wfBacked = marketplaceRequestIsWorkflow(r);
          const legacyStatus = formatBuyerRequestStatus(r.status).label;
          const visLabel = formatBuyerRequestStatus(r.visibility_status).label;
          const mktDisplay = formatBuyerMarketplaceStatus(mkt);
          const orderStatusLabel = ord?.order_status ? formatOrderStatus(ord.order_status).label : 'No project yet';

          return (
            <div key={r.id} className="mb-applicants-details" id={`mb-buyer-applicants-${r.id}`}>
              <button
                type="button"
                className="mb-applicants-summary-btn mb-applicants-summary-btn--rich"
                onClick={() => void toggle(r.id)}
                aria-expanded={open}
              >
                <span className="mb-applicants-biz">{safe(r.business_name, 'Request')}</span>
                <span className="subtle">{safe(r.build_type, 'MicroBuild')}</span>
                <span className="mb-applicants-count">{cnt} applicant{cnt !== 1 ? 's' : ''}</span>
                <StatusBadge display={mktDisplay} className="mb-applicants-mkt" />
                <span className="mb-next-action-pill" title={nextAction.hint}>
                  Next: {nextAction.label}
                </span>
                <span className="subtle">{open ? 'Hide' : 'Show'}</span>
              </button>

              <div className="mb-request-card-meta-grid subtle">
                <span>
                  <strong className="mb-meta-k">Source type</strong>{' '}
                  {wfBacked ? 'Workflow customization' : 'Custom request'}
                </span>
                <span>
                  <strong className="mb-meta-k">Workflow</strong>{' '}
                  {wfBacked && safeStr(r.source_workflow_title).trim() ?
                    safeStr(r.source_workflow_title).trim()
                  : '—'}
                </span>
                <span>
                  <strong className="mb-meta-k">Budget</strong> {r.budget?.trim() || '—'}
                </span>
                <span>
                  <strong className="mb-meta-k">Deadline</strong> {r.deadline?.trim() || '—'}
                </span>
                <span>
                  <strong className="mb-meta-k">Request status</strong> {legacyStatus}
                </span>
                <span>
                  <strong className="mb-meta-k">Marketplace status</strong> {mktDisplay.label}
                </span>
                <span>
                  <strong className="mb-meta-k">Visibility</strong> {visLabel || '—'}
                </span>
                <span>
                  <strong className="mb-meta-k">Applicants</strong> {cnt}
                </span>
                <span>
                  <strong className="mb-meta-k">Selected creator</strong>{' '}
                  {selectedName?.trim() ? <strong>{selectedName.trim()}</strong> : '—'}
                </span>
                <span>
                  <strong className="mb-meta-k">Project status</strong> {orderStatusLabel}
                </span>
                <span className="mb-next-action-block">
                  <strong className="mb-meta-k">Suggested next step</strong>{' '}
                  <span className="mb-next-action-label">{nextAction.label}</span>
                  {nextAction.hint ?
                    <span className="mb-next-action-hint"> — {nextAction.hint}</span>
                  : null}
                </span>
                {ord ?
                  (
                    <span className="mb-meta-full-row">
                      <strong className="mb-meta-k">Workspace</strong>{' '}
                      <Link to={`/dashboard/projects/${ord.id}`} className="mb-inline-project-link">
                        Open project workspace →
                      </Link>
                    </span>
                  )
                : null}
              </div>

              {open && mkt === 'creator_selected' && selectedName?.trim() ?
                (
                  <div className="mb-selection-success-banner" role="status">
                    <strong>Project created / assigned.</strong>{' '}
                    <span>{selectedName.trim()} is your selected creator.</span>
                    {ord ?
                      (
                        <>
                          {' '}
                          <Link className="mb-inline-project-link" to={`/dashboard/projects/${ord.id}`}>
                            Track delivery →
                          </Link>
                        </>
                      )
                    : (
                      <span className="subtle"> Your workspace link will appear after sync.</span>
                    )}
                  </div>
                )
              : null}

              {open && r.main_goal?.trim() ?
                (
                  <p className="mb-request-goal-preview subtle">
                    <strong>Goal:</strong> {r.main_goal.trim()}
                  </p>
                )
              : null}
              {open && r.current_problem?.trim() ?
                (
                  <p className="mb-request-goal-preview subtle">
                    <strong>Challenge:</strong> {r.current_problem.trim()}
                  </p>
                )
              : null}

              {open ?
                (
                  <p className="subtle mb-applicants-msg-hint">
                    Compare applicants below. Use <strong>Message creator</strong> for clarifications; conversations open in{' '}
                    <strong>Messages</strong>. After you select a creator, message threads prefer your project context when
                    available.
                  </p>
                )
              : null}

              {open && loadingReq === r.id ? <div className="dash-loading">Loading applicants…</div> : null}
              {open && applicantMap[r.id]?.length === 0 && loadingReq !== r.id && (
                <div className="mb-applicants-empty subtle">
                  Creators will appear here after they apply.
                </div>
              )}
              {open ?
                (
                  <div className="mb-applicant-scan-grid">
                    {(applicantMap[r.id] ?? []).map((a) => (
                      <ApplicantRow
                        key={a.id}
                        app={a}
                        buyerProfile={buyerProfile}
                        request={r}
                        orderId={ord?.id ?? null}
                        busy={busyId === a.id}
                        onBusy={(v) => setBusyId(v ? a.id : null)}
                        onToast={(t) => setToast(t)}
                        onReload={async () => {
                          await loadApplicants(r.id);
                          await refreshParent();
                        }}
                      />
                    ))}
                  </div>
                )
              : null}
              {open && (applicantMap[r.id]?.length ?? 0) > 0 ?
                (
                  <div className="mb-comparison-summary subtle">
                    <strong className="mb-comparison-summary-title">Comparison helper</strong>
                    <p className="mb-comparison-summary-body">
                      {summarizeApplicantRankingForBuyer(applicantMap[r.id] ?? [], {
                        ...r,
                        main_goal: r.main_goal ?? undefined,
                        current_problem: r.current_problem ?? undefined,
                      } as Partial<BuyerRequestRow>)}
                    </p>
                  </div>
                )
              : null}
            </div>
          );
        })}
      </div>
      <MessageModerationPlaceholder />
    </section>
  );
}

function ApplicantRow({
  app,
  buyerProfile,
  request,
  orderId,
  busy,
  onBusy,
  onToast,
  onReload,
}: {
  app: BuyerApplicantResolved;
  buyerProfile: UserProfileRow;
  request: BuyerRequestMarketplaceBrief;
  orderId: string | null;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onToast: (t: { type: 'ok' | 'err'; msg: string }) => void;
  onReload: () => Promise<void>;
}) {
  const [confirmSelect, setConfirmSelect] = useState(false);
  const prof = oneProfile(app.creator_profiles ?? null);
  const name = creatorDisplayName(app.creator_profiles ?? null);
  const sourceCreatorId = safeStr(request.source_creator_profile_id).trim();
  const applicantCreatorId = safeStr(prof?.id).trim();
  const showOriginalWorkflowCreatorBadge =
    Boolean(sourceCreatorId && applicantCreatorId && sourceCreatorId === applicantCreatorId);
  const tierLabel = readableTier(prof?.tier);
  const isVerified = normalize(prof?.verification_status) === 'verified';
  const isPublicProfile = normalize(prof?.public_profile_status) === 'public';
  const strengthScore =
    typeof prof?.profile_strength_score === 'number'
      ? prof.profile_strength_score
      : prof ? analyzeProfileStrength(prof as CreatorProfileRow).score
      : null;

  const insight = useMemo(
    () =>
      analyzeApplicantForBuyerReview(app, prof, {
        ...request,
        main_goal: request.main_goal ?? undefined,
        current_problem: request.current_problem ?? undefined,
      } as Partial<BuyerRequestRow>),
    [app, prof, request],
  );

  const mktReq = normalize(request.application_status);
  const requestLocked = ['creator_selected', 'in_progress', 'completed', 'closed'].includes(mktReq);
  const appSt = normalize(app.application_status ?? '');
  const canActOnApp = (appSt === 'submitted' || appSt === 'shortlisted') && !requestLocked;
  const portfolioHref = portfolioFirstUrl(prof);

  const buyerVerify = { email: buyerProfile.email, authUserId: buyerProfile.auth_user_id ?? null };
  const effectiveOrderId =
    (typeof orderId === 'string' && orderId.trim()) ||
    (typeof app.order_id === 'string' && app.order_id.trim()) ||
    null;

  async function doShortlist() {
    if (!canActOnApp) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'shortlisted', buyerVerify);
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant shortlisted.' } : { type: 'err', msg: 'Could not update shortlist.' },
    );
    await onReload();
  }

  async function doReject() {
    if (!canActOnApp) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'rejected', buyerVerify);
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant marked not selected for this cycle.' }
      : { type: 'err', msg: 'Could not update applicant.' },
    );
    await onReload();
  }

  async function confirmDoSelect() {
    if (!canActOnApp || !app.id?.trim()) return;
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

  const rowHighlight =
    appSt === 'buyer_selected' ? ' mb-applicant-row--winner'
    : appSt === 'shortlisted' ? ' mb-applicant-row--shortlisted'
    : appSt === 'rejected' ? ' mb-applicant-row--rejected'
    : '';

  return (
    <article className={`mb-applicant-row mb-applicant-card--scan${rowHighlight}`}>
      <div className="mb-applicant-meta">
        <div className="mb-applicant-name-row">
          <div className="mb-applicant-name">{name}</div>
          {showOriginalWorkflowCreatorBadge ?
            <span className="mb-badge-original-creator">Original Workflow Creator</span>
          : null}
        </div>
        <div className="mb-applicant-badges">
          <span className="mb-badge mb-badge-tier">Tier: {tierLabel}</span>
          {isVerified ?
            <span className="mb-badge mb-badge-verified-buyer">Verified</span>
          : (
            <span className="mb-badge mb-badge-muted">Not verified</span>
          )}
          <span className="mb-badge">
            Profile strength:{' '}
            {typeof strengthScore === 'number' ? `${strengthScore}/100` : 'Not scored'}
          </span>
          <span className="mb-badge mb-badge-fit">Rules-based fit: {insight.fitScore}/100</span>
        </div>
        <div className="mb-applicant-status-row subtle">
          <span>
            <strong>Application status:</strong> {formatRequestApplicationStatus(appSt).label}
          </span>
          <span>
            <strong>Submitted:</strong> {fmtSubmittedAt(app.created_at)}
          </span>
        </div>
      </div>

      <div className="mb-applicant-fields">
        <blockquote className="mb-applicant-proposal">
          <span className="subtle buyer-muted-hint">Proposal</span>
          <p>{app.proposal_message?.trim() || 'Not provided yet.'}</p>
        </blockquote>
        <p className="mb-applicant-line subtle">
          <strong>Fit reason:</strong> {app.fit_reason?.trim() || 'Not provided.'}
        </p>
        <p className="mb-applicant-line subtle">
          <strong>Creator questions:</strong> {app.creator_questions?.trim() || 'None listed.'}
        </p>
      </div>

      <div className="mb-applicant-line subtle">
        <span>
          <strong>Timeline:</strong> {app.estimated_timeline?.trim() || 'Not specified'}
        </span>
        <span>
          <strong>Proposed price:</strong>{' '}
          {app.proposed_price != null && String(app.proposed_price).length > 0 ?
            formatMoney(app.proposed_price)
          : 'Not specified'}
        </span>
      </div>

      <div className="mb-applicant-ai-panel subtle">
        <div className="mb-applicant-ai-title">Rules-based comparison</div>
        <p className="mb-applicant-ai-rec">{insight.recommendedBuyerDecision}</p>
        <div className="mb-applicant-ai-grid">
          <div>
            <span className="mb-ai-k">Proposal clarity</span>
            <span className="mb-ai-v">{insight.proposalClarityScore}/100</span>
          </div>
          <div>
            <span className="mb-ai-k">Timeline confidence</span>
            <span className="mb-ai-v">
              {insight.timelineConfidenceLabel} ({insight.timelineConfidenceScore}/100)
            </span>
          </div>
        </div>
        {insight.originalWorkflowCreatorAdvantage ?
          (
            <p className="mb-applicant-ai-advantage">
              <strong>Workflow publisher edge:</strong> {insight.originalWorkflowCreatorAdvantage}
            </p>
          )
        : null}
        {insight.strengths.length > 0 ?
          (
            <ul className="mb-ai-list mb-ai-list--ok">
              {insight.strengths.map((s, i) => (
                <li key={`st-${i}`}>{s}</li>
              ))}
            </ul>
          )
        : null}
        {insight.concerns.length > 0 ?
          (
            <ul className="mb-ai-list mb-ai-list--risk">
              {insight.concerns.map((s, i) => (
                <li key={`cn-${i}`}>{s}</li>
              ))}
            </ul>
          )
        : null}
      </div>

      {portfolioHref ?
        (
          <p className="mb-applicant-portfolio subtle">
            <a href={portfolioHref} target="_blank" rel="noopener noreferrer">
              Portfolio link →
            </a>
          </p>
        )
      : (
        <p className="mb-applicant-portfolio subtle">No portfolio URL on file.</p>
      )}

      {prof?.id && isPublicProfile ?
        (
          <p className="mb-applicant-view-profile subtle">
            <Link to={`/creator/${prof.id}`} target="_blank" rel="noopener noreferrer">
              View public profile →
            </Link>
          </p>
        )
      : (
        <p className="mb-applicant-view-profile subtle">Public profile hidden — use Messages or portfolio link.</p>
      )}

      <div className="mb-applicant-actions mb-applicant-actions--primary">
        <CentralMessageLauncher
          buyerRequestId={request.id}
          creatorProfileId={prof?.id ?? null}
          orderId={effectiveOrderId}
          label="Message creator"
          className="mb-applicant-msg-thread"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !canActOnApp}
          aria-busy={busy}
          onClick={() => setConfirmSelect(true)}
          title={!canActOnApp ? 'Selection is locked for this request or application.' : undefined}
        >
          Select creator
        </button>
      </div>

      <div className="mb-applicant-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !canActOnApp}
          aria-busy={busy}
          onClick={() => void doShortlist()}
        >
          {busy ? 'Working…' : 'Shortlist'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !canActOnApp}
          aria-busy={busy}
          onClick={() => void doReject()}
        >
          {busy ? 'Working…' : 'Reject applicant'}
        </button>
      </div>

      {appSt === 'buyer_selected' && effectiveOrderId ?
        (
          <p className="subtle mb-applicant-workspace-hint">
            <strong>Selected for this build.</strong>{' '}
            <Link className="mb-inline-project-link" to={`/dashboard/projects/${effectiveOrderId}`}>
              Open project workspace →
            </Link>
          </p>
        )
      : null}

      {confirmSelect ?
        (
          <div
            className="mb-select-confirm-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`mb-select-title-${app.id}`}
            onClick={(e) => {
              if (e.target === e.currentTarget && !busy) setConfirmSelect(false);
            }}
          >
            <div className="mb-select-confirm-card">
              <h4 className="mb-select-confirm-title" id={`mb-select-title-${app.id}`}>
                Start project with {name}?
              </h4>
              <p className="mb-select-confirm-copy subtle">
                This assigns your MicroBuild to this creator, marks other active applicants as not selected, updates your
                marketplace request, and creates or updates your pipeline order. You can message them immediately afterward.
              </p>
              <div className="mb-select-confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setConfirmSelect(false)}
                >
                  Cancel
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void confirmDoSelect()}>
                  {busy ? 'Saving…' : 'Confirm selection'}
                </button>
              </div>
            </div>
          </div>
        )
      : null}
    </article>
  );
}

function formatMoney(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!isFinite(n)) return String(raw);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function portfolioFirstUrl(prof: CreatorProfileRow | null): string | null {
  if (!prof) return null;
  const links = prof.portfolio_links;
  if (Array.isArray(links)) {
    const first = links.find((u) => typeof u === 'string' && u.trim().length > 0);
    if (first) return first.trim();
  }
  return prof.portfolio_url?.trim() || null;
}

function MessageModerationPlaceholder() {
  return (
    <div className="buyer-muted-hint subtle mb-msg-mod">
      <strong>Moderation toolkit</strong> — admin console will review flagged messages in a later phase (
      <span>foundation only</span>).
    </div>
  );
}

function safe(v: unknown, fb = '') {
  return typeof v === 'string' && v.trim() ? v : fb || 'Unknown';
}

function safeStr(v: unknown, fb = '') {
  return typeof v === 'string' ? v : fb;
}

function normalize(s: unknown) {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

