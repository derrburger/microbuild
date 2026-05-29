/**
 * MicroBuild — Real Analytics v1
 *
 * Computes metrics from existing Supabase rows. No fake numbers.
 * Rules-based only — no external AI APIs.
 */

import { supabase } from './supabase';
import { analyzeProfileStrength } from './profileAI';
import { normalizeCreatorProfile } from './profiles';
import { fetchDeliverablesByOrderIds, fetchOrdersByCreatorProfile, fetchOrdersByRequestIds } from './orders';
import { isWorkflowCustomizationBuyerRequest } from './marketplace';
import type {
  AccountType,
  BuyerRequestRow,
  CreatorProfileRow,
  ProjectProposalRow,
  PublishedWorkflowRow,
  RequestApplicationRow,
} from '../types/database';

const LOG_TAG = '[analytics]';

export type AnalyticsDateRange = '30d' | 'all';

export interface AnalyticsContext {
  authUserId: string;
  email: string;
  userProfileId: string | null;
  accountType: AccountType | string;
  creatorProfileId: string | null;
  creatorProfile: CreatorProfileRow | null;
  dateRange: AnalyticsDateRange;
}

export interface AnalyticsSectionMeta {
  hasEnoughData: boolean;
  notEnoughLabel: string;
  errors: string[];
}

export interface CreatorApplicationAnalytics extends AnalyticsSectionMeta {
  totalSubmitted: number;
  selected: number;
  rejected: number;
  shortlisted: number;
  selectionRate: number | null;
  avgProposedPrice: number | null;
  avgProposedTimelineLabel: string | null;
  statusBreakdown: Record<string, number>;
}

export interface CreatorProjectAnalytics extends AnalyticsSectionMeta {
  totalAssigned: number;
  inProgress: number;
  delivered: number;
  completed: number;
  needingAction: number;
  stalled: number;
  statusBreakdown: Record<string, number>;
}

export interface CreatorWorkflowAnalytics extends AnalyticsSectionMeta {
  totalCreated: number;
  published: number;
  draft: number;
  needsImprovement: number;
  avgAiQualityScore: number | null;
  requestsFromWorkflows: number;
  statusBreakdown: Record<string, number>;
}

export interface CreatorMessagingAnalytics extends AnalyticsSectionMeta {
  totalThreads: number;
  recentMessageCount: number;
  conversationsNeedingReply: number;
  lastMessageDate: string | null;
}

export interface CreatorDeliverableAnalytics extends AnalyticsSectionMeta {
  submitted: number;
  approved: number;
  needingRevision: number;
  completionRate: number | null;
  statusBreakdown: Record<string, number>;
}

export interface CreatorAgreementAnalytics extends AnalyticsSectionMeta {
  drafted: number;
  buyerConfirmed: number;
  creatorConfirmed: number;
  fullyConfirmed: number;
  changesRequested: number;
  statusBreakdown: Record<string, number>;
}

export interface CreatorProfileAnalytics extends AnalyticsSectionMeta {
  strengthScore: number | null;
  strengthLabel: string | null;
  visibility: string;
  verificationStatus: string;
  missingItems: string[];
}

export interface CreatorAnalyticsOverview {
  context: AnalyticsContext;
  applications: CreatorApplicationAnalytics;
  projects: CreatorProjectAnalytics;
  workflows: CreatorWorkflowAnalytics;
  messaging: CreatorMessagingAnalytics;
  deliverables: CreatorDeliverableAnalytics;
  agreements: CreatorAgreementAnalytics;
  profile: CreatorProfileAnalytics;
  errors: string[];
}

export interface BuyerRequestAnalytics extends AnalyticsSectionMeta {
  totalRequests: number;
  withApplicants: number;
  selectedCreators: number;
  workflowBased: number;
  customRequests: number;
  avgApplicantsPerRequest: number | null;
  statusBreakdown: Record<string, number>;
}

export interface BuyerProjectAnalytics extends AnalyticsSectionMeta {
  activeProjects: number;
  completedProjects: number;
  statusBreakdown: Record<string, number>;
}

export interface BuyerDeliverableAnalytics extends AnalyticsSectionMeta {
  waitingForReview: number;
  approved: number;
  needingRevision: number;
}

