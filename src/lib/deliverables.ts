/**
 * MicroBuild — Deliverables + Handoff v1
 *
 * Creator submit, buyer review, status sync, and UI helpers.
 * Uses existing `deliverables` table — no destructive schema changes.
 */

import { supabase } from './supabase';
import type { DeliveryStatus } from '../types/database';
import {
  fetchDeliverableByOrderId,
  updateOrderStatus,
  type DeliverablePlaceholder,
  type OrderPipelineRow,
} from './orders';
import type { ProjectProposalRow } from '../types/database';
import { getAgreementViewState } from './projectAgreement';

export type { DeliverablePlaceholder };

export type HandoffDisplayStatus =
  | 'not_submitted'
  | 'preview_submitted'
  | 'delivery_submitted'
  | 'revision_requested'
  | 'approved'
  | 'completed';

export const HANDOFF_STATUS_LABELS: Record<HandoffDisplayStatus, string> = {
  not_submitted: 'Not submitted',
  preview_submitted: 'Preview submitted',
  delivery_submitted: 'Delivery submitted',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  completed: 'Completed',
};

export const HANDOFF_STATUS_COLORS: Record<HandoffDisplayStatus, string> = {
  not_submitted: '#8a94a6',
  preview_submitted: '#63b3ed',
  delivery_submitted: '#f9b032',
  revision_requested: '#f97316',
  approved: '#00d478',
  completed: '#00d478',
};

export type HandoffChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function hasUrl(v: string | null | undefined): boolean {
  return Boolean(norm(v));
}

/** User-facing handoff badge — never raw DB enums. */
export function getHandoffDisplayStatus(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): HandoffDisplayStatus {
  if (order?.order_status === 'completed') return 'completed';
  if (!deliverable) return 'not_submitted';

  const ds = deliverable.delivery_status;
  if (ds === 'approved') return 'approved';
  if (ds === 'revision_needed') return 'revision_requested';

  const preview = hasUrl(deliverable.preview_url);
  const live = hasUrl(deliverable.live_url);

  if (live && (ds === 'submitted' || ds === 'draft')) return 'delivery_submitted';
  if (preview) return 'preview_submitted';
  return 'not_submitted';
}

export function handoffStatusLabel(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): string {
  return HANDOFF_STATUS_LABELS[getHandoffDisplayStatus(order, deliverable)];
}

/** Lightweight URL check — readable host, not strict RFC validation. */
export function isReadableUrl(url: string): boolean {
  const t = norm(url);
  if (!t || t.length < 4) return false;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    const host = u.hostname;
    return host.length > 0 && (host.includes('.') || host === 'localhost');
  } catch {
    return false;
  }
}

