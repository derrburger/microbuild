/**
 * Buyer-facing project journey stages (marketing-friendly labels).
 * Maps internal order / deliverable state to a highlight index — no fabricated timestamps.
 */

import type { OrderPipelineRow, DeliverablePlaceholder } from './orders';

export const BUYER_JOURNEY_STAGES: readonly string[] = [
  'Request Submitted',
  'Under Review',
  'Build Packet Prepared',
  'Creator Assigned',
  'In Progress',
  'In Review',
  'Delivered',
  'Completed',
];

/** Highlight index for buyer timeline UI (0..7). */
export function getBuyerJourneyActiveIndex(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): number {
  if (!order) return 1;

  const st = order.order_status;

  if (st === 'completed') return 7;
  if (st === 'delivered') return 6;
  if (st === 'in_review') return 5;
  if (st === 'in_progress' || deliverable?.delivery_status === 'revision_needed') return 4;
  if (st === 'assigned') return 3;

  if (st === 'draft') {
    if (order.build_packet_id) return 2;
    return 1;
  }

  if (st === 'ready_to_quote' || st === 'pending_payment') return 2;

  if (st === 'rejected' || st === 'canceled') return 1;

  return 1;
}

export function buyerDeliveryStatusLabel(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): string {
  if (!order) return '—';
  if (order.order_status === 'completed') return 'Completed';
  if (!deliverable) return order.order_status === 'delivered' ? 'Released — awaiting links' : 'Not submitted yet';
  if (deliverable.delivery_status === 'approved') return 'Approved for buyer';
  if (deliverable.delivery_status === 'revision_needed') return 'Revision in progress';
  if (deliverable.delivery_status === 'submitted') return 'Submitted — internal review';
  return 'Draft / preparing';
}
