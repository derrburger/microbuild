import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CentralMessageLauncher from '../CentralMessageLauncher';
import {
  fetchOrdersByCreatorProfile,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_PIPELINE_STAGES,
  orderTimelineIndex,
  getNextOrderAction,
} from '../../lib/orders';
import type { OrderPipelineRow } from '../../lib/orders';

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function CreatorProjectsPanel({
  creatorProfileId,
  compact = false,
}: {
  creatorProfileId: string;
  /** When true, show at most 4 active projects (overview). */
  compact?: boolean;
}) {
  const [orders, setOrders] = useState<OrderPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchOrdersByCreatorProfile(creatorProfileId).then((data) => {
      setOrders(data);
      setLoading(false);
    });
  }, [creatorProfileId]);

  const STAGES = [
    { id: 'assigned', label: 'Assigned', color: '#63b3ed' },
    { id: 'in_progress', label: 'In Progress', color: '#f9b032' },
    { id: 'in_review', label: 'In Review', color: '#f97316' },
    { id: 'delivered', label: 'Delivered', color: '#00d478' },
    { id: 'completed', label: 'Completed', color: '#00d478' },
  ];

  const activeOrders = orders.filter((o) => !['completed', 'rejected', 'canceled'].includes(o.order_status));
  const displayOrders = compact ? activeOrders.slice(0, 4) : orders;

  return (
    <div className="cd-pipeline-card">
      <div className="cd-pipeline-header">
        <h3 className="cd-card-title">{compact ? 'Project Pipeline' : 'My Projects'}</h3>
        {!loading && (
          <span className="cd-pipeline-live-badge">
            {orders.length > 0 ? `${orders.length} project${orders.length !== 1 ? 's' : ''}` : 'No projects yet'}
          </span>
        )}
      </div>

      {loading ?
        <div className="cd-pipeline-loading">Loading projects…</div>
      : orders.length === 0 ?
        (
          <div className="cd-pipeline-empty">
            <p>Selected projects will appear here after a buyer chooses you.</p>
            <p className="cd-pipeline-empty-sub">
              <Link to="/browse">Browse buyer requests</Link> and apply, or check{' '}
              <Link to="/dashboard/applications">My Applications</Link>.
            </p>
          </div>
        )
      : (
        <>
          <div className="cd-pipeline-stages">
            {STAGES.map((s) => {
              const count = orders.filter((o) => o.order_status === s.id).length;
              return (
                <div key={s.id} className={`cd-pipeline-stage${count > 0 ? ' cd-pipeline-stage--active' : ''}`}>
                  <div className="cd-pipeline-count" style={{ color: count > 0 ? s.color : undefined }}>
                    {count > 0 ? count : '—'}
                  </div>
                  <div className="cd-pipeline-label">{s.label}</div>
                </div>
              );
            })}
          </div>

          <div className="cd-project-list">
            {displayOrders.map((order) => {
              const sColor = ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6';
              const tIdx = orderTimelineIndex(order.order_status);
              return (
                <div key={order.id} className="cd-project-card">
                  <div className="cd-project-title">
                    {order.project_title ?? `Project ${order.id.slice(0, 8)}…`}
                  </div>
                  <div className="cd-project-type">{order.project_type ?? '—'}</div>
                  <div className="cd-project-mini-tl" aria-hidden>
                    {ORDER_PIPELINE_STAGES.map((s, i) => {
                      const done = i < tIdx;
                      const active = i === tIdx;
                      const c = ORDER_STATUS_COLORS[s.id] ?? '#8a94a6';
                      return (
                        <div
                          key={s.id}
                          className={`cd-mini-tick${done || active ? ' on' : ''}`}
                          style={{ background: done || active ? c : 'var(--border)' }}
                          title={s.label}
                        />
                      );
                    })}
                  </div>
                  <div className="cd-project-footer">
                    <span
                      className="cd-project-status-badge"
                      style={{ color: sColor, borderColor: `${sColor}44`, background: `${sColor}11` }}
                    >
                      {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                    </span>
                    <span className="cd-project-date">{fmtDate(order.created_at)}</span>
                  </div>
                  <div className="cd-project-next">→ {getNextOrderAction(order.order_status)}</div>
                  {order.request_id?.trim() && order.creator_id?.trim() ?
                    (
                      <CentralMessageLauncher
                        buyerRequestId={order.request_id.trim()}
                        creatorProfileId={order.creator_id.trim()}
                        orderId={order.id}
                        variant="inline"
                        label="Message buyer"
                        className="cd-project-msg"
                      />
                    )
                  : null}
                  <Link className="cd-project-open" to={`/dashboard/projects/${order.id}`}>
                    Open workspace →
                  </Link>
                </div>
              );
            })}
          </div>
          {compact && activeOrders.length > 4 ?
            (
              <p className="cd-project-more-link subtle">
                <Link to="/dashboard/projects">View all {activeOrders.length} active projects →</Link>
              </p>
            )
          : null}
        </>
      )}
    </div>
  );
}
