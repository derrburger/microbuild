/**
 * Buyer Requests AI Overview — rules-based only, no external AI APIs.
 */

import { getMissingInfoFlags, type BuyerRequestData } from './buyerAI';
import type { DeliverablePlaceholder, OrderPipelineRow } from './orders';
import {
  type BuyerRequestSnap,
  isWorkflowBackedRequest,
} from './buyerRequestMonitor';
import { isRequestHiddenFromActive } from './buyerRequestManagement';
import { displayAgreementStatus } from './projectAgreementAI';

export type InsightSeverity = 'info' | 'ready' | 'warning' | 'urgent' | 'positive';

export interface BuyerRequestInsight {
  id: string;
  title: string;
  severity: InsightSeverity;
  explanation: string;
  recommendedAction: string;
  requestId?: string;
  targetLabel?: string;
  targetHref?: string;
  targetAnchor?: string;
}

export interface BuyerRequestsOverviewCounts {
  needsReview: number;
  waitingForCreators: number;
  readyToSelect: number;
  activeProjects: number;
  deliveryWaiting: number;
  missingInfo: number;
}

export interface BuyerRequestsOverview {
  counts: BuyerRequestsOverviewCounts;
  nextBestAction: BuyerRequestInsight | null;
  insights: BuyerRequestInsight[];
  emptyState: BuyerRequestInsight | null;
}

