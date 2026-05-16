/**
 * Plain-text snippets for creator workspace copy buttons (no external APIs).
 */

import type { OrderPipelineRow, BuildPacketWorkspaceRow } from './orders';

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
