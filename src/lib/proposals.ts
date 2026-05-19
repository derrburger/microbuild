/**
 * MicroBuild — Proposal / pricing workflow (rules-based, no external APIs, no Stripe).
 */

import { supabase } from './supabase';
import { verifyBuyerOwnsRequest } from './marketplace';
import { updateOrderStatus } from './orders';
import type { OrderPipelineRow } from './orders';
import type {
  BuyerRequestRow,
  ProjectProposalInsert,
  ProjectProposalRow,
  PublishedWorkflowRow,
  RequestApplicationRow,
  UserProfileRow,
} from '../types/database';

const LOG = '[proposals]';

/** Stored on `project_proposals.buyer_approval_status` and mirrored on `orders.buyer_approval_status`. */
export type BuyerApprovalStored = 'pending' | 'approved' | 'changes_requested' | 'rejected';

export type ProposalLifecycleStatus =
  | 'draft'
  | 'sent'
  | 'buyer_approved'
  | 'buyer_changes_requested'
  | 'buyer_rejected'
  | 'expired'
  | 'canceled';

/** Normalize legacy rows (`buyer_approved` / `buyer_rejected`) to canonical values. */
export function canonicalBuyerApproval(stored: string | null | undefined): BuyerApprovalStored {
  const s = norm(stored);
  if (s === 'buyer_approved' || s === 'approved') return 'approved';
  if (s === 'buyer_rejected' || s === 'rejected') return 'rejected';
  if (s === 'changes_requested') return 'changes_requested';
  return 'pending';
}

export function displayBuyerApproval(stored: string | null | undefined): string {
  switch (canonicalBuyerApproval(stored)) {
    case 'approved':
      return 'Approved';
    case 'changes_requested':
      return 'Changes requested';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Pending';
  }
}

export function displayProposalLifecycle(stored: string | null | undefined): string {
  const s = norm(stored);
  switch (s) {
    case 'draft':
      return 'Draft (internal)';
    case 'sent':
      return 'Sent — awaiting buyer';
    case 'buyer_approved':
      return 'Buyer approved';
    case 'buyer_changes_requested':
      return 'Changes requested';
    case 'buyer_rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    case 'canceled':
      return 'Canceled';
    default:
      return s ? s.replace(/_/g, ' ') : '—';
  }
}

export interface BuildPacketSnippet {
  business_summary?: string | null;
  customer_problem?: string | null;
  recommended_build?: string | null;
  creator_instructions?: string | null;
  suggested_page_sections?: string[] | null;
  automation_needs?: string | null;
}

export interface GeneratedProposalDraft {
  proposal_title: string;
  scope_summary: string;
  included_deliverables: string;
  timeline: string;
  revision_limit: number;
  proposed_price: number | null;
  platform_fee: number | null;
  creator_payout: number | null;
  buyer_facing_explanation: string;
  admin_notes: string;
  risks_missing_info: string[];
  recommended_next_action: string;
  workflow_context_snapshot: string | null;
}

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

