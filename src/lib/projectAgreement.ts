/**
 * Project Agreement v1 — buyer ↔ creator on project_proposals (no Stripe).
 */

import { supabase } from './supabase';
import { verifyBuyerOwnsRequest } from './marketplace';
import type { OrderPipelineRow } from './orders';
import { fetchBuildPacketForOrder, updateOrderStatus } from './orders';
import {
  fetchApplicationById,
  fetchProposalByOrderId,
  fetchPublishedWorkflowById,
  normalizeProposalRow,
  upsertProposalRecord,
  workflowBackedRequest,
} from './proposals';
import type { BuyerRequestRow, ProjectProposalRow, UserProfileRow } from '../types/database';
import {
  analyzeAgreementCompleteness,
  generateProjectAgreementDraft,
  type ProjectAgreementDraft,
} from './projectAgreementAI';
import {
  appendNotIncludedToScope,
  buildAdminNotesFromAgreementFields,
  parseAgreementFieldsFromProposal,
  type AgreementEditableFields,
} from './agreementFields';

const LOG = '[projectAgreement]';

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export type AgreementPanelPhase =
  | 'none'
  | 'draft'
  | 'buyer_confirmed'
  | 'creator_confirmed'
  | 'confirmed'
  | 'changes_requested';

export interface AgreementViewState {
  phase: AgreementPanelPhase;
  isLocked: boolean;
  buyerConfirmed: boolean;
  creatorConfirmed: boolean;
  readinessLabel: string;
  score: number;
}

function buyerConfirmedRow(row: ProjectProposalRow): boolean {
  if (row.buyer_confirmed_at) return true;
  return row.buyer_approval_status === 'approved';
}

function creatorConfirmedRow(row: ProjectProposalRow): boolean {
  if (row.creator_confirmed_at) return true;
  return norm(row.creator_approval_status).toLowerCase() === 'approved';
}

export function getAgreementViewState(row: ProjectProposalRow | null): AgreementViewState {
  if (!row?.id) {
    return {
      phase: 'none',
      isLocked: false,
      buyerConfirmed: false,
      creatorConfirmed: false,
      readinessLabel: '—',
      score: 0,
    };
  }

  const ast = norm(row.agreement_status).toLowerCase() || 'draft';
  const buyerOk = buyerConfirmedRow(row);
  const creatorOk = creatorConfirmedRow(row);
  const bothOk = buyerOk && creatorOk;
  const locked = Boolean(row.locked_at) && ast === 'confirmed' && bothOk;

  let phase: AgreementPanelPhase = 'draft';
  if (ast === 'changes_requested') phase = 'changes_requested';
  else if (bothOk || ast === 'confirmed') phase = 'confirmed';
  else if (buyerOk && !creatorOk) phase = 'buyer_confirmed';
  else if (creatorOk && !buyerOk) phase = 'creator_confirmed';
  else if (ast === 'buyer_confirmed') phase = 'buyer_confirmed';
  else if (ast === 'creator_confirmed') phase = 'creator_confirmed';
  else phase = 'draft';

  const draft = rowToDraftShape(row);
  const analysis = analyzeAgreementCompleteness({
    draft,
    buyerRequest: { id: row.buyer_request_id ?? '', business_name: '', build_type: '' } as BuyerRequestRow,
    order: null,
    application: null,
  });

  return {
    phase,
    isLocked: locked && phase === 'confirmed',
    buyerConfirmed: buyerOk,
    creatorConfirmed: creatorOk,
    readinessLabel: row.ai_agreement_summary ? analysis.readinessLabel : analysis.readinessLabel,
    score: analysis.score,
  };
}

