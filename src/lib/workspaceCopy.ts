/**
 * Plain-text snippets for creator workspace copy buttons (no external APIs).
 */

import type { OrderPipelineRow, BuildPacketWorkspaceRow, DeliverablePlaceholder } from './orders';

function safeLines(items: string[] | null | undefined): string {
  return (items ?? []).filter(Boolean).map((s) => `• ${s}`).join('\n');
}

function safeFormFields(form_fields: unknown): string[] {
  if (!Array.isArray(form_fields)) return [];
  return form_fields.map((x) => {
    if (x && typeof x === 'object' && 'field' in x && typeof (x as { field?: unknown }).field === 'string') {
      return (x as { field: string }).field;
    }
    return String(x);
  });
}

export function buildCreatorBriefCopy(
  order: OrderPipelineRow,
  packet: BuildPacketWorkspaceRow | null,
): string {
  if (!packet) {
    return [
      `MicroBuild — Creator brief`,
      `Project: ${order.project_title ?? 'Untitled'} (${order.project_type ?? 'MicroBuild'})`,
      '',
      'No build packet is linked yet. Ask MicroBuild admin to save a build packet from the buyer request workflow.',
    ].join('\n');
  }

  const cta =
    packet.suggested_copy &&
    typeof packet.suggested_copy === 'object' &&
    'cta' in packet.suggested_copy
      ? String((packet.suggested_copy as { cta?: unknown }).cta ?? '')
      : '';

  return [
    `MicroBuild — Creator brief`,
    `Project: ${order.project_title ?? 'Untitled'}`,
    `Type: ${order.project_type ?? '—'}`,
    '',
    '— Business summary —',
    packet.business_summary || '—',
    '',
    '— Customer problem —',
    packet.customer_problem || '—',
    '',
    '— Recommended MicroBuild —',
    packet.recommended_build || '—',
    '',
    '— Design direction —',
    packet.design_direction?.trim() ? packet.design_direction : '—',
    '',
    '— Creator instructions —',
    packet.creator_instructions || '—',
    '',
    '— Recommended CTA —',
    cta || '—',
    '',
    '— Suggested page sections —',
    safeLines(packet.suggested_page_sections as string[] | null),
    '',
    '— Form fields —',
    safeLines(safeFormFields(packet.form_fields)),
    '',
    '— Automation —',
    packet.automation_needs || '—',
    '',
    '— Quality checklist —',
    safeLines(packet.quality_checklist as string[] | null),
  ].join('\n');
}

export function buildLaunchChecklistCopy(packet: BuildPacketWorkspaceRow | null): string {
  if (!packet) return 'Launch checklist will appear once a build packet is saved.';
  const lines = safeLines(packet.launch_checklist as string[] | null);
  return ['MicroBuild — Launch checklist', '', lines || '(none listed)'].join('\n');
}

export function buildBuyerUpdateCopy(
  order: OrderPipelineRow,
  packet: BuildPacketWorkspaceRow | null,
): string {
  const summary = packet?.ai_summary ?? packet?.business_summary ?? '';
  return [
    `Hi — quick update on your MicroBuild (${order.project_title ?? 'your project'}).`,
    '',
    summary ? `Where we are: ${summary}` : 'Where we are: Your build is progressing on schedule.',
    '',
    'Next: we’ll share a preview link for feedback before final delivery.',
    '',
    '— MicroBuild team',
  ].join('\n');
}

export function buildRevisionRequestCopy(revisionNote: string): string {
  const body = revisionNote.trim() || '[Describe requested changes]';
  return [
    'Hi — thanks for the submission. We need a few revisions before we can send this to the buyer:',
    '',
    body,
    '',
    'Please update the preview/delivery links and resubmit when ready.',
    '',
    '— MicroBuild team',
  ].join('\n');
}

export function buildCompletionMessageCopy(order: OrderPipelineRow): string {
  return [
    `Hi — your MicroBuild (${order.project_title ?? 'your project'}) is complete.`,
    '',
    'Thank you for working with MicroBuild. If anything needs a tweak, reply and we’ll route it appropriately.',
    '',
    '— MicroBuild team',
  ].join('\n');
}

