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
import type { UserProfileRow } from '../types/database';
import {
  buildCreatorBriefCopy,
  buildLaunchChecklistCopy,
  buildBuyerUpdateCopy,
  buildRevisionRequestCopy,
  buildCompletionMessageCopy,
  copyTextToClipboard,
} from '../lib/workspaceCopy';
import DashboardNav from '../components/DashboardNav';
import './DashboardProjectWorkspace.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

type BuyerSnippet = {
  business_name: string;
  industry: string | null;
  build_type: string | null;
  main_goal: string | null;
  deadline: string | null;
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

  const [previewUrl, setPreviewUrl] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<'idle' | 'ok' | 'err'>('idle');

  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  const reload = useCallback(async () => {
    if (!orderId || !user) return;
    setLoading(true);
    setAccessDenied(null);

    const { data: up } = await supabase.from('user_profiles').select('*').eq('auth_user_id', user.id).maybeSingle();
    if (!up) {
      navigate('/onboarding', { replace: true });
      return;
    }
    const profile = up as UserProfileRow;
    setUserProfile(profile);

    const cpId = profile.creator_profile_id;
    if (!cpId) {
      setAccessDenied('No creator profile is linked to your account.');
      setLoading(false);
      return;
    }

    const o = await fetchOrderById(orderId);
    if (!o) {
      setAccessDenied('Project not found.');
      setLoading(false);
      return;
    }

    if (!o.creator_id) {
      setAccessDenied(
        'This project does not have an assigned creator yet. Check back after MicroBuild assigns you.',
      );
      setOrder(null);
      setLoading(false);
      return;
    }

    if (o.creator_id !== cpId) {
      setAccessDenied('You do not have access to this project.');
      setLoading(false);
      return;
    }

    setOrder(o);
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
        .select('business_name, industry, build_type, main_goal, deadline')
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
        });
      } else setBuyer(null);
    } else setBuyer(null);

    setLoading(false);
  }, [orderId, user, navigate]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSubmit() {
    if (!order || !userProfile?.creator_profile_id) return;
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

  async function handleCopy(label: string, text: string) {
    const ok = await copyTextToClipboard(text);
    setCopyMsg(ok ? `${label} copied` : 'Copy failed');
    setTimeout(() => setCopyMsg(null), 2500);
  }

  const revisionHint =
    deliverable?.delivery_status === 'revision_needed'
      ? safeStr(deliverable.revision_note, '').trim()
      : '';

  const statusColor = order ? ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6' : '#8a94a6';

  const briefCopy = order ? buildCreatorBriefCopy(order, packet) : '';
  const launchCopy = buildLaunchChecklistCopy(packet);
  const buyerUpdateCopy = order ? buildBuyerUpdateCopy(order, packet) : '';
  const revisionTemplate = buildRevisionRequestCopy(revisionHint || '[Your revision notes from MicroBuild]');
  const completionCopy = order ? buildCompletionMessageCopy(order) : '';

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
            <div>
              <h1 className="dpw-title">{order.project_title ?? `Project ${order.id.slice(0, 8)}…`}</h1>
              <p className="dpw-sub">
                {buyer?.business_name ?? 'Buyer'} · {order.project_type ?? 'MicroBuild'}
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
              {deliverable && (
                <span className="dpw-deliverable-badge">
                  Deliverable: {DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status}
                </span>
              )}
            </div>
          </header>

          <WorkspaceTimeline status={order.order_status} />

          {/* Buyer context — minimal */}
          <section className="dpw-card">
            <h2 className="dpw-card-title">Buyer context</h2>
            {buyer ? (
              <dl className="dpw-kv">
                <dt>Business</dt>
                <dd>{buyer.business_name}</dd>
                {buyer.industry && (
                  <>
                    <dt>Industry</dt>
                    <dd>{buyer.industry}</dd>
                  </>
                )}
                {buyer.build_type && (
                  <>
                    <dt>MicroBuild type</dt>
                    <dd>{buyer.build_type}</dd>
                  </>
                )}
                {buyer.main_goal && (
                  <>
                    <dt>Goal</dt>
                    <dd>{buyer.main_goal}</dd>
                  </>
                )}
                {buyer.deadline && (
                  <>
                    <dt>Deadline</dt>
                    <dd>{buyer.deadline}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="dpw-muted">No buyer request details linked.</p>
            )}
          </section>

          {revisionHint ? (
            <section className="dpw-card dpw-card--warn">
              <h2 className="dpw-card-title">Revision requested</h2>
              <p className="dpw-revision-note">{revisionHint}</p>
            </section>
          ) : null}

          {/* Build packet */}
          <section className="dpw-card">
            <div className="dpw-card-head">
              <h2 className="dpw-card-title">Build packet & brief</h2>
              <div className="dpw-copy-row">
                <button type="button" className="dpw-copy-btn" onClick={() => handleCopy('Creator brief', briefCopy)}>
                  Copy Creator Brief
                </button>
                <button type="button" className="dpw-copy-btn" onClick={() => handleCopy('Launch checklist', launchCopy)}>
                  Copy Launch Checklist
                </button>
                <button type="button" className="dpw-copy-btn" onClick={() => handleCopy('Buyer update', buyerUpdateCopy)}>
                  Copy Buyer Update
                </button>
                <button type="button" className="dpw-copy-btn" onClick={() => handleCopy('Revision request', revisionTemplate)}>
                  Copy Revision Request
                </button>
                <button type="button" className="dpw-copy-btn" onClick={() => handleCopy('Completion message', completionCopy)}>
                  Copy Completion Message
                </button>
              </div>
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
                  <div className="dpw-label">Recommended CTA</div>
                  <p>
                    {packet.suggested_copy &&
                    typeof packet.suggested_copy === 'object' &&
                    'cta' in packet.suggested_copy
                      ? String((packet.suggested_copy as { cta?: unknown }).cta ?? '—')
                      : '—'}
                  </p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Suggested page sections</div>
                  {(packet.suggested_page_sections ?? []).length === 0 ? (
                    <p className="dpw-muted">—</p>
                  ) : (
                    <ul className="dpw-bullet-list">
                      {(packet.suggested_page_sections ?? []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Form fields</div>
                  <FormFieldsList form_fields={packet.form_fields} />
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Creator instructions</div>
                  <p>{packet.creator_instructions || '—'}</p>
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Quality checklist</div>
                  {(packet.quality_checklist ?? []).length === 0 ? (
                    <p className="dpw-muted">—</p>
                  ) : (
                    <ul className="dpw-bullet-list">
                      {(packet.quality_checklist ?? []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="dpw-block">
                  <div className="dpw-label">Launch checklist</div>
                  {(packet.launch_checklist ?? []).length === 0 ? (
                    <p className="dpw-muted">—</p>
                  ) : (
                    <ul className="dpw-bullet-list">
                      {(packet.launch_checklist ?? []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Submission */}
          <section className="dpw-card dpw-card--submit">
            <h2 className="dpw-card-title">Submit deliverable</h2>
            <p className="dpw-muted">
              Add preview and delivery URLs when ready. Submission marks your deliverable as <strong>Submitted</strong> and moves the project to{' '}
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
        </>
      ) : null}
    </div>
  );
}
