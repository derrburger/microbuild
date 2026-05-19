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
  ORDER_PIPELINE_STAGES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  orderTimelineIndex,
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
  OPERATIONAL_BUILD_CHECKLIST_ITEMS,
  copyTextToClipboard,
} from '../lib/workspaceCopy';
import DashboardNav from '../components/DashboardNav';
import './DashboardProjectWorkspace.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
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

function WorkspaceTimeline({ status }: { status: string }) {
  const idx = orderTimelineIndex(status);
  return (
    <div className="dpw-timeline">
      {ORDER_PIPELINE_STAGES.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const color = ORDER_STATUS_COLORS[s.id] ?? '#8a94a6';
        return (
          <div key={s.id} className={`dpw-tl-step${active ? ' dpw-tl-step--active' : ''}${done ? ' dpw-tl-step--done' : ''}`}>
            <div
              className="dpw-tl-dot"
              style={{ borderColor: color, background: done || active ? color : 'transparent' }}
            />
            <span className="dpw-tl-label">{s.label}</span>
          </div>
        );
      })}
    </div>
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

  const guidance = useMemo(() => {
    if (!order) return '';
    if (!isCreatorWorkspace) {
      return deliverable?.delivery_status === 'revision_needed'
        ? 'The creator is revising delivery based on admin feedback.'
        : order.order_status === 'completed' || deliverable?.delivery_status === 'approved'
          ? 'Your delivery path is approved or complete — use the dashboard if you still need artifact links.'
          : order.order_status === 'delivered'
            ? 'Delivery is progressing — preview and live URLs appear once approved for buyer handoff.'
            : ['assigned', 'in_progress', 'in_review'].includes(order.order_status)
              ? 'Stay in touch via messages below — your creator is progressing on scope.'
              : 'Track status here and message your creator whenever you need clarity.';
    }
    if (deliverable?.delivery_status === 'revision_needed') {
      return 'Update deliverable based on admin feedback.';
    }
    switch (order.order_status) {
      case 'completed':
        return 'Project delivery is approved.';
      case 'delivered':
        return deliverable?.delivery_status === 'approved'
          ? 'Project delivery is approved.'
          : 'Deliverable released — buyer handoff in progress.';
      case 'in_review':
        return 'Admin is reviewing your delivery.';
      case 'in_progress':
        return 'Submit preview when ready.';
      case 'assigned':
        return 'Review the brief and begin work.';
      default:
        return 'Follow your brief and checklist — contact MicroBuild if anything is unclear.';
    }
  }, [deliverable?.delivery_status, isCreatorWorkspace, order]);

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
          <header className="dpw-header dpw-header--v2">
            <div className="dpw-header-main">
              <h1 className="dpw-title">{order.project_title ?? `Project ${order.id.slice(0, 8)}…`}</h1>
              <p className="dpw-sub">
                {buyer?.business_name ?? 'Unknown request'} · MicroBuild type: {order.project_type ?? '—'}
              </p>
            </div>
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
              <span className="dpw-deliverable-badge">
                Deliverable:{' '}
                {deliverable
                  ? DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status
                  : 'none yet'}
              </span>
            </div>
          </header>

          <section className="dpw-guidance" aria-live="polite">
            <strong>Status guidance:</strong> {guidance}
          </section>

          <section className="dpw-card dpw-meta-card">
            <h2 className="dpw-card-title">Project overview</h2>
            <dl className="dpw-meta-grid">
              <dt>Buyer / business</dt>
              <dd>{buyer?.business_name ?? 'Unknown request'}</dd>
              <dt>Goal snapshot</dt>
              <dd>{buyer?.main_goal?.trim() ? buyer.main_goal : '—'}</dd>
              <dt>Industry</dt>
              <dd>{buyer?.industry?.trim() ? buyer.industry : '—'}</dd>
              <dt>{isCreatorWorkspace ? 'Your assignment' : 'Assigned creator'}</dt>
              <dd>
                {isCreatorWorkspace ?
                  creatorSelf ? `${creatorSelf.display_name ?? creatorSelf.full_name} · Tier ${creatorSelf.tier}` : '—'
                : creatorAssignee ?
                  `${creatorAssignee.display_name ?? creatorAssignee.full_name}`
                : '—'}
              </dd>
              <dt>Project agreement</dt>
              <dd className="dpw-muted">
                {agreementView.phase === 'confirmed'
                  ? 'Agreement confirmed — ready to build. Payment is not active yet.'
                  : agreementView.phase === 'none'
                    ? 'No agreement drafted yet — generate on the Project Agreement panel below.'
                    : 'Agreement in progress — both parties should confirm scope. No payment yet.'}
              </dd>
              <dt>Deadline</dt>
              <dd>{buyer?.deadline?.trim() ? buyer.deadline : '—'}</dd>
              <dt>Request submitted</dt>
              <dd>{buyer?.created_at ? fmtDate(buyer.created_at) : '—'}</dd>
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
                creatorDisplayName={
                  isCreatorWorkspace
                    ? creatorSelf?.display_name ?? creatorSelf?.full_name ?? 'You'
                    : creatorAssignee?.display_name ?? creatorAssignee?.full_name ?? 'Assigned creator'
                }
                buyerBusinessName={buyer?.business_name ?? 'Buyer'}
                onProposalUpdated={setProposal}
              />
            )
          : null}
