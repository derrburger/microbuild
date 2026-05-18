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
  /** Buyer marketplace selection linkage (migration: marketplace-application-foundation.sql) */
  request_application_id?: string | null;
  selected_by_buyer?: boolean | null;
  selection_method?: string | null;
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
  verification_status: string | null;
  public_profile_status: string | null;
  /** From creator_profiles.approval_status */
  approval_status: string | null;
  /** Best-effort from linked creator_application email */
  contact_email: string | null;
}

/** Console + UI diagnostics when assignment list is empty */
export interface CreatorAssignmentDiagnostics {
  totalProfilesInDb: number | null;
  publicProfilesInDb: number | null;
  /** Rows where creator_profiles.is_active is true */
  profilesIsActiveTrueInDb: number | null;
  profilesApprovalActiveOrPending: number;
  profilesFetchedViaLinkedApp: number;
  linkedActiveApplications: number;
  eligibleAfterFilter: number;
  errors: string[];
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
  revision_note?: string | null;
  revision_count?: number | null;
  approved_at?: string | null;
  submitted_at: string;
  updated_at: string;
}

/** Extended pipeline timeline for dashboards / workspace (includes early + terminal stages). */
export const ORDER_PIPELINE_STAGES: { id: OrderPipelineStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'ready_to_quote', label: 'Ready to Quote' },
  { id: 'pending_payment', label: 'Payment' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'canceled', label: 'Canceled' },
];

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  revision_needed: 'Revision needed',
  approved: 'Approved',
};

