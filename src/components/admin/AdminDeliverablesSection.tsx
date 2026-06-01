import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  adminReviewDeliverable,
  ORDER_STATUS_LABELS,
} from '../../lib/orders';
import {
  getHandoffDisplayStatus,
  HANDOFF_STATUS_LABELS,
  handoffStatusLabel,
  buyerReviewStatusLabel,
  formatHandoffDate,
  displayNotes,
} from '../../lib/deliverables';
import type { DeliverablePlaceholder, OrderPipelineRow } from '../../lib/orders';

export default function AdminDeliverablesSection({
  orders,
  bizByOrderId,
  creatorNameById,
  onOrderUpdate,
}: {
  orders: OrderPipelineRow[];
  bizByOrderId: Record<string, string>;
  creatorNameById: Record<string, string>;
  onOrderUpdate: (id: string, updates: Partial<OrderPipelineRow>) => void;
}) {
  const [deliverables, setDeliverables] = useState<Record<string, DeliverablePlaceholder>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revisionByOrder, setRevisionByOrder] = useState<Record<string, string>>({});

  useEffect(() => {
    if (orders.length === 0) {
      setDeliverables({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const ids = orders.map((o) => o.id);
    supabase
      .from('deliverables')
      .select(
        'id, order_id, creator_id, creator_profile_id, live_url, preview_url, github_url, notes, delivery_status, revision_note, revision_count, approved_at, submitted_at, updated_at',
      )
      .in('order_id', ids)
      .then(({ data, error }) => {
        if (error) console.error('[Admin] deliverables section:', error);
        const map: Record<string, DeliverablePlaceholder> = {};
        for (const row of data ?? []) {
          map[(row as DeliverablePlaceholder).order_id] = row as DeliverablePlaceholder;
        }
        setDeliverables(map);
        setLoading(false);
      });
  }, [orders]);

  const rows = useMemo(() => {
    return orders.map((o) => ({ order: o, del: deliverables[o.id] ?? null }));
  }, [orders, deliverables]);

  const displayRows = useMemo(() => {
    const withDel = rows.filter(({ del }) => del != null) as Array<{
      order: OrderPipelineRow;
      del: DeliverablePlaceholder;
    }>;
    const pending = withDel.filter(({ order, del }) => {
      const hs = getHandoffDisplayStatus(order, del);
      return hs === 'delivery_submitted' || hs === 'revision_requested' || hs === 'preview_submitted';
    });
    return pending.length > 0 ? pending : withDel;
  }, [rows]);

  const emptyCount = rows.filter(({ del }) => !del).length;

  async function runReview(
    order: OrderPipelineRow,
    del: DeliverablePlaceholder,
    action: 'request_revision' | 'approve_deliverable' | 'mark_delivered' | 'mark_completed',
  ) {
    setBusyId(order.id);
    const note = revisionByOrder[order.id]?.trim() || del.revision_note?.trim() || 'Please revise and resubmit.';
    let ok = false;
    if (action === 'request_revision') {
      ok = await adminReviewDeliverable({
        deliverableId: del.id,
        orderId: order.id,
        action: 'request_revision',
        revisionNote: note,
        currentRevisionCount: del.revision_count ?? 0,
      });
      if (ok) onOrderUpdate(order.id, { order_status: 'in_progress' });
    } else if (action === 'approve_deliverable') {
      ok = await adminReviewDeliverable({ deliverableId: del.id, orderId: order.id, action: 'approve_deliverable' });
      if (ok) onOrderUpdate(order.id, { order_status: 'delivered' });
    } else if (action === 'mark_delivered') {
      ok = await adminReviewDeliverable({ deliverableId: null, orderId: order.id, action: 'mark_delivered' });
      if (ok) onOrderUpdate(order.id, { order_status: 'delivered' });
    } else {
      ok = await adminReviewDeliverable({ deliverableId: null, orderId: order.id, action: 'mark_completed' });
      if (ok) onOrderUpdate(order.id, { order_status: 'completed' });
    }
    setBusyId(null);
    if (ok) {
      const { data } = await supabase.from('deliverables').select('*').eq('order_id', order.id).maybeSingle();
      if (data) setDeliverables((prev) => ({ ...prev, [order.id]: data as DeliverablePlaceholder }));
    }
  }

  return (
    <section className="admin-section" id="section-deliverables">
      <div className="admin-section-header">
        <h2>Deliverables Oversight</h2>
        <span className="admin-count">{rows.filter(({ del }) => del).length}</span>
      </div>
      <p className="admin-section-intro">
        Monitor creator submissions and buyer handoff. Buyers accept or request revision on the project workspace —
        admin action is optional oversight only.
      </p>

      {loading ?
        <div className="admin-state-row admin-loading">Loading deliverables…</div>
      : rows.length === 0 ?
        <div className="admin-state-row admin-empty">No delivery submitted yet.</div>
      : (
        <>
          {emptyCount > 0 ?
            <p className="admin-section-intro subtle">{emptyCount} project(s) with no delivery row yet.</p>
          : null}
          <div className="deliv-review-list">
            {displayRows.map(({ order, del }) => {
              if (!del) return null;
              const creatorId = del.creator_profile_id ?? del.creator_id ?? order.creator_id;
              const busy = busyId === order.id;
              const hs = getHandoffDisplayStatus(order, del);
              return (
                <article key={order.id} className="deliv-review-card">
                  <div className="deliv-review-head">
                    <h3>{order.project_title ?? `Project ${order.id.slice(0, 8)}`}</h3>
                    <span className="deliv-review-status">{HANDOFF_STATUS_LABELS[hs]}</span>
                  </div>
                  <dl className="deliv-review-dl">
                    <DelivDlRow label="Buyer / request" value={bizByOrderId[order.id] ?? '—'} />
                    <DelivDlRow
                      label="Creator"
                      value={creatorId ? creatorNameById[creatorId] ?? `${creatorId.slice(0, 8)}…` : 'Unassigned'}
                    />
                    <DelivDlRow
                      label="Project status"
                      value={ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                    />
                    <DelivDlRow label="Handoff status" value={handoffStatusLabel(order, del)} />
                    <DelivDlRow label="Buyer review" value={buyerReviewStatusLabel(order, del)} />
                    <DelivUrlRow label="Preview URL" url={del.preview_url} />
                    <DelivUrlRow label="Delivery URL" url={del.live_url} />
                    <DelivDlRow label="Submitted" value={formatHandoffDate(del.submitted_at)} />
                    <DelivDlRow label="Last updated" value={formatHandoffDate(del.updated_at)} />
                    <DelivDlRow label="Delivery notes" value={displayNotes(del.notes)} wide />
                  </dl>
                  {del.revision_note?.trim() ?
                    <blockquote className="deliv-review-revision">{del.revision_note}</blockquote>
                  : null}
                  <div className="deliv-review-actions deliv-review-actions--top">
                    <Link className="wf-action-btn" to={`/dashboard/projects/${order.id}#deliverables`}>
                      Open project workspace
                    </Link>
                  </div>
                  <label className="deliv-review-fb">
                    <span className="subtle">Admin revision note (optional override)</span>
                    <textarea
                      rows={2}
                      value={revisionByOrder[order.id] ?? ''}
                      onChange={(e) =>
                        setRevisionByOrder((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      placeholder="Optional feedback if admin must intervene…"
                    />
                  </label>
                  <div className="deliv-review-actions">
                    <button type="button" className="wf-action-btn" disabled={busy} onClick={() => void runReview(order, del, 'request_revision')}>
                      {busy ? '…' : 'Request revision (admin)'}
                    </button>
                    <button type="button" className="wf-action-btn wf-action-btn--primary" disabled={busy} onClick={() => void runReview(order, del, 'approve_deliverable')}>
                      Approve deliverable (admin)
                    </button>
                    <button type="button" className="wf-action-btn" disabled={busy} onClick={() => void runReview(order, del, 'mark_completed')}>
                      Mark completed
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function DelivDlRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'deliv-review-dl-wide' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DelivUrlRow({ label, url }: { label: string; url?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {url?.trim() ?
          <a href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        : '—'}
      </dd>
    </div>
  );
}
