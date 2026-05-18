/**
 * Central inbox (v2) — conversation graph over existing project_messages rows.
 * No realtime; grouping is purely client-side + explicit Supabase selects.
 */

import type { BuyerRequestRow, ProjectMessageRow, UserProfileRow } from '../types/database';
import type { OrderPipelineRow } from './orders';
import { fetchOrdersByCreatorProfile, fetchOrdersByRequestIds } from './orders';
import { supabase } from './supabase';
import {
  PROJECT_MESSAGE_COLUMNS,
  filterApplicantPairThread,
  filterParticipantVisible,
  getBuyerUserProfileIdForBuyerRequest,
  getCreatorUserProfileIdForCreatorProfile,
  getMessageThreadPreview,
  normalizeMessageText,
  sendProjectMessage,
  sendRequestMessage,
} from './messages';

const LOG_TAG = '[messageInbox]';

/** Buyer / creator / admin string from user_profiles.account_type */
export type MessagingAccountSide = 'buyer' | 'creator';

export interface ParticipantConversation {
  stableId: string;
  /** Preferred anchor when an order exists for this buyer × creator pairing */
  anchor: 'order' | 'application';
  buyerRequestId: string;
  orderId: string | null;
  creatorProfileId: string;
  buyerUserProfileId: string | null;
  creatorUserProfileId: string | null;
  buyerBusinessLabel: string;
  microbuildLabel: string;
  creatorNameLabel: string;
  applicationStatus: string | null;
  orderPipelineStatus: string | null;
  inboxRibbonLabel: string;
}

export interface ConversationListItem extends ParticipantConversation {
  preview: string;
  lastActivityAt: string;
}

export function buildMessagesHref(opts: {
  buyerRequestId: string | null | undefined;
  creatorProfileId?: string | null;
  orderId?: string | null;
}): string {
  const p = new URLSearchParams();
  const brid = normalizeMessageText(opts.buyerRequestId, '').trim();
  if (brid) p.set('buyerRequestId', brid);
  const oid = normalizeMessageText(opts.orderId, '').trim();
  if (oid) p.set('orderId', oid);
  const cp = normalizeMessageText(opts.creatorProfileId, '').trim();
  if (cp) p.set('creatorProfileId', cp);
  const q = p.toString();
  return `/messages${q ? `?${q}` : ''}`;
}

function uniqStrings(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map((x) => x.trim()).filter(Boolean))];
}

