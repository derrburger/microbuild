/**
 * Rules-based Project Agreement drafting (buyer ↔ creator).
 * No external AI APIs.
 */

import type { BuyerRequestRow, ProjectProposalRow, RequestApplicationRow, PublishedWorkflowRow } from '../types/database';
import type { OrderPipelineRow } from './orders';
import type { BuildPacketSnippet } from './proposals';
import { parseBudgetHint, workflowBackedRequest } from './proposals';
import type { DeliverablePlaceholder } from './orders';

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return null;
}

export type AgreementCompleteness = 'needs_work' | 'almost_ready' | 'ready_to_confirm' | 'confirmed';

export interface ProjectAgreementDraft {
  project_title: string;
  buyer_goal: string;
  creator_role: string;
  scope_summary: string;
  included_deliverables: string;
  not_included: string;
  timeline: string;
  revision_limit: number;
  proposed_price: number | null;
  platform_fee: number | null;
  creator_payout: number | null;
  delivery_requirements: string;
  buyer_responsibilities: string;
  creator_responsibilities: string;
  next_step: string;
  ai_agreement_summary: string;
  ai_missing_scope_items: string[];
  ai_risk_flags: string[];
  ai_recommended_next_step: string;
  workflow_context_snapshot: string | null;
}

export interface AgreementAnalysisInput {
  draft: ProjectAgreementDraft;
  buyerRequest: BuyerRequestRow;
  order?: OrderPipelineRow | null;
  application?: RequestApplicationRow | null;
  deliverable?: DeliverablePlaceholder | null;
  proposal?: ProjectProposalRow | null;
}

