import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuyerRequestRow, ProjectProposalRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow } from '../lib/orders';
import {
  buyerConfirmProjectAgreement,
  creatorConfirmProjectAgreement,
  generateProjectAgreementForOrder,
  getAgreementViewState,
  regenerateProjectAgreement,
  requestProjectAgreementChanges,
  saveProjectAgreementFields,
} from '../lib/projectAgreement';
import { analyzeAgreementCompleteness, displayAgreementStatus } from '../lib/projectAgreementAI';
import {
  parseAgreementFieldsFromProposal,
  displayAgreementField,
  displayAgreementPrice,
  displayAgreementTimeline,
  type AgreementEditableFields,
} from '../lib/agreementFields';
import {
  buildBuyerSummaryCopy,
  buildChangeRequestCopy,
  buildCreatorScopeCopy,
  buildDeliveryRequirementsCopy,
  buildFullAgreementCopy,
} from '../lib/agreementCopyTexts';
import { copyTextToClipboard } from '../lib/workspaceCopy';
import './ProjectAgreementPanel.css';

export type AgreementPanelRole = 'buyer' | 'creator' | 'admin';

function statusPillLabel(phase: string, stored: string | null | undefined): string {
  if (phase === 'confirmed') return 'Confirmed';
  if (phase === 'changes_requested') return 'Changes requested';
  if (phase === 'buyer_confirmed') return 'Buyer confirmed';
  if (phase === 'creator_confirmed') return 'Creator confirmed';
  return displayAgreementStatus(stored);
}

function emptyFields(): AgreementEditableFields {
  return {
    project_title: '',
    scope_summary: '',
    included_deliverables: '',
    not_included: '',
    timeline: '',
    revision_limit: 1,
    proposed_price: null,
    buyer_responsibilities: '',
    creator_responsibilities: '',
    delivery_requirements: '',
  };
}