function rowToDraftShape(row: ProjectProposalRow): ProjectAgreementDraft {
  const parsed = parseAgreementFieldsFromProposal(row);
  return {
    project_title: parsed.project_title,
    buyer_goal: '',
    creator_role: '',
    scope_summary: appendNotIncludedToScope(parsed.scope_summary, parsed.not_included),
    included_deliverables: parsed.included_deliverables,
    not_included: parsed.not_included,
    timeline: parsed.timeline,
    revision_limit: parsed.revision_limit,
    proposed_price: parsed.proposed_price,
    platform_fee: typeof row.platform_fee === 'number' ? row.platform_fee : Number(row.platform_fee) || null,
    creator_payout: typeof row.creator_payout === 'number' ? row.creator_payout : Number(row.creator_payout) || null,
    delivery_requirements: parsed.delivery_requirements,
    buyer_responsibilities: parsed.buyer_responsibilities,
    creator_responsibilities: parsed.creator_responsibilities,
    next_step: row.ai_recommended_next_step ?? '',
    ai_agreement_summary: row.ai_agreement_summary ?? '',
    ai_missing_scope_items: row.ai_missing_scope_items ?? [],
    ai_risk_flags: row.ai_risk_flags ?? [],
    ai_recommended_next_step: row.ai_recommended_next_step ?? '',
    workflow_context_snapshot: row.workflow_context_snapshot,
  };
}

function appendNotIncluded(scope: string, notIncluded: string): string {
  if (!notIncluded.trim()) return scope;
  return `${scope.trim()}\n\n── Not included ──\n${notIncluded.trim()}`;
}

