import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyzeProfileStrength } from '../lib/profileAI';
import type { CreatorProfileRow, ProjectMessageRow, UserProfileRow } from '../types/database';
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
  applications_count?: number | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
}

interface Props {
  buyerProfile: UserProfileRow;
  requests: BuyerRequestMarketplaceBrief[];
}

export default function MarketplaceApplicantsPanel({ buyerProfile, requests }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applicantMap, setApplicantMap] = useState<Record<string, BuyerApplicantResolved[]>>({});
  const [loadingReq, setLoadingReq] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const actionable = useMemo(
    () =>
      requests.filter((r) => {
        const m = normalize(r.application_status);
        if (m === 'completed' || m === 'closed') return false;
        return true;
      }),
    [requests],
  );

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
    [buyerProfile.email],
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
          Review creators who volunteered to build your open requests — selection creates the project/order.
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

          return (
            <div key={r.id} className="mb-applicants-details">
              <button
                type="button"
                className="mb-applicants-summary-btn"
                onClick={() => void toggle(r.id)}
                aria-expanded={open}
              >
                <span className="mb-applicants-biz">{safe(r.business_name)}</span>
                <span className="subtle">{safe(r.build_type)}</span>
                <span className="mb-applicants-count">{cnt} applicant{cnt !== 1 ? 's' : ''}</span>
                <span className="subtle">{open ? 'Hide' : 'Show'}</span>
              </button>
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
                    busy={busyId === a.id}
                    onBusy={(v) => setBusyId(v ? a.id : null)}
                    onToast={(t) => setToast(t)}
                    onReload={() => loadApplicants(r.id)}
                  />
                ))
              : null}
              {open && applicantMap[r.id]?.length ?
                (
                  <p className="subtle mb-comparison-snippet">
                    <pre>{generateBuyerApplicantComparison(applicantMap[r.id], { ...r, main_goal: r.main_goal ?? undefined })}</pre>
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

function ApplicantRow({
  app,
  buyerProfile,
  request,
  busy,
  onBusy,
  onToast,
  onReload,
}: {
  app: BuyerApplicantResolved;
  buyerProfile: UserProfileRow;
  request: BuyerRequestMarketplaceBrief;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onToast: (t: { type: 'ok' | 'err'; msg: string }) => void;
  onReload: () => Promise<void>;
}) {
  const prof = oneProfile(app.creator_profiles ?? null);
  const name = creatorDisplayName(app.creator_profiles ?? null);
  const tier = prof?.tier ?? '—';
  const verif = prof?.verification_status ?? '—';
  const strengthScore =
    typeof prof?.profile_strength_score === 'number'
      ? prof.profile_strength_score
      : prof ? analyzeProfileStrength(prof as CreatorProfileRow).score
      : null;

  const fit = generateApplicantFitScore(app, prof, {
    ...request,
    main_goal: request.main_goal ?? undefined,
  });
  const aiSum = generateRequestApplicationAISummary(app, app.creator_profiles ?? null);

  async function doShortlist() {
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'shortlisted');
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant shortlisted.' } : { type: 'err', msg: 'Could not update shortlist.' },
    );
    await onReload();
  }

  async function doReject() {
    onBusy(true);
    const ok = await updateRequestApplicationStatus(app.id, 'rejected');
    onBusy(false);
    onToast(
      ok ? { type: 'ok', msg: 'Applicant rejected for this cycle.' }
      : { type: 'err', msg: 'Could not reject applicant.' },
    );
    await onReload();
  }

  async function doSelect() {
    onBusy(true);
    const res = await selectCreatorForRequest({
      buyerRequestId: request.id,
      requestApplicationId: app.id,
      buyerEmail: buyerProfile.email,
      buyerProfile,
    });
    onBusy(false);
    onToast(
      res.ok ? { type: 'ok', msg: 'Creator selected — project/order updated for their workspace.' } : (
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
          <span className="mb-badge">{verif}</span>
          <span className="mb-badge">
            {typeof strengthScore === 'number' ? `Profile score ${strengthScore}/100` : 'Profile —'}
          </span>
          <span className="mb-badge mb-badge-fit">Fit score: {fit}/100</span>
        </div>
      </div>
      <blockquote className="mb-applicant-proposal">
        <span className="subtle buyer-muted-hint">Proposal</span>
        <p>{app.proposal_message?.trim() || '—'}</p>
      </blockquote>
      <div className="mb-applicant-line subtle">
        <span>Timeline: {app.estimated_timeline?.trim() || 'Not specified'}</span>
        <span>
          Offer:{' '}
          {app.proposed_price != null && app.proposed_price !== ''
            ? String(app.proposed_price)
            : '—'}
        </span>
      </div>
      <p className="subtle mb-ai-summary">{aiSum}</p>
      <ApplicantMessagingStub buyerProfile={buyerProfile} buyerRequestId={request.id} />
      <div className="mb-applicant-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void doShortlist()}>
          Shortlist
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void doSelect()}>
          Select creator
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void doReject()}>
          Reject
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled title="Realtime messaging backlog">
          Message (placeholder)
        </button>
      </div>
    </div>
  );
}

/** Refresh-only textarea send — foundation for threaded buyer/creator comms around a request */
function ApplicantMessagingStub({
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
    <div className="mb-msg-stub subtle">
      <div className="mb-msg-prev">{preview}</div>
      {sendErr ?
        <div className="mb-form-alert mb-form-alert--error" role="alert">
          {sendErr}
        </div>
      : null}
      <div className="mb-msg-send">
        <textarea
          className="mb-form-input mb-form-textarea"
          rows={2}
          placeholder="Send a lightweight note refresh-based (realtime deferred)"
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

function normalize(s: unknown) {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}
