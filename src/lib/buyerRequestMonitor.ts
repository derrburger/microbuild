/**
 * Buyer Requests page v2 — rules-based monitor, filters, and timeline helpers.
 * No external AI APIs.
 */

import {
  getMissingInfoFlags,
  getCreatorBriefSummary,
  getProposalAngle,
  type BuyerRequestData,
} from './buyerAI';
import { isWorkflowCustomizationBuyerRequest } from './marketplace';
import type { BuyerRequestRow } from '../types/database';
import type { DeliverablePlaceholder, OrderPipelineRow } from './orders';
import { formatBuyerRequestHeadline } from './statusLabels';
import { displayAgreementStatus } from './projectAgreementAI';

export type BuyerRequestFilterId =
  | 'all'
  | 'waiting_for_creators'
  | 'review_applicants'
  | 'creator_selected'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'needs_action';

export type MonitorSeverity = 'info' | 'needs_action' | 'ready';

export interface BuyerRequestsSummary {
  total: number;
  waitingForApplicants: number;
  applicantsToReview: number;
  creatorSelected: number;
  inProgress: number;
  deliveryReview: number;
}

export interface BuyerRequestMonitorInsight {
  insight: string;
  severity: MonitorSeverity;
  recommendedStep: string;
  actionLabel?: string;
  actionTarget?: 'applicants' | 'messages' | 'project' | 'agreement' | 'browse' | 'new_request';
}

export interface BuyerRequestNextAction {
  label: string;
  hint?: string;
  tone: 'neutral' | 'warning' | 'success' | 'info';
}

export interface ParsedStyleNotes {
  visualNotes: string;
  cityState: string;
  instagram: string;
  googleBusiness: string;
  preferredCta: string;
  services: string;
  targetCustomer: string;
  leadSource: string;
  workflowCustomization: string;
}

export interface MarketplaceTimelineStep {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
  dateLabel?: string;
}

export interface BuyerRequestSnap {
  id: string;
  business_name: string;
  build_type: string;
  status: string;
  visibility_status?: string | null;
  created_at: string;
  budget?: string | null;
  deadline?: string | null;
  main_goal?: string | null;
  current_problem?: string | null;
  industry?: string | null;
  website_social?: string | null;
  style_notes?: string | null;
  applications_count?: number | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  source_type?: string | null;
  source_workflow_id?: string | null;
  source_workflow_title?: string | null;
  source_creator_profile_id?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
}

function norm(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase().trim() : '';
}

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function fmtDate(iso: string | null | undefined): string | undefined {
  if (!iso || typeof iso !== 'string') return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(t);
}

