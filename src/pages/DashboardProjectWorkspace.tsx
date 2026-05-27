import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchOrderById,
  fetchBuildPacketForOrder,
  fetchDeliverableByOrderId,
  submitCreatorDeliverable,
  updateOrderStatus,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  type OrderPipelineRow,
  type BuildPacketWorkspaceRow,
  type DeliverablePlaceholder,
} from '../lib/orders';
import type { BuyerRequestRow, ProjectProposalRow, UserProfileRow } from '../types/database';
import { fetchProposalByOrderId } from '../lib/proposals';
import ProjectAgreementPanel from '../components/ProjectAgreementPanel';
import { getAgreementViewState } from '../lib/projectAgreement';
import { verifyBuyerOwnsRequest } from '../lib/marketplace';
import { buildMessagesHref } from '../lib/messages';
import {
  buildCreatorBriefCopy,
  buildLaunchChecklistCopy,
  buildBuyerUpdateCopy,
  buildRevisionRequestCopy,
  buildCompletionMessageCopy,
  buildOperationalBuildChecklistCopy,
  buildCreatorFeedbackCopy,
  buildDeliverySummaryCopy,
  buildWorkspaceActivityItems,
  copyTextToClipboard,
} from '../lib/workspaceCopy';
import {
  getWorkspaceStatusSteps,
  getWorkspaceStatusActiveIndex,
  agreementStatusBadgeLabel,
  deliverableBadgeLabel,
  formatWorkspaceDate,
  getWorkspaceNextAction,
  BUILD_CHECKLIST_GROUPS,
} from '../lib/workspaceStatus';
import DashboardNav from '../components/DashboardNav';
import './DashboardProjectWorkspace.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function fmtDate(iso: string | undefined | null): string | null {
  return formatWorkspaceDate(iso);
}

function fmtDateOrPlaceholder(iso: string | undefined | null, placeholder = 'Not set'): string {
  return fmtDate(iso) ?? placeholder;
}

function moneyDisplay(n: number | string | null | undefined): string | null {
  if (n == null || n === '') return null;
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x) || x <= 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

type BuyerSnippet = {
  business_name: string;
  industry: string | null;
  build_type: string | null;
  main_goal: string | null;
  deadline: string | null;
  created_at: string | null;
};

function FormFieldsList({ form_fields }: { form_fields: unknown }) {
  const items = useMemo(() => {
    if (!Array.isArray(form_fields)) return [];
    return form_fields.map((x) => {
      if (x && typeof x === 'object' && 'field' in x) return safeStr((x as { field?: unknown }).field, String(x));
      return String(x);
    });
  }, [form_fields]);
  if (items.length === 0) return <p className="dpw-muted">No form fields listed.</p>;
  return (
    <ul className="dpw-bullet-list">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ul>
  );
}

