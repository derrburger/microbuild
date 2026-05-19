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
  PublishedWorkflowInsert,
  PublishedWorkflowRow,
  RequestApplicationInsert,
  RequestApplicationRow,
  UserProfileRow,
} from '../types/database';
import { runWorkflowAIReview } from './workflowAI';
import type { WorkflowReviewInput } from './workflowAI';

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

/** Buyer request came from reusable workflow customization (/request?workflowId=). */
export function isWorkflowCustomizationBuyerRequest(row: BuyerRequestRow | null | undefined): boolean {
  if (!row) return false;
  const st = normalizeText(row.source_type ?? '').toLowerCase();
  return (
    st === 'workflow'
    || Boolean(row.requested_from_workflow)
    || normalizeText(row.source_workflow_title ?? '').length > 0
  );
}

/** Logged-in creator matches `buyer_requests.source_creator_profile_id` on a workflow customization request. */
export function isOriginalWorkflowCreatorForRequest(
  row: BuyerRequestRow | null | undefined,
  creatorProfileId: string | null | undefined,
): boolean {
  const pid = normalizeText(creatorProfileId ?? '');
  const src = normalizeText(row?.source_creator_profile_id ?? '');
  if (!pid || !src || pid !== src) return false;
  return isWorkflowCustomizationBuyerRequest(row);
}

function isTerminalWorkflowOpportunityRow(row: BuyerRequestRow): boolean {
  const legacy = normalizeText(row.status ?? '').toLowerCase().replace(/-/g, '_');
  if (legacy === 'completed' || legacy === 'rejected') return true;
  const app = normalizeText(row.application_status ?? 'open').toLowerCase();
  if (['creator_selected', 'in_progress', 'completed', 'closed'].includes(app)) return true;
  const vis = normalizeText(row.visibility_status ?? 'open').toLowerCase();
  if (['closed', 'completed', 'draft'].includes(vis)) return true;
  return false;
}

/**
 * Creator dashboard: workflow customization requests tied to this publisher’s workflows — excludes terminal rows.
 */
