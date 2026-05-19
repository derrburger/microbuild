import { useCallback, useEffect, useState } from 'react';
import type { BuyerRequestRow, ProjectProposalRow, RequestApplicationRow } from '../types/database';
import type { OrderPipelineRow } from '../lib/orders';
import type { BuildPacketSnippet } from '../lib/proposals';
import {
  adminSetProposalStatus,
  adminUpsertProposalFields,
  displayBuyerApproval,
  displayProposalLifecycle,
  fetchApplicationById,
  fetchProposalByBuyerRequestId,
  fetchProposalByOrderId,
  generateAndPersistProposal,
  generateProposalDraft,
  linkProposalToOrder,
  workflowBackedRequest,
  fetchPublishedWorkflowById,
} from '../lib/proposals';
import { copyTextToClipboard } from '../lib/workspaceCopy';
import {
  buildBuyerScopeSummaryCopy,
  buildCreatorScopeBriefCopy,
  buildFullProposalCopy,
  buildPaymentPlaceholderMessage,
  buildScopeOnlyCopy,
} from '../lib/proposalCopyTexts';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb;
}

function fmtMoney(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export default function AdminProposalSection({
  buyerRequest,
  order,
  packetSnippet,
  onReload,
}: {
  buyerRequest: BuyerRequestRow;
  order: OrderPipelineRow | null;
  packetSnippet: BuildPacketSnippet | null;
  onReload: () => Promise<void>;
}) {
  const [proposal, setProposal] = useState<ProjectProposalRow | null>(null);
  const [application, setApplication] = useState<RequestApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedBtn, setCopiedBtn] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [timeline, setTimeline] = useState('');
  const [revisionLimit, setRevisionLimit] = useState('1');
  const [price, setPrice] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const appId = safe(buyerRequest.selected_request_application_id);
      const appRow = appId ? await fetchApplicationById(appId) : null;
      setApplication(appRow);

      const prop =
        order?.id ? await fetchProposalByOrderId(order.id) : await fetchProposalByBuyerRequestId(buyerRequest.id);
      setProposal(prop);
      if (prop) {
        setTitle(prop.proposal_title ?? '');
        setScope(prop.scope_summary ?? '');
        setDeliverables(prop.included_deliverables ?? '');
        setTimeline(prop.timeline ?? '');
        setRevisionLimit(String(prop.revision_limit ?? 1));
        setPrice(prop.proposed_price != null && prop.proposed_price !== '' ? String(prop.proposed_price) : '');
        setAdminNotes(prop.admin_notes ?? '');
      } else {
        const wf =
          workflowBackedRequest(buyerRequest) ?
            await fetchPublishedWorkflowById(buyerRequest.source_workflow_id)
          : null;
        const preview = generateProposalDraft({
          buyerRequest,
          order: order ?? undefined,
          application: appRow ?? undefined,
          buildPacket: packetSnippet ?? undefined,
          publishedWorkflow: wf ?? undefined,
        });
        setTitle(preview.proposal_title);
        setScope(preview.scope_summary);
        setDeliverables(preview.included_deliverables);
        setTimeline(preview.timeline);
        setRevisionLimit(String(preview.revision_limit));
        setPrice(preview.proposed_price != null ? String(preview.proposed_price) : '');
        setAdminNotes([preview.admin_notes, '', 'Risks:', ...preview.risks_missing_info.map((r) => `• ${r}`)].join('\n'));
      }
    } catch (e) {
      console.error(e);
      setErr('Could not load proposal state.');
    } finally {
      setLoading(false);
    }
  }, [buyerRequest, order, packetSnippet]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyBtn(key: string, label: string, text: string) {
    const ok = await copyTextToClipboard(text);
    setCopiedBtn(ok ? key : null);
    setToast(ok ? `${label} copied` : `${label} copy failed`);
    window.setTimeout(() => {
      setCopiedBtn(null);
      setToast(null);
    }, 2200);
  }

  async function handleGeneratePersist() {
    setBusy(true);
    setErr(null);
    const wf =
      workflowBackedRequest(buyerRequest) ? await fetchPublishedWorkflowById(buyerRequest.source_workflow_id) : null;
    const res = await generateAndPersistProposal({
      buyerRequest,
      order: order ?? undefined,
      application: application ?? undefined,
      buildPacket: packetSnippet ?? undefined,
      publishedWorkflow: wf ?? undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? 'Generate failed.');
      return;
    }
    await load();
    await onReload();
    setToast('Draft generated and saved to the database.');
    window.setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveProposal() {
    setBusy(true);
    setErr(null);
    const rev = Math.max(0, Math.floor(Number(revisionLimit) || 1));
    const pNum = price.trim() ? Number(price) : null;
    const cleanPrice = pNum != null && isFinite(pNum) ? pNum : null;
    const wf =
      workflowBackedRequest(buyerRequest) ? await fetchPublishedWorkflowById(buyerRequest.source_workflow_id) : null;

    const res = await adminUpsertProposalFields({
      buyerRequest,
      order,
      application: application ?? null,
      buildPacket: packetSnippet ?? null,
      publishedWorkflow: wf ?? null,
      existingProposal: proposal,
      fields: {
        proposal_title: title.trim() || 'MicroBuild proposal',
        scope_summary: scope.trim() || '—',
        included_deliverables: deliverables.trim() || '—',
        timeline: timeline.trim() || '—',
        revision_limit: rev,
        proposed_price: cleanPrice,
        admin_notes: adminNotes.trim() || null,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? 'Save failed.');
      return;
    }
    await load();
    await onReload();
    setToast(proposal?.id ? 'Proposal updated.' : 'Proposal saved — linked to this request/project.');
    window.setTimeout(() => setToast(null), 2800);
  }

  async function handleLinkOrder() {
    if (!proposal?.id || !order?.id) return;
    setBusy(true);
    const res = await linkProposalToOrder(proposal.id, order.id);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? 'Link failed.');
      return;
    }
    await load();
    await onReload();
    setToast('Proposal attached to this order.');
    window.setTimeout(() => setToast(null), 2500);
  }

  async function setLifecycleStatus(
    status: 'draft' | 'sent' | 'buyer_approved' | 'buyer_changes_requested' | 'buyer_rejected',
  ) {
    if (!proposal?.id) return;
    setBusy(true);
    setErr(null);
    const res = await adminSetProposalStatus(proposal.id, status);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? 'Status update failed.');
      return;
    }
    await load();
    await onReload();
    setToast('Proposal status updated.');
    window.setTimeout(() => setToast(null), 2200);
  }

  const wfTitle = safe(buyerRequest.source_workflow_title);
  const customization = safe(buyerRequest.customization_notes);
  const wfBacked = workflowBackedRequest(buyerRequest);

  let snapshotPretty = '';
  if (proposal?.workflow_context_snapshot) {
    try {
      snapshotPretty = JSON.stringify(JSON.parse(proposal.workflow_context_snapshot), null, 2);
    } catch {
      snapshotPretty = proposal.workflow_context_snapshot;
    }
  }

  const propForCopy = proposal
    ? ({
        ...proposal,
        proposal_title: title || proposal.proposal_title,
        scope_summary: scope || proposal.scope_summary,
        included_deliverables: deliverables || proposal.included_deliverables,
        timeline: timeline || proposal.timeline,
        revision_limit: Math.max(0, Math.floor(Number(revisionLimit) || 1)),
        proposed_price: price.trim() ? Number(price) : proposal.proposed_price,
      } as ProjectProposalRow)
    : ({
        id: 'preview',
        proposal_title: title || 'Proposal preview',
        scope_summary: scope,
        included_deliverables: deliverables,
        timeline,
        revision_limit: Math.max(0, Math.floor(Number(revisionLimit) || 1)),
        proposed_price: price.trim() ? Number(price) : null,
        platform_fee: null,
        creator_payout: null,
        proposal_status: 'draft',
        buyer_approval_status: 'pending',
        buyer_request_id: buyerRequest.id,
        order_id: null,
        request_application_id: null,
        creator_profile_id: null,
        buyer_user_profile_id: null,
        admin_approval_status: 'pending',
        buyer_feedback: null,
        admin_notes: adminNotes || null,
        workflow_context_snapshot: null,
        created_at: '',
        updated_at: '',
      } as ProjectProposalRow);

  const hasPersistedProposal = Boolean(proposal?.id);
  const revNum = Math.max(0, Math.floor(Number(revisionLimit) || 1));

  return (
    <div className="req-admin-proposal">
      <div className="req-admin-proposal-head">
        <div className="req-project-workflow-label">Official proposal (scope &amp; price)</div>
        <p className="req-admin-proposal-subtle">
          This is the buyer-facing scope and placeholder pricing step — <strong>not</strong> checkout. Stripe and protected
          handoff come later. Use the steps below in order: draft → save → send → buyer responds.
        </p>
      </div>

      {loading ?
        <div className="req-project-workflow-loading">Loading proposal…</div>
      : (
        <>
          {toast ? <div className="wf-feedback wf-feedback--ok">{toast}</div> : null}
          {err ? <div className="wf-feedback wf-feedback--err">{err}</div> : null}

          {!hasPersistedProposal ?
            (
              <div className="req-admin-proposal-empty-banner">
                <strong>No proposal saved yet.</strong> Generate a rules-based draft from the request, review the fields,
                then <strong>Save proposal</strong> to store it and link it to this request
                {order?.id ? ' and order' : ''}.
              </div>
            )
          : (
            <div className="req-admin-proposal-summary">
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Title</span>
                <span className="req-admin-proposal-summary-val">{title.trim() || '—'}</span>
              </div>
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Proposal status</span>
                <span className="req-admin-proposal-summary-val">
                  {proposal ? displayProposalLifecycle(proposal.proposal_status) : '—'}
                </span>
              </div>
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Buyer approval</span>
                <span className="req-admin-proposal-summary-val">
                  {proposal ? displayBuyerApproval(proposal.buyer_approval_status) : '—'}
                </span>
              </div>
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Price (placeholder)</span>
                <span className="req-admin-proposal-summary-val">{fmtMoney(proposal?.proposed_price ?? (price.trim() ? Number(price) : null))}</span>
              </div>
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Timeline</span>
                <span className="req-admin-proposal-summary-val">{timeline.trim() || '—'}</span>
              </div>
              <div className="req-admin-proposal-summary-card">
                <span className="req-admin-proposal-summary-label">Revision limit</span>
                <span className="req-admin-proposal-summary-val">{revNum}</span>
              </div>
            </div>
          )}

          <div className="req-admin-proposal-meta">
            {order?.id ?
              <span className="wf-tag wf-tag--muted">Order: {order.id.slice(0, 8)}…</span>
            : <span className="wf-tag wf-tag--warn">No order yet — proposal saves on the request until a project exists</span>}
            {proposal?.order_id && order?.id && proposal.order_id !== order.id ?
              <span className="wf-tag wf-tag--warn">Proposal linked to another order — attach below</span>
            : null}
          </div>

          {wfBacked ?
            (
              <div className="req-admin-proposal-wf">
                <strong>Workflow customization</strong>
                <div>
                  <span className="req-admin-proposal-wf-tag">Source type: Workflow customization</span>
                </div>
                <div>Template title: {wfTitle || '—'}</div>
                <div>Original workflow creator profile id: {buyerRequest.source_creator_profile_id?.trim() || '—'}</div>
                <div>Customization notes: {customization || '—'}</div>
                {snapshotPretty ?
                  (
                    <details>
                      <summary>Frozen workflow snapshot (reference)</summary>
                      <pre className="req-admin-proposal-pre">{snapshotPretty}</pre>
                    </details>
                  )
                : null}
              </div>
            )
          : null}

          <div className="req-admin-proposal-step-label">Step 1 — Draft &amp; save</div>
          <div className="req-admin-proposal-actions-primary">
            <button
              type="button"
              className="wf-action-btn wf-action-btn--primary req-admin-proposal-btn-lg"
              disabled={busy}
              onClick={() => void handleGeneratePersist()}
            >
              {busy ? 'Working…' : hasPersistedProposal ? 'Regenerate draft' : 'Generate proposal'}
            </button>
            <button
              type="button"
              className="wf-action-btn wf-action-btn--accent req-admin-proposal-btn-lg"
              disabled={busy}
              onClick={() => void handleSaveProposal()}
            >
              {busy ? 'Saving…' : 'Save proposal'}
            </button>
            {proposal?.id && order?.id && !proposal.order_id ?
              (
                <button type="button" className="wf-action-btn" disabled={busy} onClick={() => void handleLinkOrder()}>
                  Attach to this order
                </button>
              )
            : null}
          </div>

          <div className="req-admin-proposal-step-label">Step 2 — Send &amp; buyer outcome (testing / override)</div>
          <p className="req-admin-proposal-step-hint">
            Normally you <strong>Mark sent</strong> when the buyer should see this in their dashboard. Use the outcome
            buttons only for support/testing — the buyer should approve or reject from their account when live.
          </p>
          <div className="req-admin-proposal-actions-lifecycle">
            <button
              type="button"
              className="wf-action-btn req-admin-proposal-lifecycle-sent"
              disabled={busy || !proposal?.id}
              onClick={() => void setLifecycleStatus('sent')}
            >
              Mark sent
            </button>
            <button
              type="button"
              className="wf-action-btn req-admin-proposal-lifecycle-approved"
              disabled={busy || !proposal?.id}
              onClick={() => void setLifecycleStatus('buyer_approved')}
            >
              Mark buyer approved
            </button>
            <button
              type="button"
              className="wf-action-btn req-admin-proposal-lifecycle-changes"
              disabled={busy || !proposal?.id}
              onClick={() => void setLifecycleStatus('buyer_changes_requested')}
            >
              Mark changes requested
            </button>
            <button
              type="button"
              className="wf-action-btn req-admin-proposal-lifecycle-rejected"
              disabled={busy || !proposal?.id}
              onClick={() => void setLifecycleStatus('buyer_rejected')}
            >
              Mark buyer rejected
            </button>
          </div>

          <div className="req-admin-proposal-step-label">Copy helpers</div>
          <div className="req-admin-proposal-copy-grid">
            <button
              type="button"
              className={`wf-action-btn${copiedBtn === 'full' ? ' req-admin-proposal-copied' : ''}`}
              onClick={() =>
                void copyBtn('full', 'Proposal', buildFullProposalCopy(propForCopy, buyerRequest))
              }
            >
              {copiedBtn === 'full' ? 'Copied' : 'Copy proposal'}
            </button>
            <button
              type="button"
              className={`wf-action-btn${copiedBtn === 'buyer' ? ' req-admin-proposal-copied' : ''}`}
              onClick={() => void copyBtn('buyer', 'Buyer summary', buildBuyerScopeSummaryCopy(propForCopy))}
            >
              {copiedBtn === 'buyer' ? 'Copied' : 'Copy buyer summary'}
            </button>
            <button
              type="button"
              className={`wf-action-btn${copiedBtn === 'creator' ? ' req-admin-proposal-copied' : ''}`}
              onClick={() => void copyBtn('creator', 'Creator brief', buildCreatorScopeBriefCopy(propForCopy))}
            >
              {copiedBtn === 'creator' ? 'Copied' : 'Copy creator brief'}
            </button>
            <button
              type="button"
              className={`wf-action-btn${copiedBtn === 'scope' ? ' req-admin-proposal-copied' : ''}`}
              onClick={() => void copyBtn('scope', 'Scope', buildScopeOnlyCopy(propForCopy))}
            >
              {copiedBtn === 'scope' ? 'Copied' : 'Copy scope'}
            </button>
            <button
              type="button"
              className={`wf-action-btn${copiedBtn === 'pay' ? ' req-admin-proposal-copied' : ''}`}
              onClick={() => void copyBtn('pay', 'Payment placeholder', buildPaymentPlaceholderMessage())}
            >
              {copiedBtn === 'pay' ? 'Copied' : 'Copy payment placeholder'}
            </button>
          </div>

          <div className="req-admin-proposal-fields">
            <label className="req-admin-proposal-field">
              <span>Title</span>
              <input className="req-admin-proposal-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            </label>
            <label className="req-admin-proposal-field">
              <span>Scope summary</span>
              <textarea className="req-admin-proposal-textarea" rows={6} value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy} />
            </label>
            <label className="req-admin-proposal-field">
              <span>Included deliverables</span>
              <textarea className="req-admin-proposal-textarea" rows={4} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} disabled={busy} />
            </label>
            <label className="req-admin-proposal-field">
              <span>Timeline</span>
              <textarea className="req-admin-proposal-textarea" rows={2} value={timeline} onChange={(e) => setTimeline(e.target.value)} disabled={busy} />
            </label>
            <div className="req-admin-proposal-grid2">
              <label className="req-admin-proposal-field">
                <span>Revision limit</span>
                <input
                  className="req-admin-proposal-input"
                  type="number"
                  min={0}
                  value={revisionLimit}
                  onChange={(e) => setRevisionLimit(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="req-admin-proposal-field">
                <span>Proposed price (USD placeholder)</span>
                <input className="req-admin-proposal-input" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} />
              </label>
            </div>
            <div className="req-admin-proposal-kv">
              <span>Platform fee (placeholder)</span>
              <span>{fmtMoney(proposal?.platform_fee)}</span>
              <span>Creator payout (placeholder)</span>
              <span>{fmtMoney(proposal?.creator_payout)}</span>
            </div>
            <p className="req-admin-proposal-fee-hint">Saving recalculates fee/payout from the price field (10% placeholder).</p>
            <label className="req-admin-proposal-field">
              <span>Admin notes / risks</span>
              <textarea className="req-admin-proposal-textarea" rows={4} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} disabled={busy} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