export function normalizeUrlInput(url: string): string {
  const t = norm(url);
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function buyerCanReviewDelivery(
  deliverable: DeliverablePlaceholder | null | undefined,
): boolean {
  if (!deliverable) return false;
  if (deliverable.delivery_status === 'approved') return false;
  if (deliverable.delivery_status === 'revision_needed') return false;
  return hasUrl(deliverable.preview_url) || hasUrl(deliverable.live_url);
}

export function buyerReviewStatusLabel(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): string {
  const hs = getHandoffDisplayStatus(order, deliverable);
  if (hs === 'completed' || hs === 'approved') return 'Delivery accepted';
  if (hs === 'revision_requested') return 'Revision requested';
  if (hs === 'delivery_submitted') return 'Awaiting your review';
  if (hs === 'preview_submitted') return 'Preview ready — final delivery pending';
  return 'Not ready for review';
}

export async function syncOrderStatusAfterHandoff(
  orderId: string,
  event: 'preview_submitted' | 'delivery_submitted' | 'revision_requested' | 'approved' | 'revision_resubmitted',
): Promise<boolean> {
  switch (event) {
    case 'preview_submitted':
      return updateOrderStatus(orderId, 'in_progress');
    case 'delivery_submitted':
    case 'revision_resubmitted':
      return updateOrderStatus(orderId, 'in_review');
    case 'revision_requested':
      return updateOrderStatus(orderId, 'in_progress');
    case 'approved':
      return updateOrderStatus(orderId, 'completed');
    default:
      return false;
  }
}

async function upsertDeliverableRow(params: {
  orderId: string;
  creatorProfileId: string;
  previewUrl?: string | null;
  liveUrl?: string | null;
  githubUrl?: string | null;
  notes?: string | null;
  deliveryStatus: DeliveryStatus;
  clearRevisionNote?: boolean;
}): Promise<{ ok: boolean; deliverable: DeliverablePlaceholder | null }> {
  const now = new Date().toISOString();
  const existing = await fetchDeliverableByOrderId(params.orderId);

  const patch: Record<string, unknown> = {
    creator_id: params.creatorProfileId,
    creator_profile_id: params.creatorProfileId,
    delivery_status: params.deliveryStatus,
    updated_at: now,
  };

  if (params.previewUrl !== undefined) patch.preview_url = params.previewUrl;
  if (params.liveUrl !== undefined) patch.live_url = params.liveUrl ?? '';
  if (params.githubUrl !== undefined) patch.github_url = params.githubUrl;
  if (params.notes !== undefined) patch.notes = params.notes;
  if (params.deliveryStatus === 'submitted') patch.submitted_at = now;
  if (params.clearRevisionNote) patch.revision_note = null;

  if (existing) {
    const { error } = await supabase.from('deliverables').update(patch).eq('id', existing.id);
    if (error) {
      console.error('[MicroBuild] upsertDeliverableRow update:', error);
      return { ok: false, deliverable: null };
    }
  } else {
    const { error } = await supabase.from('deliverables').insert({
      order_id: params.orderId,
      live_url: params.liveUrl ?? '',
      preview_url: params.previewUrl ?? null,
      github_url: params.githubUrl ?? null,
      notes: params.notes ?? null,
      delivery_status: params.deliveryStatus,
      submitted_at: params.deliveryStatus === 'submitted' ? now : undefined,
      ...patch,
    });
    if (error) {
      console.error('[MicroBuild] upsertDeliverableRow insert:', error);
      return { ok: false, deliverable: null };
    }
  }

  const deliverable = await fetchDeliverableByOrderId(params.orderId);
  return { ok: true, deliverable };
}

/** Creator submits preview link only. */
export async function submitCreatorPreview(params: {
  orderId: string;
  creatorProfileId: string;
  previewUrl: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const preview = normalizeUrlInput(params.previewUrl);
  if (!isReadableUrl(preview)) {
    return { ok: false, error: 'Enter a valid preview URL (e.g. https://preview.example.com).' };
  }

  const { ok } = await upsertDeliverableRow({
    orderId: params.orderId,
    creatorProfileId: params.creatorProfileId,
    previewUrl: preview,
    notes: norm(params.notes) || null,
    deliveryStatus: 'submitted',
    clearRevisionNote: false,
  });

  if (!ok) return { ok: false, error: 'Could not save preview. Try again.' };
  await syncOrderStatusAfterHandoff(params.orderId, 'preview_submitted');
  return { ok: true };
}

/** Creator submits final delivery URL (preview optional). */
export async function submitCreatorFinalDelivery(params: {
  orderId: string;
  creatorProfileId: string;
  previewUrl?: string;
  deliveryUrl: string;
  githubUrl?: string;
  notes?: string;
  whatChanged?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const live = normalizeUrlInput(params.deliveryUrl);
  if (!isReadableUrl(live)) {
    return { ok: false, error: 'Enter a valid final delivery URL before submitting.' };
  }

  const preview = params.previewUrl ? normalizeUrlInput(params.previewUrl) : null;
  if (preview && !isReadableUrl(preview)) {
    return { ok: false, error: 'Preview URL does not look valid — fix or leave blank.' };
  }

  let notes = norm(params.notes) || null;
  const changed = norm(params.whatChanged);
  if (changed) {
    notes = notes ? `${notes}\n\nChanges since revision:\n${changed}` : `Changes since revision:\n${changed}`;
  }

  const existing = await fetchDeliverableByOrderId(params.orderId);
  const isRevisionResponse = existing?.delivery_status === 'revision_needed';

  const { ok } = await upsertDeliverableRow({
    orderId: params.orderId,
    creatorProfileId: params.creatorProfileId,
    previewUrl: preview ?? existing?.preview_url ?? null,
    liveUrl: live,
    githubUrl: norm(params.githubUrl) || existing?.github_url || null,
    notes,
    deliveryStatus: 'submitted',
    clearRevisionNote: isRevisionResponse,
  });

  if (!ok) return { ok: false, error: 'Could not save delivery. Try again.' };

  await syncOrderStatusAfterHandoff(
    params.orderId,
    isRevisionResponse ? 'revision_resubmitted' : 'delivery_submitted',
  );
  return { ok: true };
}

/** Creator updates an existing delivery package. */
export async function updateCreatorDelivery(params: {
  orderId: string;
  creatorProfileId: string;
  previewUrl?: string;
  deliveryUrl?: string;
  githubUrl?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await fetchDeliverableByOrderId(params.orderId);
  const previewRaw = params.previewUrl !== undefined ? params.previewUrl : existing?.preview_url ?? '';
  const liveRaw = params.deliveryUrl !== undefined ? params.deliveryUrl : existing?.live_url ?? '';

  const preview = previewRaw ? normalizeUrlInput(previewRaw) : null;
  const live = liveRaw ? normalizeUrlInput(liveRaw) : '';

  if (!preview && !live) {
    return { ok: false, error: 'Add at least a preview or final delivery URL.' };
  }
  if (preview && !isReadableUrl(preview)) {
    return { ok: false, error: 'Preview URL does not look valid.' };
  }
  if (live && !isReadableUrl(live)) {
    return { ok: false, error: 'Final delivery URL does not look valid.' };
  }

  const { ok } = await upsertDeliverableRow({
    orderId: params.orderId,
    creatorProfileId: params.creatorProfileId,
    previewUrl: preview,
    liveUrl: live || null,
    githubUrl: norm(params.githubUrl) || existing?.github_url || null,
    notes: params.notes !== undefined ? norm(params.notes) || null : existing?.notes ?? null,
    deliveryStatus: 'submitted',
  });

  if (!ok) return { ok: false, error: 'Could not update delivery.' };

  const event = live ? 'delivery_submitted' : 'preview_submitted';
  await syncOrderStatusAfterHandoff(params.orderId, event);
  return { ok: true };
}

/** Buyer accepts delivery — marks approved and completes order. */
export async function buyerAcceptDelivery(params: {
  orderId: string;
  deliverableId: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('deliverables')
    .update({
      delivery_status: 'approved' as DeliveryStatus,
      approved_at: now,
      updated_at: now,
    })
    .eq('id', params.deliverableId);

  if (error) {
    console.error('[MicroBuild] buyerAcceptDelivery:', error);
    return false;
  }

  return syncOrderStatusAfterHandoff(params.orderId, 'approved');
}

/** Buyer requests revision with a note. */
export async function buyerRequestRevision(params: {
  orderId: string;
  deliverableId: string;
  revisionNote: string;
  currentRevisionCount?: number;
}): Promise<boolean> {
  const note = norm(params.revisionNote);
  if (!note) return false;

  const now = new Date().toISOString();
  const nextRev = (params.currentRevisionCount ?? 0) + 1;

  const { error } = await supabase
    .from('deliverables')
    .update({
      delivery_status: 'revision_needed' as DeliveryStatus,
      revision_note: note,
      revision_count: nextRev,
      updated_at: now,
    })
    .eq('id', params.deliverableId);

  if (error) {
    console.error('[MicroBuild] buyerRequestRevision:', error);
    return false;
  }

  return syncOrderStatusAfterHandoff(params.orderId, 'revision_requested');
}

export function buildBuyerHandoffChecklist(
  order: OrderPipelineRow | null | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
  proposal: ProjectProposalRow | null | undefined,
): HandoffChecklistItem[] {
  const agreement = getAgreementViewState(proposal ?? null);
  const hs = getHandoffDisplayStatus(order, deliverable);

  return [
    { id: 'preview', label: 'Preview reviewed', done: hasUrl(deliverable?.preview_url) },
    { id: 'final', label: 'Final link works', done: hasUrl(deliverable?.live_url) },
    {
      id: 'scope',
      label: 'Requested scope is included',
      done: agreement.phase === 'confirmed',
    },
    {
      id: 'revisions',
      label: 'Revisions checked',
      done: hs !== 'revision_requested' && (deliverable?.revision_count ?? 0) >= 0,
    },
    {
      id: 'accepted',
      label: 'Buyer accepted delivery',
      done: hs === 'approved' || hs === 'completed',
    },
  ];
}

export function buildCreatorHandoffChecklist(
  deliverable: DeliverablePlaceholder | null | undefined,
  proposal: ProjectProposalRow | null | undefined,
  hasBuildPacket: boolean,
): HandoffChecklistItem[] {
  const agreement = getAgreementViewState(proposal ?? null);
  const revisionPending = deliverable?.delivery_status === 'revision_needed';
  const revisionHandled =
    !revisionPending &&
    ((deliverable?.revision_count ?? 0) === 0 ||
      deliverable?.delivery_status === 'submitted' ||
      deliverable?.delivery_status === 'approved');

  return [
    {
      id: 'scope',
      label: 'Scope reviewed',
      done: hasBuildPacket || agreement.phase !== 'none',
    },
    {
      id: 'agreement',
      label: 'Agreement confirmed',
      done: agreement.phase === 'confirmed',
    },
    {
      id: 'preview',
      label: 'Preview submitted',
      done: hasUrl(deliverable?.preview_url),
    },
    {
      id: 'final',
      label: 'Final delivery submitted',
      done: hasUrl(deliverable?.live_url),
    },
    {
      id: 'revision',
      label: 'Revision handled if requested',
      done: revisionHandled,
    },
  ];
}

export function formatHandoffDate(iso: string | undefined | null): string {
  if (!iso) return 'Not set';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Not set';
  }
}

export function displayNotes(notes: string | null | undefined): string {
  const t = norm(notes);
  return t || 'No delivery notes yet.';
}

export function displayUrl(url: string | null | undefined, empty = 'Not provided yet'): string {
  return hasUrl(url) ? norm(url) : empty;
}
