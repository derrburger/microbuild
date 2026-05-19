/**
 * Human-readable status labels and badge tones for marketplace UX.
 * Rules-based only — maps DB enum/snake_case values to plain English.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type StatusDisplay = {
  label: string;
  tone: StatusTone;
  color: string;
};

const TONE_COLORS: Record<StatusTone, string> = {
  success: '#00d478',
  warning: '#f9b032',
  danger: '#ef4444',
  info: '#63b3ed',
  neutral: '#8a94a6',
};

/** Normalize raw DB / form values for lookup */
export function normalizeStatusKey(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

const REQUEST_APPLICATION_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  submitted: { label: 'Waiting for buyer', tone: 'warning' },
  shortlisted: { label: 'Shortlisted', tone: 'info' },
  buyer_selected: { label: 'Selected', tone: 'success' },
  rejected: { label: 'Not selected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  admin_blocked: { label: 'Blocked', tone: 'danger' },
};

const BUYER_REQUEST_MARKETPLACE_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  open: { label: 'Waiting for creators', tone: 'warning' },
  reviewing_applicants: { label: 'Review applicants', tone: 'info' },
  creator_selected: { label: 'Creator selected', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'success' },
};

const BUYER_REQUEST_LEGACY_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  new: { label: 'New', tone: 'info' },
  'in-review': { label: 'Under review', tone: 'info' },
  'in_review': { label: 'Under review', tone: 'info' },
  'needs-more-info': { label: 'Needs more info', tone: 'warning' },
  needs_more_info: { label: 'Needs more info', tone: 'warning' },
  'proposal-sent': { label: 'Proposal sent (legacy)', tone: 'neutral' },
  proposal_sent: { label: 'Proposal sent (legacy)', tone: 'neutral' },
  'in-progress': { label: 'In progress', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  rejected: { label: 'Closed', tone: 'danger' },
};

const ORDER_STATUS_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  draft: { label: 'Draft', tone: 'neutral' },
  ready_to_quote: { label: 'Ready to scope', tone: 'info' },
  pending_payment: { label: 'Payment later', tone: 'warning' },
  assigned: { label: 'Creator assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  submitted_for_review: { label: 'Submitted for review', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  cancelled: { label: 'Canceled', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

const DELIVERY_STATUS_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  draft: { label: 'Not submitted', tone: 'neutral' },
  submitted: { label: 'Delivery submitted', tone: 'warning' },
  in_review: { label: 'In review', tone: 'warning' },
  revision_needed: { label: 'Revision needed', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  delivered: { label: 'Delivered', tone: 'success' },
};

const CREATOR_APPROVAL_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'warning' },
  new: { label: 'Pending review', tone: 'warning' },
  reviewing: { label: 'Under review', tone: 'info' },
  needs_more_info: { label: 'Needs more info', tone: 'warning' },
  approved_pending_payment: { label: 'Approved, payment later', tone: 'success' },
  active: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

const WORKFLOW_AI_LABELS: Record<string, Omit<StatusDisplay, 'color'>> = {
  pending: { label: 'Pending AI review', tone: 'warning' },
  needs_improvement: { label: 'Needs improvement', tone: 'warning' },
  ai_approved: { label: 'AI approved', tone: 'success' },
  published: { label: 'Published', tone: 'success' },
  risk_flagged: { label: 'Risk flagged', tone: 'danger' },
};

function withColor(entry: Omit<StatusDisplay, 'color'>): StatusDisplay {
  return { ...entry, color: TONE_COLORS[entry.tone] };
}

function lookup(
  key: string,
  map: Record<string, Omit<StatusDisplay, 'color'>>,
  fallbackLabel?: string,
): StatusDisplay {
  const k = normalizeStatusKey(key);
  if (k && map[k]) return withColor(map[k]);
  const label =
    fallbackLabel ??
    (k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
  return withColor({ label, tone: 'neutral' });
}

export function formatRequestApplicationStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), REQUEST_APPLICATION_LABELS);
}

