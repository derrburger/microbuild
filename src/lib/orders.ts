/**
 * MicroBuild — Project Pipeline Helpers
 *
 * CRUD operations for orders, deliverables, and creator assignment.
 * Requires project-pipeline-foundation.sql to be run first.
 */

import { supabase } from './supabase';
import type { OrderPipelineStatus, PaymentStatus, DeliveryStatus } from '../types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderPipelineRow {
  id: string;
  request_id: string | null;
  buyer_id: string | null;
  creator_id: string | null;
  template_id: string | null;
  build_packet_id: string | null;
  project_title: string | null;
  project_type: string | null;
  order_status: OrderPipelineStatus;
  payment_status: PaymentStatus;
  admin_notes: string | null;
  microbuild_fee: string | null;
  creator_payout: string | null;
  amount_cents: number;
  status: string;    // legacy field
  created_at: string;
  updated_at: string;
}

export interface CreatorProfileSnap {
  id: string;
  display_name: string | null;
  full_name: string;
  tier: string;
  is_active: boolean;
}

export interface DeliverablePlaceholder {
  id: string;
  order_id: string;
  creator_id: string | null;
  creator_profile_id: string | null;
  live_url: string | null;
  preview_url: string | null;
  github_url: string | null;
  notes: string | null;
  delivery_status: DeliveryStatus;
  submitted_at: string;
  updated_at: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft:          'Draft',
  ready_to_quote: 'Ready to Quote',
  pending_payment:'Pending Payment',
  assigned:       'Assigned',
  in_progress:    'In Progress',
  in_review:      'In Review',
  delivered:      'Delivered',
  completed:      'Completed',
  rejected:       'Rejected',
  canceled:       'Canceled',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  draft:          '#8a94a6',
  ready_to_quote: '#a78bfa',
  pending_payment:'#f97316',
  assigned:       '#63b3ed',
  in_progress:    '#f9b032',
  in_review:      '#f97316',
  delivered:      '#00d478',
  completed:      '#00d478',
  rejected:       '#ef4444',
  canceled:       '#ef4444',
};

export const ORDER_PIPELINE_STAGES: { id: OrderPipelineStatus; label: string }[] = [
  { id: 'draft',          label: 'Draft' },
  { id: 'ready_to_quote', label: 'Ready to Quote' },
  { id: 'assigned',       label: 'Assigned' },
  { id: 'in_progress',    label: 'In Progress' },
  { id: 'in_review',      label: 'In Review' },
  { id: 'delivered',      label: 'Delivered' },
  { id: 'completed',      label: 'Completed' },
];

export function getNextOrderAction(status: OrderPipelineStatus | string): string {
  switch (status) {
    case 'draft':           return 'Assign a creator or move to Ready to Quote';
    case 'ready_to_quote':  return 'Send proposal to buyer and assign creator';
    case 'pending_payment': return 'Waiting for buyer payment confirmation';
    case 'assigned':        return 'Creator assigned — move to In Progress when work begins';
    case 'in_progress':     return 'Creator is building — check for updates';
    case 'in_review':       return 'Build submitted — review with buyer';
    case 'delivered':       return 'Confirm buyer approval and mark complete';
    case 'completed':       return 'Consider requesting a testimonial';
    case 'rejected':        return 'Notify buyer and creator of rejection reason';
    case 'canceled':        return 'No further action needed';
    default:                return 'Review and update project status';
  }
}

// ─── Order CRUD ───────────────────────────────────────────────────────────────