function uniqById(rows: ProjectMessageRow[]): ProjectMessageRow[] {
  const map = new Map<string, ProjectMessageRow>();
  for (const r of rows ?? []) {
    const id = normalizeMessageText(r.id, '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, r);
  }
  return [...map.values()];
}

function sortAscending(rows: ProjectMessageRow[]): ProjectMessageRow[] {
  return [...(rows ?? [])].sort((a, b) => {
    const ta = Date.parse(normalizeMessageText(a.created_at));
    const tb = Date.parse(normalizeMessageText(b.created_at));
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });
}

/** Exposed for the Messages shell to batch-refresh pooled rows after sends */
export async function fetchMessagePool(
  buyerRequestIds: string[],
  orderIds: string[],
): Promise<ProjectMessageRow[]> {
  const reqs = uniqStrings(buyerRequestIds);
  const ords = uniqStrings(orderIds);
  const out: ProjectMessageRow[] = [];

  if (reqs.length) {
    const { data, error } = await supabase
      .from('project_messages')
      .select(PROJECT_MESSAGE_COLUMNS)
      .in('buyer_request_id', reqs)
      .order('created_at', { ascending: true });
    if (error) console.error(`${LOG_TAG} pool buyer_request_id:`, error);
    else out.push(...(((data ?? []) as unknown) as ProjectMessageRow[]));
  }

  if (ords.length) {
    const { data, error } = await supabase
      .from('project_messages')
      .select(PROJECT_MESSAGE_COLUMNS)
      .in('order_id', ords)
      .order('created_at', { ascending: true });
    if (error) console.error(`${LOG_TAG} pool order_id:`, error);
    else out.push(...(((data ?? []) as unknown) as ProjectMessageRow[]));
  }

  return sortAscending(uniqById(filterParticipantVisible(out)));
}

function counterpartForViewer(
  conv: ParticipantConversation,
  viewerUserProfileId: string,
): string | null {
  const vid = normalizeMessageText(viewerUserProfileId, '').trim();
  const buyer = normalizeMessageText(conv.buyerUserProfileId, '').trim();
  const creator = normalizeMessageText(conv.creatorUserProfileId, '').trim();
  if (vid && buyer && vid === buyer) return creator || null;
  if (vid && creator && vid === creator) return buyer || null;
  return buyer && creator ? buyer : creator || null;
}

/** Request-phase (null order_id) + matching order-phase rows merged when order anchor exists */
export function mergeMessagesForConversation(
  pool: ProjectMessageRow[],
  conv: ParticipantConversation,
  viewerUserProfileId: string,
): ProjectMessageRow[] {
  const v = normalizeMessageText(viewerUserProfileId, '').trim();
  const br = normalizeMessageText(conv.buyerRequestId, '').trim();
  const cpId = counterpartForViewer(conv, v);

  if (conv.orderId?.trim()) {
    const oid = conv.orderId.trim();
    const proj = pool.filter((m) => normalizeMessageText(m.order_id, '').trim() === oid);
    const reqOnly = pool.filter(
      (m) =>
        normalizeMessageText(m.buyer_request_id, '').trim() === br &&
        !normalizeMessageText(m.order_id, '').trim(),
    );
    const pairReq = filterApplicantPairThread(reqOnly, v, cpId);
    return sortAscending(uniqById([...proj, ...pairReq]));
  }

  const reqOnly = pool.filter(
    (m) =>
      normalizeMessageText(m.buyer_request_id, '').trim() === br &&
      !normalizeMessageText(m.order_id, '').trim(),
  );
  return sortAscending(filterApplicantPairThread(reqOnly, v, cpId));
}

export function sliceMessagesForConversation(
  conv: ParticipantConversation,
  viewerUserProfileId: string,
  pool: ProjectMessageRow[],
): ProjectMessageRow[] {
  return mergeMessagesForConversation(pool, conv, viewerUserProfileId);
}

export async function getConversationMessages(
  conv: ParticipantConversation,
  viewerUserProfileId: string,
): Promise<ProjectMessageRow[]> {
  const br = conv.buyerRequestId.trim();
  const orders = uniqStrings(conv.orderId?.trim() ? [conv.orderId.trim()] : []);
  const pool = await fetchMessagePool([br], orders);
  return mergeMessagesForConversation(pool, conv, viewerUserProfileId);
}

export async function sendConversationMessage(
  conv: ParticipantConversation,
  viewerUserProfileRow: UserProfileRow,
  messageBody: string,
): Promise<{ ok: boolean; error: string | null }> {
  const roleRaw = normalizeMessageText(viewerUserProfileRow.account_type, '').toLowerCase();
  const senderRole = roleRaw === 'creator' ? 'creator' : roleRaw === 'admin' ? 'admin' : 'buyer';
  const counterpart = counterpartForViewer(conv, viewerUserProfileRow.id.trim());
  const rid = viewerUserProfileRow.id.trim();

  if (conv.orderId?.trim()) {
    return sendProjectMessage({
      order_id: conv.orderId.trim(),
      buyer_request_id: conv.buyerRequestId.trim(),
      sender_user_profile_id: rid || null,
      recipient_user_profile_id: counterpart ?? null,
      sender_role: senderRole,
      message_body: messageBody,
      visibility: 'buyer_creator',
    });
  }

  return sendRequestMessage({
    buyer_request_id: conv.buyerRequestId.trim(),
    order_id: null,
    sender_user_profile_id: rid || null,
    recipient_user_profile_id: counterpart ?? null,
    sender_role: senderRole,
    message_body: messageBody,
    visibility: 'buyer_creator',
  });
}

export const createRequestConversationMessage = sendRequestMessage;
export const createProjectConversationMessage = sendProjectMessage;

export function getConversationTitle(conv: ParticipantConversation): string {
  const biz = normalizeMessageText(conv.buyerBusinessLabel, '').trim() || 'Request';
  const mb = normalizeMessageText(conv.microbuildLabel, '').trim() || 'MicroBuild';
  return `${biz} · ${mb}`;
}

export function getOtherParticipantLabel(conv: ParticipantConversation, side: MessagingAccountSide): string {
  if (side === 'buyer') {
    return normalizeMessageText(conv.creatorNameLabel, '').trim() || 'Creator';
  }
  return normalizeMessageText(conv.buyerBusinessLabel, '').trim() || 'Buyer';
}

export function getConversationStatusLabel(conv: ParticipantConversation): string {
  if (conv.orderId && conv.orderPipelineStatus) {
    const o = normalizeMessageText(conv.orderPipelineStatus).replace(/_/g, ' ');
    return o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Project';
  }
  const a = normalizeMessageText(conv.applicationStatus).replace(/_/g, ' ');
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Application';
}

export function getConversationContext(conv: ParticipantConversation, side: MessagingAccountSide): string {
  const other = getOtherParticipantLabel(conv, side);
  const ribbon = normalizeMessageText(conv.inboxRibbonLabel).trim();
  const title = getConversationTitle(conv);
  const status = getConversationStatusLabel(conv);
  if (conv.anchor === 'order') {
    return `${ribbon} with ${other} — ${title}. Project status: ${status}. Earlier request-phase messages between you appear here when scoped to both participants.`;
  }
  return `${ribbon} with ${other} — ${title}. Application status: ${status}.`;
}

const APP_FIELDS = `
  id,
  buyer_request_id,
  order_id,
  creator_profile_id,
  creator_user_profile_id,
  buyer_user_profile_id,
  application_status,
  created_at,
  updated_at
`.replace(/\s+/g, ' ');

const REQ_INBOX_FIELDS =
  'id, business_name, industry, build_type, main_goal, applications_count, application_status, visibility_status';

async function loadBuyerRequestsForViewer(profile: UserProfileRow): Promise<BuyerRequestRow[]> {
  const email = normalizeMessageText(profile.email, '').trim();
  const uid = normalizeMessageText(profile.auth_user_id ?? '', '').trim();

  let q = supabase
    .from('buyer_requests')
    .select(`${REQ_INBOX_FIELDS}, email, status, user_id`)
    .order('created_at', { ascending: false })
    .limit(40);

  if (uid && email) {
    q = q.or(`email.eq.${email},user_id.eq.${uid}`);
  } else if (email) {
    q = q.eq('email', email);
  } else {
    return [];
  }

  const { data, error } = await q;
  if (error) {
    console.error(`${LOG_TAG} buyer_requests:`, error);
    return [];
  }
  return (data as BuyerRequestRow[]) ?? [];
}

async function loadApplicationsForBuyerRequestIds(ids: string[]): Promise<
  Array<Record<string, string | null | undefined>>
> {
  const u = uniqStrings(ids);
  if (!u.length) return [];
  const { data, error } = await supabase
    .from('request_applications')
    .select(APP_FIELDS.trim())
    .in('buyer_request_id', u);
  if (error) {
    console.error(`${LOG_TAG} request_applications (buyer scope):`, error);
    return [];
  }
  return (((data ?? []) as unknown) as Array<Record<string, string | null | undefined>>);
}

type CreatorLite = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  user_profile_id: string | null;
};