export function parseStyleNotesFromBuyerRequest(styleNotes: string | null | undefined): ParsedStyleNotes {
  const raw = safeStr(styleNotes).trim();
  const out: ParsedStyleNotes = {
    visualNotes: '',
    cityState: '',
    instagram: '',
    googleBusiness: '',
    preferredCta: '',
    services: '',
    targetCustomer: '',
    leadSource: '',
    workflowCustomization: '',
  };
  if (!raw) return out;

  const wfMatch = raw.match(/\[Workflow customization\]\s*([\s\S]*?)(?=\n\n\[|$)/i);
  if (wfMatch?.[1]) out.workflowCustomization = wfMatch[1].trim();

  const visualMatch = raw.match(/\[Visual Notes\]\s*([\s\S]*?)(?=\n\n\[|$)/i);
  if (visualMatch?.[1]) out.visualNotes = visualMatch[1].trim();

  const ctxMatch = raw.match(/\[Business Context\]\s*([\s\S]*?)(?=\n\n\[|$)/i);
  const ctxBlock = ctxMatch?.[1] ?? '';
  for (const line of ctxBlock.split('\n')) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key.startsWith('city')) out.cityState = val;
    else if (key.includes('instagram')) out.instagram = val;
    else if (key.includes('google')) out.googleBusiness = val;
    else if (key.includes('cta')) out.preferredCta = val;
    else if (key.includes('services')) out.services = val;
    else if (key.includes('target')) out.targetCustomer = val;
    else if (key.includes('lead')) out.leadSource = val;
  }

  return out;
}

export function requestDisplayTitle(r: BuyerRequestSnap): string {
  const biz = safeStr(r.business_name).trim();
  if (biz) return biz;
  const wf = safeStr(r.source_workflow_title).trim();
  if (wf) return wf;
  return 'MicroBuild request';
}

export function isWorkflowBackedRequest(r: BuyerRequestSnap): boolean {
  return isWorkflowCustomizationBuyerRequest(r as BuyerRequestRow);
}

export function computeBuyerRequestsSummary(
  requests: BuyerRequestSnap[],
  ordersByRequestId: Record<string, OrderPipelineRow>,
  deliverablesByOrderId: Record<string, DeliverablePlaceholder | null | undefined>,
): BuyerRequestsSummary {
  const summary: BuyerRequestsSummary = {
    total: requests.length,
    waitingForApplicants: 0,
    applicantsToReview: 0,
    creatorSelected: 0,
    inProgress: 0,
    deliveryReview: 0,
  };

  for (const r of requests) {
    const ord = ordersByRequestId[r.id];
    const del = ord?.id ? deliverablesByOrderId[ord.id] : null;
    const bucket = classifyBuyerRequestPrimaryFilter(r, ord, del ?? null);
    if (bucket === 'waiting_for_creators') summary.waitingForApplicants++;
    else if (bucket === 'review_applicants') summary.applicantsToReview++;
    else if (bucket === 'creator_selected') summary.creatorSelected++;
    else if (bucket === 'in_progress') summary.inProgress++;
    else if (bucket === 'delivered') summary.deliveryReview++;
  }

  return summary;
}

export function classifyBuyerRequestPrimaryFilter(
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
): BuyerRequestFilterId {
  const monitor = analyzeBuyerRequestMonitor(r, order, deliverable);
  if (monitor.severity === 'needs_action') return 'needs_action';

  const ord = order ?? null;
  const del = deliverable ?? null;
  const os = norm(ord?.order_status);
  const ds = norm(del?.delivery_status);

  if (os === 'completed') return 'completed';
  if (os === 'delivered' && ds !== 'approved') return 'delivered';
  if (os === 'delivered' && ds === 'approved') return 'completed';
  if (['in_progress', 'in_review', 'assigned'].includes(os)) return 'in_progress';

  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
  const mkt = norm(r.application_status);
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;

  if (hasSelected && (mkt === 'creator_selected' || mkt === 'in_progress')) return 'creator_selected';
  if (cnt > 0 && !hasSelected) return 'review_applicants';
  if (cnt === 0 && !hasSelected) return 'waiting_for_creators';

  return 'waiting_for_creators';
}

export function requestMatchesFilter(
  filter: BuyerRequestFilterId,
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
): boolean {
  if (filter === 'all') return true;
  const primary = classifyBuyerRequestPrimaryFilter(r, order, deliverable);
  if (filter === 'needs_action') {
    return analyzeBuyerRequestMonitor(r, order, deliverable).severity === 'needs_action';
  }
  if (filter === 'completed') {
    const os = norm(order?.order_status);
    const ds = norm(deliverable?.delivery_status);
    return os === 'completed' || (os === 'delivered' && ds === 'approved');
  }
  return primary === filter;
}

export function searchMatchesBuyerRequest(
  query: string,
  r: BuyerRequestSnap,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    r.business_name,
    r.build_type,
    r.industry,
    r.source_workflow_title,
    r.main_goal,
  ]
    .map((x) => safeStr(x).toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export function computeBuyerRequestNextAction(
  r: BuyerRequestSnap,
  ord: OrderPipelineRow | undefined,
  deliverable: DeliverablePlaceholder | null | undefined,
): BuyerRequestNextAction {
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const mkt = norm(r.application_status);
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());

  if (ord?.id) {
    const os = norm(ord.order_status);
    const ds = norm(deliverable?.delivery_status ?? '');
    if (os === 'completed') {
      return { label: 'Request another MicroBuild', hint: 'Build finished — start your next project.', tone: 'success' };
    }
    if (os === 'delivered' && ds !== 'approved') {
      return { label: 'Review delivery', hint: 'Preview links are ready — approve or request changes.', tone: 'warning' };
    }
    const agr = norm(ord.agreement_status);
    if (hasSelected && agr && agr !== 'confirmed') {
      return { label: 'Review agreement', hint: 'Confirm scope with your creator in the project workspace.', tone: 'warning' };
    }
    if (['in_progress', 'in_review', 'assigned', 'delivered'].includes(os)) {
      return { label: 'Track project', hint: 'Open your project workspace for status and messages.', tone: 'info' };
    }
  }

  if (hasSelected && mkt === 'creator_selected') {
    return ord?.id
      ? { label: 'Track project', hint: 'Creator assigned — open your project workspace.', tone: 'info' }
      : { label: 'Project setup in progress', hint: 'Your workspace link will appear after sync.', tone: 'info' };
  }

  if (cnt === 0 && !hasSelected) {
    return { label: 'Waiting for creators', hint: 'Creators discover open requests from marketplace browse.', tone: 'warning' };
  }

  if (!hasSelected && cnt > 0) {
    return { label: 'Review applicants', hint: 'Compare proposals and select a creator.', tone: 'warning' };
  }

  if (hasSelected) {
    return { label: 'Message selected creator', hint: 'Align on scope in Messages.', tone: 'info' };
  }

  return { label: 'View request status', tone: 'neutral' };
}

export function analyzeBuyerRequestMonitor(
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
): BuyerRequestMonitorInsight {
  const data: BuyerRequestData = {
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

  const missing = getMissingInfoFlags(data);
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
  const mkt = norm(r.application_status);
  const ord = order ?? null;
  const os = norm(ord?.order_status);
  const ds = norm(deliverable?.delivery_status);
  const agr = norm(ord?.agreement_status);

  if (ord && os === 'delivered' && ds !== 'approved') {
    return {
      insight: 'Delivery is ready for your review.',
      severity: 'needs_action',
      recommendedStep: 'Open your project, preview links, and approve delivery or request changes.',
      actionLabel: 'Review delivery',
      actionTarget: 'project',
    };
  }

  if (hasSelected && ord && agr && agr !== 'confirmed' && !['completed', 'canceled', 'rejected'].includes(os)) {
    return {
      insight: 'Creator selected — agreement not fully confirmed yet.',
      severity: 'needs_action',
      recommendedStep: 'Review and confirm the project agreement in your workspace.',
      actionLabel: 'Review agreement',
      actionTarget: 'agreement',
    };
  }

  if (!hasSelected && cnt > 0 && ['open', 'reviewing_applicants', ''].includes(mkt)) {
    return {
      insight: `${cnt} creator${cnt !== 1 ? 's' : ''} applied — waiting for your review.`,
      severity: 'needs_action',
      recommendedStep: 'Compare applicants and select who should build this MicroBuild.',
      actionLabel: 'Review applicants',
      actionTarget: 'applicants',
    };
  }

  if (isWorkflowBackedRequest(r) && safeStr(r.customization_notes).trim().length < 40) {
    return {
      insight: 'Workflow customization notes are thin.',
      severity: 'needs_action',
      recommendedStep: 'Add brand details and customization goals so creators can quote accurately.',
      actionLabel: 'Browse similar workflows',
      actionTarget: 'browse',
    };
  }

  if (missing.length >= 3 && cnt === 0) {
    return {
      insight: 'Request is missing key business details.',
      severity: 'needs_action',
      recommendedStep: `Add: ${missing.slice(0, 2).join('; ')}.`,
      actionLabel: 'New request with details',
      actionTarget: 'new_request',
    };
  }

  if (cnt === 0 && !hasSelected) {
    return {
      insight: 'No applicants yet — request is open on the marketplace.',
      severity: 'info',
      recommendedStep: 'Add more detail to your goal and budget to attract creator applications.',
      actionLabel: 'Browse workflows',
      actionTarget: 'browse',
    };
  }

  if (hasSelected && ['in_progress', 'assigned', 'in_review'].includes(os)) {
    return {
      insight: 'Build is in progress with your selected creator.',
      severity: 'ready',
      recommendedStep: 'Track milestones in your project workspace and message your creator as needed.',
      actionLabel: 'Open project',
      actionTarget: 'project',
    };
  }

  if (os === 'completed' || (os === 'delivered' && ds === 'approved')) {
    return {
      insight: 'This MicroBuild is complete.',
      severity: 'ready',
      recommendedStep: 'Request another build or browse workflows for your next project.',
      actionLabel: 'Browse workflows',
      actionTarget: 'browse',
    };
  }

  if (hasSelected) {
    return {
      insight: 'Creator assigned — project is moving forward.',
      severity: 'ready',
      recommendedStep: 'Message your creator and confirm agreement details when prompted.',
      actionLabel: 'Message creator',
      actionTarget: 'messages',
    };
  }

  return {
    insight: 'Request submitted and visible in your dashboard.',
    severity: 'info',
    recommendedStep: getProposalAngle(data).slice(0, 160),
    actionLabel: 'View details',
    actionTarget: 'applicants',
  };
}

export function getBuyerRequestAiSummary(r: BuyerRequestSnap): string {
  return getCreatorBriefSummary({
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
  });
}

export function buildMarketplaceRequestTimeline(
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
  selectedAt?: string | null,
): MarketplaceTimelineStep[] {
  const cnt = typeof r.applications_count === 'number' ? r.applications_count : 0;
  const hasSelected = Boolean(r.selected_creator_profile_id?.trim());
  const os = norm(order?.order_status);
  const ds = norm(deliverable?.delivery_status);
  const agr = norm(order?.agreement_status);

  const submittedDone = true;
  const appliedDone = cnt > 0;
  const selectedDone = hasSelected;
  const agreementDone = agr === 'confirmed';
  const buildDone = ['in_progress', 'in_review', 'delivered', 'completed'].includes(os);
  const deliveryDone = os === 'delivered' || os === 'completed';
  const completedDone = os === 'completed' || (os === 'delivered' && ds === 'approved');

  const steps: MarketplaceTimelineStep[] = [
    {
      id: 'submitted',
      label: 'Request submitted',
      done: submittedDone,
      active: !appliedDone && !selectedDone,
      dateLabel: fmtDate(r.created_at),
    },
    {
      id: 'applied',
      label: 'Creators applied',
      done: appliedDone,
      active: appliedDone && !selectedDone,
    },
    {
      id: 'selected',
      label: 'Creator selected',
      done: selectedDone,
      active: selectedDone && !agreementDone && !buildDone,
      dateLabel: fmtDate(selectedAt ?? undefined),
    },
    {
      id: 'agreement',
      label: agreementDone ? 'Agreement confirmed' : 'Agreement pending',
      done: agreementDone,
      active: selectedDone && !agreementDone,
    },
    {
      id: 'build',
      label: 'Build in progress',
      done: buildDone,
      active: ['in_progress', 'in_review', 'assigned'].includes(os),
    },
    {
      id: 'delivery',
      label: 'Delivery submitted',
      done: deliveryDone,
      active: os === 'delivered' && ds !== 'approved',
    },
    {
      id: 'completed',
      label: 'Completed',
      done: completedDone,
      active: completedDone,
    },
  ];

  let foundActive = false;
  return steps.map((s) => {
    if (s.active && !foundActive) {
      foundActive = true;
      return s;
    }
    if (foundActive) return { ...s, active: false };
    return s;
  });
}

export function buyerRequestStatusHeadline(
  r: BuyerRequestSnap,
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
) {
  return formatBuyerRequestHeadline(r, order ?? null, deliverable ?? null);
}

export function agreementStatusLabel(order?: OrderPipelineRow | null): string {
  if (!order?.id) return 'No project yet';
  return displayAgreementStatus(order.agreement_status);
}

export function deliveryStatusLabel(
  order?: OrderPipelineRow | null,
  deliverable?: DeliverablePlaceholder | null,
): string {
  if (!order?.id) return '—';
  const os = norm(order.order_status);
  if (os === 'completed') return 'Completed';
  if (!deliverable) return os === 'delivered' ? 'Awaiting links' : 'Not submitted';
  const ds = norm(deliverable.delivery_status);
  if (ds === 'approved') return 'Approved';
  if (ds === 'revision_needed') return 'Revision in progress';
  if (ds === 'submitted') return 'Submitted — review';
  return 'Preparing';
}
