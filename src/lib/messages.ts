/**
 * MicroBuild — Messaging v1 (refresh-based, text-only helpers)
 */

import { supabase } from './supabase';
import type { ProjectMessageInsert, ProjectMessageRow } from '../types/database';

const LOG_TAG = '[messages]';

/** Explicit column list — avoid SELECT * */
export const PROJECT_MESSAGE_COLUMNS =
  [
    'id',
    'buyer_request_id',
    'order_id',
    'sender_user_profile_id',
    'recipient_user_profile_id',
    'sender_role',
    'message_body',
    'message_type',
    'visibility',
    'created_at',
  ].join(', ');

export function normalizeMessageText(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}

function visibilityLower(row: Pick<ProjectMessageRow, 'visibility'>): string {
  return normalizeMessageText(row.visibility, 'participant').toLowerCase();
}

/** Hides moderator-only visibility from participant UIs */
export function filterParticipantVisible(rows: ProjectMessageRow[]): ProjectMessageRow[] {
  return (rows ?? []).filter((r) => visibilityLower(r) !== 'admin_only');
}

/**
 * Threads between a specific buyer ↔ creator participant pair on a request.
 * When counterpartId is null, returns participant-visible rows for the request where the viewer appears as sender/recipient,
 * excluding rows that only targeted a different counterpart (explicit recipient mismatch).
 */
export function filterApplicantPairThread(
  rows: ProjectMessageRow[],
  viewerUserProfileId: string | null | undefined,
  counterpartUserProfileId: string | null | undefined,
): ProjectMessageRow[] {
  const v = normalizeMessageText(viewerUserProfileId, '').trim();
  const c = normalizeMessageText(counterpartUserProfileId, '').trim();
  const base = filterParticipantVisible(rows ?? []);

  if (!v || !base.length) return [];

  return base.filter((m) => {
    const s = normalizeMessageText(m.sender_user_profile_id, '').trim();
    const r = normalizeMessageText(m.recipient_user_profile_id, '').trim();

    const viewerInvolved = s === v || r === v;
    if (!viewerInvolved) return false;

    if (!c) {
      // Only show “open” rows when we cannot scope a counterpart
      if (!r) return true;
      return r === v || s === v;
    }

    const counterpartInvolved = s === c || r === c;
    if (!counterpartInvolved) return false;

    if (s === v && r === c) return true;
    if (s === c && r === v) return true;

    if (!r.length && !s.length) return true;

    if (!r.length && (s === v || s === c)) {
      const role = normalizeMessageText(m.sender_role, '').toLowerCase();
      if (role === 'buyer' && s === v) return true;
      if (role === 'creator' && s === c) return true;
    }

    return false;
  });
}

export function filterRequestPhaseMessages(
  rows: ProjectMessageRow[],
  buyerRequestId: string,
): ProjectMessageRow[] {
  const rid = buyerRequestId.trim();
  return filterParticipantVisible(rows ?? []).filter(
    (m) => normalizeMessageText(m.buyer_request_id, '').trim() === rid && !m.order_id,
  );
}

/** Latest-first preview line */
export function getMessageThreadPreview(messages: ProjectMessageRow[]): string {
  const list = [...(messages ?? [])].sort((a, b) => {
    const ta = Date.parse(normalizeMessageText(a.created_at));
    const tb = Date.parse(normalizeMessageText(b.created_at));
    return tb - ta;
  });
  const last = list[0];
  if (!last) return 'No messages yet — refresh after sending (realtime deferred).';

  const who = formatMessageSender(last, undefined);
  const excerpt = normalizeMessageText(last.message_body).slice(0, 140);
  const safeExcerpt = excerpt || '…';
  return `Latest (${who}): ${safeExcerpt}${excerpt.length >= 140 ? '…' : ''}`;
}

/** v1 stub — unread counts require read receipts (future) */
export function getUnreadPlaceholderCount(): number {
  return 0;
}

export type MessageParticipantLabelFormat = 'You' | 'Buyer' | 'Creator' | 'Admin' | 'System' | string;

export function formatMessageSender(
  row: ProjectMessageRow,
  viewerUserProfileId?: string | null,
): MessageParticipantLabelFormat {
  const sid = normalizeMessageText(row.sender_user_profile_id, '').trim();
  const vid = normalizeMessageText(viewerUserProfileId, '').trim();
  if (vid && sid && sid === vid) return 'You';

  const sr = normalizeMessageText(row.sender_role, '').toLowerCase();
  const mt = normalizeMessageText(row.message_type, '').toLowerCase();

  if (mt === 'system_update') return 'System';

  switch (sr) {
    case 'buyer':
      return 'Buyer';
    case 'creator':
      return 'Creator';
    case 'admin':
    case 'microbuild_admin':
      return 'Admin';
    default:
      return sr ? sr.charAt(0).toUpperCase() + sr.slice(1) : 'Participant';
  }
}

export function getMessageVisibilityLabel(visibility: string | null | undefined): string {
  const v = normalizeMessageText(visibility, 'participant').toLowerCase();
  switch (v) {
    case 'admin_only':
      return 'Admin only';
    case 'buyer_creator':
      return 'Buyer & creator';
    case 'participant':
      return 'Participants';
    case 'public_safe':
      return 'Public-safe';
    default:
      return v ? v.replace(/_/g, ' ') : 'Participants';
  }
}

