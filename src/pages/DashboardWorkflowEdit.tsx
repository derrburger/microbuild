import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchBuyerRequestsForWorkflow,
  fetchPublishedWorkflowForCreator,
  publishCreatorWorkflowAfterAIApproval,
  resolveCreatorProfileForMarketplace,
  runStoredWorkflowAIReviewOnly,
  submitStoredWorkflowForAIReview,
  updateCreatorWorkflowContent,
  type WorkflowBuyerRequestRow,
} from '../lib/marketplace';
import { creatorEligibleForWorkflowAuthoring } from '../lib/marketplaceEligibility';
import {
  computeWorkflowFormCompletion,
  formatWorkflowStatusLabel,
  formatWorkflowVisibilityLabel,
  getWorkflowCardActions,
} from '../lib/workflowLabels';
import WorkflowAIPanel from '../components/creator/WorkflowAIPanel';
import WorkflowBuyerPreview from '../components/creator/WorkflowBuyerPreview';
import DashboardNav from '../components/DashboardNav';
import type { CreatorProfileRow, PublishedWorkflowRow, UserProfileRow } from '../types/database';
import './Dashboard.css';
import './DashboardWorkflows.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function fmtRequestDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function DashboardWorkflowEdit() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(true);
  const [row, setRow] = useState<PublishedWorkflowRow | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [creatorDisplayName, setCreatorDisplayName] = useState('You');
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [buyerRequests, setBuyerRequests] = useState<WorkflowBuyerRequestRow[]>([]);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [includedFeatures, setIncludedFeatures] = useState('');
  const [setupRequirements, setSetupRequirements] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [estimatedTurnaround, setEstimatedTurnaround] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [flashErr, setFlashErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || authLoading) return;
    if (!id) {
      navigate('/dashboard/workflows', { replace: true });
      return;
    }
    const workflowId = id;
    let cancelled = false;

    async function load() {
      setBusy(true);
      setFlashErr(null);

      const authUid = user!.id;
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
      if (!cancelled) {
        setCreatorProfile(cp);
        setCreatorDisplayName(safeStr(cp?.display_name) || safeStr(cp?.full_name) || 'You');
      }

      const gate = creatorEligibleForWorkflowAuthoring(cp);
      if (!gate.ok) {
        if (!cancelled) {
          setGateMsg(gate.message);
          setBusy(false);
        }
        return;
      }

      if (!cp?.id) {
        if (!cancelled) navigate('/dashboard/workflows', { replace: true });
        return;
      }

      const wf = await fetchPublishedWorkflowForCreator(workflowId, cp.id);
      if (!wf) {
        if (!cancelled) navigate('/dashboard/workflows', { replace: true });
        return;
      }

      const reqs = await fetchBuyerRequestsForWorkflow(workflowId);

      if (!cancelled) {
        setRow(wf);
        setTitle(safeStr(wf.title));
        setCategory(safeStr(wf.category));
        setTargetIndustry(safeStr(wf.target_industry));
        setDescription(safeStr(wf.description));
        setIncludedFeatures(safeStr(wf.included_features));
        setSetupRequirements(safeStr(wf.setup_requirements));
        setStartingPrice(
          wf.starting_price != null && wf.starting_price !== '' ? String(wf.starting_price) : '',
        );
        setEstimatedTurnaround(safeStr(wf.estimated_turnaround));
        setPreviewUrl(safeStr(wf.preview_url));
        setCoverImageUrl(safeStr(wf.cover_image_url));
        setBuyerRequests(reqs);
        setBusy(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, id, authLoading, navigate]);

  const formFields = useMemo(
    () => ({
      title,
      category,
      targetIndustry,
      description,
      includedFeatures,
      setupRequirements,
      startingPrice,
      estimatedTurnaround,
      previewUrl,
    }),
    [
      title,
      category,
      targetIndustry,
      description,
      includedFeatures,
      setupRequirements,
      startingPrice,
      estimatedTurnaround,
      previewUrl,
    ],
  );

  const completion = useMemo(() => computeWorkflowFormCompletion(formFields), [formFields]);

  const previewWorkflow = useMemo(
    (): PublishedWorkflowRow | null => {
      if (!row) return null;
      return {
        ...row,
        title: title.trim() || row.title,
        category: category.trim() || row.category,
        target_industry: targetIndustry.trim() || row.target_industry,
        description: description.trim() || row.description,
        included_features: includedFeatures.trim() || row.included_features,
        starting_price: startingPrice.trim() ? startingPrice : row.starting_price,
        estimated_turnaround: estimatedTurnaround.trim() || row.estimated_turnaround,
        preview_url: previewUrl.trim() || row.preview_url,
        cover_image_url: coverImageUrl.trim() || row.cover_image_url,
      };
    },
    [row, title, category, targetIndustry, description, includedFeatures, startingPrice, estimatedTurnaround, previewUrl, coverImageUrl],
  );

  const cardActions = row ? getWorkflowCardActions(row) : null;

  function flash(success: string | null, err: string | null) {
    setFlashOk(success);
    setFlashErr(err);
    if (success) setTimeout(() => setFlashOk(null), 5000);
  }

  async function refreshRow() {
    if (!row?.id || !creatorProfile?.id) return;
    const next = await fetchPublishedWorkflowForCreator(row.id, creatorProfile.id);
    if (next) setRow(next);
    const reqs = await fetchBuyerRequestsForWorkflow(row.id);
    setBuyerRequests(reqs);
  }

  async function handleSaveDraft() {
    if (!row?.id || !creatorProfile?.id || actionBusy) return;
    setActionBusy('save');
    const res = await updateCreatorWorkflowContent(row.id, creatorProfile.id, {
      title,
      category,
      target_industry: targetIndustry,
      description,
      included_features: includedFeatures,
      setup_requirements: setupRequirements,
      estimated_turnaround: estimatedTurnaround,
      preview_url: previewUrl,
      cover_image_url: coverImageUrl,
      starting_price: startingPrice === '' ? null : Number(startingPrice),
    });
    setActionBusy(null);
    if (!res.ok) {
      flash(null, res.error ?? 'Save failed.');
      return;
    }
    await refreshRow();
    flash('Draft saved.', null);
  }

  async function handleRunAiOnly() {
    if (!row?.id || !creatorProfile?.id || actionBusy) return;
    setActionBusy('ai');
    const res = await runStoredWorkflowAIReviewOnly({
      workflowId: row.id,
      creatorProfileId: creatorProfile.id,
      creatorProfile,
    });
    setActionBusy(null);
    if (!res.ok) {
      flash(null, res.error ?? 'AI review failed.');
      return;
    }
    await refreshRow();
    flash('AI review updated.', null);
  }

  async function handleSubmitAi() {
    if (!row?.id || !creatorProfile?.id || actionBusy) return;
    setActionBusy('submit');
    const res = await submitStoredWorkflowForAIReview({
      workflowId: row.id,
      creatorProfileId: creatorProfile.id,
      creatorProfile,
    });
    setActionBusy(null);
    if (!res.ok) {
      flash(null, res.error ?? 'Submit failed.');
      return;
    }
    await refreshRow();
    flash('Submitted for AI review.', null);
  }

  async function handlePublish() {
    if (!row?.id || !creatorProfile?.id || actionBusy) return;
    setActionBusy('publish');
    const res = await publishCreatorWorkflowAfterAIApproval({
      workflowId: row.id,
      creatorProfileId: creatorProfile.id,
    });
    setActionBusy(null);
    if (!res.ok) {
      flash(null, res.error ?? 'Publish failed.');
      return;
    }
    await refreshRow();
    flash('Published — visible on buyer Browse when public.', null);
  }

  if (authLoading || busy || !user) {
    return (
      <div className="dashboard-page">
        <div className="container dashboard-body">
          <DashboardNav />
          <div className="dash-loading">Loading workflow…</div>
        </div>
      </div>
    );
  }

  if (gateMsg) {
    return (
      <div className="dashboard-page">
        <div className="container dashboard-body">
          <DashboardNav />
          <section className="dash-empty wf-dash-gate">
            <p>{gateMsg}</p>
            <Link to="/dashboard/workflows" className="btn btn-ghost btn-sm">
              Back
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container">
          <div className="dashboard-eyebrow">Marketplace · Workflow editor</div>
          <h1 className="dashboard-title">{title.trim() || 'Edit workflow'}</h1>
          <p className="dashboard-sub mb-browse-intro">
            {row ?
              `${formatWorkflowStatusLabel(row.workflow_status)} · ${formatWorkflowVisibilityLabel(row.visibility_status)}`
            : 'Save drafts freely — publish runs through AI review first.'}
          </p>
        </div>
      </div>

      <div className="container dashboard-body">
        <DashboardNav />

        <div className="wf-edit-toolbar">
          <Link to="/dashboard/workflows" className="btn btn-ghost btn-sm">
            ← All workflows
          </Link>
        </div>

        {flashOk ? <div className="wf-flash wf-flash--ok">{flashOk}</div> : null}
        {flashErr ? <div className="wf-flash wf-flash--err">{flashErr}</div> : null}

        <div className="wf-v2-edit-layout">
          <div className="wf-v2-edit-main">
            <section className="wf-v2-section" aria-labelledby="wf-basics">
              <h2 id="wf-basics" className="wf-v2-section-title">Basics</h2>
              <label className="wf-field">
                <span className="wf-field-required">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
                <span className="wf-field-hint">Short name buyers will recognize (e.g. “Pool Quote Funnel”).</span>
              </label>
              <div className="wf-field-row">
                <label className="wf-field">
                  <span className="wf-field-required">Category</span>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Quote funnel" />
                  <span className="wf-field-hint">MicroBuild type or package name.</span>
                </label>
                <label className="wf-field">
                  <span className="wf-field-required">Target industry</span>
                  <input value={targetIndustry} onChange={(e) => setTargetIndustry(e.target.value)} placeholder="Pool service" />
                  <span className="wf-field-hint">Who this workflow is built for.</span>
                </label>
              </div>
            </section>

            <section className="wf-v2-section" aria-labelledby="wf-desc">
              <h2 id="wf-desc" className="wf-v2-section-title">Buyer-facing description</h2>
              <label className="wf-field">
                <span className="wf-field-required">Description</span>
                <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
                <span className="wf-field-hint">
                  Explain outcomes, who it helps, and what the buyer receives (aim for 80+ characters).
                </span>
              </label>
            </section>

            <section className="wf-v2-section" aria-labelledby="wf-deliver">
              <h2 id="wf-deliver" className="wf-v2-section-title">Deliverables / features</h2>
              <label className="wf-field">
                <span className="wf-field-required">Included features</span>
                <textarea rows={4} value={includedFeatures} onChange={(e) => setIncludedFeatures(e.target.value)} />
                <span className="wf-field-hint">Bullet concrete outputs: pages, forms, automations, assets.</span>
              </label>
            </section>

            <section className="wf-v2-section" aria-labelledby="wf-req">
              <h2 id="wf-req" className="wf-v2-section-title">Requirements</h2>
              <label className="wf-field">
                <span>Setup requirements</span>
                <textarea rows={3} value={setupRequirements} onChange={(e) => setSetupRequirements(e.target.value)} />
                <span className="wf-field-hint">What you need from the buyer: domain, brand assets, logins.</span>
              </label>
            </section>

            <section className="wf-v2-section" aria-labelledby="wf-price">
              <h2 id="wf-price" className="wf-v2-section-title">Pricing / timeline</h2>
              <div className="wf-field-row">
                <label className="wf-field">
                  <span className="wf-field-required">Starting price (USD)</span>
                  <input inputMode="decimal" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
                  <span className="wf-field-hint">Indicative only — no payments on MicroBuild yet.</span>
                </label>
                <label className="wf-field">
                  <span className="wf-field-required">Estimated turnaround</span>
                  <input value={estimatedTurnaround} onChange={(e) => setEstimatedTurnaround(e.target.value)} placeholder="5–7 days" />
                </label>
              </div>
            </section>

            <section className="wf-v2-section" aria-labelledby="wf-proof">
              <h2 id="wf-proof" className="wf-v2-section-title">Proof / preview</h2>
              <label className="wf-field">
                <span>Preview URL</span>
                <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…" />
                <span className="wf-field-hint">Live demo, staging link, or Loom walkthrough.</span>
              </label>
              <label className="wf-field">
                <span>Cover image URL</span>
                <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" />
                <span className="wf-field-hint">Optional hero image for your workflow card.</span>
              </label>
            </section>

            <div className="wf-v2-edit-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={actionBusy !== null}
                onClick={() => void handleSaveDraft()}
              >
                {actionBusy === 'save' ? 'Saving…' : 'Save Draft'}
              </button>
              {cardActions?.runAi ?
                (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={actionBusy !== null}
                    onClick={() => void handleRunAiOnly()}
                  >
                    {actionBusy === 'ai' ? 'Running…' : 'Run AI Review'}
                  </button>
                )
              : null}
              {cardActions?.submitAi ?
                (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={actionBusy !== null}
                    onClick={() => void handleSubmitAi()}
                  >
                    {actionBusy === 'submit' ? 'Submitting…' : 'Submit for AI Review'}
                  </button>
                )
              : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? 'Hide buyer preview' : 'Preview as Buyer'}
              </button>
              {cardActions?.publish ?
                (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={actionBusy !== null}
                    onClick={() => void handlePublish()}
                  >
                    {actionBusy === 'publish' ? 'Publishing…' : 'Publish'}
                  </button>
                )
              : null}
            </div>

            {showPreview && previewWorkflow ?
              (
                <div style={{ marginTop: '1rem' }}>
                  <WorkflowBuyerPreview
                    workflow={previewWorkflow}
                    creatorDisplayName={creatorDisplayName}
                    previewMode
                  />
                </div>
              )
            : null}
          </div>

          <aside className="wf-v2-edit-sidebar">
            <div className="wf-v2-completion">
              <strong>Form readiness</strong>
              <div className="wf-v2-completion-bar" aria-hidden>
                <div className="wf-v2-completion-fill" style={{ width: `${completion.percent}%` }} />
              </div>
              <p className="subtle" style={{ margin: 0, fontSize: '0.78rem' }}>
                {completion.filled} of {completion.total} core fields complete ({completion.percent}%)
              </p>
            </div>

            <WorkflowAIPanel row={row} />

            <div className="wf-v2-requests">
              <h3 className="wf-v2-requests-title">Buyer requests from this workflow</h3>
              {buyerRequests.length === 0 ?
                (
                  <p className="subtle" style={{ margin: 0, fontSize: '0.8rem' }}>
                    No customization requests yet. Published workflows appear on Browse with Request / Customize.
                  </p>
                )
              : (
                  <ul className="wf-v2-request-list">
                    {buyerRequests.map((r) => (
                      <li key={r.id} className="wf-v2-request-item">
                        <strong>{safeStr(r.business_name, 'Buyer request')}</strong>
                        {' · '}
                        {safeStr(r.build_type, 'MicroBuild')}
                        <br />
                        <span className="subtle">
                          {fmtRequestDate(r.created_at)}
                          {' · '}
                          {safeStr(r.application_status || r.status, 'Open')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