async function loadCreatorProfilesLite(ids: string[]): Promise<Map<string, CreatorLite>> {
  const u = uniqStrings(ids);
  const map = new Map<string, CreatorLite>();
  if (!u.length) return map;
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('id, display_name, full_name, user_profile_id')
    .in('id', u);
  if (error) {
    console.error(`${LOG_TAG} creator_profiles:`, error);
    return map;
  }
  for (const row of (data ?? []) as CreatorLite[]) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}

function readableName(c: CreatorLite | undefined): string {
  if (!c) return 'Creator';
  const d = normalizeMessageText(c.display_name, '').trim();
  const f = normalizeMessageText(c.full_name, '').trim();
  return d || f || 'Creator';
}

function creatorUserPid(
  row: Record<string, string | null | undefined>,
  prof: CreatorLite | undefined | null,
): string | null {
  const direct = normalizeMessageText(typeof row.creator_user_profile_id === 'string' ? row.creator_user_profile_id : null)
    .trim();
  if (direct) return direct;
  const p = normalizeMessageText(prof?.user_profile_id ?? null).trim();
  return p.length ? p : null;
}

function lastActivityIso(msgs: ProjectMessageRow[]): string {
  let best = 0;
  for (const m of msgs) {
    const t = Date.parse(normalizeMessageText(m.created_at));
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best).toISOString() : new Date(0).toISOString();
}