export function generateProjectAgreementDraft(params: {
  buyerRequest: BuyerRequestRow;
  order?: OrderPipelineRow | null;
  application?: RequestApplicationRow | null;
  buildPacket?: BuildPacketSnippet | null;
  publishedWorkflow?: PublishedWorkflowRow | null;
  creatorDisplayName?: string | null;
}): ProjectAgreementDraft {
  const { buyerRequest: br, application: app, buildPacket: bp, publishedWorkflow: wf } = params;
  const biz = norm(br.business_name) || 'Buyer business';
  const buildType = norm(br.build_type) || 'MicroBuild';
  const goal = norm(br.main_goal) || 'Improve conversion for your service business.';
  const problem = norm(br.current_problem);
  const deadline = norm(br.deadline) || 'Align in Messages after both parties confirm';
  const creatorName = norm(params.creatorDisplayName) || 'Assigned creator';

  const budgetHint = parseBudgetHint(br.budget);
  const appPrice = app ? num(app.proposed_price) : null;
  const wfPrice = wf ? num(wf.starting_price) : null;
  let proposed = appPrice ?? wfPrice ?? budgetHint;
  if (proposed != null && proposed < 0) proposed = null;

  const platformPct = 0.1;
  const platformFee = proposed != null ? Math.round(proposed * platformPct * 100) / 100 : null;
  const creatorPayout =
    proposed != null && platformFee != null ? Math.round((proposed - platformFee) * 100) / 100 : null;

  const wfCtx = workflowBackedRequest(br);
  const wfTitle = norm(br.source_workflow_title) || (wf ? norm(wf.title) : '');
  const customization = norm(br.customization_notes);

  const sections = Array.isArray(bp?.suggested_page_sections) ? bp!.suggested_page_sections!.filter(Boolean) : [];
  const included = [
    `• One ${buildType} build delivered to the agreed scope below`,
    sections.length
      ? `• Page/workflow sections: ${sections.slice(0, 8).join(', ')}`
      : `• Standard ${buildType} layout with primary conversion path`,
    `• Mobile-friendly layout with readable tap targets`,
    `• Preview link for review before final delivery handoff`,
    `• One round of fixes within the revision limit unless otherwise noted`,
    wfCtx && wfTitle ? `• Customization based on workflow “${wfTitle}”` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const notIncluded = [
    '• Domain registration, hosting bills, or ad spend',
    '• Unlimited revision rounds beyond the stated limit',
    '• Major new features or integrations outside this scope',
    '• Ongoing maintenance after delivery handoff',
    '• Payment processing or escrow (deferred — price is indicative only)',
  ].join('\n');

  const timelinePieces = [
    app?.estimated_timeline ? `Creator estimate: ${norm(app.estimated_timeline)}` : null,
    wf?.estimated_turnaround ? `Template hint: ${norm(wf.estimated_turnaround)}` : null,
    `Buyer target: ${deadline}`,
  ].filter(Boolean);

  const revisionLimit =
    norm(app?.fit_reason).length > 120 || (num(app?.proposed_price) != null && num(app!.proposed_price)! > 1500) ?
      2
    : 1;

  const title =
    wfCtx && wfTitle ? `Project Agreement — ${biz} × ${creatorName} (${wfTitle})` : `Project Agreement — ${biz} × ${creatorName}`;

  const scopeParts = [
    `What is being built: a ${buildType} for ${biz}.`,
    `Buyer goal: ${goal}`,
    problem ? `Problem to solve: ${problem}` : null,
    bp?.creator_instructions ? `Build instructions: ${norm(bp.creator_instructions).slice(0, 400)}` : null,
    wfCtx && wfTitle ?
      `Workflow base: “${wfTitle}”. Customization notes:\n${customization || 'See buyer request for details.'}`
    : customization ?
      `Buyer notes:\n${customization}`
    : null,
    app?.proposal_message ?
      `Creator application summary:\n${norm(app.proposal_message).slice(0, 600)}`
    : null,
  ].filter(Boolean);

  const deliveryReq = [
    'Creator provides a working preview URL before final delivery when possible.',
    'Final delivery includes a live/deployed link or documented handoff instructions.',
    'Creator notes what was built, how to test forms/links, and any credentials in the deliverable submission.',
    'Buyer reviews within a reasonable window and requests revisions only inside the agreed limit.',
  ].join('\n');

  const buyerResp = [
    'Provide logo, brand colors, copy, and any logins needed to complete the build.',
    'Respond to creator questions in Messages within a reasonable time.',
    'Confirm this agreement only when scope, timeline, and price placeholder match your expectations.',
    'Payment is not active yet — this confirms scope only.',
  ].join('\n');

  const creatorResp = [
    'Build exactly what is described in scope and included deliverables.',
    'Flag missing assets or unclear requirements in Messages before expanding effort.',
    'Submit preview and delivery URLs through the project workspace when ready.',
    'Confirm only when timeline, revisions, and delivery requirements are realistic for you.',
  ].join('\n');

  const nextStep = 'Both parties confirm this agreement, then proceed in the project workspace and Messages.';

  const snapshotObj = wfCtx
    ? {
        captured_at: new Date().toISOString(),
        source_workflow_id: br.source_workflow_id ?? null,
        source_workflow_title: wfTitle || null,
        customization_notes_excerpt: customization ? customization.slice(0, 1200) : null,
      }
    : null;

  const draft: ProjectAgreementDraft = {
    project_title: title,
    buyer_goal: goal,
    creator_role: `${creatorName} builds and delivers the ${buildType} described below.`,
    scope_summary: scopeParts.join('\n\n'),
    included_deliverables: included,
    not_included: notIncluded,
    timeline: timelinePieces.join(' · '),
    revision_limit: revisionLimit,
    proposed_price: proposed,
    platform_fee: platformFee,
    creator_payout: creatorPayout,
    delivery_requirements: deliveryReq,
    buyer_responsibilities: buyerResp,
    creator_responsibilities: creatorResp,
    next_step: nextStep,
    ai_agreement_summary: '',
    ai_missing_scope_items: [],
    ai_risk_flags: [],
    ai_recommended_next_step: '',
    workflow_context_snapshot: snapshotObj ? JSON.stringify(snapshotObj) : null,
  };

  const analysis = analyzeAgreementCompleteness({ draft, buyerRequest: br, order: params.order ?? null, application: app ?? null });
  draft.ai_agreement_summary = analysis.summary;
  draft.ai_missing_scope_items = analysis.missingItems;
  draft.ai_risk_flags = analysis.riskFlags;
  draft.ai_recommended_next_step = analysis.recommendedNextStep;

  return draft;
}

export function analyzeAgreementCompleteness(input: AgreementAnalysisInput): {
  readiness: AgreementCompleteness;
  readinessLabel: string;
  score: number;
  summary: string;
  missingItems: string[];
  riskFlags: string[];
  recommendedNextStep: string;
} {
  const { draft, buyerRequest: br, application: app, order } = input;
  const missing = getAgreementMissingItems(input);
  const risks = getAgreementRiskFlags(input);

  const agreementConfirmed =
    norm(order?.agreement_status).toLowerCase() === 'confirmed' ||
    Boolean(input.proposal?.locked_at && norm(input.proposal?.agreement_status).toLowerCase() === 'confirmed');

  if (agreementConfirmed) {
    return {
      readiness: 'confirmed',
      readinessLabel: 'Confirmed',
      score: 100,
      summary: 'Agreement confirmed by both parties — ready to build.',
      missingItems: [],
      riskFlags: [],
      recommendedNextStep: 'Proceed with build and delivery in the project workspace.',
    };
  }

  let score = 76;
  score -= missing.length * 9;
  score -= risks.length * 7;
  if (!draft.proposed_price) score -= 12;
  if (!norm(br.deadline) && !norm(draft.timeline)) score -= 8;
  if (norm(draft.scope_summary).length < 80) score -= 10;
  if (!norm(draft.delivery_requirements)) score -= 6;
  if (!norm(draft.buyer_responsibilities)) score -= 4;
  score = Math.max(0, Math.min(100, score));

  const readiness: AgreementCompleteness =
    score >= 80 && missing.length === 0 && risks.length <= 1 ? 'ready_to_confirm'
    : score >= 52 ? 'almost_ready'
    : 'needs_work';

  const readinessLabel =
    readiness === 'ready_to_confirm' ? 'Ready to confirm'
    : readiness === 'almost_ready' ? 'Almost ready'
    : 'Needs details';

  const summary = [
    `${readinessLabel} (${score}/100).`,
    app?.fit_reason ? 'Creator fit note on file.' : 'Confirm creator fit in Messages if needed.',
    'Price is indicative only — payment comes in a later phase.',
  ].join(' ');

  return {
    readiness,
    readinessLabel,
    score,
    summary,
    missingItems: missing,
    riskFlags: risks,
    recommendedNextStep: getAgreementRecommendedNextStep({ missing, risks, readiness }),
  };
}

export function getAgreementMissingItems(input: AgreementAnalysisInput): string[] {
  const { draft, buyerRequest: br } = input;
  const out: string[] = [];
  const scope = norm(draft.scope_summary);
  if (!scope) out.push('Scope summary is missing.');
  else if (scope.length < 60) out.push('Scope summary is vague — add clearer build details.');
  if (!norm(draft.included_deliverables)) out.push('Included deliverables are not listed.');
  if (!draft.proposed_price) out.push('Price is not set — agree on an indicative total in Messages.');
  if (!norm(br.deadline) && !norm(draft.timeline)) out.push('Timeline is not confirmed yet.');
  else if (!norm(draft.timeline)) out.push('Timeline should be added to the agreement.');
  if (typeof draft.revision_limit !== 'number' || draft.revision_limit < 0) {
    out.push('Revision limit is not set.');
  }
  if (!norm(draft.delivery_requirements)) out.push('Final delivery requirements are unclear.');
  if (!norm(draft.buyer_responsibilities)) out.push('Buyer responsibilities are not listed.');
  if (!norm(draft.creator_responsibilities)) out.push('Creator responsibilities are not listed.');
  if (!norm(draft.not_included)) out.push('Not-included items should be listed to avoid scope creep.');
  return out;
}

export function getAgreementRiskFlags(input: AgreementAnalysisInput): string[] {
  const { draft, buyerRequest: br, application: app } = input;
  const out: string[] = [];
  if (workflowBackedRequest(br) && !norm(br.customization_notes)) {
    out.push('Workflow customization request without detailed customization notes.');
  }
  if (!app?.estimated_timeline && !norm(draft.timeline)) {
    out.push('No creator timeline on the winning application or agreement.');
  }
  if (!norm(br.style_notes) && !norm(br.website_social)) {
    out.push('Buyer assets/access may be incomplete — confirm brand links and logins in Messages.');
  }
  if (norm(draft.scope_summary).length > 900) {
    out.push('Scope summary is very long — consider simplifying before confirmation.');
  }
  if (input.deliverable?.delivery_status === 'revision_needed') {
    out.push('Deliverable is in revision — confirm agreement text still matches current scope.');
  }
  return out;
}

export function getAgreementRecommendedNextStep(params: {
  missing: string[];
  risks: string[];
  readiness: AgreementCompleteness;
}): string {
  if (params.readiness === 'confirmed') {
    return 'Agreement is confirmed — proceed with build and delivery.';
  }
  if (params.readiness === 'ready_to_confirm') {
    return 'Both parties review the draft, then confirm when scope, timeline, and price placeholder are clear.';
  }
  if (params.missing.length) {
    return `Fill in missing details: ${params.missing[0]}`;
  }
  if (params.risks.length) {
    return `Discuss before confirming: ${params.risks[0]}`;
  }
  return 'Generate or regenerate the agreement draft, then confirm in Messages before locking scope.';
}

export function formatAgreementForBuyer(proposal: ProjectProposalRow, creatorName: string): string {
  const lines = [
    `Project Agreement (buyer view)`,
    `Between you and ${creatorName || 'your creator'}.`,
    '',
    norm(proposal.ai_agreement_summary) || 'AI-drafted agreement for scope alignment.',
    '',
    `Goal: ${extractSection(proposal.scope_summary, 'Buyer goal:') || '—'}`,
    `Timeline: ${proposal.timeline?.trim() || '—'}`,
    `Revisions included: ${proposal.revision_limit}`,
    `Indicative price (placeholder): ${money(proposal.proposed_price)}`,
    '',
    `This confirms project scope for MVP testing. Payment is not active yet.`,
  ];
  return lines.join('\n');
}

export function formatAgreementForCreator(proposal: ProjectProposalRow, buyerBiz: string): string {
  const lines = [
    `Project Agreement (creator view)`,
    `Build for ${buyerBiz || 'buyer'}.`,
    '',
    norm(proposal.ai_agreement_summary) || 'AI-drafted agreement for scope alignment.',
    '',
    `Scope:\n${proposal.scope_summary?.trim() || '—'}`,
    '',
    `Deliverables:\n${proposal.included_deliverables?.trim() || '—'}`,
    '',
    `Confirm only if scope, timeline, and delivery requirements are clear.`,
  ];
  return lines.join('\n');
}

function extractSection(scope: string | null | undefined, prefix: string): string {
  const s = norm(scope);
  if (!s.includes(prefix)) return '';
  const idx = s.indexOf(prefix);
  return s.slice(idx + prefix.length).split('\n')[0]?.trim() ?? '';
}

function money(n: number | string | null | undefined): string {
  if (n == null || n === '') return 'To be agreed in Messages';
  const x = typeof n === 'number' ? n : Number(n);
  if (!isFinite(x)) return String(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export function displayAgreementStatus(stored: string | null | undefined): string {
  const s = norm(stored).toLowerCase();
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'buyer_confirmed':
      return 'Buyer confirmed';
    case 'creator_confirmed':
      return 'Creator confirmed';
    case 'confirmed':
      return 'Agreement confirmed';
    case 'changes_requested':
      return 'Changes requested';
    case 'not_started':
      return 'Not started';
    default:
      return s ? s.replace(/_/g, ' ') : '—';
  }
}

export function displayCreatorApproval(stored: string | null | undefined): string {
  const s = norm(stored).toLowerCase();
  if (s === 'approved') return 'Creator confirmed';
  if (s === 'changes_requested') return 'Changes requested';
  return 'Pending';
}
