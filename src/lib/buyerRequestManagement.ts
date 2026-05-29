/**
 * Buyer request cancel / archive / safe delete — no hard-delete when linked activity exists.
 */

import { supabase } from './supabase';
import { verifyBuyerOwnsRequest } from './marketplace';
import type { BuyerRequestSnap } from './buyerRequestMonitor';
import { isBuyerRequestActiveList } from './buyerRequestMonitor';
import type { DeliverablePlaceholder, OrderPipelineRow } from './orders';

const LOG = '[buyerRequestManagement]';

export type BuyerRequestVisibility = 'active' | 'canceled' | 'archived' | 'deleted';

export interface BuyerRequestActivitySummary {
  requestId: string;
  applicantCount: number;
  messageCount: number;
  hasOrder: boolean;
  hasProposal: boolean;
  hasDeliverable: boolean;
  hasSelectedCreator: boolean;
  canHardDelete: boolean;
  canCancel: boolean;
  canArchive: boolean;
}

export interface ManageBuyerRequestResult {
  ok: boolean;
  error?: string;
}

function norm(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

function countForRequest(map: Record<string, number>, id: string): number {
  return map[id] ?? 0;
}

/** Batch-fetch message + proposal presence for safety checks */
export async function fetchBuyerRequestActivityMap(
  requestIds: string[],
  ordersByRequestId: Record<string, OrderPipelineRow>,
  deliverablesByOrderId: Record<string, DeliverablePlaceholder | null | undefined>,
  requests: BuyerRequestSnap[],
): Promise<Record<string, BuyerRequestActivitySummary>> {
  const ids = [...new Set(requestIds.filter(Boolean))];
  const out: Record<string, BuyerRequestActivitySummary> = {};

  if (ids.length === 0) return out;

  const messageCounts: Record<string, number> = {};
  const proposalIds = new Set<string>();

  const { data: msgRows, error: msgErr } = await supabase
    .from('project_messages')
    .select('buyer_request_id')
    .in('buyer_request_id', ids);

  if (msgErr) console.error(`${LOG} project_messages:`, msgErr);
  for (const row of (msgRows ?? []) as { buyer_request_id?: string | null }[]) {
    const rid = typeof row.buyer_request_id === 'string' ? row.buyer_request_id.trim() : '';
    if (rid) messageCounts[rid] = (messageCounts[rid] ?? 0) + 1;
  }

  const { data: propRows, error: propErr } = await supabase
    .from('project_proposals')
    .select('buyer_request_id')
    .in('buyer_request_id', ids);

  if (propErr) console.error(`${LOG} project_proposals:`, propErr);
  for (const row of (propRows ?? []) as { buyer_request_id?: string | null }[]) {
    const rid = typeof row.buyer_request_id === 'string' ? row.buyer_request_id.trim() : '';
    if (rid) proposalIds.add(rid);
  }

  for (const r of requests) {
    if (!ids.includes(r.id)) continue;
    const ord = ordersByRequestId[r.id];
    const del = ord?.id ? deliverablesByOrderId[ord.id] : null;
    const applicantCount = typeof r.applications_count === 'number' ? r.applications_count : 0;
    const messageCount = countForRequest(messageCounts, r.id);
    const hasOrder = Boolean(ord?.id);
    const hasProposal = proposalIds.has(r.id) || Boolean(ord?.proposal_id?.trim());
    const hasDeliverable = Boolean(del?.id);
    const hasSelectedCreator = Boolean(r.selected_creator_profile_id?.trim());

    const hasLinkedActivity =
      applicantCount > 0 ||
      messageCount > 0 ||
      hasOrder ||
      hasProposal ||
      hasDeliverable ||
      hasSelectedCreator;

    out[r.id] = {
      requestId: r.id,
      applicantCount,
      messageCount,
      hasOrder,
      hasProposal,
      hasDeliverable,
      hasSelectedCreator,
      canHardDelete: !hasLinkedActivity,
      canCancel: hasLinkedActivity && !hasOrder && !hasSelectedCreator,
      canArchive: true,
    };
  }

  return out;
}

export function assessBuyerRequestActivityFromRow(
  r: BuyerRequestSnap,
  order: OrderPipelineRow | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
  messageCount = 0,
  hasProposal = false,
): BuyerRequestActivitySummary {
  const applicantCount = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const hasOrder = Boolean(order?.id);
  const hasDeliverable = Boolean(deliverable?.id);
  const hasSelectedCreator = Boolean(r.selected_creator_profile_id?.trim());
  const hasProp = hasProposal || Boolean(order?.proposal_id?.trim());

  const hasLinkedActivity =
    applicantCount > 0 ||
    messageCount > 0 ||
    hasOrder ||
    hasProp ||
    hasDeliverable ||
    hasSelectedCreator;

  return {
    requestId: r.id,
    applicantCount,
    messageCount,
    hasOrder,
    hasProposal: hasProp,
    hasDeliverable,
    hasSelectedCreator,
    canHardDelete: !hasLinkedActivity,
    canCancel: hasLinkedActivity && !hasOrder && !hasSelectedCreator,
    canArchive: true,
  };
}

async function verifyOwn(
  requestId: string,
  buyerEmail: string,
  authUserId?: string | null,
): Promise<boolean> {
  return verifyBuyerOwnsRequest(requestId, buyerEmail, { authUserId: authUserId ?? null });
}

export async function cancelBuyerRequest(params: {
  requestId: string;
  buyerEmail: string;
  authUserId?: string | null;
  reason?: string;
}): Promise<ManageBuyerRequestResult> {
  const own = await verifyOwn(params.requestId, params.buyerEmail, params.authUserId);
  if (!own) return { ok: false, error: 'You cannot manage this request.' };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    canceled_at: now,
    request_visibility: 'canceled',
    visibility_status: 'closed',
    application_status: 'closed',
    updated_at: now,
  };
  if (params.reason?.trim()) patch.cancellation_reason = params.reason.trim();

  const { error } = await supabase.from('buyer_requests').update(patch).eq('id', params.requestId);
  if (error) {
    console.error(`${LOG} cancel:`, error);
    return { ok: false, error: 'Could not cancel request. If this persists, run buyer-request-management-fields.sql.' };
  }
  return { ok: true };
}

