import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { BuyerRequestRow } from '../../types/database';
import {
  applyToBuyerRequest,
  estimateRequestComplexity,
  hasCreatorAlreadyApplied,
  isOriginalWorkflowCreatorForRequest,
  isWorkflowCustomizationBuyerRequest,
} from '../../lib/marketplace';
import { getQuoteReadiness, getPriorityScore } from '../../lib/buyerAI';
import {
  creatorEligibleForApplying,
  isBuyerRequestOpenForApplications,
} from '../../lib/marketplaceEligibility';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

interface Props {
  requests: BuyerRequestRow[];
  creatorProfileId: string | null | undefined;
  creatorUserProfileId: string | null;
  eligibility: ReturnType<typeof creatorEligibleForApplying>;
  /** Precomputed from single getCreatorRequestApplications call */
  initialAppliedRequestIds?: string[];
}

export default function CreatorBuyerRequestsBrowse({
  requests,
  creatorProfileId,
  creatorUserProfileId,
  eligibility,
  initialAppliedRequestIds,
}: Props) {
  const eligible = eligibility.ok && !!creatorProfileId;

  const appliedSeedKey = (initialAppliedRequestIds ?? []).join('|');

  const [appliedIds, setAppliedIds] = useState<Set<string>>(
    () => new Set(initialAppliedRequestIds ?? []),
  );

  useEffect(() => {
    setAppliedIds(new Set(initialAppliedRequestIds ?? []));
  }, [appliedSeedKey]);

  const [applyFor, setApplyFor] = useState<string | null>(null);
  const [extraApplied, setExtraApplied] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [applyToast, setApplyToast] = useState<string | null>(null);

  const creatorPid = creatorProfileId ?? '';

  const sortedRequests = useMemo(() => {
    const list = [...requests];
    list.sort((a, b) => {
      const ao = creatorPid && isOriginalWorkflowCreatorForRequest(a, creatorPid) ? 0 : 1;
      const bo = creatorPid && isOriginalWorkflowCreatorForRequest(b, creatorPid) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const tb = Date.parse(safe(b.created_at));
      const ta = Date.parse(safe(a.created_at));
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    return list;
  }, [requests, creatorPid]);

  if (!eligible)
    return (
      <section className="mb-browse-creator-msg dash-empty">
        <p>{eligibility.message}</p>
        <p className="subtle buyer-muted-hint mt-sm">Use the Creator Dashboard → Profile tab to resolve approval.</p>
      </section>
    );

  const pid = creatorProfileId as string;

  if (!requests.length)
    return (
      <section className="mb-browse-empty">
        <p>No open buyer requests are accepting voluntary applications yet.</p>
        <p className="subtle buyer-muted-hint">Check again after buyers submit scopes from the Request form.</p>
      </section>
    );

  return (
    <>
      {applyToast ? (
        <div className="mb-form-alert mb-form-alert--muted mb-applied-toast" role="status">
          {applyToast}
        </div>
      ) : null}
      <div className="mb-browse-grid">
        {sortedRequests.map((r) => {
          const acceptsApps = isBuyerRequestOpenForApplications(r);
          const applied = appliedIds.has(r.id) || extraApplied[r.id];
          const isYourWorkflow = isOriginalWorkflowCreatorForRequest(r, pid);
          const isWfCustom = isWorkflowCustomizationBuyerRequest(r);
          const wfTitle =
            safe(r.source_workflow_title).trim()
            || (isWfCustom ? 'Published workflow (title pending)' : '');
          const custPreview = safe(r.customization_notes).trim();
          const data = {
            business_name: r.business_name ?? '',
            industry: r.industry ?? '',
            build_type: r.build_type ?? '',
            main_goal: r.main_goal ?? '',
            budget: r.budget ?? null,
            deadline: r.deadline ?? null,
            website_social: r.website_social ?? null,
            source_type: isWfCustom ? 'workflow' : 'custom_request',
            source_workflow_title: r.source_workflow_title ?? null,
            customization_notes: r.customization_notes ?? null,
          };
          const readiness = getQuoteReadiness(data);
          const priority = getPriorityScore(data);
          const cx = estimateRequestComplexity(r);
          const appCnt =
            typeof r.applications_count === 'number' && Number.isFinite(r.applications_count) ?
              r.applications_count
            : 0;
          const showApply = applyFor === r.id;
          const legacySt = safe(r.status ?? '');

          const canApplyUi = acceptsApps && !applied && eligible;

          return (
            <article key={r.id} id={`mb-req-${r.id}`} className="mb-card mb-card--request">
              {isYourWorkflow ?
                (
                  <div className="mb-first-right-banner" role="status">
                    <span className="mb-first-right-pill">Your workflow was requested</span>
                    <span className="mb-first-right-sub subtle">
                      First opportunity to apply — buyers may still select any applicant.
                    </span>
                  </div>
                )
              : isWfCustom ?
                <div className="mb-wf-custom-banner subtle">Workflow customization request</div>
              : null}
              <div className="mb-card-header">
                <h3 className="mb-card-title">
                  {(r.business_name || r.industry || 'Business').slice(0, 80)}
                </h3>
                <span className="mb-card-badge">{safe(r.build_type, 'MicroBuild')}</span>
              </div>
              <p className="mb-card-meta muted-sm">
                {safe(r.industry, 'Industry not stated')}
              </p>
              {wfTitle ?
                (
                  <p className="mb-card-goal">
                    <span className="mb-card-strong">Source workflow: </span>
                    {wfTitle}
                  </p>
                )
              : null}
              {custPreview ?
                (
                  <p className="mb-card-goal subtle">
                    <span className="mb-card-strong">Customization preview: </span>
                    {custPreview.slice(0, 200)}
                    {custPreview.length > 200 ? '…' : ''}
                  </p>
                )
              : null}
              <p className="mb-card-goal">
                <span className="mb-card-strong">Goal: </span>
                {safe(r.main_goal, '—')}
              </p>
              <p className="mb-card-goal">
                <span className="mb-card-strong">Challenge: </span>
                {safe(r.current_problem, '—')}
              </p>
              <div className="mb-card-row mb-card-grid-2">
                <span className="mb-card-row-label">Budget</span>
                <span className="mb-card-row-val">{r.budget?.trim() || '—'}</span>
                <span className="mb-card-row-label">Deadline</span>
                <span className="mb-card-row-val">{r.deadline?.trim() || '—'}</span>
                <span className="mb-card-row-label">Quote readiness</span>
                <span className="mb-card-row-val" style={{ color: readiness.color }}>
                  {readiness.label}
                </span>
                <span className="mb-card-row-label">Complexity</span>
                <span className="mb-card-row-val">{cx}</span>
                <span className="mb-card-row-label">Priority</span>
                <span className="mb-card-row-val" style={{ color: priority.color }}>
                  {priority.label}
                </span>
                <span className="mb-card-row-label">Applications</span>
                <span className="mb-card-row-val">{appCnt}</span>
                <span className="mb-card-row-label">Request status</span>
                <span className="mb-card-row-val">
                  {safe(r.application_status ?? legacySt ?? 'open', 'open')}
                </span>
              </div>

              {applied ?
                <div className="mb-applied-pill">✓ Applied</div>
              : !acceptsApps ?
                <div className="mb-applied-pill mb-applied-pill--readonly">
                  Applications closed for this request
                </div>
              : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm mb-apply-open"
                  onClick={() => {
                    setApplyFor(showApply ? null : r.id);
                    setFormErr(null);
                  }}
                  disabled={!canApplyUi}
                >
                  {showApply ?
                    'Close application form'
                  : isYourWorkflow ?
                    'Apply to Build This Workflow Request'
                  : 'Apply to Build'}
                </button>
              )}

              {showApply && canApplyUi && !applied && (
                <CreatorApplyMiniForm
                  key={`${r.id}-${isYourWorkflow ? 'orig' : 'std'}`}
                  busy={busy}
                  error={formErr}
                  initialFitReason={
                    isYourWorkflow ? 'Original creator of the requested workflow' : ''
                  }
                  fitReasonPlaceholder={
                    isYourWorkflow ?
                      'Original creator of the requested workflow (editable)'
                    : 'Why this aligns with your past work'
                  }
                  onCancel={() => {
                    setApplyFor(null);
                    setFormErr(null);
                  }}
                  onSubmit={async (payload) => {
                    setBusy(true);
                    setFormErr(null);

                    const stillApplied = await hasCreatorAlreadyApplied(r.id, pid);
                    if (stillApplied) {
                      setExtraApplied((m) => ({ ...m, [r.id]: true }));
                      setAppliedIds((prev) => new Set(prev).add(r.id));
                      setBusy(false);
                      setApplyFor(null);
                      return;
                    }

                    const parsed =
                      payload.proposed_price.trim() === '' ?
                        null
                      : Number.parseFloat(payload.proposed_price.trim());

                    const defaultFit =
                      isYourWorkflow ? 'Original creator of the requested workflow' : '';
                    const res = await applyToBuyerRequest({
                      buyerRequestId: r.id,
                      creatorProfileId: pid,
                      creatorUserProfileId,
                      proposal_message: payload.proposal_message,
                      fit_reason: payload.fit_reason.trim() || defaultFit,
                      estimated_timeline: payload.estimated_timeline,
                      proposed_price: parsed != null && isFinite(parsed) ? parsed : null,
                      creator_questions: payload.creator_questions,
                      relevant_workflow_url: payload.relevant_workflow_url || null,
                      relevant_workflow_id: isYourWorkflow ? (r.source_workflow_id ?? null) : null,
                    });

                    setBusy(false);
                    if (!res.ok) setFormErr(res.error ?? 'Failed to apply.');
                    else {
                      setExtraApplied((m) => ({ ...m, [r.id]: true }));
                      setAppliedIds((prev) => new Set(prev).add(r.id));
                      setApplyFor(null);
                      setApplyToast('Application submitted — track it under Dashboard → Applications.');
                      window.setTimeout(() => setApplyToast(null), 5000);
                    }
                  }}
                />
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function CreatorApplyMiniForm({
  busy,
  error,
  initialFitReason,
  fitReasonPlaceholder,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  /** Pre-filled when original workflow creator applies */
  initialFitReason?: string;
  fitReasonPlaceholder?: string;
  onSubmit: (p: {
    proposal_message: string;
    fit_reason: string;
    estimated_timeline: string;
    proposed_price: string;
    creator_questions: string;
    relevant_workflow_url: string;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [proposal_message, setProposal] = useState('');
  const [fit_reason, setFit] = useState(initialFitReason ?? '');
  const [estimated_timeline, setTl] = useState('');
  const [proposed_price, setPrice] = useState('');
  const [creator_questions, setQ] = useState('');
  const [relevant_workflow_url, setUrl] = useState('');

  useEffect(() => {
    setFit(initialFitReason ?? '');
  }, [initialFitReason]);

  async function handle(ev: FormEvent) {
    ev.preventDefault();
    await onSubmit({
      proposal_message,
      fit_reason,
      estimated_timeline,
      proposed_price,
      creator_questions,
      relevant_workflow_url,
    });
  }

  return (
    <form className="mb-apply-form" onSubmit={(e) => void handle(e)}>
      {error ?
        (
          <div className="mb-form-alert mb-form-alert--error" role="alert">
            {error}
          </div>
        )
      : null}
      <label className="mb-form-label">
        Proposal message*
        <textarea
          rows={4}
          className="mb-form-input mb-form-textarea"
          value={proposal_message}
          onChange={(e) => setProposal(e.target.value)}
          required
          placeholder="How you will tackle this MicroBuild"
        />
      </label>
      <label className="mb-form-label">
        Fit reason
        <textarea
          rows={2}
          className="mb-form-input mb-form-textarea"
          value={fit_reason}
          onChange={(e) => setFit(e.target.value)}
          placeholder={fitReasonPlaceholder ?? 'Why this aligns with your past work'}
        />
      </label>
      <label className="mb-form-label">
        Estimated timeline
        <input
          className="mb-form-input"
          value={estimated_timeline}
          onChange={(e) => setTl(e.target.value)}
          placeholder="Example: 10 business days"
        />
      </label>
      <label className="mb-form-label">
        Proposed price (optional USD)
        <input
          className="mb-form-input"
          value={proposed_price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Numeric quote — invoicing deferred"
          inputMode="decimal"
        />
      </label>
      <label className="mb-form-label">
        Workflow or portfolio link
        <input
          className="mb-form-input"
          value={relevant_workflow_url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Portfolio or reusable workflow demo"
        />
      </label>
      <label className="mb-form-label">
        Questions for the buyer (optional)
        <textarea
          rows={2}
          className="mb-form-input mb-form-textarea"
          value={creator_questions}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="mb-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit application'}
        </button>
      </div>
      <p className="subtle buyer-muted-hint mb-form-notes">
        Projects finalize after buyer selection — you are volunteering interest only.
      </p>
    </form>
  );
}
