/**
 * Parse and serialize Project Agreement structured fields stored on project_proposals.
 * Responsibilities and delivery requirements live in admin_notes; not-included in scope_summary.
 */

import type { ProjectProposalRow } from '../types/database';

const NOT_INCLUDED_MARKER = '── Not included ──';

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function extractBlock(notes: string, label: string): string {
  const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?:\\n\\n|$)`, 'i');
  const m = notes.match(re);
  return m?.[1]?.trim() ?? '';
}

export interface AgreementEditableFields {
  project_title: string;
  scope_summary: string;
  included_deliverables: string;
  not_included: string;
  timeline: string;
  revision_limit: number;
  proposed_price: number | null;
  buyer_responsibilities: string;
  creator_responsibilities: string;
  delivery_requirements: string;
}

export function scopeOnlyText(summary: string | null | undefined): string {
  const s = norm(summary);
  if (!s) return '';
  if (!s.includes(NOT_INCLUDED_MARKER)) return s;
  return s.split(NOT_INCLUDED_MARKER)[0]?.trim() ?? s;
}

export function notIncludedFromScope(summary: string | null | undefined): string {
  const s = norm(summary);
  if (!s.includes(NOT_INCLUDED_MARKER)) return '';
  return s.split(NOT_INCLUDED_MARKER)[1]?.trim() ?? '';
}

export function appendNotIncludedToScope(scope: string, notIncluded: string): string {
  const base = norm(scope);
  const ni = norm(notIncluded);
  if (!ni) return base;
  return `${base}\n\n${NOT_INCLUDED_MARKER}\n${ni}`;
}

export function buildAdminNotesFromAgreementFields(fields: {
  delivery_requirements?: string;
  buyer_responsibilities?: string;
  creator_responsibilities?: string;
}): string {
  return [
    fields.delivery_requirements ? `Delivery requirements:\n${norm(fields.delivery_requirements)}` : '',
    fields.buyer_responsibilities ? `Buyer responsibilities:\n${norm(fields.buyer_responsibilities)}` : '',
    fields.creator_responsibilities ? `Creator responsibilities:\n${norm(fields.creator_responsibilities)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseAgreementFieldsFromProposal(row: ProjectProposalRow): AgreementEditableFields {
  const notes = norm(row.admin_notes);
  const price =
    row.proposed_price == null || row.proposed_price === ''
      ? null
      : typeof row.proposed_price === 'number'
        ? row.proposed_price
        : Number(row.proposed_price) || null;

  return {
    project_title: norm(row.proposal_title) || 'Project Agreement',
    scope_summary: scopeOnlyText(row.scope_summary),
    included_deliverables: norm(row.included_deliverables),
    not_included:
      notIncludedFromScope(row.scope_summary) ||
      'Ongoing hosting, unlimited revisions, and net-new features outside this scope unless added in Messages.',
    timeline: norm(row.timeline),
    revision_limit: typeof row.revision_limit === 'number' ? row.revision_limit : 1,
    proposed_price: price != null && isFinite(price) ? price : null,
    buyer_responsibilities:
      extractBlock(notes, 'Buyer responsibilities') ||
      'Provide timely feedback, brand assets, and access needed to build.',
    creator_responsibilities:
      extractBlock(notes, 'Creator responsibilities') ||
      'Deliver work matching this agreement and flag scope gaps early in Messages.',
    delivery_requirements:
      extractBlock(notes, 'Delivery requirements') ||
      'Preview URL, final delivery link, and revision rounds per agreement.',
  };
}

export function displayAgreementField(value: string | null | undefined, fallback: string): string {
  const v = norm(value);
  return v || fallback;
}

export function displayAgreementPrice(price: number | string | null | undefined): string {
  if (price == null || price === '') return 'Price not confirmed yet';
  const x = typeof price === 'number' ? price : Number(price);
  if (!isFinite(x) || x <= 0) return 'Price not confirmed yet';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export function displayAgreementTimeline(timeline: string | null | undefined): string {
  return norm(timeline) || 'Timeline not confirmed yet';
}