export interface BuyerMessagingAnalytics extends AnalyticsSectionMeta {
  openConversations: number;
  recentMessageCount: number;
  conversationsNeedingReply: number;
  lastMessageDate: string | null;
}

export interface BuyerAnalyticsOverview {
  context: AnalyticsContext;
  requests: BuyerRequestAnalytics;
  projects: BuyerProjectAnalytics;
  deliverables: BuyerDeliverableAnalytics;
  messaging: BuyerMessagingAnalytics;
  errors: string[];
}

export interface AdminPlatformAnalytics extends AnalyticsSectionMeta {
  openBuyerRequests: number;
  pendingCreatorApplications: number;
  activeCreators: number;
  publishedWorkflows: number;
  openProjects: number;
  deliverablesNeedingReview: number;
  stalledProjects: number;
  totalMessages: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function norm(v: unknown, fb = ''): string {
  if (typeof v === 'string') return v.trim();
  if (v == null) return fb;
  return String(v).trim();
}

function safeNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateCutoff(range: AnalyticsDateRange): number | null {
  if (range === 'all') return null;
  return Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function inRange(iso: string | null | undefined, range: AnalyticsDateRange): boolean {
  const cutoff = dateCutoff(range);
  if (cutoff == null) return true;
  const t = Date.parse(norm(iso));
  return Number.isFinite(t) && t >= cutoff;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = keyFn(row) || 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function sectionMeta(hasData: boolean, errors: string[] = []): Pick<AnalyticsSectionMeta, 'hasEnoughData' | 'notEnoughLabel' | 'errors'> {
  return {
    hasEnoughData: hasData,
    notEnoughLabel: 'Not enough data yet',
    errors,
  };
}

const REQUEST_APPLICATION_COLS =
  'id, buyer_request_id, order_id, creator_profile_id, creator_user_profile_id, application_status, proposed_price, estimated_timeline, proposal_message, fit_reason, created_at, updated_at';

const WORKFLOW_COLS =
  'id, creator_profile_id, workflow_status, visibility_status, ai_review_status, ai_quality_score, created_at, updated_at';

const PROPOSAL_COLS =
  'id, order_id, buyer_request_id, creator_profile_id, agreement_status, buyer_confirmed_at, creator_confirmed_at, buyer_approval_status, creator_approval_status, created_at, updated_at';

const BUYER_REQUEST_COLS =
  'id, email, status, visibility_status, application_status, applications_count, selected_creator_profile_id, source_type, source_workflow_id, requested_from_workflow, created_at, updated_at';

const MESSAGE_COLS =
  'id, buyer_request_id, order_id, sender_user_profile_id, recipient_user_profile_id, created_at';

type MessageSnap = {
  id: string;
  buyer_request_id: string | null;
  order_id: string | null;
  sender_user_profile_id: string | null;
  recipient_user_profile_id: string | null;
  created_at: string;
};

// ─── Context loader ───────────────────────────────────────────────────────────

export async function loadAnalyticsContext(
  authUserId: string,
  email: string,
  dateRange: AnalyticsDateRange = 'all',
): Promise<AnalyticsContext> {
  const { data: up, error: upErr } = await supabase
    .from('user_profiles')
    .select('id, account_type, email, creator_profile_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (upErr) {
    console.error(`${LOG_TAG} loadAnalyticsContext user_profiles:`, upErr);
  }

  const accountType = norm((up as { account_type?: string } | null)?.account_type, 'buyer');
  const userProfileId = norm((up as { id?: string } | null)?.id) || null;
  let creatorProfileId = norm((up as { creator_profile_id?: string } | null)?.creator_profile_id) || null;
  let creatorProfile: CreatorProfileRow | null = null;

  if (accountType === 'creator') {
    const { data: cp, error: cpErr } = await supabase
      .from('creator_profiles')
      .select(
        'id, display_name, full_name, tier, approval_status, public_profile_status, verification_status, bio, tools, niches, portfolio_links, github_url, linkedin_url, available_hours, certifications, credential_links, proof_links, case_studies, education_or_coursework, skills, badges, completed_builds_count, average_rating, is_active, profile_photo_url, profile_strength_score, user_profile_id, auth_user_id, user_id, created_at, updated_at',
      )
      .or(`user_id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
      .maybeSingle();

    if (cpErr) {
      console.error(`${LOG_TAG} loadAnalyticsContext creator_profiles:`, cpErr);
    } else if (cp) {
      creatorProfile = normalizeCreatorProfile(cp as Record<string, unknown>);
      creatorProfileId = creatorProfile.id;
    }
  }

  return {
    authUserId,
    email: norm(email),
    userProfileId,
    accountType,
    creatorProfileId,
    creatorProfile,
    dateRange,
  };
}

// ─── Creator sections ─────────────────────────────────────────────────────────

async function fetchCreatorApplications(ctx: AnalyticsContext): Promise<RequestApplicationRow[]> {
  if (!ctx.creatorProfileId && !ctx.userProfileId) return [];

  const aggregated = new Map<string, RequestApplicationRow>();

  async function pull(column: 'creator_profile_id' | 'creator_user_profile_id', value: string) {
    const { data, error } = await supabase
      .from('request_applications')
      .select(REQUEST_APPLICATION_COLS)
      .eq(column, value)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`${LOG_TAG} request_applications.${column}:`, error);
      return;
    }
    for (const row of (data ?? []) as RequestApplicationRow[]) {
      if (row?.id) aggregated.set(row.id, row);
    }
  }

  if (ctx.creatorProfileId) await pull('creator_profile_id', ctx.creatorProfileId);
  if (ctx.userProfileId) await pull('creator_user_profile_id', ctx.userProfileId);

  return [...aggregated.values()].filter((r) => inRange(r.created_at, ctx.dateRange));
}

export async function getCreatorApplicationAnalytics(ctx: AnalyticsContext): Promise<CreatorApplicationAnalytics> {
  const errors: string[] = [];
  const rows = await fetchCreatorApplications(ctx);
  const hasData = rows.length > 0;

  const selected = rows.filter((r) => norm(r.application_status).toLowerCase() === 'buyer_selected').length;
  const rejected = rows.filter((r) => norm(r.application_status).toLowerCase() === 'rejected').length;
  const shortlisted = rows.filter((r) => norm(r.application_status).toLowerCase() === 'shortlisted').length;

  const prices = rows.map((r) => safeNum(r.proposed_price)).filter((n): n is number => n != null);
  const timelines = rows
    .map((r) => norm(r.estimated_timeline))
    .filter((t) => t.length > 0);

  const decided = selected + rejected;
  const selectionRate = decided > 0 ? Math.round((selected / decided) * 100) : null;

  return {
    ...sectionMeta(hasData, errors),
    totalSubmitted: rows.length,
    selected,
    rejected,
    shortlisted,
    selectionRate,
    avgProposedPrice: avg(prices),
    avgProposedTimelineLabel: timelines.length > 0 ? timelines.slice(0, 3).join(' · ') : null,
    statusBreakdown: countBy(rows, (r) => norm(r.application_status, 'submitted')),
  };
}

export async function getCreatorProjectAnalytics(ctx: AnalyticsContext): Promise<CreatorProjectAnalytics> {
  const errors: string[] = [];
  if (!ctx.creatorProfileId) {
    return {
      ...sectionMeta(false, errors),
      totalAssigned: 0,
      inProgress: 0,
      delivered: 0,
      completed: 0,
      needingAction: 0,
      stalled: 0,
      statusBreakdown: {},
    };
  }

  const allOrders = await fetchOrdersByCreatorProfile(ctx.creatorProfileId);
  const rows = allOrders.filter((o) => inRange(o.created_at, ctx.dateRange));
  const hasData = rows.length > 0;

  const stalledCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeStatuses = new Set(['assigned', 'in_progress', 'in_review']);
  const actionStatuses = new Set(['assigned', 'in_progress', 'in_review', 'delivered']);

  let inProgress = 0;
  let delivered = 0;
  let completed = 0;
  let needingAction = 0;
  let stalled = 0;

  for (const o of rows) {
    const st = norm(o.order_status, norm(o.status)).toLowerCase();
    if (st === 'in_progress') inProgress += 1;
    if (st === 'delivered') delivered += 1;
    if (st === 'completed') completed += 1;
    if (actionStatuses.has(st)) needingAction += 1;
    if (activeStatuses.has(st)) {
      const updated = Date.parse(norm(o.updated_at));
      if (Number.isFinite(updated) && updated < stalledCutoff) stalled += 1;
    }
  }

  return {
    ...sectionMeta(hasData, errors),
    totalAssigned: rows.length,
    inProgress,
    delivered,
    completed,
    needingAction,
    stalled,
    statusBreakdown: countBy(rows, (o) => norm(o.order_status, norm(o.status, 'unknown'))),
  };
}

export async function getCreatorWorkflowAnalytics(ctx: AnalyticsContext): Promise<CreatorWorkflowAnalytics> {
  const errors: string[] = [];
  if (!ctx.creatorProfileId) {
    return {
      ...sectionMeta(false, errors),
      totalCreated: 0,
      published: 0,
      draft: 0,
      needsImprovement: 0,
      avgAiQualityScore: null,
      requestsFromWorkflows: 0,
      statusBreakdown: {},
    };
  }

  const { data: workflows, error: wfErr } = await supabase
    .from('published_workflows')
    .select(WORKFLOW_COLS)
    .eq('creator_profile_id', ctx.creatorProfileId)
    .order('created_at', { ascending: false });

  if (wfErr) {
    console.error(`${LOG_TAG} published_workflows:`, wfErr);
    errors.push(wfErr.message ?? 'Could not load workflows.');
  }

  const wfRows = ((workflows ?? []) as PublishedWorkflowRow[]).filter((w) =>
    inRange(w.created_at, ctx.dateRange),
  );
  const hasData = wfRows.length > 0;

  const published = wfRows.filter((w) => norm(w.workflow_status).toLowerCase() === 'published').length;
  const draft = wfRows.filter((w) => {
    const st = norm(w.workflow_status).toLowerCase();
    return st === 'draft' || st === 'submitted_for_review';
  }).length;
  const needsImprovement = wfRows.filter((w) => {
    const ai = norm(w.ai_review_status).toLowerCase();
    return ai === 'needs_improvement' || ai === 'needs_review' || ai === 'risk_flagged';
  }).length;

  const scores = wfRows.map((w) => safeNum(w.ai_quality_score)).filter((n): n is number => n != null);

  const workflowIds = wfRows.map((w) => w.id).filter(Boolean);
  let requestsFromWorkflows = 0;
  if (workflowIds.length > 0) {
    const { count, error: brErr } = await supabase
      .from('buyer_requests')
      .select('id', { count: 'exact', head: true })
      .in('source_workflow_id', workflowIds);

    if (brErr) {
      console.error(`${LOG_TAG} buyer_requests source_workflow_id:`, brErr);
      errors.push(brErr.message ?? 'Could not count workflow requests.');
    } else {
      requestsFromWorkflows = count ?? 0;
    }
  }

  return {
    ...sectionMeta(hasData, errors),
    totalCreated: wfRows.length,
    published,
    draft,
    needsImprovement,
    avgAiQualityScore: avg(scores),
    requestsFromWorkflows,
    statusBreakdown: countBy(wfRows, (w) => norm(w.workflow_status, 'draft')),
  };
}

async function fetchMessagesForScope(
  buyerRequestIds: string[],
  orderIds: string[],
): Promise<MessageSnap[]> {
  const reqs = [...new Set(buyerRequestIds.filter(Boolean))];
  const ords = [...new Set(orderIds.filter(Boolean))];
  const out: MessageSnap[] = [];

  if (reqs.length > 0) {
    const { data, error } = await supabase.from('project_messages').select(MESSAGE_COLS).in('buyer_request_id', reqs);
    if (error) console.error(`${LOG_TAG} project_messages by request:`, error);
    else out.push(...((data ?? []) as MessageSnap[]));
  }
  if (ords.length > 0) {
    const { data, error } = await supabase.from('project_messages').select(MESSAGE_COLS).in('order_id', ords);
    if (error) console.error(`${LOG_TAG} project_messages by order:`, error);
    else out.push(...((data ?? []) as MessageSnap[]));
  }

  const dedup = new Map<string, MessageSnap>();
  for (const m of out) {
    if (m?.id) dedup.set(m.id, m);
  }
  return [...dedup.values()];
}

export async function getCreatorMessagingAnalytics(ctx: AnalyticsContext): Promise<CreatorMessagingAnalytics> {
  const errors: string[] = [];
  const apps = await fetchCreatorApplications(ctx);
  const buyerRequestIds = apps.map((a) => a.buyer_request_id).filter(Boolean);
  let orderIds: string[] = [];

  if (ctx.creatorProfileId) {
    const orders = await fetchOrdersByCreatorProfile(ctx.creatorProfileId);
    orderIds = orders.map((o) => o.id);
  }

  const messages = (await fetchMessagesForScope(buyerRequestIds, orderIds)).filter((m) =>
    inRange(m.created_at, ctx.dateRange),
  );

  const threadKeys = new Set<string>();
  for (const m of messages) {
    const key = m.order_id ? `o:${m.order_id}` : `r:${m.buyer_request_id ?? 'unknown'}`;
    threadKeys.add(key);
  }

  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentMessageCount = messages.filter((m) => {
    const t = Date.parse(norm(m.created_at));
    return Number.isFinite(t) && t >= recentCutoff;
  }).length;

  let lastMessageDate: string | null = null;
  for (const m of messages) {
    const t = norm(m.created_at);
    if (!lastMessageDate || Date.parse(t) > Date.parse(lastMessageDate)) lastMessageDate = t;
  }

  let conversationsNeedingReply = 0;
  if (ctx.userProfileId && messages.length > 0) {
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const key = m.order_id ? `o:${m.order_id}` : `r:${m.buyer_request_id ?? 'unknown'}`;
      const list = byThread.get(key) ?? [];
      list.push(m);
      byThread.set(key, list);
    }
    for (const list of byThread.values()) {
      const sorted = [...list].sort((a, b) => Date.parse(norm(b.created_at)) - Date.parse(norm(a.created_at)));
      const last = sorted[0];
      if (!last) continue;
      const sender = norm(last.sender_user_profile_id);
      const recipient = norm(last.recipient_user_profile_id);
      if (recipient === ctx.userProfileId && sender !== ctx.userProfileId) {
        conversationsNeedingReply += 1;
      }
    }
  }

  return {
    ...sectionMeta(messages.length > 0, errors),
    totalThreads: threadKeys.size,
    recentMessageCount,
    conversationsNeedingReply,
    lastMessageDate,
  };
}

export async function getCreatorDeliverableAnalytics(ctx: AnalyticsContext): Promise<CreatorDeliverableAnalytics> {
  const errors: string[] = [];
  if (!ctx.creatorProfileId) {
    return {
      ...sectionMeta(false, errors),
      submitted: 0,
      approved: 0,
      needingRevision: 0,
      completionRate: null,
      statusBreakdown: {},
    };
  }

  const orders = await fetchOrdersByCreatorProfile(ctx.creatorProfileId);
  const orderIds = orders.map((o) => o.id);
  const deliverableMap = await fetchDeliverablesByOrderIds(orderIds);
  const rows = Object.values(deliverableMap).filter((d) => inRange(d.submitted_at, ctx.dateRange));
  const hasData = rows.length > 0;

  const submitted = rows.filter((d) => norm(d.delivery_status).toLowerCase() !== 'draft').length;
  const approved = rows.filter((d) => norm(d.delivery_status).toLowerCase() === 'approved').length;
  const needingRevision = rows.filter((d) => norm(d.delivery_status).toLowerCase() === 'revision_needed').length;
  const completionRate = submitted > 0 ? Math.round((approved / submitted) * 100) : null;

  return {
    ...sectionMeta(hasData, errors),
    submitted,
    approved,
    needingRevision,
    completionRate,
    statusBreakdown: countBy(rows, (d) => norm(d.delivery_status, 'draft')),
  };
}

export async function getCreatorAgreementAnalytics(ctx: AnalyticsContext): Promise<CreatorAgreementAnalytics> {
  const errors: string[] = [];
  if (!ctx.creatorProfileId) {
    return {
      ...sectionMeta(false, errors),
      drafted: 0,
      buyerConfirmed: 0,
      creatorConfirmed: 0,
      fullyConfirmed: 0,
      changesRequested: 0,
      statusBreakdown: {},
    };
  }

  const { data, error } = await supabase
    .from('project_proposals')
    .select(PROPOSAL_COLS)
    .eq('creator_profile_id', ctx.creatorProfileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`${LOG_TAG} project_proposals creator:`, error);
    errors.push(error.message ?? 'Could not load agreements.');
    return {
      ...sectionMeta(false, errors),
      drafted: 0,
      buyerConfirmed: 0,
      creatorConfirmed: 0,
      fullyConfirmed: 0,
      changesRequested: 0,
      statusBreakdown: {},
    };
  }

  const rows = ((data ?? []) as ProjectProposalRow[]).filter((r) => inRange(r.created_at, ctx.dateRange));
  const hasData = rows.length > 0;

  const drafted = rows.filter((r) => {
    const st = norm(r.agreement_status).toLowerCase();
    return !st || st === 'draft';
  }).length;
  const buyerConfirmed = rows.filter((r) => {
    const st = norm(r.agreement_status).toLowerCase();
    return st === 'buyer_confirmed' || Boolean(r.buyer_confirmed_at);
  }).length;
  const creatorConfirmed = rows.filter((r) => {
    const st = norm(r.agreement_status).toLowerCase();
    return st === 'creator_confirmed' || Boolean(r.creator_confirmed_at);
  }).length;
  const fullyConfirmed = rows.filter((r) => norm(r.agreement_status).toLowerCase() === 'confirmed').length;
  const changesRequested = rows.filter((r) => norm(r.agreement_status).toLowerCase() === 'changes_requested').length;

  return {
    ...sectionMeta(hasData, errors),
    drafted,
    buyerConfirmed,
    creatorConfirmed,
    fullyConfirmed,
    changesRequested,
    statusBreakdown: countBy(rows, (r) => norm(r.agreement_status, 'draft')),
  };
}

export function getCreatorProfileAnalytics(ctx: AnalyticsContext): CreatorProfileAnalytics {
  const errors: string[] = [];
  const cp = ctx.creatorProfile;
  if (!cp) {
    return {
      ...sectionMeta(false, errors),
      strengthScore: null,
      strengthLabel: null,
      visibility: '—',
      verificationStatus: '—',
      missingItems: [],
    };
  }

  const strength = analyzeProfileStrength(cp);
  return {
    ...sectionMeta(true, errors),
    strengthScore: strength.score,
    strengthLabel: strength.label,
    visibility: norm(cp.public_profile_status, 'hidden'),
    verificationStatus: norm(cp.verification_status, 'unverified'),
    missingItems: strength.missingItems,
  };
}

export async function getCreatorAnalyticsOverview(ctx: AnalyticsContext): Promise<CreatorAnalyticsOverview> {
  const [
    applications,
    projects,
    workflows,
    messaging,
    deliverables,
    agreements,
  ] = await Promise.all([
    getCreatorApplicationAnalytics(ctx),
    getCreatorProjectAnalytics(ctx),
    getCreatorWorkflowAnalytics(ctx),
    getCreatorMessagingAnalytics(ctx),
    getCreatorDeliverableAnalytics(ctx),
    getCreatorAgreementAnalytics(ctx),
  ]);

  const profile = getCreatorProfileAnalytics(ctx);
  const errors = [
    ...applications.errors,
    ...projects.errors,
    ...workflows.errors,
    ...messaging.errors,
    ...deliverables.errors,
    ...agreements.errors,
    ...profile.errors,
  ];

  return {
    context: ctx,
    applications,
    projects,
    workflows,
    messaging,
    deliverables,
    agreements,
    profile,
    errors,
  };
}

// ─── Buyer sections ───────────────────────────────────────────────────────────

async function fetchBuyerRequests(ctx: AnalyticsContext) {
  const { data, error } = await supabase
    .from('buyer_requests')
    .select(BUYER_REQUEST_COLS)
    .eq('email', ctx.email)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`${LOG_TAG} buyer_requests:`, error);
    return { rows: [] as Array<Record<string, unknown>>, error: error.message ?? 'Could not load requests.' };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((r) =>
    inRange(norm(r.created_at), ctx.dateRange),
  );
  return { rows, error: null };
}

export async function getBuyerRequestAnalytics(ctx: AnalyticsContext): Promise<BuyerRequestAnalytics> {
  const errors: string[] = [];
  const { rows, error } = await fetchBuyerRequests(ctx);
  if (error) errors.push(error);

  const hasData = rows.length > 0;
  const withApplicants = rows.filter((r) => (safeNum(r.applications_count) ?? 0) > 0).length;
  const selectedCreators = rows.filter((r) => norm(r.selected_creator_profile_id).length > 0).length;

  let workflowBased = 0;
  let customRequests = 0;
  for (const r of rows) {
    if (isWorkflowCustomizationBuyerRequest(r as unknown as BuyerRequestRow)) {
      workflowBased += 1;
    } else {
      customRequests += 1;
    }
  }

  const applicantCounts = rows
    .map((r) => safeNum(r.applications_count))
    .filter((n): n is number => n != null);

  return {
    ...sectionMeta(hasData, errors),
    totalRequests: rows.length,
    withApplicants,
    selectedCreators,
    workflowBased,
    customRequests,
    avgApplicantsPerRequest: avg(applicantCounts),
    statusBreakdown: countBy(rows, (r) => norm(r.application_status, norm(r.status, 'new'))),
  };
}

export async function getBuyerProjectAnalytics(ctx: AnalyticsContext): Promise<BuyerProjectAnalytics> {
  const errors: string[] = [];
  const { rows: reqRows, error } = await fetchBuyerRequests(ctx);
  if (error) errors.push(error);

  const requestIds = reqRows.map((r) => norm(r.id)).filter(Boolean);
  const orders = await fetchOrdersByRequestIds(requestIds);
  const filtered = orders.filter((o) => inRange(o.created_at, ctx.dateRange));
  const hasData = filtered.length > 0;

  const activeStatuses = new Set(['assigned', 'in_progress', 'in_review', 'delivered']);
  const activeProjects = filtered.filter((o) => activeStatuses.has(norm(o.order_status).toLowerCase())).length;
  const completedProjects = filtered.filter((o) => norm(o.order_status).toLowerCase() === 'completed').length;

  return {
    ...sectionMeta(hasData, errors),
    activeProjects,
    completedProjects,
    statusBreakdown: countBy(filtered, (o) => norm(o.order_status, 'unknown')),
  };
}

export async function getBuyerDeliverableAnalytics(ctx: AnalyticsContext): Promise<BuyerDeliverableAnalytics> {
  const errors: string[] = [];
  const { rows: reqRows, error } = await fetchBuyerRequests(ctx);
  if (error) errors.push(error);

  const requestIds = reqRows.map((r) => norm(r.id)).filter(Boolean);
  const orders = await fetchOrdersByRequestIds(requestIds);
  const deliverableMap = await fetchDeliverablesByOrderIds(orders.map((o) => o.id));
  const rows = Object.values(deliverableMap).filter((d) => inRange(d.submitted_at, ctx.dateRange));
  const hasData = rows.length > 0;

  return {
    ...sectionMeta(hasData, errors),
    waitingForReview: rows.filter((d) => norm(d.delivery_status).toLowerCase() === 'submitted').length,
    approved: rows.filter((d) => norm(d.delivery_status).toLowerCase() === 'approved').length,
    needingRevision: rows.filter((d) => norm(d.delivery_status).toLowerCase() === 'revision_needed').length,
  };
}

export async function getBuyerMessagingAnalytics(ctx: AnalyticsContext): Promise<BuyerMessagingAnalytics> {
  const errors: string[] = [];
  const { rows: reqRows, error } = await fetchBuyerRequests(ctx);
  if (error) errors.push(error);

  const requestIds = reqRows.map((r) => norm(r.id)).filter(Boolean);
  const orders = await fetchOrdersByRequestIds(requestIds);
  const orderIds = orders.map((o) => o.id);

  const messages = (await fetchMessagesForScope(requestIds, orderIds)).filter((m) =>
    inRange(m.created_at, ctx.dateRange),
  );

  const threadKeys = new Set<string>();
  for (const m of messages) {
    threadKeys.add(m.order_id ? `o:${m.order_id}` : `r:${m.buyer_request_id ?? 'unknown'}`);
  }

  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentMessageCount = messages.filter((m) => {
    const t = Date.parse(norm(m.created_at));
    return Number.isFinite(t) && t >= recentCutoff;
  }).length;

  let lastMessageDate: string | null = null;
  for (const m of messages) {
    const t = norm(m.created_at);
    if (!lastMessageDate || Date.parse(t) > Date.parse(lastMessageDate)) lastMessageDate = t;
  }

  let conversationsNeedingReply = 0;
  if (ctx.userProfileId && messages.length > 0) {
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const key = m.order_id ? `o:${m.order_id}` : `r:${m.buyer_request_id ?? 'unknown'}`;
      const list = byThread.get(key) ?? [];
      list.push(m);
      byThread.set(key, list);
    }
    for (const list of byThread.values()) {
      const sorted = [...list].sort((a, b) => Date.parse(norm(b.created_at)) - Date.parse(norm(a.created_at)));
      const last = sorted[0];
      if (!last) continue;
      if (norm(last.recipient_user_profile_id) === ctx.userProfileId && norm(last.sender_user_profile_id) !== ctx.userProfileId) {
        conversationsNeedingReply += 1;
      }
    }
  }

  return {
    ...sectionMeta(messages.length > 0, errors),
    openConversations: threadKeys.size,
    recentMessageCount,
    conversationsNeedingReply,
    lastMessageDate,
  };
}

export async function getBuyerAnalyticsOverview(ctx: AnalyticsContext): Promise<BuyerAnalyticsOverview> {
  const [requests, projects, deliverables, messaging] = await Promise.all([
    getBuyerRequestAnalytics(ctx),
    getBuyerProjectAnalytics(ctx),
    getBuyerDeliverableAnalytics(ctx),
    getBuyerMessagingAnalytics(ctx),
  ]);

  return {
    context: ctx,
    requests,
    projects,
    deliverables,
    messaging,
    errors: [...requests.errors, ...projects.errors, ...deliverables.errors, ...messaging.errors],
  };
}

// ─── Admin platform metrics ─────────────────────────────────────────────────────

async function countRows(
  label: string,
  run: () => PromiseLike<{ count: number | null; error: { message?: string } | null }>,
  errors: string[],
): Promise<number> {
  const { count, error } = await run();
  if (error) {
    console.error(`${LOG_TAG} admin count ${label}:`, error);
    errors.push(`${label}: ${error.message ?? 'query failed'}`);
    return 0;
  }
  return count ?? 0;
}

export async function getAdminPlatformAnalytics(): Promise<AdminPlatformAnalytics> {
  const errors: string[] = [];

  const openBuyerRequests = await countRows('buyer_requests open', () =>
    supabase
      .from('buyer_requests')
      .select('id', { count: 'exact', head: true })
      .in('visibility_status', ['open', 'reviewing_applicants']),
    errors,
  );

  const pendingCreatorApplications = await countRows('creator_applications pending', () =>
    supabase
      .from('creator_applications')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'reviewing', 'needs_more_info', 'needs_portfolio_review']),
    errors,
  );

  const activeCreators = await countRows('creator_profiles active', () =>
    supabase.from('creator_profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    errors,
  );

  const publishedWorkflows = await countRows('published_workflows', () =>
    supabase.from('published_workflows').select('id', { count: 'exact', head: true }).eq('workflow_status', 'published'),
    errors,
  );

  const openProjects = await countRows('orders open', () =>
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('order_status', ['assigned', 'in_progress', 'in_review', 'delivered']),
    errors,
  );

  const deliverablesNeedingReview = await countRows('deliverables submitted', () =>
    supabase.from('deliverables').select('id', { count: 'exact', head: true }).eq('delivery_status', 'submitted'),
    errors,
  );

  let stalledProjects = 0;
  const stalledCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: stalledCount, error: stalledErr } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('order_status', ['assigned', 'in_progress', 'in_review'])
    .lt('updated_at', stalledCutoff);

  if (stalledErr) {
    console.error(`${LOG_TAG} stalled projects:`, stalledErr);
    errors.push(stalledErr.message ?? 'Could not count stalled projects.');
  } else {
    stalledProjects = stalledCount ?? 0;
  }

  const totalMessages = await countRows('project_messages', () =>
    supabase.from('project_messages').select('id', { count: 'exact', head: true }),
    errors,
  );

  const hasData =
    openBuyerRequests +
      pendingCreatorApplications +
      activeCreators +
      publishedWorkflows +
      openProjects +
      deliverablesNeedingReview +
      totalMessages >
    0;

  return {
    ...sectionMeta(hasData, errors),
    openBuyerRequests,
    pendingCreatorApplications,
    activeCreators,
    publishedWorkflows,
    openProjects,
    deliverablesNeedingReview,
    stalledProjects,
    totalMessages,
  };
}
