import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectProposalRow } from '../types/database';
import { fetchDeliverableByOrderId, type DeliverablePlaceholder, type OrderPipelineRow } from '../lib/orders';
import {
  getHandoffDisplayStatus,
  HANDOFF_STATUS_COLORS,
  HANDOFF_STATUS_LABELS,
  handoffStatusLabel,
  buyerReviewStatusLabel,
  buyerCanReviewDelivery,
  submitCreatorPreview,
  submitCreatorFinalDelivery,
  updateCreatorDelivery,
  buyerAcceptDelivery,
  buyerRequestRevision,
  buildBuyerHandoffChecklist,
  buildCreatorHandoffChecklist,
  formatHandoffDate,
  displayNotes,
  displayUrl,
} from '../lib/deliverables';
import { analyzeDeliveryHandoff, type DeliveryInsightSeverity } from '../lib/deliveryAI';
import { buildMessagesHref } from '../lib/messages';
import './DeliverablesHandoffPanel.css';

type PanelRole = 'buyer' | 'creator';

const SEV_CLASS: Record<DeliveryInsightSeverity, string> = {
  urgent: 'dpw-handoff-ai-sev--urgent',
  warning: 'dpw-handoff-ai-sev--warn',
  ready: 'dpw-handoff-ai-sev--ready',
  info: 'dpw-handoff-ai-sev--info',
  positive: 'dpw-handoff-ai-sev--ok',
};

function HandoffBadge({
  order,
  deliverable,
}: {
  order: OrderPipelineRow;
  deliverable: DeliverablePlaceholder | null;
}) {
  const status = getHandoffDisplayStatus(order, deliverable);
  const color = HANDOFF_STATUS_COLORS[status];
  return (
    <span
      className="dpw-handoff-badge"
      style={{
        color,
        borderColor: `${color}55`,
        background: `${color}14`,
      }}
    >
      {HANDOFF_STATUS_LABELS[status]}
    </span>
  );
}

function LinkDisplay({ url, emptyLabel }: { url: string | null | undefined; emptyLabel: string }) {
  const text = displayUrl(url, emptyLabel);
  if (!url?.trim()) {
    return <p className="dpw-handoff-muted">{emptyLabel}</p>;
  }
  const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="dpw-handoff-link">
      {text}
    </a>
  );
}

