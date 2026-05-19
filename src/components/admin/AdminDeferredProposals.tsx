import { useState } from 'react';
import AdminProposalSection from '../AdminProposalSection';
import type { BuyerRequestRow } from '../../types/database';
import type { BuildPacketSnippet } from '../../lib/proposals';
import { fetchOrderByRequestId } from '../../lib/orders';
import type { OrderPipelineRow } from '../../lib/orders';

export default function AdminDeferredProposals({
  buyerRequests,
}: {
  buyerRequests: BuyerRequestRow[];
}) {
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [order, setOrder] = useState<OrderPipelineRow | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  const selected = buyerRequests.find((r) => r.id === selectedRequestId);

  async function handleSelectRequest(id: string) {
    setSelectedRequestId(id);
    setOrder(null);
    if (!id) return;
    setLoadingOrder(true);
    try {
      const o = await fetchOrderByRequestId(id);
      setOrder(o);
    } finally {
      setLoadingOrder(false);
    }
  }

  return (
    <section className="admin-section admin-section--dim admin-deferred-proposals" id="section-deferred">
      <details>
        <summary className="admin-deferred-summary">
          <span className="admin-deferred-title">Later: Proposal &amp; Payment Workflow</span>
          <span className="admin-deferred-tag">Deferred</span>
        </summary>
        <div className="admin-deferred-body">
          <p className="admin-deferred-intro">
            Proposal, pricing, payment, and agreement complexity are <strong>deferred</strong>. No active payment or
            proposal enforcement runs in production flows. Buyer and creator dashboards may show read-only proposal
            placeholders where data already exists. Use this panel only for testing or migrating legacy rows — not for
            day-to-day operations.
          </p>
          <ul className="admin-deferred-list">
            <li>Payment / Stripe — not connected</li>
            <li>Agreement / handoff security — future phase</li>
            <li>Main admin workflow — accounts, marketplace, projects, deliverables, workflows</li>
          </ul>

          {buyerRequests.length > 0 ?
            (
              <DeferredPicker
                buyerRequests={buyerRequests}
                selectedRequestId={selectedRequestId}
                selected={selected}
                loadingOrder={loadingOrder}
                order={order}
                onSelectRequest={handleSelectRequest}
              />
            )
          : <p className="subtle">No buyer requests loaded — proposal test UI unavailable.</p>}
        </div>
      </details>
    </section>
  );
}

function DeferredPicker({
  buyerRequests,
  selectedRequestId,
  selected,
  loadingOrder,
  order,
  onSelectRequest,
}: {
  buyerRequests: BuyerRequestRow[];
  selectedRequestId: string;
  selected: BuyerRequestRow | undefined;
  loadingOrder: boolean;
  order: OrderPipelineRow | null;
  onSelectRequest: (id: string) => void;
}) {
  return (
    <div className="admin-deferred-picker">
      <label className="admin-deferred-label">
        Test proposal tools for a request (optional)
        <select
          className="admin-deferred-select"
          value={selectedRequestId}
          onChange={(e) => void onSelectRequest(e.target.value)}
        >
          <option value="">— Select buyer request —</option>
          {buyerRequests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.business_name ?? 'Request'} · {r.build_type ?? '—'}
            </option>
          ))}
        </select>
      </label>
      {selected && loadingOrder ? <p className="subtle">Loading linked project…</p> : null}
      {selected && !loadingOrder ?
        (
          <AdminProposalSection
            buyerRequest={selected}
            order={order}
            packetSnippet={null as BuildPacketSnippet | null}
            onReload={async () => {
              await onSelectRequest(selectedRequestId);
            }}
          />
        )
      : null}
    </div>
  );
}