function SectionBlock({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`dpw-agreement-section${className ? ` ${className}` : ''}`}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function ReadText({ value, fallback }: { value: string; fallback: string }) {
  return <p>{displayAgreementField(value, fallback)}</p>;
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
  compact = false,
}: {
  role: AgreementPanelRole;
  order: OrderPipelineRow;
  buyerRequest: BuyerRequestRow | null;
  proposal: ProjectProposalRow | null;
  userProfile?: UserProfileRow | null;
  creatorProfileId: string | null;
  creatorDisplayName: string | null;
  buyerBusinessName: string;
  onProposalUpdated: (row: ProjectProposalRow | null) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<AgreementEditableFields>(emptyFields());

  const view = useMemo(() => getAgreementViewState(proposal), [proposal]);
  const parsed = useMemo(() => (proposal ? parseAgreementFieldsFromProposal(proposal) : emptyFields()), [proposal]);

  useEffect(() => {
    if (proposal) setEditFields(parseAgreementFieldsFromProposal(proposal));
  }, [proposal?.id, proposal?.updated_at]);

  const analysis = useMemo(() => {
    if (!proposal || !buyerRequest) return null;
    const draft = {
      project_title: parsed.project_title,
      buyer_goal: buyerRequest.main_goal ?? '',
      creator_role: '',
      scope_summary: parsed.scope_summary,
      included_deliverables: parsed.included_deliverables,
      not_included: parsed.not_included,
      timeline: parsed.timeline,
      revision_limit: parsed.revision_limit,
      proposed_price: parsed.proposed_price,
      platform_fee: Number(proposal.platform_fee) || null,
      creator_payout: Number(proposal.creator_payout) || null,
      delivery_requirements: parsed.delivery_requirements,
      buyer_responsibilities: parsed.buyer_responsibilities,
      creator_responsibilities: parsed.creator_responsibilities,
      next_step: proposal.ai_recommended_next_step ?? '',
      ai_agreement_summary: proposal.ai_agreement_summary ?? '',
      ai_missing_scope_items: proposal.ai_missing_scope_items ?? [],
      ai_risk_flags: proposal.ai_risk_flags ?? [],
      ai_recommended_next_step: proposal.ai_recommended_next_step ?? '',
      workflow_context_snapshot: proposal.workflow_context_snapshot,
    };
    return analyzeAgreementCompleteness({
      draft,
      buyerRequest,
      order,
      application: null,
      proposal,
    });
  }, [proposal, buyerRequest, order, parsed]);

  const flash = useCallback((msg: string, isErr = false) => {
    if (isErr) setErr(msg);
    else setToast(msg);
    window.setTimeout(() => {
      setToast(null);
      setErr(null);
    }, 4000);
  }, []);

  const isLocked = view.isLocked;
  const canEditAgreement =
    !isLocked && (role === 'admin' || view.phase === 'changes_requested' || view.phase === 'draft' || view.phase === 'buyer_confirmed' || view.phase === 'creator_confirmed');
  const canGenerate = role !== 'admin' && Boolean(userProfile);
  const showConfirmBuyer = role === 'buyer' && !isLocked && proposal && !view.buyerConfirmed;
  const showConfirmCreator = role === 'creator' && !isLocked && proposal && !view.creatorConfirmed;
  const changeNote = proposal?.buyer_feedback?.trim() ?? '';

  async function handleGenerate() {
    if (!buyerRequest || !userProfile) {
      flash('Buyer request details are not loaded yet.', true);
      return;
    }
    setBusy(true);
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
    setEditMode(false);
    flash('Agreement draft generated.');
  }

  async function handleRegenerate() {
    if (!buyerRequest || !userProfile) {
      flash('Buyer request details are not loaded yet.', true);
      return;
    }
    if (isLocked) {
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
    setEditMode(false);
    flash('Agreement draft regenerated.');
  }

  async function handleConfirm() {
    if (!proposal?.id) return;
    if (role === 'buyer' && !userProfile) return;
    if (role === 'creator' && !creatorProfileId) return;
    setBusy(true);
    const res =
      role === 'buyer'
        ? await buyerConfirmProjectAgreement({ proposalId: proposal.id, buyerProfile: userProfile! })
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
    setEditMode(false);
    flash(role === 'buyer' ? 'Buyer confirmation saved.' : 'Creator confirmation saved.');
  }

  async function handleRequestChanges() {
    if (!proposal?.id) return;
    if (!feedback.trim()) {
      flash('Describe what should change before submitting a change request.', true);
      return;
    }
    setBusy(true);
    const res = await requestProjectAgreementChanges({
      proposalId: proposal.id,
      role,
      feedback,
      buyerProfile: role === 'buyer' ? userProfile ?? undefined : undefined,
      creatorProfileId: role === 'creator' ? creatorProfileId ?? undefined : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Could not save change request.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    setFeedback('');
    setEditMode(true);
    flash('Change request saved — review and update the agreement draft.');
  }

  async function handleSaveEdit() {
    if (!proposal?.id) return;
    setBusy(true);
    const res = await saveProjectAgreementFields({
      proposalId: proposal.id,
      role,
      fields: editFields,
      buyerProfile: role === 'buyer' ? userProfile ?? undefined : undefined,
      creatorProfileId: role === 'creator' ? creatorProfileId ?? undefined : undefined,
      buyerRequest,
      order,
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? 'Could not save agreement.', true);
      return;
    }
    onProposalUpdated(res.proposal ?? null);
    setEditMode(false);
    flash('Agreement saved.');
  }

  async function handleCopy(key: string, label: string, text: string) {
    const ok = await copyTextToClipboard(text);
    setCopiedKey(ok ? key : null);
    flash(ok ? `${label} copied` : `${label} failed — try again`, !ok);
    window.setTimeout(() => setCopiedKey(null), 2000);
  }

  function setField<K extends keyof AgreementEditableFields>(key: K, value: AgreementEditableFields[K]) {
    setEditFields((prev) => ({ ...prev, [key]: value }));
  }

  const roleLabel = role === 'buyer' ? 'Buyer' : role === 'creator' ? 'Creator' : 'Admin';

  return (
    <section className={`dpw-card dpw-card--agreement${compact ? ' dpw-card--agreement-compact' : ''}`} id="project-agreement">
      <div className="dpw-card-head">
        <div>
          <h2 className="dpw-card-title">Project Agreement</h2>
          <p className="dpw-muted dpw-agreement-sub">
            Agreement between {buyerBusinessName} and {creatorDisplayName ?? 'assigned creator'}
          </p>
        </div>
        {role === 'admin' ?
          <span className="dpw-agreement-admin-badge">Admin oversight</span>
        : null}
      </div>

      {toast ? <div className="mb-form-alert mb-form-alert--muted">{toast}</div> : null}
      {err ? <div className="mb-form-alert mb-form-alert--error">{err}</div> : null}

      {!proposal ?
        (
          <div className="dpw-agreement-empty">
            <p>No agreement drafted yet.</p>
            <p className="dpw-muted">
              {role === 'admin'
                ? 'Buyer and creator generate the agreement on the project workspace.'
                : 'Generate an AI-drafted agreement from the buyer request and project assignment.'}
            </p>
            {canGenerate ?
              (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !buyerRequest} onClick={() => void handleGenerate()}>
                  {busy ? 'Working…' : 'Generate AI Agreement Draft'}
                </button>
              )
            : null}
          </div>
        )
      : (
          <>
            <div className="dpw-agreement-status-row">
              <span className={`dpw-agreement-pill dpw-agreement-pill--${view.phase}`}>
                {statusPillLabel(view.phase, proposal.agreement_status)}
              </span>
              {analysis ?
                <span className="dpw-agreement-readiness">
                  AI readiness: <strong>{analysis.readinessLabel}</strong> ({analysis.score}/100)
                </span>
              : null}
            </div>

            {view.phase === 'confirmed' ?
              <div className="dpw-agreement-locked-banner">Agreement confirmed — ready to build</div>
            : null}

            {changeNote ?
              (
                <div className="dpw-agreement-change-note">
                  <strong>Change request note</strong>
                  {changeNote}
                </div>
              )
            : null}

            <div className="dpw-agreement-confirm-grid">
              <div className={`dpw-agreement-party${view.buyerConfirmed ? ' is-done' : ' is-pending'}`}>
                <span className="dpw-agreement-party-label">Buyer confirmation</span>
                <span className="dpw-agreement-party-status">{view.buyerConfirmed ? 'Confirmed' : 'Pending'}</span>
              </div>
              <div className={`dpw-agreement-party${view.creatorConfirmed ? ' is-done' : ' is-pending'}`}>
                <span className="dpw-agreement-party-label">Creator confirmation</span>
                <span className="dpw-agreement-party-status">{view.creatorConfirmed ? 'Confirmed' : 'Pending'}</span>
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

            {view.phase === 'changes_requested' && role !== 'admin' ?
              (
                <p className="dpw-agreement-partial-hint dpw-agreement-partial-hint--warn">
                  Review requested agreement changes before confirming again.
                </p>
              )
            : null}

            {proposal.ai_agreement_summary ?
              <p className="dpw-agreement-ai-summary">{proposal.ai_agreement_summary}</p>
            : null}

            {(proposal.ai_missing_scope_items?.length ?? 0) > 0 ?
              (
                <div className="dpw-agreement-flags">
                  <strong>Missing information</strong>
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
              <p className="dpw-muted dpw-agreement-next-step">
                <strong>Recommended next step:</strong> {proposal.ai_recommended_next_step}
              </p>
            : null}

            {editMode && canEditAgreement ?
              (
                <div className="dpw-agreement-edit-form">
                  <p className="dpw-muted dpw-agreement-edit-intro">
                    Edit the agreement draft before both parties confirm. Saving resets confirmations to pending.
                  </p>
                  <label className="dpw-agreement-field">
                    <span>Project title</span>
                    <input value={editFields.project_title} onChange={(e) => setField('project_title', e.target.value)} />
                  </label>
                  <label className="dpw-agreement-field">
                    <span>Scope summary</span>
                    <textarea rows={4} value={editFields.scope_summary} onChange={(e) => setField('scope_summary', e.target.value)} />
                  </label>
                  <label className="dpw-agreement-field">
                    <span>Included deliverables</span>
                    <textarea rows={3} value={editFields.included_deliverables} onChange={(e) => setField('included_deliverables', e.target.value)} />
                  </label>
                  <label className="dpw-agreement-field">
                    <span>Not included</span>
                    <textarea rows={3} value={editFields.not_included} onChange={(e) => setField('not_included', e.target.value)} />
                  </label>
                  <div className="dpw-agreement-edit-row">
                    <label className="dpw-agreement-field">
                      <span>Timeline</span>
                      <input value={editFields.timeline} onChange={(e) => setField('timeline', e.target.value)} />
                    </label>
                    <label className="dpw-agreement-field">
                      <span>Revision limit</span>
                      <input
                        type="number"
                        min={0}
                        value={editFields.revision_limit}
                        onChange={(e) => setField('revision_limit', Math.max(0, Number(e.target.value) || 0))}
                      />
                    </label>
                    <label className="dpw-agreement-field">
                      <span>Price (indicative)</span>
                      <input
                        type="number"
                        min={0}
                        value={editFields.proposed_price ?? ''}
                        onChange={(e) => setField('proposed_price', e.target.value ? Number(e.target.value) : null)}
                        placeholder="Price not confirmed yet"
                      />
                    </label>
                  </div>
                  <label className="dpw-agreement-field">
                    <span>Buyer responsibilities</span>
                    <textarea rows={3} value={editFields.buyer_responsibilities} onChange={(e) => setField('buyer_responsibilities', e.target.value)} />
                  </label>
                  <label className="dpw-agreement-field">
                    <span>Creator responsibilities</span>
                    <textarea rows={3} value={editFields.creator_responsibilities} onChange={(e) => setField('creator_responsibilities', e.target.value)} />
                  </label>
                  <label className="dpw-agreement-field">
                    <span>Delivery requirements</span>
                    <textarea rows={3} value={editFields.delivery_requirements} onChange={(e) => setField('delivery_requirements', e.target.value)} />
                  </label>
                  <div className="dpw-agreement-edit-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void handleSaveEdit()}>
                      {busy ? 'Saving…' : 'Save Agreement'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditMode(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )
            : (
                <>
                  <SectionBlock title="Project title">
                    <ReadText value={parsed.project_title} fallback="Project Agreement" />
                  </SectionBlock>

                  <div className="dpw-agreement-sections">
                    <SectionBlock title="Scope summary — what is being built?">
                      <ReadText value={parsed.scope_summary} fallback="Scope not confirmed yet." />
                    </SectionBlock>
                    <SectionBlock title="Included deliverables">
                      <ReadText value={parsed.included_deliverables} fallback="Deliverables not listed yet." />
                    </SectionBlock>
                    <SectionBlock title="Not included">
                      <ReadText
                        value={parsed.not_included}
                        fallback="Standard exclusions apply — hosting, unlimited revisions, and out-of-scope features unless added in Messages."
                      />
                    </SectionBlock>
                  </div>

                  <div className="dpw-agreement-meta-row">
                    <div className="dpw-agreement-meta-item">
                      <span>Timeline</span>
                      <strong>{displayAgreementTimeline(parsed.timeline)}</strong>
                    </div>
                    <div className="dpw-agreement-meta-item">
                      <span>Revision limit</span>
                      <strong>{typeof parsed.revision_limit === 'number' ? parsed.revision_limit : 'Not set'}</strong>
                    </div>
                    <div className="dpw-agreement-meta-item">
                      <span>Price</span>
                      <strong>{displayAgreementPrice(parsed.proposed_price)}</strong>
                    </div>
                  </div>

                  <div className="dpw-agreement-sections">
                    <SectionBlock title="Buyer responsibilities">
                      <ReadText value={parsed.buyer_responsibilities} fallback="Provide assets and feedback in Messages." />
                    </SectionBlock>
                    <SectionBlock title="Creator responsibilities">
                      <ReadText value={parsed.creator_responsibilities} fallback="Deliver scope and submit preview/delivery URLs." />
                    </SectionBlock>
                    <SectionBlock title="Delivery requirements">
                      <ReadText value={parsed.delivery_requirements} fallback="Preview URL and final delivery link required." />
                    </SectionBlock>
                  </div>
                </>
              )}

            <p className="dpw-agreement-disclaimer">
              {role === 'admin'
                ? 'Admin oversight only — buyer and creator confirm scope on the project workspace. Payment is not active yet.'
                : role === 'buyer'
                  ? 'This confirms project scope for MVP testing. Payment comes in a later phase.'
                  : 'Confirm only if scope, timeline, price placeholder, and delivery requirements are clear.'}
            </p>

            <div className="dpw-agreement-actions">
              <div className="dpw-agreement-actions-primary">
                {showConfirmBuyer ?
                  (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || editMode} onClick={() => void handleConfirm()}>
                      {busy ? 'Saving…' : 'Confirm Agreement'}
                    </button>
                  )
                : null}
                {showConfirmCreator ?
                  (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || editMode} onClick={() => void handleConfirm()}>
                      {busy ? 'Saving…' : 'Confirm Agreement'}
                    </button>
                  )
                : null}

                {canEditAgreement && !editMode ?
                  (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditMode(true)}>
                      {role === 'admin' ? 'Edit Agreement (override)' : 'Edit Agreement'}
                    </button>
                  )
                : null}

                {role !== 'admin' && !isLocked ?
                  (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || editMode} onClick={() => void handleRegenerate()}>
                        Regenerate Draft
                      </button>
                    </>
                  )
                : null}

                {(role !== 'admin' || isLocked) && !editMode ?
                  (
                    <label className="dpw-agreement-changes">
                      <span className="dpw-label">What should change?</span>
                      <textarea
                        className="dpw-textarea"
                        rows={3}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Describe scope, timeline, price, or delivery changes needed before confirmation."
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm dpw-agreement-changes-btn"
                        disabled={busy}
                        onClick={() => void handleRequestChanges()}
                      >
                        Request Changes
                      </button>
                    </label>
                  )
                : null}

                {isLocked && role !== 'admin' && !editMode ?
                  <p className="dpw-muted">Agreement is locked. Use Request Changes to reopen discussion.</p>
                : null}
              </div>

              <div className="dpw-agreement-actions-copy">
                <span className="dpw-copy-group-label">Copy</span>
                <div className="dpw-copy-row">
                  <button
                    type="button"
                    className={`dpw-copy-btn${copiedKey === 'full' ? ' dpw-copy-btn--ok' : ''}`}
                    onClick={() =>
                      void handleCopy('full', 'Full agreement', buildFullAgreementCopy(proposal, buyerRequest, creatorDisplayName))}
                  >
                    Copy Full Agreement
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
                  {changeNote ?
                    (
                      <button
                        type="button"
                        className={`dpw-copy-btn${copiedKey === 'changes' ? ' dpw-copy-btn--ok' : ''}`}
                        onClick={() =>
                          void handleCopy('changes', 'Change request', buildChangeRequestCopy(proposal, roleLabel))}
                      >
                        Copy Change Request
                      </button>
                    )
                  : null}
                </div>
              </div>
            </div>
          </>
        )}
    </section>
  );
}