/** Loose budget parser — picks first currency-ish number */
export function parseBudgetHint(budget: string | null | undefined): number | null {
  const s = norm(budget);
  if (!s) return null;
  const m = s.match(/[\d,.]+/g);
  if (!m?.length) return null;
  const cleaned = m[0].replace(/,/g, '');
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

export function workflowBackedRequest(req: Partial<BuyerRequestRow>): boolean {
  const st = norm(req.source_type).toLowerCase();
  return st === 'workflow' || req.requested_from_workflow === true || Boolean(norm(req.source_workflow_title));
}

export function generateProposalDraft(params: {
  buyerRequest: BuyerRequestRow;
  order?: OrderPipelineRow | null;
  application?: RequestApplicationRow | null;
  buildPacket?: BuildPacketSnippet | null;
  publishedWorkflow?: PublishedWorkflowRow | null;
}): GeneratedProposalDraft {
  const { buyerRequest: br, application: app, buildPacket: bp, publishedWorkflow: wf } = params;
  const biz = norm(br.business_name) || 'Your business';
  const buildType = norm(br.build_type) || 'MicroBuild deliverable';
  const goal = norm(br.main_goal) || 'Improve conversion for your service business.';
  const problem = norm(br.current_problem);
  const deadline = norm(br.deadline) || 'Aligned after kickoff message';
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

  const snapshotObj = wfCtx
    ? {
        captured_at: new Date().toISOString(),
        source_workflow_id: br.source_workflow_id ?? null,
        source_workflow_title: wfTitle || null,
        customization_notes_excerpt: customization ? customization.slice(0, 1200) : null,
        note:
          'Frozen snapshot for proposal traceability — editing the live workflow does not change this approved scope context.',
      }
    : null;

  const packetScope = [
    bp?.business_summary ? `Business snapshot: ${norm(bp.business_summary).slice(0, 600)}` : '',
    bp?.customer_problem ? `Problem focus: ${norm(bp.customer_problem).slice(0, 500)}` : '',
    bp?.recommended_build ? `Recommended build angle: ${norm(bp.recommended_build).slice(0, 400)}` : '',
    bp?.creator_instructions ? `Creator execution notes: ${norm(bp.creator_instructions).slice(0, 700)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const sections = Array.isArray(bp?.suggested_page_sections) ? bp!.suggested_page_sections!.filter(Boolean) : [];
  const deliverablesLines = [
    `• ${buildType} implemented to match agreed scope`,
    sections.length ? `• Page / module emphasis: ${sections.slice(0, 8).join(', ')}` : `• Standard sections for ${buildType}`,
    wfCtx && wfTitle ? `• Workflow customization sourced from “${wfTitle}” (see snapshot)` : null,
    norm(bp?.automation_needs) ? `• Automation / integrations: ${norm(bp?.automation_needs).slice(0, 280)}` : null,
    `• Handoff: preview link + revision round(s) per revision policy`,
  ].filter(Boolean) as string[];

  const timelinePieces = [
    app?.estimated_timeline ? `Creator estimate: ${norm(app.estimated_timeline)}` : null,
    wf?.estimated_turnaround ? `Workflow template SLA hint: ${norm(wf.estimated_turnaround)}` : null,
    `Buyer preferred timeline: ${deadline}`,
  ].filter(Boolean);

  const revisionLimit =
    norm(app?.fit_reason).length > 120 || (num(app?.proposed_price) != null && num(app!.proposed_price)! > 1500) ?
      2
    : 1;

  const title = wfCtx && wfTitle ? `Proposal — ${biz} (${wfTitle})` : `Proposal — ${biz} · ${buildType}`;

  const buyerExpl = [
    'This document summarizes scope and an indicative price for MVP testing.',
    'Payments are not live yet — approving only locks scope intent so your creator can proceed safely.',
    proposed != null
      ? `Indicative total: $${proposed.toFixed(0)} (platform allocation simulated; real checkout comes later).`
      : 'Price to be finalized with MicroBuild before checkout.',
    platformFee != null && creatorPayout != null
      ? `Illustrative split: platform placeholder $${platformFee.toFixed(0)}, creator portion ~$${creatorPayout.toFixed(0)}.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const adminNotes = [
    'Generated via rules engine — edit freely before sending to buyer.',
    app?.creator_questions ? `Open questions from creator: ${norm(app.creator_questions).slice(0, 400)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const nextAction =
    proposed != null
      ? 'Review pricing bands with buyer in Messages, send proposal, then await buyer approval.'
      : 'Collect explicit buyer budget + creator quote in Messages before marking sent.';

  const scopeParts = [
    `${biz} — ${buildType}`,
    `Goal: ${goal}`,
    problem ? `Challenge: ${problem}` : null,
    wfCtx && wfTitle ?
      `This proposal is based on the reusable workflow: “${wfTitle}”.`
    : null,
    wfCtx && wfTitle ?
      `Customization notes from buyer are incorporated below.\n${customization || '—'}`
    : null,
    customization && !wfCtx ? `Buyer notes: ${customization}` : null,
    packetScope ? `Internal packet alignment:\n${packetScope}` : null,
    app?.proposal_message ? `Selected creator proposal excerpt:\n${norm(app.proposal_message).slice(0, 900)}` : null,
    `── What happens next (buyer-facing) ──\n${buyerExpl}`,
    `── Recommended admin next step ──\n${nextAction}`,
  ].filter(Boolean);

  const risks: string[] = [];
  if (!proposed) risks.push('Final price still indicative — confirm numbers before payment phase lands.');
  if (!norm(br.budget)) risks.push('Buyer budget range missing — pricing may need negotiation.');
  if (!app?.estimated_timeline) risks.push('Creator timeline not explicit on application — confirm in Messages.');
  if (wfCtx && !customization) risks.push('Workflow customization notes empty — clarify deltas vs template.');

  return {
    proposal_title: title,
    scope_summary: scopeParts.join('\n\n'),
    included_deliverables: deliverablesLines.join('\n'),
    timeline: timelinePieces.join(' · '),
    revision_limit: revisionLimit,
    proposed_price: proposed,
    platform_fee: platformFee,
    creator_payout: creatorPayout,
    buyer_facing_explanation: buyerExpl,
    admin_notes: adminNotes,
    risks_missing_info: risks,
    recommended_next_action: nextAction,
    workflow_context_snapshot: snapshotObj ? JSON.stringify(snapshotObj) : null,
  };
}

export function normalizeProposalRow(raw: Record<string, unknown>): ProjectProposalRow {
  return {
    id: norm(raw.id),
    buyer_request_id: raw.buyer_request_id != null ? norm(raw.buyer_request_id) : null,
    order_id: raw.order_id != null ? norm(raw.order_id) : null,
    request_application_id: raw.request_application_id != null ? norm(raw.request_application_id) : null,
    creator_profile_id: raw.creator_profile_id != null ? norm(raw.creator_profile_id) : null,
    buyer_user_profile_id: raw.buyer_user_profile_id != null ? norm(raw.buyer_user_profile_id) : null,
    proposal_title: norm(raw.proposal_title) || 'MicroBuild proposal',
    scope_summary: norm(raw.scope_summary) || '',
    included_deliverables: norm(raw.included_deliverables) || '',
    timeline: norm(raw.timeline) || '',
    revision_limit: typeof raw.revision_limit === 'number' && isFinite(raw.revision_limit) ? raw.revision_limit : 1,
    proposed_price: raw.proposed_price as ProjectProposalRow['proposed_price'],
    platform_fee: raw.platform_fee as ProjectProposalRow['platform_fee'],
    creator_payout: raw.creator_payout as ProjectProposalRow['creator_payout'],
    proposal_status: norm(raw.proposal_status) || 'draft',
    buyer_approval_status: canonicalBuyerApproval(norm(raw.buyer_approval_status) || 'pending'),
    admin_approval_status: norm(raw.admin_approval_status) || 'pending',
    buyer_feedback: raw.buyer_feedback != null ? norm(raw.buyer_feedback) : null,
    admin_notes: raw.admin_notes != null ? norm(raw.admin_notes) : null,
    workflow_context_snapshot: raw.workflow_context_snapshot != null ? norm(raw.workflow_context_snapshot) : null,
    created_at: norm(raw.created_at) || new Date().toISOString(),
    updated_at: norm(raw.updated_at) || new Date().toISOString(),
  };
}

export async function fetchPublishedWorkflowById(id: string | null | undefined): Promise<PublishedWorkflowRow | null> {
  const sid = norm(id);
  if (!sid) return null;
  const { data, error } = await supabase.from('published_workflows').select('*').eq('id', sid).maybeSingle();
  if (error) {
    console.error(LOG, 'fetchPublishedWorkflowById', error);
    return null;
  }
  return (data as PublishedWorkflowRow) ?? null;
}

export async function fetchApplicationById(id: string | null | undefined): Promise<RequestApplicationRow | null> {
  const sid = norm(id);
  if (!sid) return null;
  const { data, error } = await supabase.from('request_applications').select('*').eq('id', sid).maybeSingle();
  if (error) {
    console.error(LOG, 'fetchApplicationById', error);
    return null;
  }
  return (data as RequestApplicationRow) ?? null;
}

export async function fetchProposalByOrderId(orderId: string | null | undefined): Promise<ProjectProposalRow | null> {
  const oid = norm(orderId);
  if (!oid) return null;
  const { data, error } = await supabase.from('project_proposals').select('*').eq('order_id', oid).maybeSingle();
  if (error) {
    console.error(LOG, 'fetchProposalByOrderId', error);
    return null;
  }
  return data ? normalizeProposalRow(data as Record<string, unknown>) : null;
}

/** Latest proposal row for a buyer request when no order yet (or supplemental lookup). */
export async function fetchProposalByBuyerRequestId(
  buyerRequestId: string | null | undefined,
): Promise<ProjectProposalRow | null> {
  const rid = norm(buyerRequestId);
  if (!rid) return null;
  const { data, error } = await supabase
    .from('project_proposals')
    .select('*')
    .eq('buyer_request_id', rid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(LOG, 'fetchProposalByBuyerRequestId', error);
    return null;
  }
  return data ? normalizeProposalRow(data as Record<string, unknown>) : null;
}

async function syncOrderProposalPointers(
  orderId: string,
  proposalId: string,
  proposalStatus: string,
  buyerApprovalStatus: string | null | undefined,
): Promise<void> {
  const patch: Record<string, unknown> = {
    proposal_id: proposalId,
    proposal_status: proposalStatus,
    buyer_approval_status: canonicalBuyerApproval(buyerApprovalStatus),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('orders').update(patch).eq('id', orderId);
}

export async function upsertProposalRecord(payload: ProjectProposalInsert & { id?: string }): Promise<{
  ok: boolean;
  error: string | null;
  proposal?: ProjectProposalRow | null;
}> {
  const now = new Date().toISOString();
  const oid = norm(payload.order_id);
  let existingId = norm(payload.id);

  if (!existingId && oid) {
    const existing = await fetchProposalByOrderId(oid);
    if (existing) existingId = existing.id;
  }
  if (!existingId && payload.buyer_request_id) {
    const loose = await fetchProposalByBuyerRequestId(norm(payload.buyer_request_id));
    if (loose && !norm(loose.order_id) && oid) {
      existingId = loose.id;
    } else if (loose && norm(loose.order_id) === oid) {
      existingId = loose.id;
    }
  }

  if (existingId) {
    const { id: _drop, ...rest } = payload as ProjectProposalInsert & { id?: string };
    const { data, error } = await supabase
      .from('project_proposals')
      .update({
        ...rest,
        updated_at: now,
      })
      .eq('id', existingId)
      .select('*')
      .maybeSingle();
    if (error) return { ok: false, error: error.message || 'Could not update proposal.', proposal: null };
    const row = data ? normalizeProposalRow(data as Record<string, unknown>) : null;
    if (row?.order_id)
      await syncOrderProposalPointers(row.order_id, row.id, row.proposal_status, row.buyer_approval_status);
    return { ok: true, error: null, proposal: row };
  }

  const insertPayload = { ...payload } as ProjectProposalInsert & { id?: string };
  delete (insertPayload as { id?: string }).id;
  const insertBody = {
    ...insertPayload,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('project_proposals').insert(insertBody).select('*').maybeSingle();
  if (error) return { ok: false, error: error.message || 'Could not create proposal.', proposal: null };
  const row = data ? normalizeProposalRow(data as Record<string, unknown>) : null;
  if (row?.order_id)
    await syncOrderProposalPointers(row.order_id, row.id, row.proposal_status, row.buyer_approval_status);
  return { ok: true, error: null, proposal: row };
}

export async function linkProposalToOrder(proposalId: string, orderId: string): Promise<{ ok: boolean; error: string | null }> {
  const pid = norm(proposalId);
  const oid = norm(orderId);
  if (!pid || !oid) return { ok: false, error: 'Missing ids.' };
  const { error } = await supabase
    .from('project_proposals')
    .update({ order_id: oid, updated_at: new Date().toISOString() })
    .eq('id', pid);
  if (error) return { ok: false, error: error.message };
  const { data } = await supabase
    .from('project_proposals')
    .select('proposal_status, buyer_approval_status')
    .eq('id', pid)
    .maybeSingle();
  const st =
    data && typeof data === 'object' && 'proposal_status' in data ?
      norm((data as { proposal_status?: string }).proposal_status)
    : 'draft';
  const ba =
    data && typeof data === 'object' && 'buyer_approval_status' in data ?
      norm((data as { buyer_approval_status?: string }).buyer_approval_status)
    : 'pending';
  await syncOrderProposalPointers(oid, pid, st || 'draft', ba);
  return { ok: true, error: null };
}

export async function generateAndPersistProposal(params: {
  buyerRequest: BuyerRequestRow;
  order?: OrderPipelineRow | null;
  application?: RequestApplicationRow | null;
  buildPacket?: BuildPacketSnippet | null;
  publishedWorkflow?: PublishedWorkflowRow | null;
  buyerUserProfileId?: string | null;
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const wfId = params.buyerRequest.source_workflow_id;
  const wf =
    params.publishedWorkflow ??
    (workflowBackedRequest(params.buyerRequest) ? await fetchPublishedWorkflowById(wfId) : null);

  const mergedDraft = generateProposalDraft({
    buyerRequest: params.buyerRequest,
    order: params.order ?? null,
    application: params.application ?? null,
    buildPacket: params.buildPacket ?? null,
    publishedWorkflow: wf,
  });

  const insert: ProjectProposalInsert = {
    buyer_request_id: params.buyerRequest.id,
    order_id: params.order?.id ?? null,
    request_application_id: params.application?.id ?? params.buyerRequest.selected_request_application_id ?? null,
    creator_profile_id:
      params.application?.creator_profile_id ??
      params.buyerRequest.selected_creator_profile_id ??
      params.order?.creator_id ??
      null,
    buyer_user_profile_id: params.buyerUserProfileId ?? null,
    proposal_title: mergedDraft.proposal_title,
    scope_summary: mergedDraft.scope_summary,
    included_deliverables: mergedDraft.included_deliverables,
    timeline: mergedDraft.timeline,
    revision_limit: mergedDraft.revision_limit,
    proposed_price: mergedDraft.proposed_price,
    platform_fee: mergedDraft.platform_fee,
    creator_payout: mergedDraft.creator_payout,
    proposal_status: 'draft',
    buyer_approval_status: 'pending',
    admin_approval_status: 'pending',
    buyer_feedback: null,
    admin_notes: [mergedDraft.admin_notes, '', 'Risks:', ...mergedDraft.risks_missing_info.map((r) => `• ${r}`)].join('\n'),
    workflow_context_snapshot: mergedDraft.workflow_context_snapshot,
  };

  const existing = params.order?.id
    ? await fetchProposalByOrderId(params.order.id)
    : await fetchProposalByBuyerRequestId(params.buyerRequest.id);

  return upsertProposalRecord({
    ...insert,
    id: existing?.id,
  });
}

export async function adminUpdateProposalFields(
  proposalId: string,
  patch: Partial<
    Pick<
      ProjectProposalRow,
      | 'proposal_title'
      | 'scope_summary'
      | 'included_deliverables'
      | 'timeline'
      | 'revision_limit'
      | 'proposed_price'
      | 'platform_fee'
      | 'creator_payout'
      | 'admin_notes'
    >
  >,
): Promise<{ ok: boolean; error: string | null }> {
  const pid = norm(proposalId);
  if (!pid) return { ok: false, error: 'Missing proposal id.' };
  const { error } = await supabase
    .from('project_proposals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', pid);
  if (error) return { ok: false, error: error.message };
  const row = await supabase
    .from('project_proposals')
    .select('order_id, proposal_status, buyer_approval_status')
    .eq('id', pid)
    .maybeSingle();
  const r = row.data as {
    order_id?: string | null;
    proposal_status?: string | null;
    buyer_approval_status?: string | null;
  } | null;
  if (r?.order_id)
    await syncOrderProposalPointers(
      norm(r.order_id),
      pid,
      norm(r.proposal_status) || 'draft',
      r.buyer_approval_status,
    );
  return { ok: true, error: null };
}

export async function adminSetProposalStatus(
  proposalId: string,
  status: ProposalLifecycleStatus,
  extra?: { buyer_approval_status?: string },
): Promise<{ ok: boolean; error: string | null }> {
  const pid = norm(proposalId);
  if (!pid) return { ok: false, error: 'Missing proposal id.' };

  let impliedBuyer: BuyerApprovalStored | undefined;
  if (extra?.buyer_approval_status != null && norm(extra.buyer_approval_status)) {
    impliedBuyer = canonicalBuyerApproval(extra.buyer_approval_status);
  } else if (status === 'sent') impliedBuyer = 'pending';
  else if (status === 'buyer_approved') impliedBuyer = 'approved';
  else if (status === 'buyer_changes_requested') impliedBuyer = 'changes_requested';
  else if (status === 'buyer_rejected') impliedBuyer = 'rejected';

  const updatePayload: Record<string, unknown> = {
    proposal_status: status,
    updated_at: new Date().toISOString(),
  };
  if (impliedBuyer != null) updatePayload.buyer_approval_status = impliedBuyer;

  const { error } = await supabase.from('project_proposals').update(updatePayload).eq('id', pid);
  if (error) return { ok: false, error: error.message };

  const { data: prow } = await supabase.from('project_proposals').select('*').eq('id', pid).maybeSingle();
  const pr = prow ? normalizeProposalRow(prow as Record<string, unknown>) : null;
  const oid = pr?.order_id ? norm(pr.order_id) : '';

  if (oid) {
    await syncOrderProposalPointers(oid, pr!.id, pr!.proposal_status, pr!.buyer_approval_status);

    if (status === 'buyer_approved') {
      await supabase
        .from('orders')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', oid);

      const { data: ord } = await supabase.from('orders').select('order_status').eq('id', oid).maybeSingle();
      const os =
        ord && typeof ord === 'object' ? norm((ord as { order_status?: string }).order_status) : '';
      if (os === 'assigned') {
        await updateOrderStatus(oid, 'in_progress');
      }
    }
  }

  return { ok: true, error: null };
}

async function loadProposalWithRequest(proposalId: string): Promise<{
  proposal: ProjectProposalRow | null;
  buyerRequestId: string | null;
}> {
  const { data, error } = await supabase.from('project_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (error || !data) return { proposal: null, buyerRequestId: null };
  const proposal = normalizeProposalRow(data as Record<string, unknown>);
  return { proposal, buyerRequestId: proposal.buyer_request_id };
}

export async function buyerApproveProposal(params: {
  proposalId: string;
  buyerProfile: UserProfileRow;
}): Promise<{ ok: boolean; error: string | null }> {
  const { proposal, buyerRequestId } = await loadProposalWithRequest(norm(params.proposalId));
  if (!proposal || !buyerRequestId) return { ok: false, error: 'Proposal not found.' };
  const own = await verifyBuyerOwnsRequest(buyerRequestId, params.buyerProfile.email, {
    authUserId: params.buyerProfile.auth_user_id ?? null,
  });
  if (!own) return { ok: false, error: 'You cannot approve this proposal.' };

  const { error } = await supabase
    .from('project_proposals')
    .update({
      proposal_status: 'buyer_approved',
      buyer_approval_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id);
  if (error) return { ok: false, error: error.message };

  const oid = norm(proposal.order_id);
  if (oid) {
    await syncOrderProposalPointers(oid, proposal.id, 'buyer_approved', 'approved');

    await supabase
      .from('orders')
      .update({
        payment_status: 'unpaid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', oid);

    const { data: ord } = await supabase.from('orders').select('order_status').eq('id', oid).maybeSingle();
    const os = ord && typeof ord === 'object' ? norm((ord as { order_status?: string }).order_status) : '';
    if (os === 'assigned') {
      await updateOrderStatus(oid, 'in_progress');
    }
  }

  return { ok: true, error: null };
}

export async function buyerRequestProposalChanges(params: {
  proposalId: string;
  buyerProfile: UserProfileRow;
  feedback: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { proposal, buyerRequestId } = await loadProposalWithRequest(norm(params.proposalId));
  if (!proposal || !buyerRequestId) return { ok: false, error: 'Proposal not found.' };
  const own = await verifyBuyerOwnsRequest(buyerRequestId, params.buyerProfile.email, {
    authUserId: params.buyerProfile.auth_user_id ?? null,
  });
  if (!own) return { ok: false, error: 'You cannot update this proposal.' };

  const fb = norm(params.feedback) || 'Buyer requested changes (see Messages for detail).';
  const { error } = await supabase
    .from('project_proposals')
    .update({
      proposal_status: 'buyer_changes_requested',
      buyer_approval_status: 'changes_requested',
      buyer_feedback: fb,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id);
  if (error) return { ok: false, error: error.message };

  const oid = norm(proposal.order_id);
  if (oid) {
    await syncOrderProposalPointers(oid, proposal.id, 'buyer_changes_requested', 'changes_requested');
  }
  return { ok: true, error: null };
}

export async function buyerRejectProposal(params: {
  proposalId: string;
  buyerProfile: UserProfileRow;
  feedback?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { proposal, buyerRequestId } = await loadProposalWithRequest(norm(params.proposalId));
  if (!proposal || !buyerRequestId) return { ok: false, error: 'Proposal not found.' };
  const own = await verifyBuyerOwnsRequest(buyerRequestId, params.buyerProfile.email, {
    authUserId: params.buyerProfile.auth_user_id ?? null,
  });
  if (!own) return { ok: false, error: 'You cannot reject this proposal.' };

  const fb = norm(params.feedback) || 'Buyer rejected this proposal scope.';
  const { error } = await supabase
    .from('project_proposals')
    .update({
      proposal_status: 'buyer_rejected',
      buyer_approval_status: 'rejected',
      buyer_feedback: fb,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id);
  if (error) return { ok: false, error: error.message };

  const oid = norm(proposal.order_id);
  if (oid) {
    await syncOrderProposalPointers(oid, proposal.id, 'buyer_rejected', 'rejected');
  }
  return { ok: true, error: null };
}

export async function adminUpsertProposalFields(params: {
  buyerRequest: BuyerRequestRow;
  order: OrderPipelineRow | null;
  application: RequestApplicationRow | null;
  buildPacket: BuildPacketSnippet | null;
  publishedWorkflow: PublishedWorkflowRow | null;
  existingProposal: ProjectProposalRow | null;
  fields: {
    proposal_title: string;
    scope_summary: string;
    included_deliverables: string;
    timeline: string;
    revision_limit: number;
    proposed_price: number | null;
    admin_notes: string | null;
  };
}): Promise<{ ok: boolean; error: string | null; proposal?: ProjectProposalRow | null }> {
  const wf =
    params.publishedWorkflow ??
    (workflowBackedRequest(params.buyerRequest) ?
      await fetchPublishedWorkflowById(params.buyerRequest.source_workflow_id)
    : null);

  const draft = generateProposalDraft({
    buyerRequest: params.buyerRequest,
    order: params.order ?? null,
    application: params.application ?? null,
    buildPacket: params.buildPacket ?? null,
    publishedWorkflow: wf,
  });

  const cleanPrice = params.fields.proposed_price;
  const platformPct = 0.1;
  const platformFee = cleanPrice != null ? Math.round(cleanPrice * platformPct * 100) / 100 : null;
  const creatorPayout =
    cleanPrice != null && platformFee != null ? Math.round((cleanPrice - platformFee) * 100) / 100 : null;

  const ex = params.existingProposal;

  const adminNotesBody =
    params.fields.admin_notes != null && norm(params.fields.admin_notes) ?
      norm(params.fields.admin_notes)
    : [draft.admin_notes, '', 'Risks:', ...draft.risks_missing_info.map((r) => `• ${r}`)].join('\n');

  const insert: ProjectProposalInsert = {
    buyer_request_id: params.buyerRequest.id,
    order_id: params.order?.id ?? null,
    request_application_id:
      params.application?.id ?? params.buyerRequest.selected_request_application_id ?? null,
    creator_profile_id:
      params.application?.creator_profile_id ??
      params.buyerRequest.selected_creator_profile_id ??
      params.order?.creator_id ??
      null,
    buyer_user_profile_id: null,
    proposal_title: norm(params.fields.proposal_title) || draft.proposal_title,
    scope_summary: norm(params.fields.scope_summary) || '—',
    included_deliverables: norm(params.fields.included_deliverables) || '—',
    timeline: norm(params.fields.timeline) || '—',
    revision_limit: Math.max(0, Math.floor(params.fields.revision_limit) || 1),
    proposed_price: cleanPrice,
    platform_fee: platformFee,
    creator_payout: creatorPayout,
    proposal_status: ex?.proposal_status ?? 'draft',
    buyer_approval_status: ex?.id ? canonicalBuyerApproval(ex.buyer_approval_status) : 'pending',
    admin_approval_status: ex?.admin_approval_status ?? 'pending',
    buyer_feedback: ex?.buyer_feedback ?? null,
    admin_notes: adminNotesBody,
    workflow_context_snapshot: ex?.workflow_context_snapshot ?? draft.workflow_context_snapshot,
  };

  return upsertProposalRecord({
    ...insert,
    id: ex?.id,
  });
}

export async function fetchProposalsForBuyerRequests(requestIds: string[]): Promise<ProjectProposalRow[]> {
  const ids = [...new Set(requestIds.map(norm).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('project_proposals').select('*').in('buyer_request_id', ids);
  if (error) {
    console.error(LOG, 'fetchProposalsForBuyerRequests', error);
    return [];
  }
  const rows = ((data as Record<string, unknown>[]) ?? []).map(normalizeProposalRow);
  const latestByRequest = new Map<string, ProjectProposalRow>();
  for (const r of rows) {
    const rid = norm(r.buyer_request_id);
    if (!rid) continue;
    const prev = latestByRequest.get(rid);
    if (!prev || norm(r.updated_at) > norm(prev.updated_at)) {
      latestByRequest.set(rid, r);
    }
  }
  return Array.from(latestByRequest.values());
}