async function finalizeListItem(
  base: ParticipantConversation,
  pool: ProjectMessageRow[],
  viewerPid: string,
): Promise<ConversationListItem> {
  const msgs = mergeMessagesForConversation(pool, base, viewerPid);
  return {
    ...base,
    preview: getMessageThreadPreview(msgs),
    lastActivityAt: lastActivityIso(msgs),
  };
}

async function buildBuyerConversationRows(profile: UserProfileRow): Promise<ParticipantConversation[]> {
  const viewerPid = profile.id.trim();
  const reqs = await loadBuyerRequestsForViewer(profile);
  const bridList = reqs.map((r) => normalizeMessageText(r.id, '').trim()).filter(Boolean);

  const reqMeta = new Map<string, BuyerRequestRow>();
  for (const r of reqs) reqMeta.set(r.id.trim(), r);

  const apps = await loadApplicationsForBuyerRequestIds(bridList);
  const orders = await fetchOrdersByRequestIds(bridList);

  const cpIds = uniqStrings([
    ...apps.map((a) => normalizeMessageText(a.creator_profile_id, '').trim()),
    ...orders.map((o) => normalizeMessageText(o.creator_id, '').trim()),
  ]);
  let profMap = await loadCreatorProfilesLite(cpIds);

  const bridToBuyerPid = new Map<string, string>();
  for (const rid of bridList) {
    const fromRow = viewerPid;

    bridToBuyerPid.set(rid, fromRow.trim());
    const hydrated = normalizeMessageText((await getBuyerUserProfileIdForBuyerRequest(rid)).id, '').trim();
    if (hydrated) bridToBuyerPid.set(rid, hydrated);
  }

  const absorbedApps = new Set<string>();
  const rows: ParticipantConversation[] = [];

  for (const order of orders as OrderPipelineRow[]) {
    const rid = normalizeMessageText(order.request_id ?? '', '').trim();
    const cpAssigned = normalizeMessageText(order.creator_id ?? '', '').trim();
    if (!rid || !cpAssigned) continue;

    const br = reqMeta.get(rid);
    const biz = normalizeMessageText(br?.business_name, '').trim() || 'Buyer request';
    const mb = normalizeMessageText(br?.build_type ?? order.project_type ?? '', '').trim() || 'MicroBuild';

    if (!profMap.has(cpAssigned)) {
      profMap = new Map([...profMap, ...(await loadCreatorProfilesLite([cpAssigned]))]);
    }
    const cprof = profMap.get(cpAssigned);
    const creatorName = readableName(cprof);
    let creatorUp =
      creatorUserPid(
        { creator_profile_id: cpAssigned, creator_user_profile_id: cprof?.user_profile_id ?? null },
        cprof ?? undefined,
      ) ?? null;
    if (!creatorUp?.trim()) {
      creatorUp = (await getCreatorUserProfileIdForCreatorProfile(cpAssigned)).id ?? null;
    }

    const buyerPid = bridToBuyerPid.get(rid) ?? viewerPid;

    for (const row of apps) {
      const ab = normalizeMessageText(row.buyer_request_id, '').trim();
      const ac = normalizeMessageText(row.creator_profile_id, '').trim();
      const aid = normalizeMessageText(typeof row.id === 'string' ? row.id : null, '').trim();
      if (aid && ab === rid && ac === cpAssigned) absorbedApps.add(aid);
    }

    const selectedAppRow = apps.find((a) => {
      const ab = normalizeMessageText(a.buyer_request_id, '').trim();
      const ac = normalizeMessageText(a.creator_profile_id, '').trim();
      return ab === rid && ac === cpAssigned;
    });
    const appSt =
      normalizeMessageText(selectedAppRow?.application_status ?? '').trim()
      || normalizeMessageText(br?.application_status ?? '').trim();

    rows.push({
      stableId: `order:${order.id.trim()}`,
      anchor: 'order',
      buyerRequestId: rid,
      orderId: order.id.trim(),
      creatorProfileId: cpAssigned,
      buyerUserProfileId: buyerPid || null,
      creatorUserProfileId: creatorUp,
      buyerBusinessLabel: biz,
      microbuildLabel: mb,
      creatorNameLabel: creatorName,
      applicationStatus: appSt || null,
      orderPipelineStatus: normalizeMessageText(order.order_status, '').trim(),
      inboxRibbonLabel: 'Selected creator',
    });
  }

  for (const row of apps) {
    const aid = normalizeMessageText(typeof row.id === 'string' ? row.id : null, '').trim();
    if (!aid || absorbedApps.has(aid)) continue;

    const ast = normalizeMessageText(typeof row.application_status === 'string' ? row.application_status : null).toLowerCase();
    if (ast === 'withdrawn') continue;

    const rid = normalizeMessageText(typeof row.buyer_request_id === 'string' ? row.buyer_request_id : '', '').trim();
    const cp = normalizeMessageText(typeof row.creator_profile_id === 'string' ? row.creator_profile_id : '', '').trim();
    if (!reqMeta.has(rid) || !cp) continue;

    const br = reqMeta.get(rid)!;
    const biz = normalizeMessageText(br.business_name, '').trim() || 'Buyer request';
    const mb =
      normalizeMessageText(br.build_type, '').trim() || 'MicroBuild';

    if (!profMap.has(cp)) {
      profMap = new Map([...profMap, ...(await loadCreatorProfilesLite([cp]))]);
    }
    const cprof = profMap.get(cp);
    const creatorName = readableName(cprof);
    let creatorUp =
      creatorUserPid(
        {
          creator_user_profile_id: typeof row.creator_user_profile_id === 'string' ? row.creator_user_profile_id : null,
        },
        cprof ?? undefined,
      ) ?? null;
    if (!creatorUp?.trim()) creatorUp = (await getCreatorUserProfileIdForCreatorProfile(cp)).id ?? null;

    const buyerFromApp =
      normalizeMessageText(typeof row.buyer_user_profile_id === 'string' ? row.buyer_user_profile_id : null, '').trim();
    const buyerPid = buyerFromApp || bridToBuyerPid.get(rid) || viewerPid;

    rows.push({
      stableId: `req:${rid}:cp:${cp}`,
      anchor: 'application',
      buyerRequestId: rid,
      orderId: null,
      creatorProfileId: cp,
      buyerUserProfileId: buyerPid || null,
      creatorUserProfileId: creatorUp,
      buyerBusinessLabel: biz,
      microbuildLabel: mb,
      creatorNameLabel: creatorName,
      applicationStatus: normalizeMessageText(typeof row.application_status === 'string' ? row.application_status : null),
      orderPipelineStatus: null,
      inboxRibbonLabel: 'Applicant',
    });
  }

  const dedupByStable = new Map<string, ParticipantConversation>();
  for (const r of rows) dedupByStable.set(r.stableId, r);
  return [...dedupByStable.values()];
}

