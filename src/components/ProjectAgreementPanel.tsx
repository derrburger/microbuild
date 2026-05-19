import { useCallback, useMemo, useState } from 'react';
import type { BuyerRequestRow, ProjectProposalRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow } from '../lib/orders';
import {
  buyerConfirmProjectAgreement,
  creatorConfirmProjectAgreement,
  generateProjectAgreementForOrder,
  getAgreementViewState,
  regenerateProjectAgreement,
  requestProjectAgreementChanges,
} from '../lib/projectAgreement';
import {
  analyzeAgreementCompleteness,
  displayAgreementStatus,
  displayCreatorApproval,
} from '../lib/projectAgreementAI';
import { displayBuyerApproval } from '../lib/proposals';
import {
  buildBuyerSummaryCopy,
  buildCreatorScopeCopy,
  buildDeliveryRequirementsCopy,
  buildFullAgreementCopy,
} from '../lib/agreementCopyTexts';
import { copyTextToClipboard } from '../lib/workspaceCopy';
import './ProjectAgreementPanel.css';

function safe(v: unknown, fb = '—'): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v == null) return fb;
  return String(v);
}

function money(n: number | string | null | undefined): string {
  if (n == null || n === '') return 'To be agreed in Messages';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export default function ProjectAgreementPanel({
  role,
  order,
  buyerRequest,
  proposal,
  userProfile,
  creatorProfileId,
  creatorDisplayName,
  buyerBusinessName,
  onProposalUpdated,
}: {
  role: 'buyer' | 'creator';
  order: OrderPipelineRow;
  buyerRequest: BuyerRequestRow | null;
  proposal: ProjectProposalRow | null;
  userProfile: UserProfileRow;
  creatorProfileId: string | null;
  creatorDisplayName: string | null;
  buyerBusinessName: string;
  onProposalUpdated: (row: ProjectProposalRow | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const view = useMemo(() => getAgreementViewState(proposal), [proposal]);

  const analysis = useMemo(() => {
    if (!proposal || !buyerRequest) return null;
    const notIncluded = proposal.scope_summary?.includes('── Not included ──')
      ? proposal.scope_summary.split('── Not included ──')[1]?.trim() ?? ''
      : '';
    return analyzeAgreementCompleteness({
      draft: {
        project_title: proposal.proposal_title,
        buyer_goal: buyerRequest.main_goal ?? '',
        creator_role: '',
        scope_summary: proposal.scope_summary,
        included_deliverables: proposal.included_deliverables,
        not_included: notIncluded,
        timeline: proposal.timeline,
        revision_limit: proposal.revision_limit,
        proposed_price: Number(proposal.proposed_price) || null,
        platform_fee: Number(proposal.platform_fee) || null,
        creator_payout: Number(proposal.creator_payout) || null,
        delivery_requirements: '',
        buyer_responsibilities: '',
        creator_responsibilities: '',
        next_step: proposal.ai_recommended_next_step ?? '',
        ai_agreement_summary: proposal.ai_agreement_summary ?? '',
        ai_missing_scope_items: proposal.ai_missing_scope_items ?? [],
        ai_risk_flags: proposal.ai_risk_flags ?? [],
        ai_recommended_next_step: proposal.ai_recommended_next_step ?? '',
        workflow_context_snapshot: proposal.workflow_context_snapshot,
      },
      buyerRequest,
      order,
      application: null,
    });
  }, [proposal, buyerRequest, order]);

  const flash = useCallback((msg: string, isErr = false) => {
    if (isErr) setErr(msg);
    else setToast(msg);
    window.setTimeout(() => {
      setToast(null);
      setErr(null);
    }, 4000);
  }, []);

  async function handleGenerate() {
    if (!buyerRequest) {
      flash('Buyer request details are not loaded yet.', true);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await generateProjectAgreementForOrder({
      order,
      buyerRequest,
      buyerUserProfileId: userProfile.id,
      creatorDisplayName,
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Could not generate agreement.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    flash('AI agreement draft generated.');
  }

  async function handleRegenerate() {
    if (!buyerRequest) {
      flash('Buyer request details are not loaded yet.', true);
      return;
    }
    if (view.isLocked) {
      flash('Agreement is locked. Request changes before regenerating.', true);
      return;
    }
    setBusy(true);
    const res = await regenerateProjectAgreement({
      order,
      buyerRequest,
      buyerUserProfileId: userProfile.id,
      creatorDisplayName,
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Could not regenerate.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    flash('Agreement draft regenerated.');
  }

  async function handleConfirm() {
    if (!proposal?.id) return;
    setBusy(true);
    const res =
      role === 'buyer'
        ? await buyerConfirmProjectAgreement({ proposalId: proposal.id, buyerProfile: userProfile })
        : await creatorConfirmProjectAgreement({
            proposalId: proposal.id,
            creatorProfileId: creatorProfileId ?? '',
          });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Confirmation failed.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    flash(role === 'buyer' ? 'Buyer confirmed.' : 'Creator confirmed.');
  }

  async function handleRequestChanges() {
    if (!proposal?.id) return;
    setBusy(true);
    const res = await requestProjectAgreementChanges({
      proposalId: proposal.id,
      role,
      feedback,
      buyerProfile: role === 'buyer' ? userProfile : undefined,
      creatorProfileId: role === 'creator' ? creatorProfileId ?? undefined : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Could not save change request.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    setFeedback('');
    flash('Change request recorded — continue in Messages.');
  }

  async function handleCopy(key: string, label: string, text: string) {
    const ok = await copyTextToClipboard(text);
    setCopiedKey(ok ? key : null);
    flash(ok ? `${label} copied` : `${label} failed — try again`, !ok);
    window.setTimeout(() => setCopiedKey(null), 2000);
  }

  const canEdit = view.phase === 'changes_requested' || (view.phase !== 'confirmed' && !view.isLocked);
  const showConfirmBuyer = role === 'buyer' && canEdit && proposal && !view.buyerConfirmed;
  const showConfirmCreator = role === 'creator' && canEdit && proposal && !view.creatorConfirmed;

  return (
    <section className="dpw-card dpw-card--agreement" id="project-agreement">
      <div className="dpw-card-head">
        <div>
          <h2 className="dpw-card-title">Project Agreement</h2>
          <p className="dpw-muted dpw-agreement-sub">Agreement between buyer and creator · AI-drafted · rules-based check</p>
        </div>
        {proposal ?
          (
            <div className="dpw-copy-row">
              <button
                type="button"
                className={`dpw-copy-btn${copiedKey === 'full' ? ' dpw-copy-btn--ok' : ''}`}
                onClick={() =>
                  void handleCopy(
                    'full',
                    'Agreement',
                    buildFullAgreementCopy(proposal, buyerRequest, creatorDisplayName),
                  )}
              >
                Copy Agreement
              </button>
              <button
                type="button"
                className={`dpw-copy-btn${copiedKey === 'buyer' ? ' dpw-copy-btn--ok' : ''}`}
                onClick={() => void handleCopy('buyer', 'Buyer summary', buildBuyerSummaryCopy(proposal))}
              >
                Copy Buyer Summary
              </button>
              <button
                type="button"
                className={`dpw-copy-btn${copiedKey === 'creator' ? ' dpw-copy-btn--ok' : ''}`}
                onClick={() => void handleCopy('creator', 'Creator scope', buildCreatorScopeCopy(proposal))}
              >
                Copy Creator Scope
              </button>
              <button
                type="button"
                className={`dpw-copy-btn${copiedKey === 'delivery' ? ' dpw-copy-btn--ok' : ''}`}
                onClick={() =>
                  void handleCopy('delivery', 'Delivery requirements', buildDeliveryRequirementsCopy(proposal))}
              >
                Copy Delivery Requirements
              </button>
            </div>
          )
        : null}
      </div>

      {toast ? <div className="mb-form-alert mb-form-alert--muted">{toast}</div> : null}
      {err ? <div className="mb-form-alert mb-form-alert--error">{err}</div> : null}

      {!proposal ?
        (
          <div className="dpw-agreement-empty">
            <p>No agreement drafted yet.</p>
            <p className="dpw-muted">Generate an AI-drafted agreement from the buyer request and your project assignment.</p>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !buyerRequest} onClick={() => void handleGenerate()}>
              {busy ? 'Working…' : 'Generate AI Agreement Draft'}
            </button>
          </div>
        )
      : (
          <>
            <div className="dpw-agreement-status-row">
              <span className={`dpw-agreement-pill dpw-agreement-pill--${view.phase}`}>
                {view.phase === 'confirmed' ? 'Agreement confirmed · Ready to build' : displayAgreementStatus(proposal.agreement_status)}
              </span>
              {analysis ?
                <span className="dpw-agreement-readiness">
                  AI readiness: <strong>{analysis.readinessLabel}</strong> ({analysis.score}/100)
                </span>
              : null}
            </div>

            <div className="dpw-agreement-confirm-grid">
              <div className={`dpw-agreement-party${view.buyerConfirmed ? ' is-done' : ''}`}>
                <span className="dpw-agreement-party-label">Buyer</span>
                <span>{view.buyerConfirmed ? 'Buyer confirmed' : displayBuyerApproval(proposal.buyer_approval_status)}</span>
              </div>
              <div className={`dpw-agreement-party${view.creatorConfirmed ? ' is-done' : ''}`}>
                <span className="dpw-agreement-party-label">Creator</span>
                <span>{view.creatorConfirmed ? 'Creator confirmed' : displayCreatorApproval(proposal.creator_approval_status)}</span>
              </div>
            </div>

            {view.phase === 'buyer_confirmed' || view.phase === 'creator_confirmed' ?
              (
                <p className="dpw-agreement-partial-hint">
                  {view.phase === 'buyer_confirmed'
                    ? 'Waiting for creator confirmation.'
                    : 'Waiting for buyer confirmation.'}
                </p>
              )
            : null}

            {proposal.ai_agreement_summary ?
              <p className="dpw-agreement-ai-summary">{proposal.ai_agreement_summary}</p>
            : null}

            {(proposal.ai_missing_scope_items?.length ?? 0) > 0 ?
              (
                <div className="dpw-agreement-flags">
                  <strong>Missing items</strong>
                  <ul>
                    {proposal.ai_missing_scope_items!.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )
            : null}

            {(proposal.ai_risk_flags?.length ?? 0) > 0 ?
              (
                <div className="dpw-agreement-flags dpw-agreement-flags--risk">
                  <strong>Risk flags</strong>
                  <ul>
                    {proposal.ai_risk_flags!.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )
            : null}

            {proposal.ai_recommended_next_step ?
              <p className="dpw-muted">
                <strong>Recommended next step:</strong> {proposal.ai_recommended_next_step}
              </p>
            : null}

            <dl className="dpw-meta-grid dpw-agreement-details">
              <dt>Project title</dt>
              <dd>{safe(proposal.proposal_title)}</dd>
              <dt>Buyer</dt>
              <dd>{buyerBusinessName}</dd>
              <dt>Creator</dt>
              <dd>{creatorDisplayName ?? 'Assigned creator'}</dd>
              <dt>Scope summary</dt>
              <dd className="dpw-proposal-scope">
                {safe(proposal.scope_summary, '—').split('── Not included ──')[0]?.trim() || '—'}
              </dd>
              <dt>Included deliverables</dt>
              <dd className="dpw-proposal-scope">{safe(proposal.included_deliverables)}</dd>
              <dt>Not included</dt>
              <dd className="dpw-proposal-scope">
                {proposal.scope_summary?.includes('── Not included ──')
                  ? proposal.scope_summary.split('── Not included ──')[1]?.trim() || '—'
                  : '—'}
              </dd>
              <dt>Timeline</dt>
              <dd>{safe(proposal.timeline)}</dd>
              <dt>Revision limit</dt>
              <dd>{typeof proposal.revision_limit === 'number' ? proposal.revision_limit : '—'}</dd>
              <dt>Indicative price (placeholder)</dt>
              <dd>{money(proposal.proposed_price)}</dd>
            </dl>

            <p className="dpw-agreement-disclaimer">
              {role === 'buyer'
                ? 'This confirms the project scope for MVP testing. Payment is not active yet.'
                : 'Confirm only if the scope, timeline, and delivery requirements are clear.'}
            </p>

            <div className="dpw-agreement-actions">
              {showConfirmBuyer ?
                (
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void handleConfirm()}>
                    {busy ? 'Saving…' : 'Buyer Confirm Agreement'}
                  </button>
                )
              : null}
              {showConfirmCreator ?
                (
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void handleConfirm()}>
                    {busy ? 'Saving…' : 'Creator Confirm Agreement'}
                  </button>
                )
              : null}
              {canEdit ?
                (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void handleRegenerate()}
                    >
                      Regenerate Draft
                    </button>
                    <label className="dpw-agreement-changes">
                      <span className="dpw-label">Request changes (optional note)</span>
                      <textarea
                        className="dpw-textarea"
                        rows={2}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="What should change in scope, timeline, or delivery?"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void handleRequestChanges()}
                    >
                      Request Changes
                    </button>
                  </>
                )
              : view.isLocked ?
                (
                  <p className="dpw-muted">Agreement is locked. Use Request Changes to reopen discussion.</p>
                )
              : null}
              {view.isLocked && proposal ?
                (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void handleRequestChanges()}
                  >
                    Request Changes
                  </button>
                )
              : null}
            </div>
          </>
        )}
    </section>
  );
}
