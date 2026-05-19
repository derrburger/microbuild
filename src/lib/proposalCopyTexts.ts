/**
 * Plain-text blocks for proposal copy buttons (rules-only, no APIs).
 */

import type { BuyerRequestRow, ProjectProposalRow } from '../types/database';
import { displayBuyerApproval, displayProposalLifecycle } from './proposals';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb;
}

function money(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export function buildFullProposalCopy(proposal: ProjectProposalRow, buyerRequest?: BuyerRequestRow | null): string {
  const lines = [
    `MicroBuild — Proposal`,
    `Title: ${safe(proposal.proposal_title, 'Proposal')}`,
    `Proposal status: ${displayProposalLifecycle(proposal.proposal_status)} · Buyer approval: ${displayBuyerApproval(proposal.buyer_approval_status)}`,
    '',
    `── Scope summary ──`,
    safe(proposal.scope_summary, '—'),
    '',
    `── Included deliverables ──`,
    safe(proposal.included_deliverables, '—'),
    '',
    `Timeline: ${safe(proposal.timeline, '—')}`,
    `Revision rounds included: ${typeof proposal.revision_limit === 'number' ? proposal.revision_limit : '—'}`,
    `Proposed price (placeholder): ${money(proposal.proposed_price)}`,
    `Platform fee (placeholder): ${money(proposal.platform_fee)}`,
    `Creator payout (placeholder): ${money(proposal.creator_payout)}`,
    '',
    `── Buyer notes ──`,
    buyerRequest ?
      [
        `Business: ${safe(buyerRequest.business_name)}`,
        `MicroBuild type: ${safe(buyerRequest.build_type)}`,
        safe(buyerRequest.source_workflow_title)
          ? `Workflow customization source: ${buyerRequest.source_workflow_title}`
          : null,
        safe(buyerRequest.customization_notes) ? `Customization notes:\n${buyerRequest.customization_notes}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : '—',
    '',
    proposal.buyer_feedback ? `Buyer feedback on file:\n${proposal.buyer_feedback}` : '',
    proposal.workflow_context_snapshot ? `\n── Frozen workflow snapshot (reference only) ──\n${proposal.workflow_context_snapshot}` : '',
    '',
    `Payments are not active — this text is for MVP alignment only.`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildBuyerScopeSummaryCopy(proposal: ProjectProposalRow): string {
  return [
    `Buyer-facing summary`,
    '',
    safe(proposal.scope_summary, 'Scope details pending.'),
    '',
    `Deliverables:`,
    safe(proposal.included_deliverables, '—'),
    '',
    `Timeline: ${safe(proposal.timeline, '—')}`,
    `Revisions included: ${proposal.revision_limit}`,
    `Indicative investment: ${money(proposal.proposed_price)}`,
  ].join('\n');
}

export function buildCreatorScopeBriefCopy(proposal: ProjectProposalRow): string {
  return [
    `Creator scope brief (from approved/sent proposal row — do not edit here)`,
    '',
    safe(proposal.scope_summary),
    '',
    `Execution checklist (deliverables field):`,
    safe(proposal.included_deliverables),
    '',
    `Timeline commitment: ${safe(proposal.timeline)}`,
    `Revision policy: ${proposal.revision_limit} revision round(s) unless superseded by Messages.`,
    `Price placeholder shown to buyer: ${money(proposal.proposed_price)}`,
  ].join('\n');
}

/** Plain scope block only (for quick paste into Messages). */
export function buildScopeOnlyCopy(proposal: ProjectProposalRow): string {
  return [
    `Scope summary`,
    '',
    safe(proposal.scope_summary, '—'),
    '',
    `Deliverables`,
    safe(proposal.included_deliverables, '—'),
    '',
    `Timeline: ${safe(proposal.timeline, '—')} · Revisions: ${proposal.revision_limit}`,
  ].join('\n');
}

export function buildPaymentPlaceholderMessage(): string {
  return [
    `MicroBuild — Payment notice`,
    '',
    `Checkout and payouts are not wired up yet.`,
    `This milestone only records buyer approval of scope and indicative pricing for testing.`,
    `Stripe / escrow and creator payout protection ship in a later phase.`,
  ].join('\n');
}

export function buildChangeRequestResponseTemplate(): string {
  return [
    `Hi — thanks for the detailed feedback on the proposal.`,
    `Here is how we will adjust scope:`,
    `1) [Concrete change]`,
    `2) [Timeline impact]`,
    `3) [Price impact if any — still placeholder until checkout]`,
    ``,
    `Reply in Messages to confirm and we will re-issue an updated proposal snapshot.`,
  ].join('\n');
}