<section className="dpw-card dpw-card--activity">
            <h2 className="dpw-card-title">Activity</h2>
            <p className="dpw-muted dpw-activity-intro">
              Known milestones from timestamps already stored in MicroBuild. Steps without dates are shown without guessing times.
            </p>
            <ul className="dpw-activity-list">
              {activityItems.map((ev) => (
                <li key={ev.id}>
                  <span className="dpw-activity-title">{ev.title}</span>
                  {ev.atIso ? (
                    <span className="dpw-activity-date">{fmtDate(ev.atIso)}</span>
                  ) : (
                    <span className="dpw-activity-date dpw-activity-date--na">—</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <WorkspaceTimeline status={order.order_status} />

          {revisionHint ?
            (
              <section className="dpw-card dpw-card--warn">
                <h2 className="dpw-card-title">
                  {isCreatorWorkspace ? 'Revision requested — action required' : 'Revision in progress'}
                </h2>
                <p className="dpw-revision-note">{revisionHint}</p>
                {!isCreatorWorkspace ?
                  <p className="dpw-muted">
                    Your creator applies admin feedback — you will see refreshed links once approved.
                  </p>
                : null}
              </section>
            )
          : null}

          {/* Build packet */}
          <section className="dpw-card">
            <div className="dpw-card-head">
              <h2 className="dpw-card-title">{isCreatorWorkspace ? 'Creator brief' : 'Build brief / scope context'}</h2>
              {isCreatorWorkspace ?
                (
                  <div className="dpw-copy-row">
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(briefCopy)}>
                      Copy Creator Brief
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(checklistCopy)}>
                      Copy Build Checklist
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(packetLaunchCopy)}>
                      Copy Packet Launch List
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(buyerUpdateCopy)}>
                      Copy Buyer Update
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(revisionTemplate)}>
                      Copy Revision Request
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(completionCopy)}>
                      Copy Completion Message
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(feedbackCopy)}>
                      Copy Creator Feedback
                    </button>
                    <button type="button" className="dpw-copy-btn" onClick={() => handleCopy(deliverySummaryCopy)}>
                      Copy Delivery Summary
                    </button>
                  </div>
                )
              : (
                <p className="dpw-muted dpw-card-head-muted">
                  Read-only overview — clipboard shortcuts appear when you open this project as the assigned creator.
                </p>
              )}
            </div>

            {!packet ? (
              <p className="dpw-muted">
                No build packet found yet. Ask MicroBuild admin to save a build packet from the buyer request workflow.
              </p>
            ) : (
              <>
                {packet.ai_summary && (
                  <div className="dpw-block">
                    <div className="dpw-label">Summary</div>
                    <p>{packet.ai_summary}</p>
                  </div>
                )}
                <div className="dpw-block">
                  <div className="dpw-label">Business summary</div>
                  <p>{packet.business_summary || '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Customer problem</div>
                  <p>{packet.customer_problem || '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Recommended MicroBuild</div>
                  <p>{packet.recommended_build || '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Creator instructions</div>
                  <p>{packet.creator_instructions || '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Design direction</div>
                  <p>{packet.design_direction?.trim() ? packet.design_direction : '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Suggested CTA</div>
                  <p>
                    {packet.suggested_copy &&
                    typeof packet.suggested_copy === 'object' &&
                    'cta' in packet.suggested_copy
                      ? String((packet.suggested_copy as { cta?: unknown }).cta ?? '—')
                      : '—'}
                  </p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Suggested form fields</div>
                  <FormFieldsList form_fields={packet.form_fields} />
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Automation opportunities</div>
                  <p>{packet.automation_needs?.trim() ? packet.automation_needs : '—'}</p>
                </div>
              </>
            )}
          </section>

          {isCreatorWorkspace ?
            (
              <section className="dpw-card dpw-card--checklist">
                <h2 className="dpw-card-title">Build checklist</h2>
                <p className="dpw-muted">
                  Operational steps — rules-based checklist for every MicroBuild (no AI). Tick mentally as you go.
                </p>
                <ul className="dpw-checklist">
                  {OPERATIONAL_BUILD_CHECKLIST_ITEMS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            )
          : null}

          {userProfile?.id ?
            (
              <section className="dpw-card dpw-card--msgs">
                <h2 className="dpw-card-title">Project chat</h2>
                <p className="dpw-muted">
                  Messaging now lives in the central <strong>Messages</strong> inbox — order-scoped when a project exists, merging
                  request-phase replies from the marketplace. Text-only · refresh-based · participant-safe filtering (admin-only rows
                  never appear).
                </p>
                {order.request_id?.trim() && order.creator_id?.trim() ?
                  (
                    <Link
                      className="btn btn-primary btn-sm dpw-open-chat"
                      to={buildMessagesHref({
                        buyerRequestId: order.request_id!.trim(),
                        orderId: order.id,
                        creatorProfileId: order.creator_id.trim(),
                      })}
                    >
                      Open project chat →
                    </Link>
                  )
                : (
                  <p className="dpw-muted">Chat requires a buyer request linkage and creator assignment.</p>
                )}
              </section>
            )
          : null}

          {isCreatorWorkspace ?
            (
              <section className="dpw-card dpw-card--submit">
            <h2 className="dpw-card-title">Deliverable submission</h2>
            <div className="dpw-submit-status">
              <span>
                Current status:{' '}
                <strong>
                  {deliverable
                    ? DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status
                    : 'none — first save creates your row'}
                </strong>
              </span>
              {deliverable?.submitted_at ? (
                <span className="dpw-muted">Last submission stamp: {fmtDate(deliverable.submitted_at)}</span>
              ) : null}
            </div>
            <p className="dpw-muted">
              Submit or update URLs anytime. Saving marks the deliverable as <strong>Submitted</strong> and moves the project to{' '}
              <strong>In Review</strong> when it was Assigned or In Progress.
            </p>
            <div className="dpw-form-grid">
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
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What changed, test credentials, etc." />
              </label>
            </div>
            <div className="dpw-submit-row">
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Saving…' : 'Submit deliverable'}
              </button>
              {submitMsg === 'ok' && <span className="dpw-feedback dpw-feedback--ok">Saved — submitted for review.</span>}
              {submitMsg === 'err' && (
                <span className="dpw-feedback dpw-feedback--err">Save failed — check the browser console.</span>
              )}
            </div>
              </section>
            )
          : null}
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