export interface BuildPacketWorkspaceRow {
  id: string;
  request_id: string;
  order_id: string | null;
  business_summary: string;
  recommended_build: string;
  customer_problem: string;
  suggested_copy: Record<string, unknown> | null;
  form_fields: unknown;
  /** Visual / UX direction from build packet row */
  design_direction: string | null;
  automation_needs: string | null;
  creator_instructions: string;
  quality_checklist: string[] | null;
  launch_checklist: string[] | null;
  suggested_page_sections: string[] | null;
  ai_summary: string | null;
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

/** Sets creator_profile on order only (does not change pipeline status). */
export async function setOrderCreatorProfile(
  orderId: string,
  creatorProfileId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({
      creator_id: creatorProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) { console.error('[MicroBuild] setOrderCreatorProfile failed:', error); return false; }
  return true;
}

/** Assigns creator and advances pipeline to assigned (one-click). */
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

/** Links an existing build_packet row to an order. */
export async function linkBuildPacketToOrder(
  orderId: string,
  buildPacketId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({
      build_packet_id: buildPacketId,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) { console.error('[MicroBuild] linkBuildPacketToOrder failed:', error); return false; }

  await supabase
    .from('build_packets')
    .update({ order_id: orderId, updated_at: new Date().toISOString() })
    .eq('id', buildPacketId);

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

/** Single order row by primary key (creator workspace / detail loaders). */
export async function fetchOrderById(orderId: string): Promise<OrderPipelineRow | null> {
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) {
    console.error('[MicroBuild] fetchOrderById failed:', error);
    return null;
  }
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

const BUILD_PACKET_WORKSPACE_COLS =
  'id, request_id, order_id, business_summary, recommended_build, customer_problem, suggested_copy, form_fields, design_direction, automation_needs, creator_instructions, quality_checklist, launch_checklist, suggested_page_sections, ai_summary, updated_at';

/** Loads the best build packet for an order (linked id first, else latest by request). */
export async function fetchBuildPacketForOrder(
  order: OrderPipelineRow,
): Promise<BuildPacketWorkspaceRow | null> {
  if (order.build_packet_id) {
    const { data, error } = await supabase
      .from('build_packets')
      .select(BUILD_PACKET_WORKSPACE_COLS)
      .eq('id', order.build_packet_id)
      .maybeSingle();
    if (error) console.error('[MicroBuild] fetchBuildPacketForOrder by packet id:', error);
    else if (data) return data as BuildPacketWorkspaceRow;
  }
  if (!order.request_id) return null;
  const { data, error } = await supabase
    .from('build_packets')
    .select(BUILD_PACKET_WORKSPACE_COLS)
    .eq('request_id', order.request_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[MicroBuild] fetchBuildPacketForOrder by request:', error);
    return null;
  }
  return data as BuildPacketWorkspaceRow | null;
}

/** Index into ORDER_PIPELINE_STAGES for progress UI (unknown → 0). */
export function orderTimelineIndex(orderStatus: OrderPipelineStatus | string): number {
  const i = ORDER_PIPELINE_STAGES.findIndex((s) => s.id === orderStatus);
  return i >= 0 ? i : 0;
}

/** Batch-fetch deliverables keyed by order id (buyer dashboard, admin prefetch). */
export async function fetchDeliverablesByOrderIds(
  orderIds: string[],
): Promise<Record<string, DeliverablePlaceholder>> {
  if (orderIds.length === 0) return {};
  const { data, error } = await supabase
    .from('deliverables')
    .select(
      'id, order_id, creator_id, creator_profile_id, live_url, preview_url, github_url, notes, delivery_status, revision_note, revision_count, approved_at, submitted_at, updated_at',
    )
    .in('order_id', orderIds);

  if (error) {
    console.error('[MicroBuild] fetchDeliverablesByOrderIds failed:', error);
    return {};
  }
  const map: Record<string, DeliverablePlaceholder> = {};
  for (const row of (data ?? []) as DeliverablePlaceholder[]) {
    map[row.order_id] = row;
  }
  return map;
}

export type AdminDeliverableReviewAction =
  | 'request_revision'
  | 'approve_deliverable'
  | 'mark_delivered'
  | 'mark_completed';

export async function adminReviewDeliverable(params: {
  deliverableId: string | null;
  orderId: string;
  action: AdminDeliverableReviewAction;
  revisionNote?: string;
  currentRevisionCount?: number;
}): Promise<boolean> {
  const now = new Date().toISOString();

  switch (params.action) {
    case 'request_revision': {
      if (!params.deliverableId) {
        console.error('[MicroBuild] adminReviewDeliverable: missing deliverable id');
        return false;
      }
      const nextRev = (params.currentRevisionCount ?? 0) + 1;
      const { error: dErr } = await supabase
        .from('deliverables')
        .update({
          delivery_status: 'revision_needed' as DeliveryStatus,
          revision_note: params.revisionNote?.trim() || null,
          revision_count: nextRev,
          updated_at: now,
        })
        .eq('id', params.deliverableId);
      if (dErr) {
        console.error('[MicroBuild] adminReviewDeliverable revision:', dErr);
        return false;
      }
      return updateOrderStatus(params.orderId, 'in_progress');
    }
    case 'approve_deliverable': {
      if (!params.deliverableId) {
        console.error('[MicroBuild] adminReviewDeliverable: missing deliverable id');
        return false;
      }
      const { error: dErr } = await supabase
        .from('deliverables')
        .update({
          delivery_status: 'approved' as DeliveryStatus,
          approved_at: now,
          updated_at: now,
        })
        .eq('id', params.deliverableId);
      if (dErr) {
        console.error('[MicroBuild] adminReviewDeliverable approve:', dErr);
        return false;
      }
      return updateOrderStatus(params.orderId, 'delivered');
    }
    case 'mark_delivered':
      return updateOrderStatus(params.orderId, 'delivered');
    case 'mark_completed':
      return updateOrderStatus(params.orderId, 'completed');
    default:
      return false;
  }
}

type ProfileAssignmentRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  tier: string | null;
  is_active: boolean | null;
  verification_status: string | null;
  public_profile_status: string | null;
  approval_status: string | null;
  creator_application_id: string | null;
};

function normalizeSnap(row: ProfileAssignmentRow, contactEmail: string | null): CreatorProfileSnap {
  const display = (row.display_name ?? '').trim();
  const full = (row.full_name ?? '').trim();
  const label = display || full || 'Creator';
  return {
    id: row.id,
    display_name: display || label,
    full_name: full || label,
    tier: row.tier ?? 'free',
    is_active: Boolean(row.is_active),
    verification_status: row.verification_status ?? null,
    public_profile_status: row.public_profile_status ?? null,
    approval_status: row.approval_status ?? null,
    contact_email: contactEmail,
  };
}

function terminalBlocked(status: string | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'rejected' || s === 'suspended';
}

/**
 * Loads creator_profiles eligible for pipeline assignment.
 *
 * IMPORTANT: Do not filter on `is_active` alone — `buildCreatorProfileInsert` sets
 * `is_active: false` for new profiles while `approval_status` is the source of truth.
 */
export async function fetchCreatorProfilesForAssignment(): Promise<{
  creators: CreatorProfileSnap[];
  diagnostics: CreatorAssignmentDiagnostics;
}> {
  const diagnostics: CreatorAssignmentDiagnostics = {
    totalProfilesInDb: null,
    publicProfilesInDb: null,
    profilesIsActiveTrueInDb: null,
    profilesApprovalActiveOrPending: 0,
    profilesFetchedViaLinkedApp: 0,
    linkedActiveApplications: 0,
    eligibleAfterFilter: 0,
    errors: [],
  };

  const SELECT_COLS =
    'id, display_name, full_name, tier, is_active, verification_status, public_profile_status, approval_status, creator_application_id';

  const [
    totalRes,
    publicRes,
    activeFlagRes,
    approvalRes,
    appsRes,
  ] = await Promise.all([
    supabase.from('creator_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('creator_profiles').select('id', { count: 'exact', head: true }).eq('public_profile_status', 'public'),
    supabase.from('creator_profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('creator_profiles')
      .select(SELECT_COLS)
      .in('approval_status', ['active', 'approved_pending_payment']),
    supabase
      .from('creator_applications')
      .select('linked_creator_profile_id, email, status')
      .in('status', ['active', 'approved_pending_payment'])
      .not('linked_creator_profile_id', 'is', null),
  ]);

  if (totalRes.error) {
    console.error('[MicroBuild] creator assignment count(total):', totalRes.error);
    diagnostics.errors.push(`total count: ${totalRes.error.message}`);
  } else {
    diagnostics.totalProfilesInDb = totalRes.count ?? null;
  }
  if (publicRes.error) {
    console.error('[MicroBuild] creator assignment count(public):', publicRes.error);
    diagnostics.errors.push(`public count: ${publicRes.error.message}`);
  } else {
    diagnostics.publicProfilesInDb = publicRes.count ?? null;
  }
  if (activeFlagRes.error) {
    console.error('[MicroBuild] creator assignment count(is_active):', activeFlagRes.error);
    diagnostics.errors.push(`is_active count: ${activeFlagRes.error.message}`);
  } else {
    diagnostics.profilesIsActiveTrueInDb = activeFlagRes.count ?? null;
  }
  if (approvalRes.error) {
    console.error('[MicroBuild] creator assignment by approval_status:', approvalRes.error);
    diagnostics.errors.push(`approval query: ${approvalRes.error.message}`);
  }
  if (appsRes.error) {
    console.error('[MicroBuild] creator assignment linked apps:', appsRes.error);
    diagnostics.errors.push(`applications query: ${appsRes.error.message}`);
  }

  const byApproval = (approvalRes.data ?? []) as ProfileAssignmentRow[];
  diagnostics.profilesApprovalActiveOrPending = byApproval.length;

  const activeApps = (appsRes.data ?? []) as {
    linked_creator_profile_id: string;
    email: string | null;
    status: string;
  }[];
  diagnostics.linkedActiveApplications = activeApps.length;

  const emailByProfileId = new Map<string, string>();
  const linkedIdsOrdered: string[] = [];
  const seen = new Set<string>();
  for (const a of activeApps) {
    const pid = a.linked_creator_profile_id;
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    linkedIdsOrdered.push(pid);
    if (a.email?.trim()) emailByProfileId.set(pid, a.email.trim());
  }

  const mergedMap = new Map<string, ProfileAssignmentRow>();
  for (const p of byApproval) mergedMap.set(p.id, p);

  const missingLinked = linkedIdsOrdered.filter((id) => !mergedMap.has(id));
  diagnostics.profilesFetchedViaLinkedApp = missingLinked.length;

  if (missingLinked.length > 0) {
    const { data: extraRows, error: extraErr } = await supabase
      .from('creator_profiles')
      .select(SELECT_COLS)
      .in('id', missingLinked);

    if (extraErr) {
      console.error('[MicroBuild] creator assignment fetch linked profiles:', extraErr);
      diagnostics.errors.push(`linked profile fetch: ${extraErr.message}`);
    } else {
      for (const p of (extraRows ?? []) as ProfileAssignmentRow[]) {
        mergedMap.set(p.id, p);
      }
    }
  }

  const linkedSet = new Set(linkedIdsOrdered);

  const eligibleRows = [...mergedMap.values()].filter((p) => {
    if (terminalBlocked(p.approval_status ?? undefined)) return false;
    const ap = (p.approval_status ?? '').toLowerCase();
    if (ap === 'active' || ap === 'approved_pending_payment') return true;
    if (p.is_active === true) return true;
    if (linkedSet.has(p.id)) return true;
    return false;
  });

  diagnostics.eligibleAfterFilter = eligibleRows.length;

  eligibleRows.sort((a, b) => {
    const na = (a.display_name ?? a.full_name ?? '').toLowerCase();
    const nb = (b.display_name ?? b.full_name ?? '').toLowerCase();
    return na.localeCompare(nb);
  });

  const creators = eligibleRows.map((row) =>
    normalizeSnap(row, emailByProfileId.get(row.id) ?? null),
  );

  if (creators.length === 0 && diagnostics.errors.length === 0) {
    console.warn(
      '[MicroBuild] fetchCreatorProfilesForAssignment: zero eligible creators.',
      diagnostics,
    );
  }

  return { creators, diagnostics };
}

/** @deprecated Prefer fetchCreatorProfilesForAssignment when diagnostics are needed */
export async function fetchActiveCreatorProfiles(): Promise<CreatorProfileSnap[]> {
  const { creators } = await fetchCreatorProfilesForAssignment();
  return creators;
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
    .select(
      'id, order_id, creator_id, creator_profile_id, live_url, preview_url, github_url, notes, delivery_status, revision_note, revision_count, approved_at, submitted_at, updated_at',
    )
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
    revision_note?: string | null;
    approved_at?: string | null;
    submitted_at?: string;
    revision_count?: number;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('deliverables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', deliverableId);

  if (error) { console.error('[MicroBuild] updateDeliverable failed:', error); return false; }
  return true;
}

/**
 * Creator submits or updates the single deliverable row for an order (no duplicates).
 * Sets delivery_status to submitted and stamps submitted_at.
 */
export async function submitCreatorDeliverable(params: {
  orderId: string;
  creatorProfileId: string;
  previewUrl: string;
  deliveryUrl: string;
  githubUrl: string;
  notes: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const preview_url = params.previewUrl.trim() || null;
  const live_url = params.deliveryUrl.trim() || '';
  const github_url = params.githubUrl.trim() || null;
  const notes = params.notes.trim() || null;

  const existing = await fetchDeliverableByOrderId(params.orderId);

  if (existing) {
    const { error } = await supabase
      .from('deliverables')
      .update({
        preview_url,
        live_url,
        github_url,
        notes,
        delivery_status: 'submitted' as DeliveryStatus,
        submitted_at: now,
        creator_id: params.creatorProfileId,
        creator_profile_id: params.creatorProfileId,
        updated_at: now,
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[MicroBuild] submitCreatorDeliverable update:', error);
      return false;
    }
    return true;
  }

  const { error } = await supabase.from('deliverables').insert({
    order_id: params.orderId,
    creator_id: params.creatorProfileId,
    creator_profile_id: params.creatorProfileId,
    live_url,
    preview_url,
    github_url,
    notes,
    delivery_status: 'submitted' as DeliveryStatus,
    submitted_at: now,
  });

  if (error) {
    console.error('[MicroBuild] submitCreatorDeliverable insert:', error);
    return false;
  }
  return true;
}
