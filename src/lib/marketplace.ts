/**
 * MicroBuild — Marketplace foundation helpers
 *
 * Rules-based summaries only — no external AI APIs.
 */

import {
  assignCreatorToOrder,
  createOrderFromRequest,
  fetchOrderByRequestId,
} from './orders';
import { supabase } from './supabase';
import type {
  BuyerRequestRow,
  CreatorProfileRow,
  ProjectMessageInsert,
  ProjectMessageRow,
  PublishedWorkflowRow,
  RequestApplicationInsert,
  RequestApplicationRow,
  UserProfileRow,
} from '../types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ACTIVE_APPLICATION_STATUSES = [
  'submitted',
  'shortlisted',
  'buyer_selected',
] as const;

export type ActiveApplicationStatus = (typeof ACTIVE_APPLICATION_STATUSES)[number];

// ─── Small utils ──────────────────────────────────────────────────────────────

function normalizeText(v: unknown, fb = ''): string {
  if (typeof v === 'string') return v.trim();
  if (v == null) return fb;
  return String(v).trim();
}

function singleProfile(row: CreatorProfileRow | CreatorProfileRow[] | null): CreatorProfileRow | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

/** Open requests eligible for creator browsing (foundation rules). */
function isBuyerRequestOpenMarketplace(row: BuyerRequestRow): boolean {
  const vr = normalizeText(row.visibility_status ?? 'open', 'open').toLowerCase();
  const app = normalizeText(row.application_status ?? 'open', 'open').toLowerCase();
  if (vr === 'draft' || vr === 'closed' || vr === 'completed') return false;
  if (['creator_selected', 'in_progress', 'completed', 'closed', 'draft'].includes(app)) {
    return false;
  }
  return true;
}

/** Rules-based heuristic: Low / Medium / High */
export function estimateRequestComplexity(row: Partial<BuyerRequestRow>): string {
  const goal = normalizeText(row.main_goal ?? '').length;
  const prob = normalizeText(row.current_problem ?? '').length;
  const budget = normalizeText(row.budget ?? '').length > 3;
  const deadline = normalizeText(row.deadline ?? '').length > 0;
  let score = 0;
  if (goal > 120) score += 2;
  else if (goal > 40) score += 1;
  if (prob > 200) score += 2;
  else if (prob > 60) score += 1;
  if (budget) score += 1;
  if (deadline) score += 1;
  if (score >= 4) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

// ─── Read paths ─────────────────────────────────────────────────────────────────

/** Creator browse: marketplace-open buyer_requests */
export async function getOpenBuyerRequests(): Promise<BuyerRequestRow[]> {
  const { data, error } = await supabase
    .from('buyer_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getOpenBuyerRequests:', error);
    return [];
  }
  const rows = (data as BuyerRequestRow[]) ?? [];
  return rows.filter((r) => isBuyerRequestOpenMarketplace(r));
}

export async function getBuyerRequestApplicationSummary(
  buyerRequestId: string,
): Promise<{ count: number; activeCount: number; row: BuyerRequestRow | null }> {
  const { data: reqRaw } = await supabase
    .from('buyer_requests')
    .select(
      'id, applications_count, application_status, visibility_status, selected_creator_profile_id',
    )
    .eq('id', buyerRequestId)
    .maybeSingle();

  const apps = await supabase
    .from('request_applications')
    .select('id, application_status')
    .eq('buyer_request_id', buyerRequestId);

  const list = (apps.data ?? []) as { application_status?: string | null }[];
  const activeCount = list.filter((a) =>
    ACTIVE_APPLICATION_STATUSES.includes(normalizeText(a.application_status) as ActiveApplicationStatus),
  ).length;

  const reqRow = (reqRaw as BuyerRequestRow | null) ?? null;
  const count =
    typeof reqRow?.applications_count === 'number' ? reqRow.applications_count : list.length;

  return {
    count,
    activeCount,
    row: reqRow ?? null,
  };
}

export async function getCreatorRequestApplications(
  creatorProfileId: string,
): Promise<RequestApplicationRow[]> {
  const { data, error } = await supabase
    .from('request_applications')
    .select('*')
    .eq('creator_profile_id', creatorProfileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getCreatorRequestApplications:', error);
    return [];
  }
  return (data as RequestApplicationRow[]) ?? [];
}

export interface RequestApplicationWithBuyerRequest extends RequestApplicationRow {
  buyer_requests?: BuyerRequestRow | BuyerRequestRow[] | null;
}