function ChecklistBlock({ items }: { items: { id: string; label: string; done: boolean }[] }) {
  return (
    <ul className="dpw-handoff-checklist">
      {items.map((item) => (
        <li key={item.id} className={item.done ? 'dpw-handoff-check--done' : 'dpw-handoff-check--todo'}>
          <span className="dpw-handoff-check-icon" aria-hidden>
            {item.done ? '✓' : '○'}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DeliverablesHandoffPanel({
  role,
  order,
  deliverable,
  proposal,
  hasBuildPacket,
  creatorProfileId,
  onDeliverableUpdated,
  onOrderUpdated,
}: {
  role: PanelRole;
  order: OrderPipelineRow;
  deliverable: DeliverablePlaceholder | null;
  proposal: ProjectProposalRow | null;
  hasBuildPacket: boolean;
  creatorProfileId: string | null;
  onDeliverableUpdated: (d: DeliverablePlaceholder | null) => void;
  onOrderUpdated: (patch: Partial<OrderPipelineRow>) => void;
}) {
  const isCreator = role === 'creator';
  const hs = getHandoffDisplayStatus(order, deliverable);

  const [previewUrl, setPreviewUrl] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [whatChanged, setWhatChanged] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const syncFormFromDeliverable = useCallback((d: DeliverablePlaceholder | null) => {
    if (!d) return;
    setPreviewUrl(d.preview_url ?? '');
    setDeliveryUrl(d.live_url ?? '');
    setGithubUrl(d.github_url ?? '');
    setNotes(d.notes ?? '');
  }, []);

  useEffect(() => {
    syncFormFromDeliverable(deliverable);
  }, [deliverable, syncFormFromDeliverable]);

  const messagesHref =
    order.request_id?.trim() && order.creator_id?.trim()
      ? buildMessagesHref({
          buyerRequestId: order.request_id.trim(),
          orderId: order.id,
          creatorProfileId: order.creator_id.trim(),
        })
      : null;

  const insights = useMemo(
    () => analyzeDeliveryHandoff({ order, deliverable, proposal, role }),
    [order, deliverable, proposal, role],
  );

  const buyerChecklist = useMemo(
    () => buildBuyerHandoffChecklist(order, deliverable, proposal),
    [order, deliverable, proposal],
  );

  const creatorChecklist = useMemo(
    () => buildCreatorHandoffChecklist(deliverable, proposal, hasBuildPacket),
    [deliverable, proposal, hasBuildPacket],
  );

  const revisionNoteText = deliverable?.revision_note?.trim() ?? '';
  const canBuyerReview = !isCreator && buyerCanReviewDelivery(deliverable);
  const showRevisionBanner = hs === 'revision_requested' && revisionNoteText;

  function flash(tone: 'ok' | 'err', text: string) {
    setFeedback({ tone, text });
    setTimeout(() => setFeedback(null), 5000);
  }

  async function reloadDeliverable() {
    const d = await fetchDeliverableByOrderId(order.id);
    onDeliverableUpdated(d);
    syncFormFromDeliverable(d);
    return d;
  }

  async function runCreatorAction(
    action: 'preview' | 'final' | 'update' | 'revision',
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    if (!creatorProfileId) return;
    setBusy(action);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      await reloadDeliverable();
      if (action === 'final' || action === 'revision') {
        onOrderUpdated({ order_status: 'in_review' });
      } else if (action === 'preview') {
        onOrderUpdated({ order_status: 'in_progress' });
      }
      flash('ok', action === 'preview' ? 'Preview submitted.' : 'Delivery saved and submitted for review.');
      setWhatChanged('');
    } else {
      flash('err', res.error ?? 'Save failed — try again.');
    }
  }

  async function handleAccept() {
    if (!deliverable?.id) return;
    setBusy('accept');
    const ok = await buyerAcceptDelivery({ orderId: order.id, deliverableId: deliverable.id });
    setBusy(null);
    if (ok) {
      await reloadDeliverable();
      onOrderUpdated({ order_status: 'completed' });
      setShowReview(false);
      flash('ok', 'Delivery accepted — project marked complete.');
    } else {
      flash('err', 'Could not accept delivery. Try again.');
    }
  }

  async function handleRequestRevision() {
    if (!deliverable?.id) return;
    const note = revisionNote.trim();
    if (!note) {
      flash('err', 'Add a revision note so the creator knows what to change.');
      return;
    }
    setBusy('revision');
    const ok = await buyerRequestRevision({
      orderId: order.id,
      deliverableId: deliverable.id,
      revisionNote: note,
      currentRevisionCount: deliverable.revision_count ?? 0,
    });
    setBusy(null);
    if (ok) {
      await reloadDeliverable();
      onOrderUpdated({ order_status: 'in_progress' });
      setShowReview(false);
      setRevisionNote('');
      flash('ok', 'Revision requested — creator has been notified via project status.');
    } else {
      flash('err', 'Could not save revision request.');
    }
  }

  const emptyCreator = !deliverable && isCreator;
  const emptyBuyer = !deliverable && !isCreator;

  return (
    <section className="dpw-card dpw-card--handoff" id="deliverables">
      <div className="dpw-handoff-head">
        <div>
          <h2 className="dpw-card-title">Deliverables &amp; Handoff</h2>
          <p className="dpw-muted dpw-handoff-sub">
            {isCreator
              ? 'Submit preview and final delivery links when your build is ready.'
              : 'Review creator delivery, accept when ready, or request revisions.'}
          </p>
        </div>
        <HandoffBadge order={order} deliverable={deliverable} />
      </div>

      {/* AI Delivery Monitor */}
      {insights.length > 0 ?
        (
          <div className="dpw-handoff-ai" aria-label="AI Delivery Monitor">
            <h3 className="dpw-handoff-ai-title">AI Delivery Monitor</h3>
            <ul className="dpw-handoff-ai-list">
              {insights.slice(0, 4).map((ins) => (
                <li key={ins.id} className="dpw-handoff-ai-item">
                  <span className={`dpw-handoff-ai-sev ${SEV_CLASS[ins.severity]}`}>{ins.severity}</span>
                  <div className="dpw-handoff-ai-body">
                    <strong>{ins.title}</strong>
                    <p>{ins.explanation}</p>
                    <p className="dpw-handoff-ai-action">{ins.recommendedAction}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      : null}

      {/* Empty states */}
      {emptyBuyer ?
        (
          <div className="dpw-handoff-empty">
            <p>Waiting for creator delivery.</p>
            <p className="dpw-muted">Preview and final links will appear here once submitted.</p>
            {messagesHref ?
              (
                <Link className="btn btn-ghost btn-sm" to={messagesHref}>
                  Message creator about delivery
                </Link>
              )
            : null}
          </div>
        )
      : null}

      {emptyCreator ?
        (
          <div className="dpw-handoff-empty">
            <p>Submit preview or final delivery when ready.</p>
            <p className="dpw-muted">Submit a preview first if the buyer should review before final handoff.</p>
          </div>
        )
      : null}

      {/* Revision banner */}
      {showRevisionBanner ?
        (
          <div className="dpw-handoff-revision-banner" role="alert">
            <strong>Revision requested</strong>
            <p>{revisionNoteText}</p>
            {isCreator ?
              <p className="dpw-muted">Update your delivery below and describe what changed.</p>
            : (
              <p className="dpw-muted">Waiting for creator update.</p>
            )}
          </div>
        )
      : null}

      {/* Delivery details grid */}
      {(deliverable || isCreator) && !emptyBuyer ?
        (
          <>
            <dl className="dpw-handoff-meta">
              <div>
                <dt>Preview link</dt>
                <dd>
                  {!isCreator && !deliverable?.preview_url?.trim() ?
                    <span className="dpw-handoff-muted">Not submitted yet</span>
                  : isCreator ?
                    <LinkDisplay url={deliverable?.preview_url} emptyLabel="Not submitted yet" />
                  : (
                    <LinkDisplay url={deliverable?.preview_url} emptyLabel="Not submitted yet" />
                  )}
                </dd>
              </div>
              <div>
                <dt>Final delivery link</dt>
                <dd>
                  <LinkDisplay url={deliverable?.live_url} emptyLabel="Not submitted yet" />
                </dd>
              </div>
              <div className="dpw-handoff-meta--wide">
                <dt>Delivery notes</dt>
                <dd className="dpw-handoff-notes">{displayNotes(deliverable?.notes)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{handoffStatusLabel(order, deliverable)}</dd>
              </div>
              <div>
                <dt>Buyer review status</dt>
                <dd>{buyerReviewStatusLabel(order, deliverable)}</dd>
              </div>
              {revisionNoteText && hs !== 'revision_requested' ?
                (
                  <div className="dpw-handoff-meta--wide">
                    <dt>Last revision notes</dt>
                    <dd className="dpw-handoff-notes">{revisionNoteText}</dd>
                  </div>
                )
              : null}
              <div>
                <dt>Submitted date</dt>
                <dd>{formatHandoffDate(deliverable?.submitted_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatHandoffDate(deliverable?.updated_at)}</dd>
              </div>
            </dl>

            {/* Checklists */}
            <div className="dpw-handoff-checklists">
              <div>
                <h3 className="dpw-handoff-section-title">
                  {isCreator ? 'Creator handoff checklist' : 'Buyer handoff checklist'}
                </h3>
                <ChecklistBlock items={isCreator ? creatorChecklist : buyerChecklist} />
              </div>
            </div>

            {/* Buyer review */}
            {!isCreator && deliverable ?
              (
                <div className="dpw-handoff-buyer-actions">
                  {(hs === 'approved' || hs === 'completed') ?
                    (
                      <p className="dpw-handoff-success">Delivery accepted — thank you for reviewing.</p>
                    )
                  : hs === 'revision_requested' ?
                    (
                      <p className="dpw-muted">Waiting for creator update.</p>
                    )
                  : canBuyerReview ?
                    (
                      <>
                        {!showReview ?
                          (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setShowReview(true)}
                            >
                              Review delivery
                            </button>
                          )
                        : (
                          <div className="dpw-handoff-review-panel">
                            <p className="dpw-muted">
                              Open the preview and final links above. Accept when scope matches your agreement, or
                              request a revision with clear notes.
                            </p>
                            <label className="dpw-field dpw-field--full">
                              <span>Revision note (only if requesting changes)</span>
                              <textarea
                                rows={3}
                                value={revisionNote}
                                onChange={(e) => setRevisionNote(e.target.value)}
                                placeholder="Describe what needs to change…"
                              />
                            </label>
                            <div className="dpw-handoff-action-row">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy !== null}
                                onClick={() => void handleAccept()}
                              >
                                {busy === 'accept' ? 'Saving…' : 'Accept delivery'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy !== null || !revisionNote.trim()}
                                onClick={() => void handleRequestRevision()}
                              >
                                {busy === 'revision' ? 'Saving…' : 'Request revision'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowReview(false)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  : (
                    <p className="dpw-muted">Delivery links will be available for review once the creator submits.</p>
                  )}
                  {messagesHref ?
                    (
                      <Link className="btn btn-ghost btn-sm dpw-handoff-msg-btn" to={messagesHref}>
                        Message creator about delivery
                      </Link>
                    )
                  : null}
                </div>
              )
            : null}

            {/* Creator forms */}
            {isCreator && creatorProfileId ?
              (
                <div className="dpw-handoff-creator-forms">
                  <p className="dpw-handoff-helper">
                    Submit a preview first if the buyer should review before final handoff.
                  </p>

                  <div className="dpw-handoff-form-block">
                    <h3 className="dpw-handoff-section-title">Submit preview</h3>
                    <div className="dpw-form-grid">
                      <label className="dpw-field dpw-field--full">
                        <span>Preview URL</span>
                        <input
                          type="url"
                          value={previewUrl}
                          onChange={(e) => setPreviewUrl(e.target.value)}
                          placeholder="https://preview.example.com"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy !== null || !previewUrl.trim()}
                      onClick={() =>
                        void runCreatorAction('preview', () =>
                          submitCreatorPreview({
                            orderId: order.id,
                            creatorProfileId,
                            previewUrl,
                            notes,
                          }),
                        )
                      }
                    >
                      {busy === 'preview' ? 'Saving…' : 'Submit preview'}
                    </button>
                  </div>

                  <div className="dpw-handoff-form-block">
                    <h3 className="dpw-handoff-section-title">
                      {hs === 'revision_requested' ? 'Respond to revision' : 'Submit final delivery'}
                    </h3>
                    <div className="dpw-form-grid">
                      <label className="dpw-field">
                        <span>Preview URL (optional)</span>
                        <input
                          type="url"
                          value={previewUrl}
                          onChange={(e) => setPreviewUrl(e.target.value)}
                          placeholder="https://preview.example.com"
                          autoComplete="off"
                        />
                      </label>
                      <label className="dpw-field">
                        <span>Final delivery URL</span>
                        <input
                          type="url"
                          value={deliveryUrl}
                          onChange={(e) => setDeliveryUrl(e.target.value)}
                          placeholder="https://yoursite.com"
                          autoComplete="off"
                          required
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
                        <span>Delivery notes</span>
                        <textarea
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="What was delivered, test credentials, etc."
                        />
                      </label>
                      {hs === 'revision_requested' ?
                        (
                          <label className="dpw-field dpw-field--full">
                            <span>What changed since last revision</span>
                            <textarea
                              rows={2}
                              value={whatChanged}
                              onChange={(e) => setWhatChanged(e.target.value)}
                              placeholder="Summarize fixes or updates…"
                            />
                          </label>
                        )
                      : null}
                    </div>
                    <div className="dpw-handoff-action-row">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null || !deliveryUrl.trim()}
                        onClick={() =>
                          void runCreatorAction(hs === 'revision_requested' ? 'revision' : 'final', () =>
                            submitCreatorFinalDelivery({
                              orderId: order.id,
                              creatorProfileId,
                              previewUrl,
                              deliveryUrl,
                              githubUrl,
                              notes,
                              whatChanged: hs === 'revision_requested' ? whatChanged : undefined,
                            }),
                          )
                        }
                      >
                        {busy === 'final' || busy === 'revision' ? 'Saving…' : hs === 'revision_requested' ? 'Resubmit delivery' : 'Submit final delivery'}
                      </button>
                      {deliverable ?
                        (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy !== null}
                            onClick={() =>
                              void runCreatorAction('update', () =>
                                updateCreatorDelivery({
                                  orderId: order.id,
                                  creatorProfileId,
                                  previewUrl,
                                  deliveryUrl,
                                  githubUrl,
                                  notes,
                                }),
                              )
                            }
                          >
                            {busy === 'update' ? 'Saving…' : 'Update delivery'}
                          </button>
                        )
                      : null}
                    </div>
                  </div>

                  {messagesHref ?
                    (
                      <Link className="btn btn-ghost btn-sm" to={messagesHref}>
                        Message buyer about delivery
                      </Link>
                    )
                  : null}
                </div>
              )
            : null}
          </>
        )
      : null}

      {feedback ?
        (
          <p
            className={`dpw-feedback${feedback.tone === 'ok' ? ' dpw-feedback--ok' : ' dpw-feedback--err'}`}
            role="status"
          >
            {feedback.text}
          </p>
        )
      : null}
    </section>
  );
}