async function syncOrderAgreement(orderId: string, agreementStatus: string): Promise<void> {
  const oid = norm(orderId);
  if (!oid) return;
  await supabase
    .from('orders')
    .update({
      agreement_status: agreementStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', oid);
}

async function patchProposal(
  proposalId: string,
  patch: Record<string, unknown>,
  orderId?: string | null,
): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const { data, error } = await supabase
    .from('project_proposals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', proposalId)
    .select('*')
    .maybeSingle();
  if (error) {
    console.error(LOG, 'patchProposal', error);
    return { ok: false, error: error.message ?? 'Could not update agreement.', proposal: null };
  }
  const row = data ? normalizeProposalRow(data as Record<string, unknown>) : null;
  const oid = norm(orderId ?? row?.order_id);
  if (oid && patch.agreement_status) {
    await syncOrderAgreement(oid, String(patch.agreement_status));
  }
  return { ok: true, error: null, proposal: row };
}

function draftToInsert(
  draft: ProjectAgreementDraft,
  ctx: {
    buyerRequest: BuyerRequestRow;
    order: OrderPipelineRow;
    applicationId?: string | null;
    creatorProfileId?: string | null;
    buyerUserProfileId?: string | null;
    existingId?: string | null;
  },
) {
  const scopeWithNotIncluded = appendNotIncluded(draft.scope_summary, draft.not_included);
  const adminNotes = [
    draft.delivery_requirements ? `Delivery requirements:\n${draft.delivery_requirements}` : '',
    draft.buyer_responsibilities ? `Buyer responsibilities:\n${draft.buyer_responsibilities}` : '',
    draft.creator_responsibilities ? `Creator responsibilities:\n${draft.creator_responsibilities}` : '',
    draft.next_step ? `Next step:\n${draft.next_step}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    id: ctx.existingId ?? undefined,
    buyer_request_id: ctx.buyerRequest.id,
    order_id: ctx.order.id,
    request_application_id: ctx.applicationId ?? ctx.buyerRequest.selected_request_application_id ?? null,
    creator_profile_id: ctx.creatorProfileId ?? ctx.order.creator_id ?? null,
    buyer_user_profile_id: ctx.buyerUserProfileId ?? null,
    proposal_title: draft.project_title,
    scope_summary: scopeWithNotIncluded,
    included_deliverables: draft.included_deliverables,
    timeline: draft.timeline,
    revision_limit: draft.revision_limit,
    proposed_price: draft.proposed_price,
    platform_fee: draft.platform_fee,
    creator_payout: draft.creator_payout,
    proposal_status: 'sent',
    buyer_approval_status: 'pending',
    creator_approval_status: 'pending',
    admin_approval_status: 'pending',
    buyer_feedback: null,
    admin_notes: adminNotes,
    workflow_context_snapshot: draft.workflow_context_snapshot,
    agreement_status: 'draft',
    buyer_confirmed_at: null,
    creator_confirmed_at: null,
    locked_at: null,
    ai_agreement_summary: draft.ai_agreement_summary,
    ai_missing_scope_items: draft.ai_missing_scope_items,
    ai_risk_flags: draft.ai_risk_flags,
    ai_recommended_next_step: draft.ai_recommended_next_step,
  };
}

export async function generateProjectAgreementForOrder(params: {
  order: OrderPipelineRow;
  buyerRequest: BuyerRequestRow;
  buyerUserProfileId?: string | null;
  creatorDisplayName?: string | null;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const oid = norm(params.order.id);
  if (!oid) return { ok: false, error: 'Missing project id.' };

  const existing = await fetchProposalByOrderId(oid);
  if (existing?.locked_at || norm(existing?.agreement_status) === 'confirmed') {
    return { ok: false, error: 'Agreement is locked. Request changes before regenerating.' };
  }

  const appId = norm(params.order.request_application_id ?? params.buyerRequest.selected_request_application_id);
  const application = appId ? await fetchApplicationById(appId) : null;
  const wfId = params.buyerRequest.source_workflow_id;
  const wf =
    workflowBackedRequest(params.buyerRequest) ? await fetchPublishedWorkflowById(wfId) : null;
  const packet = await fetchBuildPacketForOrder(params.order);

  const draft = generateProjectAgreementDraft({
    buyerRequest: params.buyerRequest,
    order: params.order,
    application: application ?? null,
    buildPacket: packet ?
      {
        business_summary: packet.business_summary,
        customer_problem: packet.customer_problem,
        recommended_build: packet.recommended_build,
        creator_instructions: packet.creator_instructions,
        suggested_page_sections: packet.suggested_page_sections,
        automation_needs: packet.automation_needs,
      }
    : null,
    publishedWorkflow: wf,
    creatorDisplayName: params.creatorDisplayName,
  });

  const insert = draftToInsert(draft, {
    buyerRequest: params.buyerRequest,
    order: params.order,
    applicationId: application?.id ?? null,
    creatorProfileId: params.order.creator_id,
    buyerUserProfileId: params.buyerUserProfileId,
    existingId: existing?.id,
  });

  const res = await upsertProposalRecord(insert);
  if (res.ok && res.proposal?.order_id) {
    await syncOrderAgreement(res.proposal.order_id, 'draft');
  }
  return res;
}

async function resolveBothConfirmed(
  row: ProjectProposalRow,
): Promise<{ agreement_status: string; lock: boolean }> {
  const buyerOk = buyerConfirmedRow(row);
  const creatorOk = creatorConfirmedRow(row);
  if (buyerOk && creatorOk) return { agreement_status: 'confirmed', lock: true };
  if (buyerOk) return { agreement_status: 'buyer_confirmed', lock: false };
  if (creatorOk) return { agreement_status: 'creator_confirmed', lock: false };
  return { agreement_status: 'draft', lock: false };
}

export async function buyerConfirmProjectAgreement(params: {
  proposalId: string;
  buyerProfile: UserProfileRow;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const { data, error } = await supabase.from('project_proposals').select('*').eq('id', norm(params.proposalId)).maybeSingle();
  if (error || !data) return { ok: false, error: 'Agreement not found.' };
  const row = normalizeProposalRow(data as Record<string, unknown>);
  const rid = norm(row.buyer_request_id);
  if (!rid) return { ok: false, error: 'Agreement is not linked to a request.' };

  const own = await verifyBuyerOwnsRequest(rid, params.buyerProfile.email, {
    authUserId: params.buyerProfile.auth_user_id ?? null,
  });
  if (!own) return { ok: false, error: 'Only the buyer on this request can confirm.' };
  if (row.locked_at && norm(row.agreement_status) === 'confirmed') {
    return { ok: false, error: 'Agreement is already confirmed.' };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    buyer_approval_status: 'approved',
    proposal_status: 'buyer_approved',
    buyer_confirmed_at: now,
  };

  const tempRow = { ...row, buyer_confirmed_at: now, buyer_approval_status: 'approved' as const };
  const next = await resolveBothConfirmed(tempRow);
  patch.agreement_status = next.agreement_status;
  if (next.lock) {
    patch.locked_at = now;
    patch.proposal_status = 'buyer_approved';
  }

  const res = await patchProposal(row.id, patch, row.order_id);
  const oid = norm(row.order_id);
  if (res.ok && oid && next.lock) {
    await supabase.from('orders').update({ payment_status: 'unpaid', updated_at: now }).eq('id', oid);
    const { data: ord } = await supabase.from('orders').select('order_status').eq('id', oid).maybeSingle();
    const os = ord && typeof ord === 'object' ? norm((ord as { order_status?: string }).order_status) : '';
    if (os === 'assigned') await updateOrderStatus(oid, 'in_progress');
  }
  return res;
}

export async function creatorConfirmProjectAgreement(params: {
  proposalId: string;
  creatorProfileId: string;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const cpid = norm(params.creatorProfileId);
  if (!cpid) return { ok: false, error: 'Creator profile required.' };

  const { data, error } = await supabase.from('project_proposals').select('*').eq('id', norm(params.proposalId)).maybeSingle();
  if (error || !data) return { ok: false, error: 'Agreement not found.' };
  const row = normalizeProposalRow(data as Record<string, unknown>);
  if (norm(row.creator_profile_id) !== cpid) {
    return { ok: false, error: 'Only the assigned creator can confirm.' };
  }
  if (row.locked_at && norm(row.agreement_status) === 'confirmed') {
    return { ok: false, error: 'Agreement is already confirmed.' };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    creator_approval_status: 'approved',
    creator_confirmed_at: now,
  };

  const tempRow = { ...row, creator_confirmed_at: now, creator_approval_status: 'approved' };
  const next = await resolveBothConfirmed(tempRow);
  patch.agreement_status = next.agreement_status;
  if (next.lock) {
    patch.locked_at = now;
    patch.proposal_status = 'buyer_approved';
    if (!buyerConfirmedRow(row)) {
      patch.buyer_approval_status = 'approved';
      patch.buyer_confirmed_at = now;
    }
  }

  return patchProposal(row.id, patch, row.order_id);
}

export async function requestProjectAgreementChanges(params: {
  proposalId: string;
  role: 'buyer' | 'creator' | 'admin';
  feedback: string;
  buyerProfile?: UserProfileRow;
  creatorProfileId?: string;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const { data, error } = await supabase.from('project_proposals').select('*').eq('id', norm(params.proposalId)).maybeSingle();
  if (error || !data) return { ok: false, error: 'Agreement not found.' };
  const row = normalizeProposalRow(data as Record<string, unknown>);

  if (params.role === 'buyer') {
    if (!params.buyerProfile) return { ok: false, error: 'Buyer profile required.' };
    const rid = norm(row.buyer_request_id);
    const own = rid
      ? await verifyBuyerOwnsRequest(rid, params.buyerProfile.email, {
          authUserId: params.buyerProfile.auth_user_id ?? null,
        })
      : false;
    if (!own) return { ok: false, error: 'Only the buyer can request changes.' };
  } else if (params.role === 'creator') {
    if (norm(row.creator_profile_id) !== norm(params.creatorProfileId)) {
      return { ok: false, error: 'Only the assigned creator can request changes.' };
    }
  }

  const fb =
    norm(params.feedback) ||
    `${params.role === 'buyer' ? 'Buyer' : params.role === 'creator' ? 'Creator' : 'Admin'} requested agreement changes (see Messages).`;
  const patch: Record<string, unknown> = {
    agreement_status: 'changes_requested',
    proposal_status: 'buyer_changes_requested',
    locked_at: null,
    buyer_feedback: fb,
    buyer_approval_status: 'pending',
    creator_approval_status: 'pending',
    buyer_confirmed_at: null,
    creator_confirmed_at: null,
  };

  return patchProposal(row.id, patch, row.order_id);
}

export async function saveProjectAgreementFields(params: {
  proposalId: string;
  role: 'buyer' | 'creator' | 'admin';
  fields: AgreementEditableFields;
  buyerProfile?: UserProfileRow;
  creatorProfileId?: string;
  buyerRequest?: BuyerRequestRow | null;
  order?: OrderPipelineRow | null;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const { data, error } = await supabase.from('project_proposals').select('*').eq('id', norm(params.proposalId)).maybeSingle();
  if (error || !data) return { ok: false, error: 'Agreement not found.' };
  const row = normalizeProposalRow(data as Record<string, unknown>);

  if (row.locked_at && norm(row.agreement_status) === 'confirmed') {
    return { ok: false, error: 'Agreement is locked. Request changes before editing.' };
  }

  if (params.role === 'buyer') {
    if (!params.buyerProfile) return { ok: false, error: 'Buyer profile required.' };
    const rid = norm(row.buyer_request_id);
    const own = rid
      ? await verifyBuyerOwnsRequest(rid, params.buyerProfile.email, {
          authUserId: params.buyerProfile.auth_user_id ?? null,
        })
      : false;
    if (!own) return { ok: false, error: 'Only the buyer can edit this agreement.' };
  } else if (params.role === 'creator') {
    if (norm(row.creator_profile_id) !== norm(params.creatorProfileId)) {
      return { ok: false, error: 'Only the assigned creator can edit this agreement.' };
    }
  }

  const f = params.fields;
  const scopeWithNotIncluded = appendNotIncludedToScope(f.scope_summary, f.not_included);
  const adminNotes = buildAdminNotesFromAgreementFields({
    delivery_requirements: f.delivery_requirements,
    buyer_responsibilities: f.buyer_responsibilities,
    creator_responsibilities: f.creator_responsibilities,
  });

  const cleanPrice = f.proposed_price;
  const platformPct = 0.1;
  const platformFee = cleanPrice != null ? Math.round(cleanPrice * platformPct * 100) / 100 : null;
  const creatorPayout =
    cleanPrice != null && platformFee != null ? Math.round((cleanPrice - platformFee) * 100) / 100 : null;

  const draftShape: ProjectAgreementDraft = {
    project_title: norm(f.project_title) || row.proposal_title,
    buyer_goal: '',
    creator_role: '',
    scope_summary: scopeWithNotIncluded,
    included_deliverables: norm(f.included_deliverables),
    not_included: norm(f.not_included),
    timeline: norm(f.timeline),
    revision_limit: Math.max(0, Math.floor(f.revision_limit) || 1),
    proposed_price: cleanPrice,
    platform_fee: platformFee,
    creator_payout: creatorPayout,
    delivery_requirements: norm(f.delivery_requirements),
    buyer_responsibilities: norm(f.buyer_responsibilities),
    creator_responsibilities: norm(f.creator_responsibilities),
    next_step: '',
    ai_agreement_summary: '',
    ai_missing_scope_items: [],
    ai_risk_flags: [],
    ai_recommended_next_step: '',
    workflow_context_snapshot: row.workflow_context_snapshot,
  };

  const analysis = analyzeAgreementCompleteness({
    draft: draftShape,
    buyerRequest: params.buyerRequest ?? ({ id: row.buyer_request_id ?? '', business_name: '', build_type: '' } as BuyerRequestRow),
    order: params.order ?? null,
    application: null,
    proposal: row,
  });

  const patch: Record<string, unknown> = {
    proposal_title: norm(f.project_title) || row.proposal_title,
    scope_summary: scopeWithNotIncluded,
    included_deliverables: norm(f.included_deliverables),
    timeline: norm(f.timeline),
    revision_limit: Math.max(0, Math.floor(f.revision_limit) || 1),
    proposed_price: cleanPrice,
    platform_fee: platformFee,
    creator_payout: creatorPayout,
    admin_notes: adminNotes,
    ai_agreement_summary: analysis.summary,
    ai_missing_scope_items: analysis.missingItems,
    ai_risk_flags: analysis.riskFlags,
    ai_recommended_next_step: analysis.recommendedNextStep,
    agreement_status: 'draft',
    buyer_approval_status: 'pending',
    creator_approval_status: 'pending',
    buyer_confirmed_at: null,
    creator_confirmed_at: null,
    locked_at: null,
  };

  return patchProposal(row.id, patch, row.order_id);
}

/** Regenerate draft when not locked */
export async function regenerateProjectAgreement(params: {
  order: OrderPipelineRow;
  buyerRequest: BuyerRequestRow;
  buyerUserProfileId?: string | null;
  creatorDisplayName?: string | null;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  return generateProjectAgreementForOrder(params);
}