export async function getWorkflowFirstRightBuyerRequestsForCreator(
  creatorProfileId: string,
): Promise<BuyerRequestRow[]> {
  const pid = normalizeText(creatorProfileId);
  if (!pid) return [];

  const { data, error } = await supabase
    .from('buyer_requests')
    .select('*')
    .eq('source_creator_profile_id', pid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getWorkflowFirstRightBuyerRequestsForCreator:', error);
    return [];
  }

  const rows = (data as BuyerRequestRow[]) ?? [];
  return rows.filter((r) => isWorkflowCustomizationBuyerRequest(r) && !isTerminalWorkflowOpportunityRow(r));
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

/** Buyers browse workflows (published storefront slice — AI-visible only). */
export async function getPublishedWorkflowsForBuyers(): Promise<PublishedWorkflowRow[]> {
  const { data, error } = await supabase
    .from('published_workflows')
    .select('*')
    .eq('workflow_status', 'published')
    .eq('visibility_status', 'public')
    .in('ai_review_status', ['published', 'ai_approved'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[marketplace] getPublishedWorkflowsForBuyers:', error);
    return [];
  }

  const rows = (data as PublishedWorkflowRow[]) ?? [];
  return rows.filter((r) => {
    const risks = r.ai_risk_flags;
    return !Array.isArray(risks) || risks.length === 0;
  });
}

/** Published workflow visible for customization requests (anon-safe SELECT must succeed under RLS). */
export async function fetchPublishedWorkflowForPublicRequest(
  workflowId: string,
): Promise<PublishedWorkflowRow | null> {
  const id = normalizeText(workflowId);
  if (!id) return null;

  const { data, error } = await supabase
    .from('published_workflows')
    .select('*')
    .eq('id', id)
    .eq('workflow_status', 'published')
    .eq('visibility_status', 'public')
    .in('ai_review_status', ['published', 'ai_approved'])
    .maybeSingle();

  if (error) {
    console.error('[marketplace] fetchPublishedWorkflowForPublicRequest:', error);
    return null;
  }

  const row = (data as PublishedWorkflowRow) ?? null;
  if (!row) return null;
  const risks = row.ai_risk_flags;
  if (Array.isArray(risks) && risks.length > 0) return null;
  return row;
}

export async function fetchCreatorPublicDisplayName(creatorProfileId: string): Promise<string> {
  const id = normalizeText(creatorProfileId);
  if (!id) return 'Creator';
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('display_name, full_name')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[marketplace] fetchCreatorPublicDisplayName:', error);
    return 'Creator';
  }
  const row = data as { display_name?: string | null; full_name?: string | null };
  const nm = normalizeText(row.display_name) || normalizeText(row.full_name);
  return nm || 'Creator';
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

function slugifyWorkflowTitle(title: string): string {
  const s = normalizeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return s || 'workflow';
}

function parseWorkflowPrice(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function publishedWorkflowToReviewInput(
  row: PublishedWorkflowRow,
  creator?: CreatorProfileRow | null,
): WorkflowReviewInput {
  return {
    title: normalizeText(row.title),
    category: normalizeText(row.category ?? ''),
    targetIndustry: normalizeText(row.target_industry ?? ''),
    description: normalizeText(row.description ?? ''),
    includedFeatures: normalizeText(row.included_features ?? ''),
    setupRequirements: normalizeText(row.setup_requirements ?? ''),
    startingPrice: parseWorkflowPrice(row.starting_price),
    estimatedTurnaround: normalizeText(row.estimated_turnaround ?? ''),
    previewUrl: normalizeText(row.preview_url ?? ''),
    creatorProfile: creator ?? null,
  };
}

export async function fetchPublishedWorkflowForCreator(
  workflowId: string,
  creatorProfileId: string,
): Promise<PublishedWorkflowRow | null> {
  const { data, error } = await supabase
    .from('published_workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('creator_profile_id', creatorProfileId)
    .maybeSingle();

  if (error) {
    console.error('[marketplace] fetchPublishedWorkflowForCreator:', error);
    return null;
  }
  return (data as PublishedWorkflowRow) ?? null;
}

export type CreatorWorkflowContentPatch = Pick<
  PublishedWorkflowRow,
  | 'title'
  | 'slug'
  | 'category'
  | 'target_industry'
  | 'description'
  | 'included_features'
  | 'setup_requirements'
  | 'starting_price'
  | 'estimated_turnaround'
  | 'preview_url'
  | 'cover_image_url'
>;

/** Create draft workflow (hidden, AI not reviewed). */
export async function insertCreatorWorkflowDraft(params: {
  creatorProfileId: string;
  title: string;
  content?: Partial<CreatorWorkflowContentPatch>;
}): Promise<{ ok: boolean; row: PublishedWorkflowRow | null; error: string | null }> {
  const title = normalizeText(params.title);
  if (title.length < 2) {
    return { ok: false, row: null, error: 'Title is required.' };
  }
  const c = params.content ?? {};
  const slugRaw = normalizeText(c.slug ?? '');
  const slug = slugRaw || slugifyWorkflowTitle(title);

  const insert: PublishedWorkflowInsert = {
    creator_profile_id: params.creatorProfileId,
    title,
    slug,
    category: normalizeText(c.category ?? '') || null,
    target_industry: normalizeText(c.target_industry ?? '') || null,
    description: normalizeText(c.description ?? '') || null,
    included_features: normalizeText(c.included_features ?? '') || null,
    setup_requirements: normalizeText(c.setup_requirements ?? '') || null,
    starting_price:
      c.starting_price != null && c.starting_price !== ('' as unknown)
        ? parseWorkflowPrice(c.starting_price)
        : null,
    estimated_turnaround: normalizeText(c.estimated_turnaround ?? '') || null,
    preview_url: normalizeText(c.preview_url ?? '') || null,
    cover_image_url: normalizeText(c.cover_image_url ?? '') || null,
    workflow_status: 'draft',
    visibility_status: 'hidden',
    ai_review_status: 'not_reviewed',
    ai_quality_score: 0,
    ai_publish_readiness: 'not_ready',
    auto_publish_eligible: false,
  };

  const { data, error } = await supabase.from('published_workflows').insert(insert).select('*').maybeSingle();

  if (error) {
    console.error('[marketplace] insertCreatorWorkflowDraft:', error);
    return { ok: false, row: null, error: error.message || 'Could not create workflow.' };
  }

  return { ok: true, row: (data as PublishedWorkflowRow) ?? null, error: null };
}

/** Creator updates editable storefront fields only (not lifecycle / AI columns). */
export async function updateCreatorWorkflowContent(
  workflowId: string,
  creatorProfileId: string,
  patch: Partial<CreatorWorkflowContentPatch>,
): Promise<{ ok: boolean; error: string | null }> {
  const title = patch.title != null ? normalizeText(patch.title) : undefined;
  if (title !== undefined && title.length < 2) {
    return { ok: false, error: 'Title is required.' };
  }

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.title != null) row.title = title;
  if (patch.slug !== undefined) {
    const raw = normalizeText(patch.slug ?? '');
    if (raw) row.slug = slugifyWorkflowTitle(raw);
    else if (patch.title != null) row.slug = slugifyWorkflowTitle(normalizeText(patch.title));
  }
  if (patch.category !== undefined) row.category = normalizeText(patch.category ?? '') || null;
  if (patch.target_industry !== undefined) {
    row.target_industry = normalizeText(patch.target_industry ?? '') || null;
  }
  if (patch.description !== undefined) row.description = normalizeText(patch.description ?? '') || null;
  if (patch.included_features !== undefined) {
    row.included_features = normalizeText(patch.included_features ?? '') || null;
  }
  if (patch.setup_requirements !== undefined) {
    row.setup_requirements = normalizeText(patch.setup_requirements ?? '') || null;
  }
  if (patch.estimated_turnaround !== undefined) {
    row.estimated_turnaround = normalizeText(patch.estimated_turnaround ?? '') || null;
  }
  if (patch.preview_url !== undefined) row.preview_url = normalizeText(patch.preview_url ?? '') || null;
  if (patch.cover_image_url !== undefined) {
    row.cover_image_url = normalizeText(patch.cover_image_url ?? '') || null;
  }
  if (patch.starting_price !== undefined) {
    const p = parseWorkflowPrice(patch.starting_price);
    row.starting_price = p;
  }

  const { error } = await supabase
    .from('published_workflows')
    .update(row)
    .eq('id', workflowId)
    .eq('creator_profile_id', creatorProfileId);

  if (error) {
    console.error('[marketplace] updateCreatorWorkflowContent:', error);
    return { ok: false, error: error.message || 'Could not save workflow.' };
  }
  return { ok: true, error: null };
}

/** Persist rules-based AI fields without changing publish lifecycle (preview / refresh). */
export async function runStoredWorkflowAIReviewOnly(params: {
  workflowId: string;
  creatorProfileId: string;
  creatorProfile: CreatorProfileRow | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const row = await fetchPublishedWorkflowForCreator(params.workflowId, params.creatorProfileId);
  if (!row) return { ok: false, error: 'Workflow not found.' };

  const analysis = runWorkflowAIReview(publishedWorkflowToReviewInput(row, params.creatorProfile));

  const { error } = await supabase
    .from('published_workflows')
    .update({
      ai_quality_score: analysis.qualityScore,
      ai_missing_items: analysis.missingItems,
      ai_risk_flags: analysis.riskFlags,
      ai_suggested_improvements: analysis.suggestedImprovements,
      ai_publish_readiness: analysis.readinessLabel,
      ai_recommended_action: analysis.recommendedAction,
      ai_review_summary: analysis.summary,
      ai_review_status: analysis.aiReviewStatus,
      auto_publish_eligible: analysis.autoPublishEligible,
      ai_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.workflowId)
    .eq('creator_profile_id', params.creatorProfileId);

  if (error) {
    console.error('[marketplace] runStoredWorkflowAIReviewOnly:', error);
    return { ok: false, error: error.message || 'AI review failed to save.' };
  }
  return { ok: true, error: null };
}

/** Submit for AI review — applies AI-first lifecycle (may auto-publish). */
export async function submitStoredWorkflowForAIReview(params: {
  workflowId: string;
  creatorProfileId: string;
  creatorProfile: CreatorProfileRow | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const row = await fetchPublishedWorkflowForCreator(params.workflowId, params.creatorProfileId);
  if (!row) return { ok: false, error: 'Workflow not found.' };

  const analysis = runWorkflowAIReview(publishedWorkflowToReviewInput(row, params.creatorProfile));

  let workflow_status: string;
  let visibility_status: string;
  let ai_review_status: string;

  if (analysis.riskFlags.length > 0) {
    workflow_status = 'hidden';
    visibility_status = 'hidden';
    ai_review_status = 'risk_flagged';
  } else if (analysis.autoPublishEligible) {
    workflow_status = 'published';
    visibility_status = 'public';
    ai_review_status = 'published';
  } else if (analysis.aiReviewStatus === 'ai_approved') {
    workflow_status = 'submitted_for_review';
    visibility_status = 'hidden';
    ai_review_status = 'ai_approved';
  } else {
    workflow_status = 'draft';
    visibility_status = 'hidden';
    ai_review_status = 'needs_improvement';
  }

  const { error } = await supabase
    .from('published_workflows')
    .update({
      ai_quality_score: analysis.qualityScore,
      ai_missing_items: analysis.missingItems,
      ai_risk_flags: analysis.riskFlags,
      ai_suggested_improvements: analysis.suggestedImprovements,
      ai_publish_readiness: analysis.readinessLabel,
      ai_recommended_action: analysis.recommendedAction,
      ai_review_summary: analysis.summary,
      ai_review_status,
      auto_publish_eligible: analysis.autoPublishEligible,
      ai_reviewed_at: new Date().toISOString(),
      workflow_status,
      visibility_status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.workflowId)
    .eq('creator_profile_id', params.creatorProfileId);

  if (error) {
    console.error('[marketplace] submitStoredWorkflowForAIReview:', error);
    return { ok: false, error: error.message || 'Submit for review failed.' };
  }
  return { ok: true, error: null };
}

/** Creator publish after AI approval (score 70–84 band). */
export async function publishCreatorWorkflowAfterAIApproval(params: {
  workflowId: string;
  creatorProfileId: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const row = await fetchPublishedWorkflowForCreator(params.workflowId, params.creatorProfileId);
  if (!row) return { ok: false, error: 'Workflow not found.' };

  const aiSt = normalizeText(row.ai_review_status ?? '');
  if (aiSt !== 'ai_approved') {
    return {
      ok: false,
      error: 'Only workflows that passed AI review can be published.',
    };
  }
  const risks = row.ai_risk_flags;
  if (Array.isArray(risks) && risks.length > 0) {
    return { ok: false, error: 'Risk-flagged workflows cannot be made public.' };
  }

  const { error } = await supabase
    .from('published_workflows')
    .update({
      workflow_status: 'published',
      visibility_status: 'public',
      ai_review_status: 'published',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.workflowId)
    .eq('creator_profile_id', params.creatorProfileId);

  if (error) {
    console.error('[marketplace] publishCreatorWorkflowAfterAIApproval:', error);
    return { ok: false, error: error.message || 'Could not publish workflow.' };
  }
  return { ok: true, error: null };
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

export {
  getMessageThreadPreview as generateMessageThreadPreview,
  insertProjectMessageRow as insertProjectMessage,
  getRequestMessages as fetchProjectMessagesForRequest,
} from './messages';

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
  buyerVerification?: { email: string; authUserId?: string | null },
): Promise<boolean> {
  if (buyerVerification?.email) {
    const { data: row, error: loadErr } = await supabase
      .from('request_applications')
      .select('buyer_request_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (loadErr || !row) {
      console.error('[marketplace] updateRequestApplicationStatus load:', loadErr);
      return false;
    }

    const brid = normalizeText((row as { buyer_request_id?: string }).buyer_request_id ?? '');
    if (!brid) return false;

    const own = await verifyBuyerOwnsRequest(brid, buyerVerification.email, {
      authUserId: buyerVerification.authUserId ?? null,
    });
    if (!own) return false;
  }

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
  if (!normalizeText(params.requestApplicationId)) {
    return { ok: false, error: 'No application selected.' };
  }
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