/** Creates a new order from a buyer request. Returns null if order already exists. */
export async function createOrderFromRequest(params: {
  requestId: string;
  buildType: string;
  projectTitle?: string;
  buyerUserId?: string | null;
  adminNotes?: string;
}): Promise<{ id: string; isNew: boolean } | null> {
  // Prevent duplicates — check first
  const { data: existing } = await supabase
    .from('orders')
    .select('id, order_status')
    .eq('request_id', params.requestId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { id: (existing[0] as { id: string }).id, isNew: false };
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({
      request_id:    params.requestId,
      buyer_id:      params.buyerUserId ?? null,
      project_title: params.projectTitle ?? `MicroBuild — ${params.buildType}`,
      project_type:  params.buildType,
      order_status:  'draft' as OrderPipelineStatus,
      payment_status:'unpaid' as PaymentStatus,
      amount_cents:  0,
      status:        'pending',  // legacy
      admin_notes:   params.adminNotes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[MicroBuild] createOrderFromRequest failed:', error);
    return null;
  }

  return { id: (data as { id: string }).id, isNew: true };
}

/** Updates the pipeline status of an order. */
export async function updateOrderStatus(
  orderId: string,
  status: OrderPipelineStatus,
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({ order_status: status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) { console.error('[MicroBuild] updateOrderStatus failed:', error); return false; }
  return true;
}

/** Assigns a creator_profile to an order and moves status to 'assigned'. */
export async function assignCreatorToOrder(
  orderId: string,
  creatorProfileId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({
      creator_id:   creatorProfileId,
      order_status: 'assigned' as OrderPipelineStatus,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) { console.error('[MicroBuild] assignCreatorToOrder failed:', error); return false; }
  return true;
}

/** Updates admin notes on an order. */
export async function updateOrderAdminNotes(
  orderId: string,
  notes: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({ admin_notes: notes, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) { console.error('[MicroBuild] updateOrderAdminNotes failed:', error); return false; }
  return true;
}

/** Fetches all orders for the admin pipeline view. */
export async function fetchAllOrders(): Promise<OrderPipelineRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error('[MicroBuild] fetchAllOrders failed:', error); return []; }
  return (data as OrderPipelineRow[]) ?? [];
}

/** Checks if an order already exists for a given request ID. */
export async function fetchOrderByRequestId(
  requestId: string,
): Promise<OrderPipelineRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();

  if (error) { console.error('[MicroBuild] fetchOrderByRequestId failed:', error); return null; }
  return data as OrderPipelineRow | null;
}

/** Fetches orders assigned to a specific creator profile. */
export async function fetchOrdersByCreatorProfile(
  creatorProfileId: string,
): Promise<OrderPipelineRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('creator_id', creatorProfileId)
    .order('created_at', { ascending: false });

  if (error) { console.error('[MicroBuild] fetchOrdersByCreatorProfile failed:', error); return []; }
  return (data as OrderPipelineRow[]) ?? [];
}

/** Fetches active orders for a set of buyer request IDs (for buyer dashboard). */
export async function fetchOrdersByRequestIds(
  requestIds: string[],
): Promise<OrderPipelineRow[]> {
  if (requestIds.length === 0) return [];

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: false });

  if (error) { console.error('[MicroBuild] fetchOrdersByRequestIds failed:', error); return []; }
  return (data as OrderPipelineRow[]) ?? [];
}

// ─── Creator profiles ─────────────────────────────────────────────────────────

/** Fetches active creator profiles for the creator assignment dropdown. */
export async function fetchActiveCreatorProfiles(): Promise<CreatorProfileSnap[]> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('id, display_name, full_name, tier, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) { console.error('[MicroBuild] fetchActiveCreatorProfiles failed:', error); return []; }
  return (data as CreatorProfileSnap[]) ?? [];
}

// ─── Deliverables ─────────────────────────────────────────────────────────────

/** Creates a deliverable placeholder for a project. */
export async function createDeliverablePlaceholder(params: {
  orderId: string;
  creatorProfileId?: string | null;
  notes?: string;
}): Promise<{ id: string } | null> {
  // Check for existing deliverable
  const { data: existing } = await supabase
    .from('deliverables')
    .select('id')
    .eq('order_id', params.orderId)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0] as { id: string };
  }

  const { data, error } = await supabase
    .from('deliverables')
    .insert({
      order_id:           params.orderId,
      creator_id:         params.creatorProfileId ?? null,
      creator_profile_id: params.creatorProfileId ?? null,
      live_url:           '',            // placeholder — will be filled when delivered
      delivery_status:    'draft' as DeliveryStatus,
      notes:              params.notes ?? null,
    })
    .select('id')
    .single();

  if (error) { console.error('[MicroBuild] createDeliverablePlaceholder failed:', error); return null; }
  return data as { id: string };
}

/** Fetches the deliverable for an order. */
export async function fetchDeliverableByOrderId(
  orderId: string,
): Promise<DeliverablePlaceholder | null> {
  const { data, error } = await supabase
    .from('deliverables')
    .select('id, order_id, creator_id, creator_profile_id, live_url, preview_url, github_url, notes, delivery_status, submitted_at, updated_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) { console.error('[MicroBuild] fetchDeliverableByOrderId failed:', error); return null; }
  return data as DeliverablePlaceholder | null;
}

/** Updates a deliverable's URLs and status. */
export async function updateDeliverable(
  deliverableId: string,
  updates: {
    live_url?: string;
    preview_url?: string;
    github_url?: string;
    notes?: string;
    delivery_status?: DeliveryStatus;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('deliverables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', deliverableId);

  if (error) { console.error('[MicroBuild] updateDeliverable failed:', error); return false; }
  return true;
}