/**
 * Canonical creator_profiles resolution for authenticated marketplace flows (Browse + Applications).
 * Tries FK on user_profiles, then creator_profiles.auth_user_id, legacy creator_profiles.user_id,
 * then creator_profiles.user_profile_id ↔ user_profiles.id.
 */
export async function resolveCreatorProfileForMarketplace(
  authUserId: string,
  userProfile: UserProfileRow | null | undefined,
): Promise<CreatorProfileRow | null> {
  const cpFk = normalizeText((userProfile as { creator_profile_id?: string | null })?.creator_profile_id ?? '');
  if (cpFk) {
    const { data, error } = await supabase.from('creator_profiles').select('*').eq('id', cpFk).maybeSingle();
    if (error) console.error('[marketplace] resolveCreatorProfileForMarketplace FK id:', error);
    if (data) return data as CreatorProfileRow;
  }

  const { data: byAuth, error: ea } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (ea) console.error('[marketplace] resolveCreatorProfileForMarketplace auth_user_id:', ea);
  if (byAuth) return byAuth as CreatorProfileRow;

  const { data: legacyUid, error: eb } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (eb) console.error('[marketplace] resolveCreatorProfileForMarketplace user_id(auth):', eb);
  if (legacyUid) return legacyUid as CreatorProfileRow;

  const upPk = normalizeText(userProfile?.id ?? '');
  if (upPk) {
    const { data: byUp, error: ec } = await supabase
      .from('creator_profiles')
      .select('*')
      .eq('user_profile_id', upPk)
      .maybeSingle();

    if (ec) console.error('[marketplace] resolveCreatorProfileForMarketplace user_profile_id:', ec);
    if (byUp) return byUp as CreatorProfileRow;
  }

  return null;
}

const REQUEST_APPLICATION_LIST_FIELDS = `
  id,
  buyer_request_id,
  order_id,
  creator_profile_id,
  creator_user_profile_id,
  buyer_user_profile_id,
  application_status,
  proposal_message,
  fit_reason,
  estimated_timeline,
  proposed_price,
  relevant_workflow_id,
  creator_questions,
  admin_notes,
  buyer_message,
  created_at,
  updated_at
`;

/** Buyer row slice for hydrated application cards (safe if RLS blocks full select). */
const BUYER_REQUEST_CARD_FIELDS =
  'id, business_name, industry, build_type, main_goal, current_problem, budget, deadline, applications_count, application_status, visibility_status';

/**
 * Loads request_applications for the dashboard without embedding buyer_requests (avoids RLS / FK embed failures returning empty).
 * Optional fallback: rows keyed by creator_user_profile_id when profile-id query returns none.
 */
export async function getCreatorApplicationsWithBuyerRequests(
  creatorProfileId: string | null | undefined,
  creatorUserProfileId?: string | null,
): Promise<{
  data: RequestApplicationWithBuyerRequest[];
  errorMessage: string | null;
}> {
  const aggregated = new Map<string, RequestApplicationWithBuyerRequest>();
  let lastErrorMsg: string | null = null;

  async function pullBy(column: 'creator_profile_id' | 'creator_user_profile_id', value: string) {
    const { data, error } = await supabase
      .from('request_applications')
      .select(REQUEST_APPLICATION_LIST_FIELDS.trim().replace(/\s+/g, ' '))
      .eq(column, value)
      .order('created_at', { ascending: false });

    if (error) {
      const msg =
        `[marketplace] getCreatorApplicationsWithBuyerRequests.${column}: ${error.message}${error.details ? ` — ${error.details}` : ''}${error.code ? ` (${error.code})` : ''}`;
      console.error(msg, error);
      lastErrorMsg = error.message ?? 'Could not load applications.';
      return;
    }

    for (const row of ((data ?? []) as unknown as RequestApplicationWithBuyerRequest[])) {
      if (row?.id) aggregated.set(row.id, row);
    }
  }

  const cp = normalizeText(creatorProfileId ?? '');
  const up = normalizeText(creatorUserProfileId ?? '');

  if (cp) await pullBy('creator_profile_id', cp);
  if (up) await pullBy('creator_user_profile_id', up);

  const apps = [...aggregated.values()].sort((a, b) => {
    const ta = Date.parse(normalizeText(a.created_at));
    const tb = Date.parse(normalizeText(b.created_at));
    return (isFinite(tb) ? tb : 0) - (isFinite(ta) ? ta : 0);
  });

  const requestIds = [...new Set(apps.map((a) => normalizeText(a.buyer_request_id)).filter(Boolean))];
  let reqMap = new Map<string, BuyerRequestRow>();

  if (requestIds.length > 0) {
    const { data: reqs, error: brErr } = await supabase
      .from('buyer_requests')
      .select(BUYER_REQUEST_CARD_FIELDS)
      .in('id', requestIds);

    if (brErr) {
      const msg =
        `[marketplace] hydrate buyer_requests: ${brErr.message}${brErr.code ? ` (${brErr.code})` : ''}`;
      console.warn(msg, brErr);
      if (!lastErrorMsg)
        lastErrorMsg =
          'Applications loaded — linked buyer requests could not be fetched (permissions or network). Showing application fields only.';
    } else {
      for (const r of (reqs as BuyerRequestRow[]) ?? []) {
        if (r?.id) reqMap.set(r.id, r);
      }
    }
  }

  const merged: RequestApplicationWithBuyerRequest[] = apps.map((a) => {
    const brid = normalizeText(a.buyer_request_id);
    const brRow = brid ? reqMap.get(brid) : undefined;
    return {
      ...a,
      ...(brRow ? { buyer_requests: brRow as BuyerRequestRow } : {}),
    };
  });

  return { data: merged, errorMessage: lastErrorMsg };
}

