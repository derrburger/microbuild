/**
 * Plain-text copy blocks for Project Agreement buttons.
 */

import type { BuyerRequestRow, ProjectProposalRow } from '../types/database';
import { displayAgreementStatus } from './projectAgreementAI';
import {
  parseAgreementFieldsFromProposal,
  displayAgreementPrice,
  displayAgreementTimeline,
} from './agreementFields';

function safe(v: unknown, fb = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb;
}

function section(title: string, body: string): string {
  return [`── ${title} ──`, body || 'Not specified'].join('\n');
}

export function buildFullAgreementCopy(
  proposal: ProjectProposalRow,
  buyerRequest?: BuyerRequestRow | null,
  creatorName?: string | null,
): string {
  const f = parseAgreementFieldsFromProposal(proposal);
  return [
    'PROJECT AGREEMENT',
    'Agreement between buyer and creator.',
    `Status: ${displayAgreementStatus(proposal.agreement_status)}`,
    '',
    section('Project title', f.project_title),
    '',
    buyerRequest ? `Buyer: ${safe(buyerRequest.business_name)} · ${safe(buyerRequest.build_type, 'MicroBuild')}` : '',
    creatorName ? `Creator: ${creatorName}` : '',
    '',
    section('Scope summary', f.scope_summary),
    '',
    section('Included deliverables', f.included_deliverables),
    '',
    section('Not included', f.not_included),
    '',
    `Timeline: ${displayAgreementTimeline(f.timeline)}`,
    `Revision limit: ${f.revision_limit}`,
    `Price (indicative): ${displayAgreementPrice(f.proposed_price)}`,
    '',
    section('Buyer responsibilities', f.buyer_responsibilities),
    '',
    section('Creator responsibilities', f.creator_responsibilities),
    '',
    section('Delivery requirements', f.delivery_requirements),
    '',
    safe(proposal.ai_agreement_summary),
    '',
    proposal.buyer_feedback?.trim() ?
      section('Latest change request', proposal.buyer_feedback.trim())
    : '',
    '',
    'Payment is not active — this agreement confirms scope only for MVP testing.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildBuyerSummaryCopy(proposal: ProjectProposalRow): string {
  const f = parseAgreementFieldsFromProposal(proposal);
  return [
    'BUYER SUMMARY — Project Agreement',
    '',
    safe(proposal.ai_agreement_summary, 'AI-drafted agreement summary.'),
    '',
    section('What is being built', f.scope_summary),
    '',
    section('Included', f.included_deliverables),
    '',
    `Timeline: ${displayAgreementTimeline(f.timeline)}`,
    `Revisions included: ${f.revision_limit}`,
    `Price (indicative): ${displayAgreementPrice(f.proposed_price)}`,
    '',
    section('What you need to provide', f.buyer_responsibilities),
    '',
    'Confirm when scope and timeline match your expectations. Payment comes later.',
  ].join('\n');
}

export function buildCreatorScopeCopy(proposal: ProjectProposalRow): string {
  const f = parseAgreementFieldsFromProposal(proposal);
  return [
    'CREATOR SCOPE — Project Agreement',
    '',
    section('Scope', f.scope_summary),
    '',
    section('Deliverables', f.included_deliverables),
    '',
    section('Not included', f.not_included),
    '',
    `Timeline: ${displayAgreementTimeline(f.timeline)} · Revisions: ${f.revision_limit}`,
    '',
    section('Your responsibilities', f.creator_responsibilities),
    '',
    section('Delivery requirements', f.delivery_requirements),
    '',
    'Confirm only if scope, timeline, and delivery requirements are clear.',
  ].join('\n');
}

export function buildDeliveryRequirementsCopy(proposal: ProjectProposalRow): string {
  const f = parseAgreementFieldsFromProposal(proposal);
  return [
    'DELIVERY REQUIREMENTS',
    '',
    f.delivery_requirements,
    '',
    section('Included deliverables', f.included_deliverables),
    '',
    `Revision limit: ${f.revision_limit}`,
  ].join('\n');
}

export function buildChangeRequestCopy(proposal: ProjectProposalRow, roleLabel = 'Party'): string {
  const note = safe(proposal.buyer_feedback, 'No change note saved yet.');
  const f = parseAgreementFieldsFromProposal(proposal);
  return [
    'AGREEMENT CHANGE REQUEST',
    `Requested by: ${roleLabel}`,
    `Status: ${displayAgreementStatus(proposal.agreement_status)}`,
    '',
    section('Change note', note),
    '',
    section('Current scope snapshot', f.scope_summary),
    '',
    `Timeline: ${displayAgreementTimeline(f.timeline)}`,
    `Price (indicative): ${displayAgreementPrice(f.proposed_price)}`,
    '',
    'Continue discussion in Messages, then regenerate or edit the agreement draft.',
  ].join('\n');
}