async function buildCreatorConversationRows(
  profile: UserProfileRow,
  creatorProfile: { id: string } | null,
): Promise<ParticipantConversation[]> {
  const viewerPid = normalizeMessageText(profile.id, '').trim();
  let cpFk =
    normalizeMessageText(creatorProfile?.id ?? '', '').trim() ||
    normalizeMessageText(profile.creator_profile_id ?? '', '').trim();

  const authUid = normalizeMessageText(profile.auth_user_id ?? '', '').trim();
  if (!cpFk && authUid.length) {
    const { data: byAuth } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('auth_user_id', authUid)
      .maybeSingle();
    const hit = normalizeMessageText((byAuth as { id?: unknown } | null)?.id ?? '', '').trim();
    if (hit) cpFk = hit;
  }
  if (!cpFk.length && viewerPid.length) {
    const { data: byUp } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_profile_id', viewerPid)
      .maybeSingle();
    const hitUp = normalizeMessageText((byUp as { id?: unknown } | null)?.id ?? '', '').trim();
    if (hitUp) cpFk = hitUp;
  }

  type AppHydrated = Record<string, unknown> & {
    buyer_requests?: BuyerRequestRow | BuyerRequestRow[] | null;
  };
  const byId = new Map<string, AppHydrated>();

  async function ingest(column: 'creator_profile_id' | 'creator_user_profile_id', val: string) {
    const v = val.trim();
    if (!v.length) return;

    const embed = column === 'creator_profile_id' ? `, buyer_requests(${REQ_INBOX_FIELDS})` : '';

    const { data, error } = await supabase
      .from('request_applications')
      .select(`${APP_FIELDS.trim()}${embed}`)
      .eq(column, v);

    if (error) {
      console.error(`${LOG_TAG} request_applications ${column}:`, error);
      return;
    }

    for (const raw of ((data ?? []) as unknown as AppHydrated[]).map((row) => ({ ...row }))) {
      const id = normalizeMessageText(typeof raw.id === 'string' ? raw.id : null, '').trim();
      if (!id || byId.has(id)) continue;
      const hydrated: AppHydrated = {
        ...(raw as object),
        buyer_requests:
          typeof raw.buyer_requests === 'undefined' || raw.buyer_requests === null ? null : raw.buyer_requests,
      };
      byId.set(id, hydrated);
    }
  }

  if (cpFk) await ingest('creator_profile_id', cpFk);
  await ingest('creator_user_profile_id', viewerPid);

  const appsMerged = [...byId.values()];

  const orders = cpFk ? await fetchOrdersByCreatorProfile(cpFk) : [];
  const orderCreatorIds = uniqStrings(orders.map((o) => normalizeMessageText(o.creator_id ?? '', '').trim()));
  let liteOrders = await loadCreatorProfilesLite(orderCreatorIds);

  const bridSet = uniqStrings([
    ...appsMerged.map((a) => normalizeMessageText(typeof a.buyer_request_id === 'string' ? a.buyer_request_id : null, '').trim()),
    ...orders.map((o) => normalizeMessageText(o.request_id ?? '', '').trim()),
  ]);

  /** Hydrate buyer_requests when embed missing */
  const reqMap = new Map<string, BuyerRequestRow>();

  async function hydrateRequest(rid: string): Promise<void> {
    if (reqMap.has(rid)) return;
    const embedded = appsMerged.find(
      (a) =>
        normalizeMessageText(typeof a.buyer_request_id === 'string' ? a.buyer_request_id : null, '').trim() === rid,
    )?.buyer_requests;
    const one = Array.isArray(embedded) ? embedded[0] : embedded;
    if (one?.id) {
      reqMap.set(rid, one as BuyerRequestRow);
      return;
    }
    const { data } = await supabase
      .from('buyer_requests')
      .select(REQ_INBOX_FIELDS)
      .eq('id', rid)
      .maybeSingle();
    if (data) reqMap.set(rid, data as BuyerRequestRow);
    else reqMap.set(rid, { id: rid } as BuyerRequestRow);
  }

  for (const rid of bridSet) await hydrateRequest(rid);

  const bridToBuyerPid = new Map<string, string>();
  for (const rid of bridSet) {
    const bid = normalizeMessageText((await getBuyerUserProfileIdForBuyerRequest(rid)).id, '').trim();
    bridToBuyerPid.set(rid, bid);
  }

  /** Logged-in creator's user_profiles.id fallback */
  let selfCreatorUp = viewerPid;
  if (!selfCreatorUp.length && cpFk) {
    selfCreatorUp =
      normalizeMessageText((await getCreatorUserProfileIdForCreatorProfile(cpFk)).id, '').trim() || selfCreatorUp;
  }

  const absorbedApps = new Set<string>();

  const rows: ParticipantConversation[] = [];

  for (const order of orders as OrderPipelineRow[]) {
    const rid = normalizeMessageText(order.request_id ?? '', '').trim();
    const cpAssigned = normalizeMessageText(order.creator_id ?? '', '').trim();
    if (!rid || !cpAssigned) continue;

    await hydrateRequest(rid);
    const br = reqMap.get(rid)!;
    const biz = normalizeMessageText(br?.business_name, '').trim() || 'Buyer';
    const mb = normalizeMessageText(br?.build_type ?? order.project_type ?? '', '').trim() || 'MicroBuild';

    if (!liteOrders.has(cpAssigned)) liteOrders = new Map([...(await loadCreatorProfilesLite([cpAssigned])).entries()]);

    let creatorParticipantUp =
      normalizeMessageText((await getCreatorUserProfileIdForCreatorProfile(cpAssigned)).id, '').trim() || null;
    if (!creatorParticipantUp?.trim()) creatorParticipantUp = selfCreatorUp || viewerPid || null;

    const buyerPid = bridToBuyerPid.get(rid) ?? null;

    for (const raw of appsMerged) {
      const ab = normalizeMessageText(typeof raw.buyer_request_id === 'string' ? raw.buyer_request_id : null, '').trim();
      const ac = normalizeMessageText(typeof raw.creator_profile_id === 'string' ? raw.creator_profile_id : null, '').trim();
      const aid = normalizeMessageText(typeof raw.id === 'string' ? raw.id : null, '').trim();
      if (aid && ab === rid && ac === cpAssigned) absorbedApps.add(aid);
    }

    const matchApp =
      appsMerged.find((a) => {
        const ab = normalizeMessageText(typeof a.buyer_request_id === 'string' ? a.buyer_request_id : null, '').trim();
        const ac = normalizeMessageText(typeof a.creator_profile_id === 'string' ? a.creator_profile_id : null, '').trim();
        return ab === rid && ac === cpAssigned;
      }) ?? null;

    const appStatus =
      matchApp ?
        normalizeMessageText(typeof matchApp.application_status === 'string' ? matchApp.application_status : null, '').trim()
      : null;

    rows.push({
      stableId: `order:${order.id.trim()}`,
      anchor: 'order',
      buyerRequestId: rid,
      orderId: order.id.trim(),
      creatorProfileId: cpAssigned,
      buyerUserProfileId: buyerPid,
      creatorUserProfileId: creatorParticipantUp,
      buyerBusinessLabel: biz,
      microbuildLabel: mb,
      creatorNameLabel: readableName(liteOrders.get(cpAssigned)),
      applicationStatus: appStatus ?? null,
      orderPipelineStatus: normalizeMessageText(order.order_status, '').trim(),
      inboxRibbonLabel: 'Project',
    });
  }

  /** Application-phase pairings not folded into projects */
  const appCpIds = uniqStrings(
    appsMerged.map((a) => normalizeMessageText(typeof a.creator_profile_id === 'string' ? a.creator_profile_id : null, '').trim()),
  );
  let liteApplicants = await loadCreatorProfilesLite(appCpIds);

  for (const raw of appsMerged) {
    const ast = normalizeMessageText(typeof raw.application_status === 'string' ? raw.application_status : null).toLowerCase();
    if (ast === 'withdrawn') continue;

    const aid = normalizeMessageText(typeof raw.id === 'string' ? raw.id : null, '').trim();
    if (!aid || absorbedApps.has(aid)) continue;

    const rid = normalizeMessageText(typeof raw.buyer_request_id === 'string' ? raw.buyer_request_id : null, '').trim();
    const cp = normalizeMessageText(typeof raw.creator_profile_id === 'string' ? raw.creator_profile_id : null, '').trim();
    if (!rid || !cp) continue;

    await hydrateRequest(rid);
    const br = reqMap.get(rid)!;
    const biz = normalizeMessageText(br?.business_name, '').trim() || 'Buyer';
    const mb = normalizeMessageText(br.build_type, '').trim() || 'MicroBuild';

    if (!liteApplicants.has(cp)) liteApplicants = new Map([...(await loadCreatorProfilesLite([cp])).entries()]);
    const profLite = liteApplicants.get(cp);

    let creatorParticipantUp =
      creatorUserPid(
        {
          creator_user_profile_id: typeof raw.creator_user_profile_id === 'string' ? raw.creator_user_profile_id : null,
        },
        profLite ?? undefined,
      ) ?? null;
    if (!creatorParticipantUp?.trim()) creatorParticipantUp = (await getCreatorUserProfileIdForCreatorProfile(cp)).id ?? null;

    const buyerPid =
      normalizeMessageText(typeof raw.buyer_user_profile_id === 'string' ? raw.buyer_user_profile_id : null, '').trim()
      || bridToBuyerPid.get(rid)
      || null;

    rows.push({
      stableId: `req:${rid}:cp:${cp}`,
      anchor: 'application',
      buyerRequestId: rid,
      orderId: null,
      creatorProfileId: cp,
      buyerUserProfileId: buyerPid,
      creatorUserProfileId: creatorParticipantUp?.trim()
        ? creatorParticipantUp.trim()
        : selfCreatorUp || viewerPid || null,
      buyerBusinessLabel: biz,
      microbuildLabel: mb,
      creatorNameLabel: readableName(profLite),
      applicationStatus:
        normalizeMessageText(typeof raw.application_status === 'string' ? raw.application_status : null, '').trim() || null,
      orderPipelineStatus: null,
      inboxRibbonLabel: 'Application',
    });
  }

  const dedupByStable = new Map<string, ParticipantConversation>();
  for (const r of rows) dedupByStable.set(r.stableId, r);
  return [...dedupByStable.values()];
}

export async function getUserConversations(
  userProfile: UserProfileRow,
  accountType: MessagingAccountSide,
): Promise<ConversationListItem[]> {
  const acc = normalizeMessageText(userProfile.account_type, '').trim().toLowerCase();
  if (acc === 'admin') return [];

  let rows: ParticipantConversation[] = [];

  if (accountType === 'buyer') {
    if (acc === 'creator') rows = [];
    else rows = await buildBuyerConversationRows(userProfile);
  } else if (accountType === 'creator') {
    if (acc !== 'creator') rows = [];
    else rows = await buildCreatorConversationRows(userProfile, null);
  }

  const orderIds = uniqStrings(rows.map((r) => (r.orderId ?? '').trim()).filter(Boolean));
  const bridIds = uniqStrings(rows.map((r) => r.buyerRequestId.trim()));
  const pool = await fetchMessagePool(bridIds, orderIds);

  const viewerPid = normalizeMessageText(userProfile.id, '').trim();
  const list = await Promise.all(rows.map((r) => finalizeListItem(r, pool, viewerPid)));
  list.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  return list;
}