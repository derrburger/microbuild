import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BuyerRequestRow, ProjectProposalRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow } from '../lib/orders';
import {
  buyerApproveProposal,
  buyerRejectProposal,
  buyerRequestProposalChanges,
  displayBuyerApproval,
  displayProposalLifecycle,
  fetchProposalsForBuyerRequests,
  workflowBackedRequest,
} from '../lib/proposals';
import { copyTextToClipboard } from '../lib/workspaceCopy';
import {
  buildBuyerScopeSummaryCopy,
  buildCreatorScopeBriefCopy,
  buildFullProposalCopy,
  buildPaymentPlaceholderMessage,
  buildScopeOnlyCopy,
} from '../lib/proposalCopyTexts';

export type BuyerProposalRequestSnap = Pick<
  BuyerRequestRow,
  | 'id'
  | 'business_name'
  | 'build_type'
  | 'source_type'
  | 'source_workflow_title'
  | 'source_creator_profile_id'
  | 'customization_notes'
  | 'requested_from_workflow'
  | 'selected_creator_profile_id'
>;

function fmtMoney(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

async function copy(label: string, text: string, onToast: (s: string | null) => void, onCopied: (k: string | null) => void, key: string) {
  const ok = await copyTextToClipboard(text);
  onCopied(ok ? key : null);
  onToast(ok ? `${label} copied` : `${label} failed`);
  window.setTimeout(() => {
    onCopied(null);
    onToast(null);
  }, 2200);
}

export default function BuyerProposalSection({
  userProfile,
  requests,
  ordersByRequestId,
  creatorProfileLabels,
}: {
  userProfile: UserProfileRow;
  requests: BuyerProposalRequestSnap[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  creatorProfileLabels: Record<string, string>;
}) {
  const [rows, setRows] = useState<ProjectProposalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const requestIds = useMemo(() => requests.map((r) => r.id).filter(Boolean), [requests]);

  const load = useCallback(async () => {
    if (requestIds.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchProposalsForBuyerRequests(requestIds);
      setRows(data);
    } catch (e) {
      console.error(e);
      setErr('Could not load proposals.');
    } finally {
      setLoading(false);
    }
  }, [requestIds.join('|')]);

  useEffect(() => {
    void load();
  }, [load]);

  if (requestIds.length === 0) return null;

  function reqFor(pid: string | null): BuyerProposalRequestSnap | undefined {
    if (!pid) return undefined;
    return requests.find((r) => r.id === pid);
  }

  async function act(
    proposalId: string,
    kind: 'approve' | 'changes' | 'reject',
  ) {
    setBusyId(proposalId);
    setErr(null);
    const fb = feedback[proposalId]?.trim() ?? '';
    const res =
      kind === 'approve' ? await buyerApproveProposal({ proposalId, buyerProfile: userProfile })
      : kind === 'changes' ? await buyerRequestProposalChanges({ proposalId, buyerProfile: userProfile, feedback: fb })
      : await buyerRejectProposal({ proposalId, buyerProfile: userProfile, feedback: fb });
    setBusyId(null);
    if (!res.ok) {
      setErr(res.error ?? 'Update failed.');
      return;
    }
    await load();
    setToast(kind === 'approve' ? 'Proposal approved — scope locked for MVP testing.' : 'Proposal status updated.');
    window.setTimeout(() => setToast(null), 3200);
  }

  if (loading && rows.length === 0) {
    return (
      <section className="buyer-section mb-buyer-proposals">
        <h3 className="buyer-section-title">Proposals &amp; pricing</h3>
        <div className="dash-loading">Loading proposals…</div>
      </section>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="buyer-section mb-buyer-proposals" id="buyer-proposals-pricing">
      <div className="buyer-section-header">
        <h3 className="buyer-section-title">Project agreements</h3>
        <span className="subtle buyer-muted-hint">
          Confirm scope on your <strong>project workspace</strong> — price is indicative only; payment comes later.
        </span>
      </div>
      {toast ? <div className="mb-form-alert mb-form-alert--muted">{toast}</div> : null}
      {err ? <div className="mb-form-alert mb-form-alert--error">{err}</div> : null}

      <div className="mb-buyer-proposals-list">
        {rows.map((p) => {
          const br = reqFor(p.buyer_request_id);
          const ord = p.buyer_request_id ? ordersByRequestId[p.buyer_request_id] ?? null : null;
          const orderHref = ord?.id ? `/dashboard/projects/${ord.id}` : null;
          const canRespond = p.proposal_status === 'sent';
          const wf = br && workflowBackedRequest(br);
          const selectedCreatorId =
            ord?.creator_id?.trim() || br?.selected_creator_profile_id?.trim() || p.creator_profile_id?.trim() || '';
          const selectedCreatorName =
            selectedCreatorId ? creatorProfileLabels[selectedCreatorId]?.trim() || 'Assigned creator' : 'Not assigned yet';
          const originalPublisherName =
            wf && br?.source_creator_profile_id?.trim() ?
              creatorProfileLabels[br.source_creator_profile_id.trim()]?.trim() || 'Original workflow creator'
            : null;

          return (
            <div key={p.id} className="mb-buyer-proposal-card">
              <div className="mb-buyer-proposal-card-head">
                <h4>{p.proposal_title?.trim() || 'Proposal'}</h4>
                <span className="mb-buyer-proposal-pills">
                  <span className="mb-badge">{displayProposalLifecycle(p.proposal_status)}</span>
                  <span className="mb-badge">Buyer confirmation: {displayBuyerApproval(p.buyer_approval_status)}</span>
                  {orderHref ?
                    (
                      <Link className="btn btn-primary btn-sm" to={orderHref}>
                        Open Project Agreement →
                      </Link>
                    )
                  : null}
                </span>
              </div>
              {br ?
                <p className="subtle mb-buyer-proposal-sub">
                  Request: <strong>{br.business_name}</strong> · {br.build_type || 'MicroBuild'}
                  {wf ?
                    <>
                      {' '}
                      · <span className="mb-buyer-proposal-wf-label">Workflow customization</span>
                      {br.source_workflow_title?.trim() ?
                        <>
                          {' '}
                          · <strong>{br.source_workflow_title.trim()}</strong>
                        </>
                      : null}
                    </>
                  : null}
                </p>
              : null}
              <dl className="mb-buyer-proposal-dl">
                <dt>Selected creator</dt>
                <dd>{selectedCreatorName}</dd>
                {originalPublisherName ?
                  (
                    <>
                      <dt>Original workflow creator</dt>
                      <dd>{originalPublisherName}</dd>
                    </>
                  )
                : null}
                <dt>Scope</dt>
                <dd>{p.scope_summary?.trim() || '—'}</dd>
                <dt>Deliverables</dt>
                <dd>{p.included_deliverables?.trim() || '—'}</dd>
                <dt>Timeline</dt>
                <dd>{p.timeline?.trim() || '—'}</dd>
                <dt>Revisions included</dt>
                <dd>{typeof p.revision_limit === 'number' ? p.revision_limit : '—'}</dd>
                <dt>Proposed price (placeholder)</dt>
                <dd>{fmtMoney(p.proposed_price)}</dd>
              </dl>
              {wf && br?.customization_notes?.trim() ?
                (
                  <p className="subtle mb-buyer-proposal-custom">
                    <strong>Your customization notes:</strong> {br.customization_notes.trim().slice(0, 280)}
                    {br.customization_notes.trim().length > 280 ? '…' : ''}
                  </p>
                )
              : null}
              <p className="mb-buyer-proposal-payment-note">
                Payment is not active yet. Agreement confirmation locks scope for MVP testing. Checkout and protected
                handoff come in a later phase.
              </p>
              {orderHref ?
                <p className="subtle">
                  <Link to={orderHref} className="mb-inline-project-link">
                    Open linked project workspace →
                  </Link>
                </p>
              : (
                <p className="subtle">Project workspace appears once an order is linked to this proposal.</p>
              )}

              <div className="mb-buyer-proposal-copy-row">
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm${copiedKey === `${p.id}-full` ? ' mb-copy-flash' : ''}`}
                  onClick={() =>
                    void copy('Proposal', buildFullProposalCopy(p, br as BuyerRequestRow), setToast, setCopiedKey, `${p.id}-full`)
                  }
                >
                  {copiedKey === `${p.id}-full` ? 'Copied' : 'Copy proposal'}
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm${copiedKey === `${p.id}-buyer` ? ' mb-copy-flash' : ''}`}
                  onClick={() => void copy('Buyer summary', buildBuyerScopeSummaryCopy(p), setToast, setCopiedKey, `${p.id}-buyer`)}
                >
                  {copiedKey === `${p.id}-buyer` ? 'Copied' : 'Copy buyer summary'}
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm${copiedKey === `${p.id}-creator` ? ' mb-copy-flash' : ''}`}
                  onClick={() => void copy('Creator brief', buildCreatorScopeBriefCopy(p), setToast, setCopiedKey, `${p.id}-creator`)}
                >
                  {copiedKey === `${p.id}-creator` ? 'Copied' : 'Copy creator brief'}
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm${copiedKey === `${p.id}-scope` ? ' mb-copy-flash' : ''}`}
                  onClick={() => void copy('Scope', buildScopeOnlyCopy(p), setToast, setCopiedKey, `${p.id}-scope`)}
                >
                  {copiedKey === `${p.id}-scope` ? 'Copied' : 'Copy scope'}
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm${copiedKey === `${p.id}-pay` ? ' mb-copy-flash' : ''}`}
                  onClick={() =>
                    void copy('Payment placeholder', buildPaymentPlaceholderMessage(), setToast, setCopiedKey, `${p.id}-pay`)
                  }
                >
                  {copiedKey === `${p.id}-pay` ? 'Copied' : 'Copy payment placeholder'}
                </button>
              </div>

              {!canRespond && p.proposal_status !== 'buyer_approved' ?
                (
                  <p className="subtle mb-buyer-proposal-wait">
                    {p.proposal_status === 'draft' ?
                      'MicroBuild will send this proposal when scope is ready.'
                    : 'Respond when the proposal status is Sent.'}
                  </p>
                )
              : null}

              {canRespond ?
                (
                  <div className="mb-buyer-proposal-actions">
                    <label className="subtle mb-buyer-proposal-fb">
                      Optional feedback for changes / reject
                      <textarea
                        rows={2}
                        value={feedback[p.id] ?? ''}
                        onChange={(e) => setFeedback((m) => ({ ...m, [p.id]: e.target.value }))}
                        placeholder="What should adjust?"
                      />
                    </label>
                    <div className="mb-buyer-proposal-btn-row">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, 'approve')}
                      >
                        Approve proposal
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, 'changes')}
                      >
                        Request changes
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === p.id}
                        onClick={() => void act(p.id, 'reject')}
                      >
                        Reject proposal
                      </button>
                    </div>
                  </div>
                )
              : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