/** Rules-based operational checklist for creators (static — no AI). */
export const OPERATIONAL_BUILD_CHECKLIST_ITEMS: readonly string[] = [
  'Understand buyer goal — align copy and structure with their stated outcome.',
  'Review business links — scan website/social noted on the request for tone and offerings.',
  'Build page/funnel structure — sections match suggested MicroBuild type.',
  'Add form/CTA — primary conversion matches brief.',
  'Check mobile layout — readable tap targets and spacing.',
  'Add trust/review/proof sections — testimonials or placeholders where brief asks.',
  'Test links/forms — open preview and verify submissions route correctly.',
  'Submit preview — paste staging/preview URL for MicroBuild review.',
  'Submit delivery — paste production/live URL when approved internally.',
];

export function buildOperationalBuildChecklistCopy(): string {
  const lines = OPERATIONAL_BUILD_CHECKLIST_ITEMS.map((s, i) => `${i + 1}. ${s}`);
  return ['MicroBuild — Build checklist', '', ...lines].join('\n');
}

/** Summarize feedback visible to creator (revision note + optional creator submission notes). */
export function buildCreatorFeedbackCopy(revisionNote: string, creatorNotes: string): string {
  const rev = revisionNote.trim();
  const cn = creatorNotes.trim();
  return [
    'MicroBuild — Creator feedback summary',
    '',
    rev ? `— Revision note from MicroBuild —\n${rev}` : '— No active revision note —',
    '',
    cn ? `— Your latest submission notes —\n${cn}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDeliverySummaryCopy(
  order: OrderPipelineRow,
  deliverable: { preview_url?: string | null; live_url?: string | null; github_url?: string | null; delivery_status?: string | null } | null,
  buyerBusiness: string,
): string {
  const prev = deliverable?.preview_url?.trim();
  const live = deliverable?.live_url?.trim();
  const gh = deliverable?.github_url?.trim();
  return [
    `MicroBuild — Delivery summary`,
    `Project: ${order.project_title ?? 'Untitled'}`,
    `Buyer: ${buyerBusiness || 'Unknown request'}`,
    `Order status: ${order.order_status}`,
    `Deliverable status: ${deliverable?.delivery_status ?? 'none'}`,
    '',
    prev ? `Preview: ${prev}` : 'Preview: —',
    live ? `Delivery URL: ${live}` : 'Delivery URL: —',
    gh ? `GitHub (metadata): ${gh}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export type WorkspaceActivityItem = { id: string; title: string; atIso?: string };

export function buildWorkspaceActivityItems(params: {
  order: OrderPipelineRow;
  buyerRequestCreatedAt?: string | null;
  packetUpdatedAt?: string | null;
  deliverable: DeliverablePlaceholder | null;
}): WorkspaceActivityItem[] {
  const { order, buyerRequestCreatedAt, packetUpdatedAt, deliverable } = params;
  const items: WorkspaceActivityItem[] = [];

  if (buyerRequestCreatedAt) {
    items.push({ id: 'req', title: 'Buyer request submitted', atIso: buyerRequestCreatedAt });
  }
  items.push({ id: 'order', title: 'Project record created', atIso: order.created_at });

  if (packetUpdatedAt) {
    items.push({ id: 'packet', title: 'Build packet saved / updated', atIso: packetUpdatedAt });
  }

  if (order.creator_id) {
    items.push({ id: 'assigned', title: 'Creator assigned to project' });
  }

  if (deliverable && deliverable.delivery_status !== 'draft') {
    items.push({
      id: 'submit',
      title: 'Deliverable submitted',
      atIso: deliverable.submitted_at,
    });
  }

  if (deliverable?.delivery_status === 'revision_needed') {
    items.push({
      id: 'revision',
      title: 'Revision requested',
      atIso: deliverable.updated_at,
    });
  }

  if (deliverable?.approved_at) {
    items.push({
      id: 'approved',
      title: 'Deliverable approved internally',
      atIso: deliverable.approved_at,
    });
  }

  if (order.order_status === 'completed') {
    items.push({
      id: 'done',
      title: 'Project marked completed',
      atIso: order.updated_at,
    });
  }

  return items;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