function WorkspaceStatusTrack({
  order,
  buyerRequestCreatedAt,
  proposal,
  deliverable,
}: {
  order: OrderPipelineRow;
  buyerRequestCreatedAt?: string | null;
  proposal: ProjectProposalRow | null;
  deliverable: DeliverablePlaceholder | null;
}) {
  const steps = getWorkspaceStatusSteps({ order, buyerRequestCreatedAt, proposal, deliverable });
  const activeIdx = getWorkspaceStatusActiveIndex({ order, proposal, deliverable });

  return (
    <section className="dpw-status-track" aria-label="Project status">
      <h2 className="dpw-status-track-title">Project status</h2>
      <div className="dpw-status-steps">
        {steps.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const dateLabel = fmtDate(step.dateIso);
          return (
            <div
              key={step.id}
              className={`dpw-status-step${active ? ' dpw-status-step--active' : ''}${done ? ' dpw-status-step--done' : ''}`}
            >
              <div className="dpw-status-step-dot" />
              <span className="dpw-status-step-label">{step.label}</span>
              {dateLabel ? <span className="dpw-status-step-date">{dateLabel}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function DashboardProjectWorkspace() {
  const { id: orderId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [userProfile, setUserProfile] = useState<UserProfileRow | null>(null);
  const [order, setOrder] = useState<OrderPipelineRow | null>(null);
  const [packet, setPacket] = useState<BuildPacketWorkspaceRow | null>(null);
  const [buyer, setBuyer] = useState<BuyerSnippet | null>(null);
  const [deliverable, setDeliverable] = useState<DeliverablePlaceholder | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<'creator' | 'buyer' | null>(null);

  const [creatorSelf, setCreatorSelf] = useState<{
    display_name: string | null;
    full_name: string;
    tier: string;
  } | null>(null);

  const [creatorAssignee, setCreatorAssignee] = useState<{ display_name: string | null; full_name: string } | null>(
    null,
  );

  const [previewUrl, setPreviewUrl] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<'idle' | 'ok' | 'err'>('idle');

  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const [proposal, setProposal] = useState<ProjectProposalRow | null>(null);
  const [proposalBuyerRequest, setProposalBuyerRequest] = useState<BuyerRequestRow | null>(null);
  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  const reload = useCallback(async () => {
    if (!orderId || !user) return;
    setLoading(true);
    setAccessDenied(null);
    setWorkspaceRole(null);

    const { data: up } = await supabase.from('user_profiles').select('*').eq('auth_user_id', user.id).maybeSingle();
    if (!up) {
      navigate('/onboarding', { replace: true });
      return;
    }
    const profile = up as UserProfileRow;
    setUserProfile(profile);

    const o = await fetchOrderById(orderId);
    if (!o) {
      setAccessDenied('Project not found.');
      setOrder(null);
      setProposal(null);
      setProposalBuyerRequest(null);
      setLoading(false);
      return;
    }

    if (!o.creator_id) {
      setAccessDenied(
        'This project does not have an assigned creator yet. Check back after MicroBuild assigns someone.',
      );
      setOrder(null);
      setProposal(null);
      setProposalBuyerRequest(null);
      setLoading(false);
      return;
    }

    const cpId = profile.creator_profile_id ?? null;
    let role: 'creator' | 'buyer' | null = null;

    if (cpId && o.creator_id === cpId) {
      role = 'creator';
    } else if (o.request_id) {
      const owns = await verifyBuyerOwnsRequest(o.request_id, profile.email ?? '', {
        authUserId: profile.auth_user_id ?? null,
      });
      if (owns) role = 'buyer';
    }

    if (!role) {
      setAccessDenied('You do not have access to this project.');
      setOrder(null);
      setCreatorSelf(null);
      setCreatorAssignee(null);
      setProposal(null);
      setProposalBuyerRequest(null);
      setLoading(false);
      return;
    }

    setWorkspaceRole(role);

    if (role === 'creator') {
      setCreatorAssignee(null);
      const { data: cpRow } = await supabase
        .from('creator_profiles')
        .select('display_name, full_name, tier')
        .eq('id', cpId!)
        .maybeSingle();
      if (cpRow && typeof cpRow === 'object') {
        const r = cpRow as Record<string, unknown>;
        setCreatorSelf({
          display_name: typeof r.display_name === 'string' ? r.display_name : null,
          full_name: typeof r.full_name === 'string' ? r.full_name : 'Creator',
          tier: typeof r.tier === 'string' ? r.tier : 'free',
        });
      } else {
        setCreatorSelf(null);
      }
    } else {
      setCreatorSelf(null);
      if (o.creator_id) {
        const { data: assignee } = await supabase
          .from('creator_profiles')
          .select('display_name, full_name')
          .eq('id', o.creator_id)
          .maybeSingle();
        if (assignee && typeof assignee === 'object') {
          const r = assignee as Record<string, unknown>;
          setCreatorAssignee({
            display_name: typeof r.display_name === 'string' ? r.display_name : null,
            full_name: typeof r.full_name === 'string' ? r.full_name : 'Creator',
          });
        } else setCreatorAssignee(null);
      } else setCreatorAssignee(null);
    }

    setOrder(o);

    const prop = await fetchProposalByOrderId(o.id);
    setProposal(prop);
    if (o.request_id) {
      const { data: brf } = await supabase.from('buyer_requests').select('*').eq('id', o.request_id).maybeSingle();
      setProposalBuyerRequest(brf ? (brf as BuyerRequestRow) : null);
    } else {
      setProposalBuyerRequest(null);
    }

    const [bp, deliv] = await Promise.all([
      fetchBuildPacketForOrder(o),
      fetchDeliverableByOrderId(o.id),
    ]);
    setPacket(bp);
    setDeliverable(deliv);

    if (deliv) {
      setPreviewUrl(deliv.preview_url ?? '');
      setDeliveryUrl(deliv.live_url ?? '');
      setGithubUrl(deliv.github_url ?? '');
      setNotes(deliv.notes ?? '');
    }

    if (o.request_id) {
      const { data: br } = await supabase
        .from('buyer_requests')
        .select('business_name, industry, build_type, main_goal, deadline, created_at')
        .eq('id', o.request_id)
        .maybeSingle();
      if (br) {
        const row = br as Record<string, unknown>;
        setBuyer({
          business_name: safeStr(row.business_name, 'Business'),
          industry: safeStr(row.industry, '') || null,
          build_type: safeStr(row.build_type, '') || null,
          main_goal: safeStr(row.main_goal, '') || null,
          deadline: safeStr(row.deadline, '') || null,
          created_at: typeof row.created_at === 'string' ? row.created_at : null,
        });
      } else setBuyer(null);
    } else setBuyer(null);

    setLoading(false);
  }, [orderId, user, navigate]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSubmit() {
    if (!order || workspaceRole !== 'creator' || !userProfile?.creator_profile_id) return;
    setSubmitting(true);
    setSubmitMsg('idle');
    const ok = await submitCreatorDeliverable({
      orderId: order.id,
      creatorProfileId: userProfile.creator_profile_id,
      previewUrl,
      deliveryUrl,
      githubUrl,
      notes,
    });
    if (ok) {
      const d = await fetchDeliverableByOrderId(order.id);
      setDeliverable(d);
      if (order.order_status === 'assigned' || order.order_status === 'in_progress') {
        await updateOrderStatus(order.id, 'in_review');
        setOrder((prev) => (prev ? { ...prev, order_status: 'in_review' } : prev));
      }
      setSubmitMsg('ok');
      setTimeout(() => setSubmitMsg('idle'), 4000);
    } else {
      setSubmitMsg('err');
      setTimeout(() => setSubmitMsg('idle'), 6000);
    }
    setSubmitting(false);
  }

  async function handleCopy(text: string) {
    const ok = await copyTextToClipboard(text);
    setCopyMsg(ok ? 'Copied' : 'Copy failed — try again');
    setTimeout(() => setCopyMsg(null), 2200);
  }

  const revisionHint =
    deliverable?.delivery_status === 'revision_needed'
      ? safeStr(deliverable.revision_note, '').trim()
      : '';

  const statusColor = order ? ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6' : '#8a94a6';

  const briefCopy = order ? buildCreatorBriefCopy(order, packet) : '';
  const packetLaunchCopy = buildLaunchChecklistCopy(packet);
  const checklistCopy = buildOperationalBuildChecklistCopy();
  const buyerUpdateCopy = order ? buildBuyerUpdateCopy(order, packet) : '';
  const revisionTemplate = buildRevisionRequestCopy(revisionHint || '[Your revision notes from MicroBuild]');
  const completionCopy = order ? buildCompletionMessageCopy(order) : '';
  const feedbackCopy = buildCreatorFeedbackCopy(revisionHint, notes);
  const deliverySummaryCopy = order
    ? buildDeliverySummaryCopy(order, deliverable, buyer?.business_name ?? '')
    : '';

  const isCreatorWorkspace = workspaceRole === 'creator';

  const agreementView = useMemo(() => getAgreementViewState(proposal), [proposal]);

  const nextAction = useMemo(() => {
    if (!order || !workspaceRole) {
      return { title: 'Loading project', detail: 'Please wait while workspace data loads.', tone: 'neutral' as const };
    }
    return getWorkspaceNextAction({
      role: workspaceRole,
      order,
      proposal,
      deliverable,
    });
  }, [order, workspaceRole, proposal, deliverable]);

  const messagesHref =
    order?.request_id?.trim() && order?.creator_id?.trim()
      ? buildMessagesHref({
          buyerRequestId: order.request_id.trim(),
          orderId: order.id,
          creatorProfileId: order.creator_id.trim(),
        })
      : null;

  const creatorDisplayLabel = isCreatorWorkspace
    ? creatorSelf?.display_name ?? creatorSelf?.full_name ?? 'You'
    : creatorAssignee?.display_name ?? creatorAssignee?.full_name ?? 'Assigned creator';

  const proposedPrice = moneyDisplay(proposal?.proposed_price ?? null);

  const buyerCanSeeDeliveryLinks =
    order &&
    (order.order_status === 'delivered' || order.order_status === 'completed') &&
    deliverable?.delivery_status === 'approved';

  const activityItems = order
    ? buildWorkspaceActivityItems({
        order,
        buyerRequestCreatedAt: buyer?.created_at,
        packetUpdatedAt: packet?.updated_at ?? null,
        deliverable,
      })
    : [];

  if (authLoading || (!user && !accessDenied)) {
    return (
      <div className="dashboard-page dpw-page">
        <div className="dpw-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page dpw-page">
      <DashboardNav />

      <div className="dpw-toolbar">
        <Link to="/dashboard" className="dpw-back">
          ← Back to dashboard
        </Link>
        {copyMsg && <span className="dpw-copy-toast">{copyMsg}</span>}
      </div>

      {loading ? (
        <div className="dpw-loading">Loading workspace…</div>
      ) : accessDenied ? (
        <div className="dpw-access-denied">
          <h1 className="dpw-title">Project workspace</h1>
          <p>{accessDenied}</p>
          <Link to="/dashboard" className="btn btn-primary btn-sm">
            Return to dashboard
          </Link>
        </div>
      ) : order ? (
        <>
          <header className="dpw-header">
            <div className="dpw-header-main">
              <div className="dpw-header-top">
                <Link to="/dashboard" className="dpw-back">
                  ← Back to dashboard
                </Link>
              </div>
              <h1 className="dpw-title">{order.project_title ?? `Project ${order.id.slice(0, 8)}`}</h1>
              <p className="dpw-sub">
                {order.project_type ?? 'MicroBuild'} · {buyer?.business_name ?? 'Buyer'}
              </p>
              <div className="dpw-header-meta">
                <span>
                  Buyer: <strong>{buyer?.business_name ?? 'Unknown business'}</strong>
                </span>
                <span>
                  Creator: <strong>{creatorDisplayLabel}</strong>
                </span>
              </div>
            </div>
            <div className="dpw-header-actions">
              <div className="dpw-header-badges">
                <span
                  className="dpw-status-badge"
                  style={{
                    color: statusColor,
                    borderColor: `${statusColor}44`,
                    background: `${statusColor}11`,
                  }}
                >
                  {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                </span>
                <span
                  className={`dpw-badge dpw-badge--agreement${
                    agreementView.phase === 'confirmed'
                      ? '-confirmed'
                      : agreementView.phase === 'changes_requested'
                        ? '-warn'
                        : ''
                  }`}
                >
                  {agreementStatusBadgeLabel(proposal)}
                </span>
                <span className="dpw-badge dpw-badge--muted">
                  Deliverable: {deliverableBadgeLabel(order, deliverable)}
                </span>
              </div>
              <div className="dpw-header-btn-row">
                {messagesHref ?
                  (
                    <Link className="btn btn-primary btn-sm" to={messagesHref}>
                      Message {isCreatorWorkspace ? 'buyer' : 'creator'}
                    </Link>
                  )
                : null}
                {isCreatorWorkspace && (order.order_status === 'assigned' || order.order_status === 'in_progress') ?
                  (
                    <a className="btn btn-ghost btn-sm" href="#deliverables">
                      Submit delivery
                    </a>
                  )
                : null}
                {!isCreatorWorkspace && buyerCanSeeDeliveryLinks ?
                  (
                    <a className="btn btn-ghost btn-sm" href="#deliverables">
                      View delivery
                    </a>
                  )
                : null}
              </div>
            </div>
          </header>

          <WorkspaceStatusTrack
            order={order}
            buyerRequestCreatedAt={buyer?.created_at}
            proposal={proposal}
            deliverable={deliverable}
          />

          <div className="dpw-layout">
            <div className="dpw-col dpw-col--main">
              <section className="dpw-card dpw-meta-card">
                <h2 className="dpw-card-title">Project overview</h2>
                <dl className="dpw-meta-grid">
                  <dt>Buyer / business</dt>
                  <dd>{buyer?.business_name ?? 'Unknown business'}</dd>
                  <dt>Goal</dt>
                  <dd>{buyer?.main_goal?.trim() ? buyer.main_goal : 'Not specified'}</dd>
                  <dt>Industry</dt>
                  <dd>{buyer?.industry?.trim() ? buyer.industry : 'Not specified'}</dd>
                  <dt>MicroBuild type</dt>
                  <dd>{order.project_type ?? buyer?.build_type ?? 'MicroBuild'}</dd>
                  <dt>Deadline</dt>
                  <dd>{buyer?.deadline?.trim() ? buyer.deadline : 'Not set'}</dd>
                  <dt>Budget / price</dt>
                  <dd>{proposedPrice ?? 'To be agreed in Messages'}</dd>
                  <dt>{isCreatorWorkspace ? 'Your assignment' : 'Assigned creator'}</dt>
                  <dd>
                    {isCreatorWorkspace ?
                      creatorSelf
                        ? `${creatorSelf.display_name ?? creatorSelf.full_name} · Tier ${creatorSelf.tier}`
                      : 'Assigned creator'
                    : creatorDisplayLabel}
                  </dd>
                  <dt>Request submitted</dt>
                  <dd>{fmtDateOrPlaceholder(buyer?.created_at, 'Date not recorded')}</dd>
                </dl>
              </section>

              {workspaceRole && userProfile ?
                (
                  <ProjectAgreementPanel
                    role={workspaceRole}
                    order={order}
                    buyerRequest={proposalBuyerRequest}
                    proposal={proposal}
                    userProfile={userProfile}
                    creatorProfileId={order.creator_id ?? null}
                    creatorDisplayName={creatorDisplayLabel}
                    buyerBusinessName={buyer?.business_name ?? 'Buyer'}
                    onProposalUpdated={setProposal}
                  />
                )
              : null}

              <section className="dpw-card dpw-card--submit" id="deliverables">
                <h2 className="dpw-card-title">Deliverables</h2>
                {!deliverable && !isCreatorWorkspace ?
                  (
                    <div className="dpw-empty-state">
                      <p>No deliverable submitted yet.</p>
                      <p className="dpw-muted">Waiting for creator delivery.</p>
                    </div>
                  )
                : !deliverable && isCreatorWorkspace ?
                  (
                    <>
                      <div className="dpw-empty-state">
                        <p>No deliverable submitted yet.</p>
                        <p className="dpw-muted">Submit preview and delivery URLs when your build is ready.</p>
                      </div>
                      <div className="dpw-form-grid" style={{ marginTop: '1rem' }}>
                        <label className="dpw-field">
                          <span>Preview URL</span>
                          <input
                            type="url"
                            value={previewUrl}
                            onChange={(e) => setPreviewUrl(e.target.value)}
                            placeholder="https://…"
                            autoComplete="off"
                          />
                        </label>
                        <label className="dpw-field">
                          <span>Delivery URL</span>
                          <input
                            type="url"
                            value={deliveryUrl}
                            onChange={(e) => setDeliveryUrl(e.target.value)}
                            placeholder="https://…"
                            autoComplete="off"
                          />
                        </label>
                        <label className="dpw-field">
                          <span>GitHub URL (optional)</span>
                          <input
                            type="url"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            placeholder="https://github.com/…"
                            autoComplete="off"
                          />
                        </label>
                        <label className="dpw-field dpw-field--full">
                          <span>Notes to MicroBuild / buyer-facing context</span>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            placeholder="What changed, test credentials, etc."
                          />
                        </label>
                      </div>
                      <div className="dpw-submit-row">
                        <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
                          {submitting ? 'Saving…' : 'Submit preview / delivery'}
                        </button>
                        {submitMsg === 'ok' && <span className="dpw-feedback dpw-feedback--ok">Saved — submitted for review.</span>}
                        {submitMsg === 'err' && (
                          <span className="dpw-feedback dpw-feedback--err">Save failed — check the browser console.</span>
                        )}
                      </div>
                    </>
                  )
                : (
                  <>
                    <div className="dpw-deliverable-status-row">
                      <span>
                        Status:{' '}
                        <strong>
                          {deliverable
                            ? DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status
                            : 'Not submitted'}
                        </strong>
                      </span>
                      {deliverable?.submitted_at ?
                        <span className="dpw-muted">Submitted {fmtDate(deliverable.submitted_at)}</span>
                      : null}
                    </div>
                    {revisionHint ?
                      <div className="dpw-revision-note">{revisionHint}</div>
                    : null}
                    <div className="dpw-deliverable-grid">
                      <div className="dpw-deliverable-field">
                        <span>Preview URL</span>
                        {isCreatorWorkspace || (buyerCanSeeDeliveryLinks && deliverable?.preview_url?.trim()) ?
                          deliverable?.preview_url?.trim() ?
                            (
                              <a href={deliverable.preview_url} target="_blank" rel="noopener noreferrer">
                                {deliverable.preview_url}
                              </a>
                            )
                          : <p className="dpw-muted">Not provided yet</p>
                        : <p className="dpw-muted">Available after internal approval</p>}
                      </div>
                      <div className="dpw-deliverable-field">
                        <span>Delivery URL</span>
                        {isCreatorWorkspace || (buyerCanSeeDeliveryLinks && deliverable?.live_url?.trim()) ?
                          deliverable?.live_url?.trim() ?
                            (
                              <a href={deliverable.live_url} target="_blank" rel="noopener noreferrer">
                                {deliverable.live_url}
                              </a>
                            )
                          : <p className="dpw-muted">Not provided yet</p>
                        : <p className="dpw-muted">Available after internal approval</p>}
                      </div>
                    </div>
                    {isCreatorWorkspace ?
                      (
                        <>
                          <div className="dpw-form-grid" style={{ marginTop: '0.75rem' }}>
                            <label className="dpw-field">
                              <span>Preview URL</span>
                              <input
                                type="url"
                                value={previewUrl}
                                onChange={(e) => setPreviewUrl(e.target.value)}
                                placeholder="https://…"
                                autoComplete="off"
                              />
                            </label>
                            <label className="dpw-field">
                              <span>Delivery URL</span>
                              <input
                                type="url"
                                value={deliveryUrl}
                                onChange={(e) => setDeliveryUrl(e.target.value)}
                                placeholder="https://…"
                                autoComplete="off"
                              />
                            </label>
                            <label className="dpw-field">
                              <span>GitHub URL (optional)</span>
                              <input
                                type="url"
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)}
                                placeholder="https://github.com/…"
                                autoComplete="off"
                              />
                            </label>
                            <label className="dpw-field dpw-field--full">
                              <span>Notes to MicroBuild / buyer-facing context</span>
                              <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={4}
                                placeholder="What changed, test credentials, etc."
                              />
                            </label>
                          </div>
                          <div className="dpw-submit-row">
                            <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
                              {submitting ? 'Saving…' : 'Update deliverable'}
                            </button>
                            {submitMsg === 'ok' && (
                              <span className="dpw-feedback dpw-feedback--ok">Saved — submitted for review.</span>
                            )}
                            {submitMsg === 'err' && (
                              <span className="dpw-feedback dpw-feedback--err">Save failed — check the browser console.</span>
                            )}
                          </div>
                        </>
                      )
                    : deliverable?.delivery_status === 'approved' && buyerCanSeeDeliveryLinks ?
                      (
                        <p className="dpw-muted">
                          Review your delivery links above. Message your creator if you need adjustments.
                        </p>
                      )
                    : (
                      <p className="dpw-muted">Waiting for creator delivery or internal review.</p>
                    )}
                  </>
                )}
              </section>
            </div>

            <div className="dpw-col dpw-col--sidebar">
              <section
                className={`dpw-card dpw-card--next${
                  nextAction.tone === 'warn'
                    ? '-warn'
                    : nextAction.tone === 'success'
                      ? '-success'
                      : ''
                }`}
              >
                <h2 className="dpw-card-title">Next best action</h2>
                <p className="dpw-next-title">{nextAction.title}</p>
                <p className="dpw-next-detail">{nextAction.detail}</p>
              </section>

              {userProfile?.id ?
                (
                  <section className="dpw-card dpw-card--msgs">
                    <h2 className="dpw-card-title">Messages</h2>
                    <div className="dpw-msg-shortcut">
                      <p className="dpw-muted">
                        Project chat lives in the central Messages inbox — order-scoped after creator selection.
                      </p>
                      {messagesHref ?
                        (
                          <Link className="btn btn-primary btn-sm dpw-open-chat" to={messagesHref}>
                            Open project chat →
                          </Link>
                        )
                      : (
                        <p className="dpw-muted">Chat requires a buyer request linkage and creator assignment.</p>
                      )}
                    </div>
                  </section>
                )
              : null}

              <section className="dpw-card dpw-card--activity">
                <h2 className="dpw-card-title">Activity</h2>
                <p className="dpw-muted dpw-activity-intro">Recent milestones from stored project timestamps.</p>
                <ul className="dpw-activity-list">
                  {activityItems.map((ev) => {
                    const dateLabel = fmtDate(ev.atIso);
                    return (
                      <li key={ev.id}>
                        <span className="dpw-activity-dot" aria-hidden />
                        <div className="dpw-activity-body">
                          <span className="dpw-activity-title">{ev.title}</span>
                          {dateLabel ?
                            (
                              <>
                                <span className="dpw-activity-sep">—</span>
                                <span className="dpw-activity-date">{dateLabel}</span>
                              </>
                            )
                          : (
                            <span className="dpw-activity-pending">pending date</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {isCreatorWorkspace ?
                (
                  <section className="dpw-card dpw-card--checklist">
                    <h2 className="dpw-card-title">Build checklist</h2>
                    <p className="dpw-muted dpw-card-subtitle">Operational steps for every MicroBuild project.</p>
                    <div className="dpw-checklist-groups">
                      {BUILD_CHECKLIST_GROUPS.map((group) => (
                        <div key={group.title}>
                          <h3 className="dpw-checklist-group-title">{group.title}</h3>
                          <ul className="dpw-checklist">
                            {group.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              : null}
            </div>
          </div>

          <section className="dpw-card dpw-full-width">
            <div className="dpw-card-head">
              <div>
                <h2 className="dpw-card-title">{isCreatorWorkspace ? 'Creator brief' : 'Build brief'}</h2>
                <p className="dpw-muted dpw-card-subtitle">
                  {isCreatorWorkspace ? 'Your working brief for this build.' : 'Read-only scope context from the buyer request.'}
                </p>
              </div>
              {isCreatorWorkspace ?
                (
                  <div>
                    <div className="dpw-copy-group">
                      <div className="dpw-copy-group-label">Brief &amp; updates</div>
                      <div className="dpw-copy-row">
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(briefCopy)}>
                          Copy Creator Brief
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(buyerUpdateCopy)}>
                          Copy Buyer Update
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(completionCopy)}>
                          Copy Completion Message
                        </button>
                      </div>
                    </div>
                    <div className="dpw-copy-group">
                      <div className="dpw-copy-group-label">Build &amp; delivery</div>
                      <div className="dpw-copy-row">
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(checklistCopy)}>
                          Copy Build Checklist
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(packetLaunchCopy)}>
                          Copy Launch List
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(deliverySummaryCopy)}>
                          Copy Delivery Summary
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(revisionTemplate)}>
                          Copy Revision Request
                        </button>
                        <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(feedbackCopy)}>
                          Copy Feedback Summary
                        </button>
                      </div>
                    </div>
                  </div>
                )
              : null}
            </div>

            {!packet ?
              (
                <div className="dpw-empty-state">
                  <p>No build packet saved yet.</p>
                  <p className="dpw-muted">Generate or save a build packet from the buyer request workflow.</p>
                </div>
              )
            : (
                <div className="dpw-brief-grid">
                  {packet.ai_summary ?
                    (
                      <div className="dpw-brief-section dpw-brief-section--wide">
                        <h3>Brief summary</h3>
                        <p>{packet.ai_summary}</p>
                      </div>
                    )
                  : null}
                  <div className="dpw-brief-section">
                    <h3>Buyer goal</h3>
                    <p>{packet.customer_problem?.trim() || buyer?.main_goal?.trim() || 'Not specified'}</p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Business summary</h3>
                    <p>{packet.business_summary?.trim() || 'Not specified'}</p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Recommended MicroBuild</h3>
                    <p>{packet.recommended_build?.trim() || 'Not specified'}</p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Tone / design direction</h3>
                    <p>{packet.design_direction?.trim() || 'Not specified'}</p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Creator instructions</h3>
                    <p>{packet.creator_instructions?.trim() || 'Not specified'}</p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Suggested CTA</h3>
                    <p>
                      {packet.suggested_copy &&
                      typeof packet.suggested_copy === 'object' &&
                      'cta' in packet.suggested_copy
                        ? String((packet.suggested_copy as { cta?: unknown }).cta ?? 'Not specified')
                        : 'Not specified'}
                    </p>
                  </div>
                  <div className="dpw-brief-section">
                    <h3>Required form fields</h3>
                    <FormFieldsList form_fields={packet.form_fields} />
                  </div>
                  {packet.automation_needs?.trim() ?
                    (
                      <div className="dpw-brief-section">
                        <h3>Automation / integrations</h3>
                        <p>{packet.automation_needs}</p>
                      </div>
                    )
                  : null}
                  {(packet.suggested_page_sections as string[] | null)?.length ?
                    (
                      <div className="dpw-brief-section dpw-brief-section--wide">
                        <h3>Required sections / features</h3>
                        <ul className="dpw-bullet-list">
                          {(packet.suggested_page_sections as string[]).map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  : null}
                </div>
              )}
          </section>
        </>
      ) : (
        <div className="dpw-access-denied">
          <h1 className="dpw-title">Project workspace</h1>
          <p>This project could not be loaded. It may have been removed or the link is invalid.</p>
          <Link to="/dashboard" className="btn btn-primary btn-sm">
            Return to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
