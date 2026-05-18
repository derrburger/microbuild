import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeProfileStrength } from '../lib/profileAI';
import type { BuyerRequestRow, CreatorProfileRow, ProjectMessageRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow } from '../lib/orders';
import { supabase } from '../lib/supabase';
import {
  creatorDisplayName,
  fetchProjectMessagesForRequest,
  generateApplicantFitScore,
  generateBuyerApplicantComparison,
  generateMessageThreadPreview,
  generateRequestApplicationAISummary,
  getRequestApplicantsForBuyer,
  insertProjectMessage,
  selectCreatorForRequest,
  updateRequestApplicationStatus,
  verifyBuyerOwnsRequest,
  type BuyerApplicantResolved,
} from '../lib/marketplace';

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
}

interface Props {
  buyerProfile: UserProfileRow;
  requests: BuyerRequestMarketplaceBrief[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  onMarketplaceEvent?: () => void | Promise<void>;
}

export default function MarketplaceApplicantsPanel({
  buyerProfile,
  requests,
  ordersByRequestId,
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

  if (actionable.length === 0) return null;

  return (
    <section className="buyer-section mb-applicants-root">
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
            r.selected_creator_profile_id ? creatorLabels[r.selected_creator_profile_id] ?? '…' : null;
          const ord = ordersByRequestId[r.id];

          return (
            <div key={r.id} className="mb-applicants-details">
              <button
                type="button"
                className="mb-applicants-summary-btn mb-applicants-summary-btn--rich"
                onClick={() => void toggle(r.id)}
                aria-expanded={open}
              >
                <span className="mb-applicants-biz">{safe(r.business_name, 'Request')}</span>
                <span className="subtle">{safe(r.build_type, 'MicroBuild')}</span>
                <span className="mb-applicants-count">{cnt} applicant{cnt !== 1 ? 's' : ''}</span>
                <span className="mb-applicants-mkt">{mkt ? readableStatus(mkt) : '—'}</span>
                <span className="subtle">{open ? 'Hide' : 'Show'}</span>
              </button>

              <div className="mb-request-inline-meta subtle">
                <span>Budget: {r.budget?.trim() || '—'}</span>
                <span>Deadline: {r.deadline?.trim() || '—'}</span>
                <span>Request status: {readableStatus(normalize(r.status))}</span>
                {selectedName ?
                  <span className="mb-selected-creator-inline">
                    Selected: <strong>{selectedName}</strong>
                  </span>
                : <span>Selected: —</span>}
                {ord ?
                  (
                    <span>
                      Project:{' '}
                      <Link to={`/dashboard/projects/${ord.id}`} className="mb-inline-project-link">
                        View workspace →
                      </Link>
                    </span>
                  )
                : null}
              </div>

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
                  <RequestMessagesSection
                    buyerProfile={buyerProfile}
                    buyerRequestId={r.id}
                  />
                )
              : null}

              {open && loadingReq === r.id ? <div className="dash-loading">Loading applicants…</div> : null}
              {open && applicantMap[r.id]?.length === 0 && loadingReq !== r.id && (
                <div className="mb-applicants-empty subtle">No applications yet.</div>
              )}
              {open ?
                (applicantMap[r.id] ?? []).map((a) => (
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
                ))
              : null}
              {open && applicantMap[r.id]?.length ?
                (
                  <p className="subtle mb-comparison-snippet">
                    <pre>{generateBuyerApplicantComparison(applicantMap[r.id], {
                      ...r,
                      main_goal: r.main_goal ?? undefined,
                      current_problem: r.current_problem ?? undefined,
                    } as Partial<BuyerRequestRow>)}</pre>
                  </p>
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

// Lazy import pattern — avoid circular deps; supabase is same module path as Dashboard
function RequestMessagesSection({
  buyerProfile,
  buyerRequestId,
}: {
  buyerProfile: UserProfileRow;
  buyerRequestId: string;
}) {
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<ProjectMessageRow[]>([]);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  async function refresh() {
    const rows = await fetchProjectMessagesForRequest(buyerRequestId);
    setMsgs(rows);
  }

  useEffect(() => {
    void refresh();
  }, [buyerRequestId]);

  const preview = useMemo(() => generateMessageThreadPreview(msgs), [msgs]);

  async function send() {
    const body = text.trim();
    if (!body.length) return;
    setSending(true);
    setSendErr(null);
    const ins = await insertProjectMessage({
      buyer_request_id: buyerRequestId,
      sender_user_profile_id: buyerProfile.id ?? null,
      sender_role: 'buyer',
      message_body: body,
      visibility: 'buyer_creator',
      message_type: 'general',
    });
    if (!ins.ok) {
      setSendErr(ins.error ?? 'Could not save message.');
    } else setText('');
    await refresh();
    setSending(false);
  }

  return (
    <div className="mb-request-messages-block">
      <div className="mb-request-messages-title">
        Messages <span className="subtle">(refresh-based — realtime inbox coming later)</span>
      </div>
      <div className="mb-msg-prev subtle">{preview}</div>
      {sendErr ?
        <div className="mb-form-alert mb-form-alert--error" role="alert">
          {sendErr}
        </div>
      : null}
      <div className="mb-msg-send">
        <textarea
          className="mb-form-input mb-form-textarea"
          rows={2}
          placeholder="Optional note to the creator (saved on this request thread)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={sending} onClick={() => void send()}>
          Send &amp; refresh
        </button>
      </div>
    </div>
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
  const prof = oneProfile(app.creator_profiles ?? null);
  const name = creatorDisplayName(app.creator_profiles ?? null);
  const tier = prof?.tier ?? '—';
  const verif = prof?.verification_status ?? '—';
  const approval = prof?.approval_status ?? '—';
  const vis = prof?.public_profile_status ?? '—';
  const strengthScore =
    typeof prof?.profile_strength_score === 'number'
      ? prof.profile_strength_score
      : prof ? analyzeProfileStrength(prof as CreatorProfileRow).score
      : null;

  const fit = generateApplicantFitScore(app, prof, {
    ...request,
    main_goal: request.main_goal ?? undefined,
    current_problem: request.current_problem ?? undefined,
  } as Partial<BuyerRequestRow>);
  const aiSum = generateRequestApplicationAISummary(app, app.creator_profiles ?? null);

  const mktReq = normalize(request.application_status);
  const requestLocked = ['creator_selected', 'in_progress', 'completed', 'closed'].includes(mktReq);
  const appSt = normalize(app.application_status ?? '');
  const canActOnApp = (appSt === 'submitted' || appSt === 'shortlisted') && !requestLocked;
  const portfolioHref = portfolioFirstUrl(prof);

  async function doShortlist() {
    if (!canActOnApp) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'shortlisted');
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant shortlisted.' } : { type: 'err', msg: 'Could not update shortlist.' },
    );
    await onReload();
  }

  async function doReject() {
    if (!canActOnApp) return;
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'rejected');
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant marked not selected for this cycle.' }
      : { type: 'err', msg: 'Could not update applicant.' },
    );
    await onReload();
  }

  async function doSelect() {
    if (!canActOnApp) return;
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

  return (
    <div className="mb-applicant-row">
      <div className="mb-applicant-meta">
        <div className="mb-applicant-name">{name}</div>
        <div className="mb-applicant-badges">
          <span className="mb-badge">Tier: {tier}</span>
          <span className="mb-badge">Verification: {verif}</span>
          <span className="mb-badge">Profile: {vis}</span>
          <span className="mb-badge">Approval: {approval}</span>
          <span className="mb-badge">
            {typeof strengthScore === 'number' ? `Strength ${strengthScore}/100` : 'Strength —'}
          </span>
          <span className="mb-badge mb-badge-fit">Fit score: {fit}/100</span>
        </div>
      </div>

      <div className="mb-applicant-fields">
        <blockquote className="mb-applicant-proposal">
          <span className="subtle buyer-muted-hint">Proposal</span>
          <p>{app.proposal_message?.trim() || '—'}</p>
        </blockquote>
        <p className="mb-applicant-line subtle">
          <strong>Fit reason:</strong> {app.fit_reason?.trim() || '—'}
        </p>
        <p className="mb-applicant-line subtle">
          <strong>Questions for you:</strong> {app.creator_questions?.trim() || '—'}
        </p>
      </div>

      <div className="mb-applicant-line subtle">
        <span>Timeline: {app.estimated_timeline?.trim() || '—'}</span>
        <span>
          Proposed price:{' '}
          {app.proposed_price != null && String(app.proposed_price).length > 0 ?
            formatMoney(app.proposed_price)
          : '—'}
        </span>
      </div>

      {portfolioHref ?
        (
          <p className="mb-applicant-portfolio subtle">
            <a href={portfolioHref} target="_blank" rel="noopener noreferrer">
              Portfolio / profile preview →
            </a>
          </p>
        )
      : (
        <p className="mb-applicant-portfolio subtle">No portfolio link on file.</p>
      )}

      <p className="subtle mb-ai-summary">{aiSum}</p>

      <div className="mb-applicant-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !canActOnApp}
          onClick={() => void doShortlist()}
        >
          Shortlist
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !canActOnApp}
          onClick={() => void doSelect()}
          title={!canActOnApp ? 'Selection is locked for this request or application.' : undefined}
        >
          Select creator
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !canActOnApp}
          onClick={() => void doReject()}
        >
          Reject
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled title="Unified inbox coming soon">
          Message creator (placeholder)
        </button>
      </div>

      {appSt === 'buyer_selected' && orderId ?
        (
          <p className="subtle mb-applicant-workspace-hint">
            Open build workspace:{' '}
            <Link className="mb-inline-project-link" to={`/dashboard/projects/${orderId}`}>
              Project workspace →
            </Link>
          </p>
        )
      : null}
    </div>
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

function readableStatus(s: string): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ');
}