/** Buyer reviewing applicants — "submitted" reads as a new application */
export function formatRequestApplicationStatusForBuyer(raw: unknown): StatusDisplay {
  const st = normalizeStatusKey(raw);
  if (st === 'submitted') return withColor({ label: 'Applied', tone: 'info' });
  return formatRequestApplicationStatus(raw);
}

export function formatBuyerMarketplaceStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), BUYER_REQUEST_MARKETPLACE_LABELS);
}

export function formatBuyerRequestStatus(raw: unknown): StatusDisplay {
  const k = normalizeStatusKey(raw);
  const mkt = BUYER_REQUEST_MARKETPLACE_LABELS[k];
  if (mkt) return withColor(mkt);
  return lookup(k, BUYER_REQUEST_LEGACY_LABELS);
}

export function formatOrderStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), ORDER_STATUS_LABELS);
}

export function formatDeliveryStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), DELIVERY_STATUS_LABELS);
}

export function formatCreatorApprovalStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), CREATOR_APPROVAL_LABELS);
}

export function formatWorkflowAiStatus(raw: unknown): StatusDisplay {
  return lookup(normalizeStatusKey(raw), WORKFLOW_AI_LABELS);
}

/** Buyer-facing headline for a request + optional order/deliverable */
export function formatBuyerRequestHeadline(
  request: {
    application_status?: string | null;
    applications_count?: number | null;
    selected_creator_profile_id?: string | null;
  },
  order?: { order_status?: string | null } | null,
  deliverable?: { delivery_status?: string | null } | null,
): StatusDisplay {
  if (order?.order_status) {
    const os = normalizeStatusKey(order.order_status);
    if (os === 'completed') return withColor({ label: 'Completed', tone: 'success' });
    if (os === 'delivered') {
      const ds = normalizeStatusKey(deliverable?.delivery_status);
      if (ds === 'approved') return withColor({ label: 'Delivery submitted', tone: 'success' });
      return withColor({ label: 'Delivery submitted', tone: 'warning' });
    }
    if (os === 'in_progress' || os === 'assigned') {
      return withColor({ label: 'Project in progress', tone: 'info' });
    }
    if (os === 'in_review') return withColor({ label: 'In review', tone: 'warning' });
  }

  const mkt = normalizeStatusKey(request.application_status);
  const cnt = typeof request.applications_count === 'number' ? request.applications_count : 0;
  const hasSelected = Boolean(request.selected_creator_profile_id?.trim());

  if (hasSelected && mkt === 'creator_selected') {
    return withColor({ label: 'Creator selected', tone: 'success' });
  }
  if (cnt > 0 && !hasSelected) {
    return withColor({ label: 'Review applicants', tone: 'warning' });
  }
  if (cnt === 0 && (mkt === 'open' || !mkt)) {
    return withColor({ label: 'Waiting for creators', tone: 'warning' });
  }

  return formatBuyerMarketplaceStatus(request.application_status);
}

/** Creator application selection outcome for buyer */
export function formatCreatorSelectionOutcome(applicationStatus: unknown): StatusDisplay {
  const st = normalizeStatusKey(applicationStatus);
  if (st === 'buyer_selected') return withColor({ label: 'You were selected', tone: 'success' });
  if (st === 'shortlisted') return withColor({ label: 'Shortlisted by buyer', tone: 'info' });
  if (st === 'rejected') return withColor({ label: 'Not selected', tone: 'danger' });
  if (st === 'submitted') return withColor({ label: 'Waiting for buyer', tone: 'warning' });
  return formatRequestApplicationStatus(applicationStatus);
}

export function requestSourceLabel(sourceType: unknown, requestedFromWorkflow?: boolean | null): string {
  const st = normalizeStatusKey(sourceType);
  if (st === 'workflow' || requestedFromWorkflow) return 'Workflow customization';
  return 'Custom request';
}

const TONE_PILL_SUFFIX: Record<StatusTone, string> = {
  success: 'ok',
  warning: 'warn',
  danger: 'err',
  info: 'info',
  neutral: '',
};

export function statusPillClassName(tone: StatusTone): string {
  const suffix = TONE_PILL_SUFFIX[tone];
  return suffix ? `mb-status-pill mb-status-pill--${suffix}` : 'mb-status-pill';
}