/** IDs of requests this creator still has an active application against */
export async function getActiveAppliedBuyerRequestIds(
  creatorProfileId: string,
): Promise<string[]> {
  const rows = await getCreatorRequestApplications(creatorProfileId);
  return rows
    .filter((r) =>
      ACTIVE_APPLICATION_STATUSES.includes(
        normalizeText(r.application_status) as ActiveApplicationStatus,
      ),
    )
    .map((r) => r.buyer_request_id);
}

/** Returns true when this creator already has a submitted | shortlisted | buyer_selected row. */
export async function hasCreatorAlreadyApplied(
  buyerRequestId: string,
  creatorProfileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('request_applications')
    .select('id')
    .eq('buyer_request_id', buyerRequestId)
    .eq('creator_profile_id', creatorProfileId)
    .in('application_status', [...ACTIVE_APPLICATION_STATUSES])
    .limit(1);

  if (error) {
    console.error('[marketplace] hasCreatorAlreadyApplied:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export interface BuyerApplicantResolved extends RequestApplicationRow {
  creator_profiles?: CreatorProfileRow | CreatorProfileRow[] | null;
}

/** Buyer-facing: applicants joined to creator_profiles — assume request ownership verified by caller */
export async function getRequestApplicantsForBuyer(
  buyerRequestId: string,
): Promise<BuyerApplicantResolved[]> {
  const { data, error } = await supabase
    .from('request_applications')
    .select('*, creator_profiles(*)')
    .eq('buyer_request_id', buyerRequestId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getRequestApplicantsForBuyer:', error);
    return [];
  }

  const rows =
    (data as (BuyerApplicantResolved & { creator_profiles?: CreatorProfileRow | CreatorProfileRow[] | null })[]) ?? [];

  return rows.map((r) => ({
    ...r,
    creator_profiles: r.creator_profiles ?? null,
  }));
}

/** Reconcile denormalized count with table rows */
export async function syncBuyerRequestApplicationCount(requestId: string): Promise<number> {
  const { count, error } = await supabase
    .from('request_applications')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_request_id', requestId);

  if (error) {
    console.error('[marketplace] syncBuyerRequestApplicationCount:', error);
  }

  const finalCount =
    typeof count === 'number'
      ? count
      : ((
          await supabase.from('request_applications').select('id').eq('buyer_request_id', requestId)
        ).data?.length ?? 0);

  await supabase
    .from('buyer_requests')
    .update({
      applications_count: finalCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  return finalCount;
}

/** Buyers browse workflows (published storefront slice). */
export async function getPublishedWorkflowsForBuyers(): Promise<PublishedWorkflowRow[]> {
  const { data, error } = await supabase
    .from('published_workflows')
    .select('*')
    .eq('workflow_status', 'published')
    .eq('visibility_status', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getPublishedWorkflowsForBuyers:', error);
    return [];
  }

  return (data as PublishedWorkflowRow[]) ?? [];
}

export async function getCreatorPublishedWorkflows(
  creatorProfileId: string,
): Promise<PublishedWorkflowRow[]> {
  const { data, error } = await supabase
    .from('published_workflows')
    .select('*')
    .eq('creator_profile_id', creatorProfileId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getCreatorPublishedWorkflows:', error);
    return [];
  }

  return (data as PublishedWorkflowRow[]) ?? [];
}

// ─── Rules-based “AI” summaries ────────────────────────────────────────────────

/** One short sentence for applicant cards before stored summary exists */
export function generateApplicantFitSummarySnippet(app: Partial<RequestApplicationRow>): string {
  const tl = normalizeText(app.estimated_timeline);
  const price =
    app.proposed_price != null ? `Quoted around ${normalizeText(app.proposed_price)}.` : '';
  const fit = normalizeText(app.fit_reason);
  if (fit.length > 0) return fit.slice(0, 240);
  if (tl.length > 0) return `${price} Timeline narrative: ${tl}`.slice(0, 240);
  return 'Fit summary pending — rules will score after profile joins load.';
}

export function generateRequestApplicationAISummary(
  app: RequestApplicationRow | BuyerApplicantResolved,
  creator: CreatorProfileRow | CreatorProfileRow[] | null,
): string {
  const p = singleProfile(creator ?? null);
  const name = normalizeText(p?.display_name ?? p?.full_name, 'Creator');
  const tier = normalizeText(p?.tier, 'free');
  const vs = normalizeText(p?.verification_status, 'unverified');
  const nicheHit = overlapHint(
    `${p?.tools?.join?.(' ') ?? ''} ${p?.niches?.join?.(' ') ?? ''}`,
    normalizeText((app as RequestApplicationRow).proposal_message ?? '')
      + normalizeText(p?.bio ?? ''),
  );
  const parts = [
    `${name} (${tier}; ${vs}).`,
    normalizeText(app.proposal_message)?.slice(0, 180)
      ? `Proposal excerpt: "${normalizeText(app.proposal_message).slice(0, 180)}…"`
      : 'Proposal excerpt not provided.',
    normalizeText(app.fit_reason) ? `Fit: ${normalizeText(app.fit_reason).slice(0, 120)}.` : '',
    nicheHit,
  ].filter(Boolean);

  const scoreLine = generateApplicantFitScoreDisplay(app as RequestApplicationRow, p);
  return `${parts.join(' ')} Estimated match score band: ${scoreLine}.`;
}

export function generateApplicantFitScore(
  app: RequestApplicationRow | BuyerApplicantResolved,
  creator: CreatorProfileRow | null,
  buyerRequest?: Partial<BuyerRequestRow> | null,
): number {
  let score = 40;
  if (normalizeText(app.proposal_message).length > 40) score += 10;
  if (normalizeText(app.fit_reason).length > 40) score += 8;
  if (normalizeText(app.estimated_timeline).length > 10) score += 5;

  const tierBoost: Record<string, number> = { free: 0, professional: 8, verified: 18 };
  const t = normalizeText(creator?.tier, '').toLowerCase();
  score += tierBoost[t] ?? 0;

  const vs = normalizeText(creator?.verification_status, '').toLowerCase();
  if (vs === 'verified') score += 8;
  if (typeof creator?.profile_strength_score === 'number' && isFinite(creator.profile_strength_score)) {
    score += Math.round(Math.min(creator.profile_strength_score, 85) / 10);
  }

  const toolsSkills = [...(creator?.tools ?? []), ...(creator?.skills ?? [])];
  if (
    toolsSkills.some((s) =>
      normalizeText((buyerRequest?.build_type ?? '') + ' ' + (buyerRequest?.main_goal ?? ''))
        .toLowerCase()
        .includes(normalizeText(s).toLowerCase()),
    )
  )
    score += 6;

  return Math.min(100, Math.max(25, score));
}

function generateApplicantFitScoreDisplay(
  app: RequestApplicationRow,
  creator: CreatorProfileRow | null,
): string {
  const n = generateApplicantFitScore(app, creator);
  if (n >= 75) return 'Strong';
  if (n >= 55) return 'Good';
  return 'Emerging';
}

function overlapHint(creatorHaystack: string, requestHay: string): string {
  const words = creatorHaystack
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  let hits = 0;
  for (const w of words) if (requestHay.toLowerCase().includes(w)) hits += 1;
  return hits >= 4 ? `Keyword overlap with request context (${hits} cues).` : '';
}

export function generateBuyerApplicantComparison(
  items: BuyerApplicantResolved[],
  buyerRequest?: Partial<BuyerRequestRow>,
): string {
  const sorted = [...items].sort((a, b) => {
    const sa = generateApplicantFitScore(
      a,
      singleProfile(a.creator_profiles ?? null),
      buyerRequest ?? null,
    );
    const sb = generateApplicantFitScore(
      b,
      singleProfile(b.creator_profiles ?? null),
      buyerRequest ?? null,
    );
    return sb - sa;
  });
  const bullets = sorted.slice(0, 5).map((row, i) => {
    const nm = creatorDisplayName(row.creator_profiles ?? null);
    const score = generateApplicantFitScore(
      row,
      singleProfile(row.creator_profiles ?? null),
      buyerRequest ?? null,
    );
    const price = row.proposed_price != null ? ` — listed ${normalizeText(row.proposed_price)}` : '';
    return `${i + 1}. ${nm} (${score}/100${price}).`;
  });
  const lines = bullets.length ? bullets.join('\n') : 'No comparable applicants.';
  const note =
    buyerRequest?.build_type ?
      `\nCompared against MicroBuild scope: "${normalizeText(buyerRequest.build_type)}".`
    : '';

  return `Rules-based sorting (tier, verification, proposal depth, overlap):\n${lines}${note}`;
}

export function generateMessageThreadPreview(messages: ProjectMessageRow[]): string {
  const last = [...messages].sort((a, b) => {
    const ta = Date.parse(normalizeText(a.created_at));
    const tb = Date.parse(normalizeText(b.created_at));
    return tb - ta;
  })[0];
  if (!last) return 'No messages yet — start the thread refresh-based (realtime deferred).';

  const who = normalizeText(last.sender_role, 'Participant');
  const excerpt = normalizeText(last.message_body).slice(0, 140);
  return `Latest (${who}): ${excerpt}${excerpt.length >= 140 ? '…' : ''}`;
}

// ─── Apply flow ─────────────────────────────────────────────────────────────────

export interface ApplyToBuyerRequestParams {
  buyerRequestId: string;
  creatorProfileId: string;
  creatorUserProfileId?: string | null;
  buyerUserProfileId?: string | null;
  proposal_message: string;
  fit_reason: string;
  estimated_timeline: string;
  proposed_price?: number | null;
  relevant_workflow_id?: string | null;
  creator_questions?: string | null;
  relevant_workflow_url?: string | null;
}

/** Submit creator application — duplicate guard + DB uniqueness */
export async function applyToBuyerRequest(params: ApplyToBuyerRequestParams): Promise<{
  ok: boolean;
  error: string | null;
  duplicate?: boolean;
}> {
  if (normalizeText(params.proposal_message).length < 8) {
    return { ok: false, error: 'Please write a fuller proposal message (at least two sentences).' };
  }

  if (await hasCreatorAlreadyApplied(params.buyerRequestId, params.creatorProfileId)) {
    return {
      ok: false,
      error: 'You already have an active application for this request.',
      duplicate: true,
    };
  }

  let body = normalizeText(params.proposal_message);

  let workflowId = params.relevant_workflow_id ?? null;
  const urlTrim = normalizeText(params.relevant_workflow_url ?? '');
  if (!workflowId && urlTrim) body = `${body}\nPortfolio / workflow link: ${urlTrim}`;

  const insertPayload: RequestApplicationInsert = {
    buyer_request_id: params.buyerRequestId,
    creator_profile_id: params.creatorProfileId,
    creator_user_profile_id: params.creatorUserProfileId ?? null,
    buyer_user_profile_id: params.buyerUserProfileId ?? null,
    proposal_message: body,
    fit_reason: normalizeText(params.fit_reason) || null,
    estimated_timeline: normalizeText(params.estimated_timeline) || null,
    proposed_price:
      params.proposed_price != null && isFinite(Number(params.proposed_price)) ?
        Number(params.proposed_price)
      : null,
    relevant_workflow_id: workflowId,
    creator_questions: normalizeText(params.creator_questions ?? '') || null,
    application_status: 'submitted',
  };

  const { error } = await supabase.from('request_applications').insert(insertPayload);

  if (error) {
    const msg = normalizeText(error.message);
    const duplicate =
      msg.toLowerCase().includes('uniq_request_apps_active_creator') ||
      msg.toLowerCase().includes('duplicate') ||
      error.code === '23505';
    console.error('[marketplace] applyToBuyerRequest:', error);
    return {
      ok: false,
      error:
        duplicate ? 'You already have an active application for this request.' : (
          msg || 'Could not submit application.'
        ),
      duplicate,
    };
  }

  await syncBuyerRequestApplicationCount(params.buyerRequestId);
  await supabase
    .from('buyer_requests')
    .update({
      application_status: 'reviewing_applicants',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.buyerRequestId);

  return { ok: true, error: null };
}

export async function verifyBuyerOwnsRequest(
  buyerRequestId: string,
  buyerEmail: string,
  opts?: { authUserId?: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('buyer_requests')
    .select('email, user_id')
    .eq('id', buyerRequestId)
    .maybeSingle();

  if (error || !data) return false;

  type Row = { email?: string; user_id?: string | null };
  const row = data as Row;
  const em = normalizeText(row.email).toLowerCase();
  const emailOwns = em === normalizeText(buyerEmail).toLowerCase();

  const auth = normalizeText(opts?.authUserId ?? '');
  const buyerUid = normalizeText(row.user_id ?? '');
  const userLinked =
    Boolean(auth.length && buyerUid.length) && buyerUid !== '' && buyerUid === auth;

  return emailOwns || userLinked;
}

export async function updateRequestApplicationStatus(
  applicationId: string,
  next:
    | 'submitted'
    | 'shortlisted'
    | 'buyer_selected'
    | 'rejected'
    | 'withdrawn'
    | 'admin_blocked',
): Promise<boolean> {
  const { error } = await supabase
    .from('request_applications')
    .update({ application_status: next, updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    console.error('[marketplace] updateRequestApplicationStatus:', error);
    return false;
  }
  return true;
}

export function creatorDisplayName(edge: CreatorProfileRow | CreatorProfileRow[] | null): string {
  const p = singleProfile(edge ?? null);
  const d = normalizeText(p?.display_name);
  const f = normalizeText(p?.full_name);
  return d || f || 'Creator';
}

/**
 * Buyer picks a creator application — rejects other actives, links request row, assigns order.
 */
export async function selectCreatorForRequest(params: {
  buyerRequestId: string;
  requestApplicationId: string;
  buyerEmail: string;
  buyerProfile: UserProfileRow;
}): Promise<{ ok: boolean; error: string | null }> {
  const own = await verifyBuyerOwnsRequest(params.buyerRequestId, params.buyerEmail, {
    authUserId: params.buyerProfile.auth_user_id ?? null,
  });
  if (!own) return { ok: false, error: 'You cannot modify this request.' };

  const { data: appRaw, error: appErr } = await supabase
    .from('request_applications')
    .select('id, buyer_request_id, creator_profile_id, application_status')
    .eq('id', params.requestApplicationId)
    .maybeSingle();

  if (appErr || !appRaw) return { ok: false, error: 'Application not found.' };

  const app = appRaw as {
    id: string;
    buyer_request_id: string;
    creator_profile_id: string;
    application_status?: string | null;
  };
  if (app.buyer_request_id !== params.buyerRequestId) {
    return { ok: false, error: 'Application does not match this request.' };
  }

  const appSt = normalizeText(app.application_status).toLowerCase();

  const { data: br } = await supabase.from('buyer_requests').select('*').eq('id', params.buyerRequestId).maybeSingle();
  const request = br as BuyerRequestRow | null;
  if (!request) return { ok: false, error: 'Request not found.' };

  const reqAppSt = normalizeText(request.application_status).toLowerCase();
  const existingPick = normalizeText(request.selected_request_application_id);

  if (
    appSt === 'buyer_selected' &&
    app.id === params.requestApplicationId &&
    reqAppSt === 'creator_selected' &&
    existingPick === params.requestApplicationId
  ) {
    const orderRes = await createOrUpdateOrderFromSelectedApplication({
      buyerRequest: request,
      creatorProfileId: app.creator_profile_id,
      requestApplicationId: params.requestApplicationId,
      buyerDbUserId: request.user_id,
    });
    if (!orderRes.ok) return { ok: false, error: orderRes.error ?? 'Could not sync project order.' };
    await syncBuyerRequestApplicationCount(params.buyerRequestId);
    return { ok: true, error: null };
  }

  if (!['submitted', 'shortlisted'].includes(appSt)) {
    return { ok: false, error: 'This application cannot be selected in its current state.' };
  }

  if (
    existingPick &&
    existingPick !== params.requestApplicationId &&
    ['creator_selected', 'in_progress', 'completed'].includes(reqAppSt)
  ) {
    return { ok: false, error: 'A creator is already selected for this request.' };
  }

  await supabase
    .from('request_applications')
    .update({ application_status: 'rejected', updated_at: new Date().toISOString() })
    .eq('buyer_request_id', params.buyerRequestId)
    .neq('id', params.requestApplicationId)
    .in('application_status', ['submitted', 'shortlisted']);

  await supabase
    .from('request_applications')
    .update({
      application_status: 'buyer_selected',
      updated_at: new Date().toISOString(),
      buyer_user_profile_id: params.buyerProfile?.id ?? null,
    })
    .eq('id', params.requestApplicationId);

  await supabase
    .from('buyer_requests')
    .update({
      selected_creator_profile_id: app.creator_profile_id,
      selected_request_application_id: params.requestApplicationId,
      application_status: 'creator_selected',
      visibility_status: 'creator_selected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.buyerRequestId);

  const orderRes = await createOrUpdateOrderFromSelectedApplication({
    buyerRequest: request,
    creatorProfileId: app.creator_profile_id,
    requestApplicationId: params.requestApplicationId,
    buyerDbUserId: request.user_id,
  });

  if (!orderRes.ok) return { ok: false, error: orderRes.error ?? 'Could not finalize project row.' };

  await syncBuyerRequestApplicationCount(params.buyerRequestId);
  return { ok: true, error: null };
}

export async function createOrUpdateOrderFromSelectedApplication(params: {
  buyerRequest: BuyerRequestRow;
  creatorProfileId: string;
  requestApplicationId: string;
  buyerDbUserId?: string | null;
}): Promise<{ ok: boolean; error: string | null; orderId?: string | null }> {
  const existing = await fetchOrderByRequestId(params.buyerRequest.id);
  let orderId = existing?.id ?? null;

  if (!orderId) {
    const created = await createOrderFromRequest({
      requestId: params.buyerRequest.id,
      buildType: params.buyerRequest.build_type ?? 'Quote Funnel',
      projectTitle: `MicroBuild — ${params.buyerRequest.business_name}`,
      buyerUserId: params.buyerDbUserId ?? undefined,
    });
    if (!created) return { ok: false, error: 'Failed to create order.' };
    orderId = created.id;
  }

  const assigned = await assignCreatorToOrder(orderId, params.creatorProfileId);
  if (!assigned) return { ok: false, error: 'Could not assign creator to project order.' };

  const titleFromRequest = normalizeText(params.buyerRequest.business_name)
    ? `MicroBuild — ${normalizeText(params.buyerRequest.business_name)}`
    : null;
  const typeFromRequest = normalizeText(params.buyerRequest.build_type) || null;

  const { error } = await supabase
    .from('orders')
    .update({
      request_application_id: params.requestApplicationId,
      selected_by_buyer: true,
      selection_method: 'buyer_selected',
      updated_at: new Date().toISOString(),
      order_status: 'assigned',
      creator_id: params.creatorProfileId,
      ...(titleFromRequest ? { project_title: titleFromRequest } : {}),
      ...(typeFromRequest ? { project_type: typeFromRequest } : {}),
    })
    .eq('id', orderId);

  if (error) {
    console.error('[marketplace] createOrUpdateOrderFromSelectedApplication:', error);
    return { ok: false, error: error.message };
  }

  await supabase
    .from('request_applications')
    .update({ order_id: orderId, updated_at: new Date().toISOString() })
    .eq('id', params.requestApplicationId);

  return { ok: true, error: null, orderId };
}

// ─── Messages v1 (refresh-only) ───────────────────────────────────────────────

export async function fetchProjectMessagesForRequest(
  buyerRequestId: string,
): Promise<ProjectMessageRow[]> {
  const { data, error } = await supabase
    .from('project_messages')
    .select('*')
    .eq('buyer_request_id', buyerRequestId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[marketplace] fetchProjectMessagesForRequest:', error);
    return [];
  }

  const rows = (data as ProjectMessageRow[]) ?? [];
  return [...rows];
}

export async function insertProjectMessage(
  payload: ProjectMessageInsert,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('project_messages').insert(payload);
  if (error) return { ok: false, error: error.message ?? 'Could not save message.' };
  return { ok: true, error: null };
}