export interface BuyerRequestsOverviewContext {
  requests: BuyerRequestSnap[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  deliverablesByOrderId: Record<string, DeliverablePlaceholder | null | undefined>;
  includeHidden?: boolean;
}

function norm(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function requestData(r: BuyerRequestSnap): BuyerRequestData {
  return {
    business_name: r.business_name,
    industry: r.industry ?? undefined,
    build_type: r.build_type,
    main_goal: r.main_goal ?? undefined,
    current_problem: r.current_problem ?? undefined,
    budget: r.budget,
    deadline: r.deadline,
    website_social: r.website_social,
    source_type: r.source_type,
    source_workflow_title: r.source_workflow_title,
    customization_notes: r.customization_notes,
  };
}

function insightId(prefix: string, requestId?: string): string {
  return requestId ? `${prefix}-${requestId}` : prefix;
}

function projectHref(orderId: string, hash?: string): string {
  return `/dashboard/projects/${orderId}${hash ? `#${hash}` : ''}`;
}

export function detectRequestsMissingInfo(requests: BuyerRequestSnap[]): BuyerRequestSnap[] {
  return requests.filter((r) => getMissingInfoFlags(requestData(r)).length > 0);
}

export function detectRequestsNeedingApplicantReview(requests: BuyerRequestSnap[]): BuyerRequestSnap[] {
  return requests.filter((r) => {
    if (isRequestHiddenFromActive(r)) return false;
    const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
    const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
    const mkt = norm(r.application_status);
    return cnt > 0 && !hasSelected && ['open', 'reviewing_applicants', ''].includes(mkt);
  });
}

export function detectStalledRequests(requests: BuyerRequestSnap[]): BuyerRequestSnap[] {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return requests.filter((r) => {
    if (isRequestHiddenFromActive(r)) return false;
    const created = Date.parse(r.created_at);
    if (!Number.isFinite(created) || now - created < weekMs) return false;
    const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
    const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
    return cnt === 0 && !hasSelected;
  });
}

export function detectAgreementActions(
  requests: BuyerRequestSnap[],
  ordersByRequestId: Record<string, OrderPipelineRow>,
): Array<{ request: BuyerRequestSnap; order: OrderPipelineRow }> {
  const out: Array<{ request: BuyerRequestSnap; order: OrderPipelineRow }> = [];
  for (const r of requests) {
    if (isRequestHiddenFromActive(r)) continue;
    const ord = ordersByRequestId[r.id];
    if (!ord?.id) continue;
    const agr = norm(ord.agreement_status);
    const os = norm(ord.order_status);
    if (['completed', 'canceled', 'rejected'].includes(os)) continue;
    if (agr === 'confirmed') continue;
    out.push({ request: r, order: ord });
  }
  return out;
}

export function detectDeliveryActions(
  requests: BuyerRequestSnap[],
  ordersByRequestId: Record<string, OrderPipelineRow>,
  deliverablesByOrderId: Record<string, DeliverablePlaceholder | null | undefined>,
): Array<{ request: BuyerRequestSnap; order: OrderPipelineRow }> {
  const out: Array<{ request: BuyerRequestSnap; order: OrderPipelineRow }> = [];
  for (const r of requests) {
    if (isRequestHiddenFromActive(r)) continue;
    const ord = ordersByRequestId[r.id];
    if (!ord?.id || norm(ord.order_status) !== 'delivered') continue;
    const del = deliverablesByOrderId[ord.id];
    if (norm(del?.delivery_status) !== 'approved') out.push({ request: r, order: ord });
  }
  return out;
}

export function generateRequestInsights(
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
): BuyerRequestInsight[] {
  const insights: BuyerRequestInsight[] = [];
  const title = safeStr(r.business_name).trim() || safeStr(r.source_workflow_title).trim() || 'Your request';
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
  const os = norm(order?.order_status);
  const agr = norm(order?.agreement_status);
  const ds = norm(deliverable?.delivery_status);
  const missing = getMissingInfoFlags(requestData(r));
  const anchor = `#mb-buyer-applicants-${r.id}`;

  if (isRequestHiddenFromActive(r)) return insights;

  if (missing.length > 0 && cnt === 0) {
    insights.push({
      id: insightId('missing', r.id),
      title: 'Missing request details',
      severity: 'warning',
      explanation: `${title} is missing: ${missing.slice(0, 2).join('; ')}.`,
      recommendedAction: 'Add more detail so creators can quote accurately.',
      requestId: r.id,
      targetLabel: 'Add details',
      targetHref: '/request',
      targetAnchor: anchor,
    });
  }

  if (isWorkflowBackedRequest(r) && safeStr(r.customization_notes).trim().length < 40) {
    insights.push({
      id: insightId('wf-notes', r.id),
      title: 'Thin workflow customization',
      severity: 'warning',
      explanation: `${title} needs clearer customization notes for workflow-based builds.`,
      recommendedAction: 'Describe brand, goals, and changes you want from the starter workflow.',
      requestId: r.id,
      targetLabel: 'Browse workflows',
      targetHref: '/browse',
    });
  }

  if (cnt === 0 && !hasSelected) {
    insights.push({
      id: insightId('waiting', r.id),
      title: 'Waiting for creators',
      severity: 'info',
      explanation: `${title} is open — no creator applications yet.`,
      recommendedAction: 'Add budget, deadline, and goal details to attract applicants.',
      requestId: r.id,
      targetLabel: 'Browse workflows',
      targetHref: '/browse',
    });
  }

  if (cnt > 0 && !hasSelected) {
    insights.push({
      id: insightId('review', r.id),
      title: 'Applicants waiting for review',
      severity: 'urgent',
      explanation: `${cnt} creator${cnt !== 1 ? 's' : ''} applied to ${title}.`,
      recommendedAction: 'Compare proposals and select who should build your MicroBuild.',
      requestId: r.id,
      targetLabel: 'Review applicants',
      targetAnchor: anchor,
    });
  }

  if (hasSelected && !order?.id) {
    insights.push({
      id: insightId('proj-sync', r.id),
      title: 'Creator selected — project syncing',
      severity: 'info',
      explanation: `${title} has a selected creator. Your project workspace link may appear shortly.`,
      recommendedAction: 'Refresh this page or message your creator if the workspace does not appear.',
      requestId: r.id,
      targetLabel: 'View details',
      targetAnchor: anchor,
    });
  }

  if (order?.id && agr && agr !== 'confirmed' && !['completed', 'canceled', 'rejected'].includes(os)) {
    const agrLabel = displayAgreementStatus(order.agreement_status);
    insights.push({
      id: insightId('agreement', r.id),
      title: agr === 'changes_requested' ? 'Agreement changes requested' : 'Agreement needs confirmation',
      severity: agr === 'changes_requested' ? 'warning' : 'urgent',
      explanation: `${title} — agreement status: ${agrLabel}.`,
      recommendedAction: 'Review scope and confirm the project agreement in your workspace.',
      requestId: r.id,
      targetLabel: 'Review agreement',
      targetHref: projectHref(order.id, 'agreement'),
    });
  }

  if (os === 'delivered' && ds !== 'approved') {
    insights.push({
      id: insightId('delivery', r.id),
      title: 'Delivery waiting for your review',
      severity: 'urgent',
      explanation: `${title} has a delivery ready for your review.`,
      recommendedAction: 'Preview links and approve delivery or request changes.',
      requestId: r.id,
      targetLabel: 'Review delivery',
      targetHref: projectHref(order!.id, 'delivery'),
    });
  }

  if (os === 'in_progress' || os === 'in_review' || os === 'assigned') {
    insights.push({
      id: insightId('active', r.id),
      title: 'Active project in progress',
      severity: 'ready',
      explanation: `${title} is actively being built.`,
      recommendedAction: 'Track milestones and message your creator in the project workspace.',
      requestId: r.id,
      targetLabel: 'Open project',
      targetHref: projectHref(order!.id),
    });
  }

  if (os === 'completed' || (os === 'delivered' && ds === 'approved')) {
    insights.push({
      id: insightId('done', r.id),
      title: 'MicroBuild complete',
      severity: 'positive',
      explanation: `${title} is complete.`,
      recommendedAction: 'Archive this request or start your next MicroBuild.',
      requestId: r.id,
      targetLabel: 'Browse workflows',
      targetHref: '/browse',
    });
  }

  return insights;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  urgent: 0,
  warning: 1,
  ready: 2,
  info: 3,
  positive: 4,
};

function pickStrongestInsight(insights: BuyerRequestInsight[]): BuyerRequestInsight | null {
  if (insights.length === 0) return null;
  return [...insights].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
}

export function getBuyerRequestNextBestAction(ctx: BuyerRequestsOverviewContext): BuyerRequestInsight | null {
  return generateBuyerRequestsOverview(ctx).nextBestAction;
}

export function generateBuyerRequestsOverview(ctx: BuyerRequestsOverviewContext): BuyerRequestsOverview {
  const visible = ctx.includeHidden
    ? ctx.requests.filter((r) => !norm(r.deleted_at) && norm(r.request_visibility) !== 'deleted')
    : ctx.requests.filter((r) => !isRequestHiddenFromActive(r));

  const counts: BuyerRequestsOverviewCounts = {
    needsReview: 0,
    waitingForCreators: 0,
    readyToSelect: 0,
    activeProjects: 0,
    deliveryWaiting: 0,
    missingInfo: 0,
  };

  const allInsights: BuyerRequestInsight[] = [];

  if (visible.length === 0 && ctx.requests.length === 0) {
    return {
      counts,
      nextBestAction: null,
      insights: [],
      emptyState: {
        id: 'empty-no-requests',
        title: 'No MicroBuild requests yet',
        severity: 'info',
        explanation: 'Start with a reusable workflow or submit a custom request.',
        recommendedAction: 'Browse published workflows or create a custom request.',
        targetLabel: 'Browse workflows',
        targetHref: '/browse',
      },
    };
  }

  for (const r of visible) {
    const ord = ctx.ordersByRequestId[r.id];
    const del = ord?.id ? ctx.deliverablesByOrderId[ord.id] : null;
    const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
    const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
    const os = norm(ord?.order_status);
    const missing = getMissingInfoFlags(requestData(r));

    if (missing.length > 0) counts.missingInfo++;
    if (cnt > 0 && !hasSelected) {
      counts.needsReview++;
      counts.readyToSelect++;
    } else if (cnt === 0 && !hasSelected) {
      counts.waitingForCreators++;
    }
    if (ord && ['assigned', 'in_progress', 'in_review'].includes(os)) counts.activeProjects++;
    if (os === 'delivered' && norm(del?.delivery_status) !== 'approved') counts.deliveryWaiting++;

    allInsights.push(...generateRequestInsights(r, ord, del ?? null));
  }

  const reviewQueue = detectRequestsNeedingApplicantReview(visible);
  if (reviewQueue.length > 1) {
    allInsights.unshift({
      id: 'page-multi-review',
      title: `${reviewQueue.length} requests need applicant review`,
      severity: 'urgent',
      explanation: 'Multiple open requests have creator applications waiting for your decision.',
      recommendedAction: 'Review applicants on each request and select a creator.',
      targetLabel: 'Review applicants',
    });
  }

  const agreementQueue = detectAgreementActions(visible, ctx.ordersByRequestId);
  if (agreementQueue.length > 0) {
    const first = agreementQueue[0];
    allInsights.unshift({
      id: 'page-agreement',
      title: 'Project agreement needs attention',
      severity: 'urgent',
      explanation: `${safeStr(first.request.business_name, 'A project')} needs agreement confirmation.`,
      recommendedAction: 'Open your project workspace and confirm the agreement.',
      requestId: first.request.id,
      targetLabel: 'Review agreement',
      targetHref: projectHref(first.order.id, 'agreement'),
    });
  }

  const deliveryQueue = detectDeliveryActions(visible, ctx.ordersByRequestId, ctx.deliverablesByOrderId);
  if (deliveryQueue.length > 0) {
    const first = deliveryQueue[0];
    allInsights.unshift({
      id: 'page-delivery',
      title: 'Delivery waiting for review',
      severity: 'urgent',
      explanation: `${safeStr(first.request.business_name, 'A project')} has a delivery ready.`,
      recommendedAction: 'Preview and approve delivery or request changes.',
      requestId: first.request.id,
      targetLabel: 'Review delivery',
      targetHref: projectHref(first.order.id, 'delivery'),
    });
  }

  for (const r of detectStalledRequests(visible).slice(0, 2)) {
    allInsights.push({
      id: insightId('stalled', r.id),
      title: 'Request may be stalled',
      severity: 'warning',
      explanation: `${safeStr(r.business_name, 'Your request')} has had no applicants for over a week.`,
      recommendedAction: 'Add more detail or browse similar workflows to refine your scope.',
      requestId: r.id,
      targetLabel: 'Add details',
      targetHref: '/request',
    });
  }

  const deduped = dedupeInsights(allInsights);
  const nextBestAction = pickStrongestInsight(deduped);

  return {
    counts,
    nextBestAction,
    insights: deduped,
    emptyState:
      visible.length === 0 && ctx.requests.length > 0
        ? {
            id: 'empty-all-archived',
            title: 'No active requests',
            severity: 'info',
            explanation:
              'All requests are archived or canceled. Use the Archived or Canceled filter to view history.',
            recommendedAction: 'Submit a new request or browse workflows.',
            targetLabel: 'New request',
            targetHref: '/request',
          }
        : null,
  };
}

function dedupeInsights(items: BuyerRequestInsight[]): BuyerRequestInsight[] {
  const seen = new Set<string>();
  const out: BuyerRequestInsight[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
