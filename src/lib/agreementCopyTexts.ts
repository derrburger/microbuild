/**
 * Plain-text copy blocks for Project Agreement buttons.
 */

import type { BuyerRequestRow, ProjectProposalRow } from '../types/database';
import { displayAgreementStatus } from './projectAgreementAI';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb;
}

function money(n: number | string | null | undefined): string {
  if (n == null || n === '') return 'To be agreed in Messages';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

function deliveryBlock(proposal: ProjectProposalRow): string {
  const notes = safe(proposal.admin_notes);
  const match = notes.match(/Delivery requirements:\s*([\s\S]*?)(?:\n\n|$)/);
  return match?.[1]?.trim() || 'Preview URL, final delivery link, and revision rounds per agreement.';
}

export function buildFullAgreementCopy(
  proposal: ProjectProposalRow,
  buyerRequest?: BuyerRequestRow | null,
  creatorName?: string | null,
): string {
  return [
    `Project Agreement`,
    `Agreement between buyer and creator.`,
    `Status: ${displayAgreementStatus(proposal.agreement_status)}`,
    '',
    safe(proposal.proposal_title, 'Project Agreement'),
    '',
    `── Scope ──`,
    safe(proposal.scope_summary, '—'),
    '',
    `── Included deliverables ──`,
    safe(proposal.included_deliverables, '—'),
    '',
    `Timeline: ${safe(proposal.timeline, '—')}`,
    `Revision limit: ${proposal.revision_limit}`,
    `Indicative price (placeholder): ${money(proposal.proposed_price)}`,
    '',
    `── Delivery requirements ──`,
    deliveryBlock(proposal),
    '',
    buyerRequest ?
      `Buyer: ${safe(buyerRequest.business_name)} · ${safe(buyerRequest.build_type, 'MicroBuild')}`
    : '',
    creatorName ? `Creator: ${creatorName}` : '',
    '',
    safe(proposal.ai_agreement_summary),
    '',
    `Payment is not active — scope confirmation only for MVP testing.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildBuyerSummaryCopy(proposal: ProjectProposalRow): string {
  return [
    `Buyer summary — Project Agreement`,
    '',
    safe(proposal.ai_agreement_summary, 'AI-drafted agreement summary.'),
    '',
    safe(proposal.scope_summary, '—').split('── Not included ──')[0]?.trim(),
    '',
    `Timeline: ${safe(proposal.timeline)} · Revisions: ${proposal.revision_limit}`,
    `Indicative price: ${money(proposal.proposed_price)}`,
    '',
    `This confirms project scope for MVP testing. Payment is not active yet.`,
  ].join('\n');
}

export function buildCreatorScopeCopy(proposal: ProjectProposalRow): string {
  return [
    `Creator scope — Project Agreement`,
    '',
    safe(proposal.scope_summary, '—').split('── Not included ──')[0]?.trim(),
    '',
    `Deliverables:\n${safe(proposal.included_deliverables, '—')}`,
    '',
    `Timeline: ${safe(proposal.timeline)} · Revisions: ${proposal.revision_limit}`,
    `Confirm only if scope, timeline, and delivery requirements are clear.`,
  ].join('\n');
}

export function buildDeliveryRequirementsCopy(proposal: ProjectProposalRow): string {
  return [
    `Delivery requirements`,
    '',
    deliveryBlock(proposal),
    '',
    `Included deliverables:\n${safe(proposal.included_deliverables, '—')}`,
  ].join('\n');
}
