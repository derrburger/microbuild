import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchPublishedWorkflowForCreator,
  publishCreatorWorkflowAfterAIApproval,
  resolveCreatorProfileForMarketplace,
  runStoredWorkflowAIReviewOnly,
  submitStoredWorkflowForAIReview,
  updateCreatorWorkflowContent,
} from '../lib/marketplace';
import { creatorEligibleForWorkflowAuthoring } from '../lib/marketplaceEligibility';
import DashboardNav from '../components/DashboardNav';
import type { CreatorProfileRow, PublishedWorkflowRow, UserProfileRow } from '../types/database';
import './Dashboard.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export default function DashboardWorkflowEdit() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(true);
  const [row, setRow] = useState<PublishedWorkflowRow | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

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
      if (!cancelled) setCreatorProfile(cp);

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
        setBusy(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user, id, authLoading, navigate]);

  function flash(success: string | null, err: string | null) {
    setFlashOk(success);
    setFlashErr(err);
    if (success) setTimeout(() => setFlashOk(null), 5000);
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
    const next = await fetchPublishedWorkflowForCreator(row.id, creatorProfile.id);
    if (next) setRow(next);
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
    const next = await fetchPublishedWorkflowForCreator(row.id, creatorProfile.id);
    if (next) setRow(next);
    flash('AI review saved — storefront lifecycle unchanged.', null);
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
    const next = await fetchPublishedWorkflowForCreator(row.id, creatorProfile.id);
    if (next) setRow(next);

    const ai = safeStr(next?.ai_review_status);
    const auto = next?.auto_publish_eligible === true;
    if (auto && ai === 'published') {
      flash('AI approved — workflow auto-published to buyer Browse.', null);
    } else if (ai === 'ai_approved') {
      flash('AI approved — publish is available from this screen when you are ready.', null);
    } else if (ai === 'needs_improvement') {
      flash('AI requests improvements — edit using the checklist below.', null);
    } else if (ai === 'risk_flagged') {
      flash(null, 'Risk flags detected — workflow stays hidden until you edit and resubmit.');
    } else {
      flash('Review submitted.', null);
    }
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
    const next = await fetchPublishedWorkflowForCreator(row.id, creatorProfile.id);
    if (next) setRow(next);
    flash('Published — visible on buyer Browse.', null);
  }

  const aiSt = safeStr(row?.ai_review_status ?? 'not_reviewed');
  const ws = safeStr(row?.workflow_status ?? 'draft');
  const risks = Array.isArray(row?.ai_risk_flags) ? row!.ai_risk_flags! : [];
  const missing = Array.isArray(row?.ai_missing_items) ? row!.ai_missing_items! : [];
  const suggestions =
    Array.isArray(row?.ai_suggested_improvements) ? row!.ai_suggested_improvements! : [];

  const showPublishBtn =
    aiSt === 'ai_approved' && ws !== 'published' && risks.length === 0;

  if (authLoading || busy || !user) {
    return (
      <div className="dashboard-page">
        <div className="container dashboard-body">
          <DashboardNav />
          <div className="dash-loading">Loading…</div>
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
          <h1 className="dashboard-title">Edit workflow</h1>
          <p className="dashboard-sub mb-browse-intro">
            Save drafts freely — publishing runs through AI review first (rules-based, no external APIs).
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

        {flashOk ?
          <div className="wf-flash wf-flash--ok">{flashOk}</div>
        : null}
        {flashErr ?
          <div className="wf-flash wf-flash--err">{flashErr}</div>
        : null}

        <div className="wf-edit-grid">
          <div className="wf-edit-main">
            <label className="wf-field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="wf-field">
              <span>Category</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className="wf-field">
              <span>Target industry</span>
              <input value={targetIndustry} onChange={(e) => setTargetIndustry(e.target.value)} />
            </label>
            <label className="wf-field">
              <span>Description</span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="wf-field">
              <span>Included features / deliverables</span>
              <textarea
                rows={4}
                value={includedFeatures}
                onChange={(e) => setIncludedFeatures(e.target.value)}
              />
            </label>
            <label className="wf-field">
              <span>Setup requirements</span>
              <textarea
                rows={3}
                value={setupRequirements}
                onChange={(e) => setSetupRequirements(e.target.value)}
              />
            </label>
            <div className="wf-field-row">
              <label className="wf-field">
                <span>Starting price (USD)</span>
                <input
                  inputMode="decimal"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                />
              </label>
              <label className="wf-field">
                <span>Estimated turnaround</span>
                <input value={estimatedTurnaround} onChange={(e) => setEstimatedTurnaround(e.target.value)} />
              </label>
            </div>
            <label className="wf-field">
              <span>Preview URL</span>
              <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="wf-field">
              <span>Cover image URL</span>
              <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" />
            </label>

            <div className="wf-edit-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={actionBusy !== null}
                onClick={() => void handleSaveDraft()}
              >
                {actionBusy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={actionBusy !== null}
                onClick={() => void handleRunAiOnly()}
              >
                {actionBusy === 'ai' ? 'Running…' : 'Run AI review'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={actionBusy !== null}
                onClick={() => void handleSubmitAi()}
              >
                {actionBusy === 'submit' ? 'Submitting…' : 'Submit for AI review'}
              </button>
              {showPublishBtn ?
                (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={actionBusy !== null}
                    onClick={() => void handlePublish()}
                  >
                    {actionBusy === 'publish' ? 'Publishing…' : 'Publish (AI approved)'}
                  </button>
                )
              : null}
            </div>
          </div>

          <aside className="wf-edit-aside">
            <h3 className="wf-aside-title">AI overview</h3>
            <p className="subtle wf-aside-line">
              Score:{' '}
              {typeof row?.ai_quality_score === 'number' ? `${row.ai_quality_score}/100` : '—'}
            </p>
            <p className="subtle wf-aside-line">
              Readiness:{' '}
              {safeStr(row?.ai_publish_readiness ?? 'not_ready').replace(/_/g, ' ')}
            </p>
            <p className="subtle wf-aside-line">Status: {aiSt.replace(/_/g, ' ')}</p>
            <p className="wf-aside-summary">{safeStr(row?.ai_review_summary, 'Run AI review to populate this panel.')}</p>
            <p className="subtle wf-aside-line">{safeStr(row?.ai_recommended_action, '')}</p>

            {missing.length > 0 && (
              <div className="wf-aside-block">
                <strong>Missing items</strong>
                <ul className="wf-dash-ul">
                  {missing.map((m) => (
                    <li key={m}>{safeStr(m)}</li>
                  ))}
                </ul>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="wf-aside-block">
                <strong>Suggested improvements</strong>
                <ul className="wf-dash-ul">
                  {suggestions.map((s) => (
                    <li key={s}>{safeStr(s)}</li>
                  ))}
                </ul>
              </div>
            )}

            {risks.length > 0 && (
              <div className="wf-aside-block wf-aside-block--risk">
                <strong>Risk flags</strong>
                <ul className="wf-dash-ul">
                  {risks.map((r) => (
                    <li key={r}>{safeStr(r)}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