export async function getBuyerUserProfileIdForBuyerRequest(
  buyerRequestId: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('buyer_requests')
    .select('email')
    .eq('id', buyerRequestId.trim())
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} getBuyerUserProfileIdForBuyerRequest (buyer_requests):`, error);
    return { id: null, error: error.message ?? 'Could not load buyer request.' };
  }

  const email = normalizeMessageText((data as { email?: unknown } | null)?.email, '').trim().toLowerCase();
  if (!email) return { id: null, error: null };

  const { data: prof, error: pErr } = await supabase
    .from('user_profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (pErr) {
    console.error(`${LOG_TAG} getBuyerUserProfileIdForBuyerRequest (user_profiles):`, pErr);
    return { id: null, error: pErr.message ?? 'Could not resolve buyer profile.' };
  }

  const id = normalizeMessageText((prof as { id?: unknown } | null)?.id, '').trim() || null;
  return { id, error: null };
}

export async function getCreatorUserProfileIdForCreatorProfile(
  creatorProfileId: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('user_profile_id')
    .eq('id', creatorProfileId.trim())
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} getCreatorUserProfileIdForCreatorProfile:`, error);
    return { id: null, error: error.message ?? 'Could not load creator profile.' };
  }

  const id =
    normalizeMessageText((data as { user_profile_id?: unknown } | null)?.user_profile_id, '').trim() || null;
  return { id, error: null };
}

/** All messages for a buyer request (optionally include admin-only rows for admin consoles). */
export async function getRequestMessages(
  buyerRequestId: string,
  opts?: { includeAdminOnly?: boolean },
): Promise<ProjectMessageRow[]> {
  const { data, error } = await supabase
    .from('project_messages')
    .select(PROJECT_MESSAGE_COLUMNS)
    .eq('buyer_request_id', buyerRequestId.trim())
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`${LOG_TAG} getRequestMessages:`, error);
    return [];
  }

  const rows = ((Array.isArray(data) ? data : []) as unknown) as ProjectMessageRow[];
  if (opts?.includeAdminOnly) return [...rows];
  return filterParticipantVisible(rows);
}

/** Messages attached to a project order */
export async function getProjectMessages(
  orderId: string,
  opts?: { includeAdminOnly?: boolean },
): Promise<ProjectMessageRow[]> {
  const { data, error } = await supabase
    .from('project_messages')
    .select(PROJECT_MESSAGE_COLUMNS)
    .eq('order_id', orderId.trim())
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`${LOG_TAG} getProjectMessages:`, error);
    return [];
  }

  const rows = ((Array.isArray(data) ? data : []) as unknown) as ProjectMessageRow[];
  if (opts?.includeAdminOnly) return [...rows];
  return filterParticipantVisible(rows);
}

function validateOutgoingBody(body: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = body.trim();
  if (!text.length) return { ok: false, error: 'Message cannot be empty.' };
  return { ok: true, text };
}

export async function sendRequestMessage(params: {
  buyer_request_id: string;
  sender_user_profile_id?: string | null;
  recipient_user_profile_id?: string | null;
  sender_role: string;
  message_body: string;
  message_type?: string;
  visibility?: string;
  order_id?: string | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const checked = validateOutgoingBody(params.message_body);
  if (!checked.ok) return { ok: false, error: checked.error };

  const insert: ProjectMessageInsert = {
    buyer_request_id: params.buyer_request_id.trim(),
    order_id: params.order_id ?? null,
    sender_user_profile_id: params.sender_user_profile_id ?? null,
    recipient_user_profile_id: params.recipient_user_profile_id ?? null,
    sender_role: params.sender_role,
    message_body: checked.text,
    message_type: params.message_type ?? 'general',
    visibility: params.visibility ?? 'buyer_creator',
  };

  const { error } = await supabase.from('project_messages').insert(insert);
  if (error) {
    console.error(`${LOG_TAG} sendRequestMessage:`, error);
    return { ok: false, error: error.message ?? 'Could not save message.' };
  }
  return { ok: true, error: null };
}

export async function sendProjectMessage(params: {
  order_id: string;
  buyer_request_id?: string | null;
  sender_user_profile_id?: string | null;
  recipient_user_profile_id?: string | null;
  sender_role: string;
  message_body: string;
  message_type?: string;
  visibility?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const checked = validateOutgoingBody(params.message_body);
  if (!checked.ok) return { ok: false, error: checked.error };

  const insert: ProjectMessageInsert = {
    order_id: params.order_id.trim(),
    buyer_request_id: params.buyer_request_id ?? null,
    sender_user_profile_id: params.sender_user_profile_id ?? null,
    recipient_user_profile_id: params.recipient_user_profile_id ?? null,
    sender_role: params.sender_role,
    message_body: checked.text,
    message_type: params.message_type ?? 'general',
    visibility: params.visibility ?? 'buyer_creator',
  };

  const { error } = await supabase.from('project_messages').insert(insert);
  if (error) {
    console.error(`${LOG_TAG} sendProjectMessage:`, error);
    return { ok: false, error: error.message ?? 'Could not save message.' };
  }
  return { ok: true, error: null };
}

/** @deprecated Prefer sendRequestMessage — kept for incremental refactors */
export async function insertProjectMessageRow(
  payload: ProjectMessageInsert,
): Promise<{ ok: boolean; error: string | null }> {
  const checked = validateOutgoingBody(payload.message_body);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { error } = await supabase
    .from('project_messages')
    .insert({ ...payload, message_body: checked.text });

  if (error) {
    console.error(`${LOG_TAG} insertProjectMessageRow:`, error);
    return { ok: false, error: error.message ?? 'Could not save message.' };
  }
  return { ok: true, error: null };
}