export async function archiveBuyerRequest(params: {
  requestId: string;
  buyerEmail: string;
  authUserId?: string | null;
}): Promise<ManageBuyerRequestResult> {
  const own = await verifyOwn(params.requestId, params.buyerEmail, params.authUserId);
  if (!own) return { ok: false, error: 'You cannot manage this request.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('buyer_requests')
    .update({
      archived_at: now,
      request_visibility: 'archived',
      updated_at: now,
    })
    .eq('id', params.requestId);

  if (error) {
    console.error(`${LOG} archive:`, error);
    return { ok: false, error: 'Could not archive request. If this persists, run buyer-request-management-fields.sql.' };
  }
  return { ok: true };
}

export async function deleteBuyerRequestSafe(params: {
  requestId: string;
  buyerEmail: string;
  authUserId?: string | null;
  activity: BuyerRequestActivitySummary;
}): Promise<ManageBuyerRequestResult> {
  if (!params.activity.canHardDelete) {
    return {
      ok: false,
      error: 'This request has activity, so it can be canceled or archived instead.',
    };
  }

  const own = await verifyOwn(params.requestId, params.buyerEmail, params.authUserId);
  if (!own) return { ok: false, error: 'You cannot delete this request.' };

  const { count: appCount, error: appErr } = await supabase
    .from('request_applications')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_request_id', params.requestId);

  if (appErr) console.error(`${LOG} delete verify apps:`, appErr);
  if ((appCount ?? 0) > 0) {
    return { ok: false, error: 'Applicants exist — cancel or archive instead.' };
  }

  const { count: msgCount, error: msgErr } = await supabase
    .from('project_messages')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_request_id', params.requestId);

  if (msgErr) console.error(`${LOG} delete verify messages:`, msgErr);
  if ((msgCount ?? 0) > 0) {
    return { ok: false, error: 'Messages exist — cancel or archive instead.' };
  }

  const { count: ordCount, error: ordErr } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', params.requestId);

  if (ordErr) console.error(`${LOG} delete verify orders:`, ordErr);
  if ((ordCount ?? 0) > 0) {
    return { ok: false, error: 'A linked project exists — cancel or archive instead.' };
  }

  const { error } = await supabase.from('buyer_requests').delete().eq('id', params.requestId);
  if (error) {
    console.error(`${LOG} delete:`, error);
    return { ok: false, error: 'Could not delete request.' };
  }
  return { ok: true };
}

export function requestLifecycleLabel(r: BuyerRequestSnap): string | null {
  if (norm(r.deleted_at) || norm(r.request_visibility) === 'deleted') return 'Deleted';
  if (norm(r.archived_at) || norm(r.request_visibility) === 'archived') return 'Archived';
  if (norm(r.canceled_at) || norm(r.request_visibility) === 'canceled') return 'Canceled';
  return null;
}

export function isRequestHiddenFromActive(r: BuyerRequestSnap): boolean {
  return !isBuyerRequestActiveList(r);
}
