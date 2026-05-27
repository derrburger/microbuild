import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchTemplates } from '../lib/templates';
import { generateBuildPacket, generateCreatorReview } from '../lib/buildPacket';
import type { GeneratedBuildPacket, CreatorApplicationReview } from '../lib/buildPacket';
import { buildCreatorProfileInsert, normalizeCreatorProfile } from '../lib/profiles';
import { analyzeProfileStrength, getStrengthColor as psGetStrengthColor } from '../lib/profileAI';
import type { CreatorApplicationRow as DBCreatorApplicationRow, CreatorProfileRow as DBCreatorProfileRow } from '../types/database';
import type { MicroBuildListing } from '../types';
import {
  createOrderFromRequest,
  fetchAllOrders,
  fetchCreatorProfilesForAssignment,
  fetchOrderByRequestId,
  updateOrderStatus,
  assignCreatorToOrder,
  setOrderCreatorProfile,
  linkBuildPacketToOrder,
  fetchDeliverableByOrderId,
  createDeliverablePlaceholder,
  fetchBuildPacketForOrder,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_PIPELINE_STAGES,
  orderTimelineIndex,
  DELIVERY_STATUS_LABELS,
  getNextOrderAction,
} from '../lib/orders';
import type {
  OrderPipelineRow,
  CreatorProfileSnap,
  DeliverablePlaceholder,
  CreatorAssignmentDiagnostics,
  BuildPacketWorkspaceRow,
} from '../lib/orders';
import type { OrderPipelineStatus } from '../types/database';
import type { BuyerRequestRow as DatabaseBuyerRequestRow } from '../types/database';
import {
  buildBuyerUpdateCopy,
  buildCompletionMessageCopy,
  buildCreatorBriefCopy,
  buildDeliverySummaryCopy,
  buildOperationalBuildChecklistCopy,
  buildRevisionRequestCopy,
  copyTextToClipboard,
} from '../lib/workspaceCopy';
import './Admin.css';
import { adminSectionFromHash, type AdminSectionId } from '../components/admin/adminSections';
import AdminCommandCenter from '../components/admin/AdminCommandCenter';
import AdminMarketplaceApplications, {
  type MarketplaceAppAdminRow,
} from '../components/admin/AdminMarketplaceApplications';
import AdminDeliverablesSection from '../components/admin/AdminDeliverablesSection';
import AdminMessagesPlaceholder from '../components/admin/AdminMessagesPlaceholder';
import { fetchProposalByOrderId } from '../lib/proposals';
import { getAgreementViewState } from '../lib/projectAgreement';
import { displayAgreementStatus } from '../lib/projectAgreementAI';
import ProjectAgreementPanel from '../components/ProjectAgreementPanel';
import type { ProjectProposalRow } from '../types/database';
import AdminDeferredProposals from '../components/admin/AdminDeferredProposals';
import AdminMetricsStrip from '../components/admin/AdminMetricsStrip';

// ─── Defensive helpers ────────────────────────────────────────────────────────

function safeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function safeText(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}

function safeNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function safeDate(v: unknown): string {
  if (!v) return 'Unknown date';
  try {
    const d = new Date(v as string);
    if (isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

// ─── Row types ────────────────────────────────────────────────────────────────

interface BuyerRequestRow {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  business_name: string;
  industry: string;
  website_social: string | null;
  build_type: string;
  main_goal: string;
  current_problem: string;
  budget: string | null;
  deadline: string | null;
  style_notes: string | null;
  status: string;
  created_at: string;
  visibility_status?: string | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
  selected_request_application_id?: string | null;
  applications_count?: number | null;
  source_type?: string | null;
  source_workflow_id?: string | null;
  source_workflow_title?: string | null;
  source_creator_profile_id?: string | null;
  customization_notes?: string | null;
  requested_from_workflow?: boolean | null;
}

interface CreatorApplicationRow {
  id: string;
  full_name: string;
  email: string;
  tools: string[];
  niches: string[];
  experience: string;
  available_hours: string;
  portfolio_url: string | null;
  portfolio_url_2: string | null;
  message: string | null;
  status: string;
  created_at: string;
  // Tier fields
  tier: string;
  requested_plan_price: number;
  top_projects: string | null;
  service_capabilities: string[];
  fulfillment_speed: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  certifications: string | null;
  credential_links: string[];
  case_studies: string | null;
  // Approval workflow fields (account-approval-workflow.sql)
  auth_user_id: string | null;
  user_profile_id: string | null;
  approval_status: string | null;
  admin_notes: string | null;
  admin_decision_at: string | null;
  rejected_reason: string | null;
  needs_info_reason: string | null;
  linked_creator_profile_id: string | null;
  updated_at: string | null;
}

interface EnrichedRequest {
  row: BuyerRequestRow;
  packet: GeneratedBuildPacket;
}

type RequestFilter = 'all' | 'new' | 'high-priority' | 'needs-followup' | 'ready-to-quote';

// ─── Row normalizers (guard against null fields from Supabase) ─────────────────

function normalizeBuyerRequest(raw: Record<string, unknown>): BuyerRequestRow {
  return {
    id:              safeText(raw.id, 'unknown'),
    user_id:         raw.user_id != null ? safeText(raw.user_id) : null,
    full_name:       safeText(raw.full_name, 'Unknown'),
    email:           safeText(raw.email, ''),
    business_name:   safeText(raw.business_name, 'Unknown Business'),
    industry:        safeText(raw.industry, 'Unknown'),
    website_social:  raw.website_social != null ? safeText(raw.website_social) : null,
    build_type:      safeText(raw.build_type, 'Quote Funnel'),
    main_goal:       safeText(raw.main_goal, ''),
    current_problem: safeText(raw.current_problem, ''),
    budget:          raw.budget != null ? safeText(raw.budget) : null,
    deadline:        raw.deadline != null ? safeText(raw.deadline) : null,
    style_notes:     raw.style_notes != null ? safeText(raw.style_notes) : null,
    status:          safeText(raw.status, 'new'),
    created_at:      safeText(raw.created_at, new Date().toISOString()),
    visibility_status: raw.visibility_status != null ? safeText(raw.visibility_status, 'open') : 'open',
    application_status:
      raw.application_status != null ? safeText(raw.application_status, 'open') : 'open',
    selected_creator_profile_id:
      raw.selected_creator_profile_id != null ? safeText(raw.selected_creator_profile_id) : null,
    selected_request_application_id:
      raw.selected_request_application_id != null ? safeText(raw.selected_request_application_id) : null,
    applications_count: (() => {
      if (typeof raw.applications_count === 'number') return raw.applications_count;
      if (typeof raw.applications_count === 'string') {
        const n = Number(raw.applications_count);
        return isFinite(n) ? n : null;
      }
      return null;
    })(),
    source_type: raw.source_type != null ? safeText(raw.source_type, 'custom_request') : 'custom_request',
    source_workflow_id: raw.source_workflow_id != null ? safeText(raw.source_workflow_id) : null,
    source_workflow_title: raw.source_workflow_title != null ? safeText(raw.source_workflow_title) : null,
    source_creator_profile_id:
      raw.source_creator_profile_id != null ? safeText(raw.source_creator_profile_id) : null,
    customization_notes: raw.customization_notes != null ? safeText(raw.customization_notes) : null,
    requested_from_workflow:
      typeof raw.requested_from_workflow === 'boolean'
        ? raw.requested_from_workflow
        : raw.requested_from_workflow === 'true'
          ? true
          : raw.requested_from_workflow === 'false'
            ? false
            : null,
  };
}

function normalizeCreatorApp(raw: Record<string, unknown>): CreatorApplicationRow {
  return {
    id:                   safeText(raw.id, 'unknown'),
    full_name:            safeText(raw.full_name, 'Unknown Applicant'),
    email:                safeText(raw.email, ''),
    tools:                safeArray<string>(raw.tools),
    niches:               safeArray<string>(raw.niches),
    experience:           safeText(raw.experience, ''),
    available_hours:      safeText(raw.available_hours, '0'),
    portfolio_url:        raw.portfolio_url != null ? safeText(raw.portfolio_url) : null,
    portfolio_url_2:      raw.portfolio_url_2 != null ? safeText(raw.portfolio_url_2) : null,
    message:              raw.message != null ? safeText(raw.message) : null,
    status:               safeText(raw.status, 'new'),
    created_at:           safeText(raw.created_at, new Date().toISOString()),
    tier:                 safeText(raw.tier, 'free'),
    requested_plan_price: safeNumber(raw.requested_plan_price, 0),
    top_projects:         raw.top_projects != null ? safeText(raw.top_projects) : null,
    service_capabilities: safeArray<string>(raw.service_capabilities),
    fulfillment_speed:    raw.fulfillment_speed != null ? safeText(raw.fulfillment_speed) : null,
    github_url:           raw.github_url != null ? safeText(raw.github_url) : null,
    linkedin_url:         raw.linkedin_url != null ? safeText(raw.linkedin_url) : null,
    certifications:       raw.certifications != null ? safeText(raw.certifications) : null,
    credential_links:          safeArray<string>(raw.credential_links),
    case_studies:              raw.case_studies != null ? safeText(raw.case_studies) : null,
    // Approval workflow fields
    auth_user_id:              raw.auth_user_id != null ? safeText(raw.auth_user_id) : null,
    user_profile_id:           raw.user_profile_id != null ? safeText(raw.user_profile_id) : null,
    approval_status:           raw.approval_status != null ? safeText(raw.approval_status) : null,
    admin_notes:               raw.admin_notes != null ? safeText(raw.admin_notes) : null,
    admin_decision_at:         raw.admin_decision_at != null ? safeText(raw.admin_decision_at) : null,
    rejected_reason:           raw.rejected_reason != null ? safeText(raw.rejected_reason) : null,
    needs_info_reason:         raw.needs_info_reason != null ? safeText(raw.needs_info_reason) : null,
    linked_creator_profile_id: raw.linked_creator_profile_id != null ? safeText(raw.linked_creator_profile_id) : null,
    updated_at:                raw.updated_at != null ? safeText(raw.updated_at) : null,
  };
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  new:                        '#f9b032',
  'in-review':                '#63b3ed',
  'proposal-sent':            '#00d478',
  accepted:                   '#00d478',
  rejected:                   '#ef4444',
  reviewing:                  '#63b3ed',
  needs_portfolio_review:     '#f9b032',
  needs_more_info:            '#f9b032',
  approved_pending_payment:   '#63b3ed',
  active:                     '#00d478',
  approved:                   '#00d478',
  suspended:                  '#ef4444',
  'in-progress':              '#f9b032',
  delivered:                  '#00d478',
  available:                  '#00d478',
  popular:                    '#f9b032',
  'coming-soon':              '#63b3ed',
};

const tierColors: Record<string, string> = {
  free:         '#8a94a6',
  professional: '#63b3ed',
  verified:     '#f9b032',
};

const tierLabels: Record<string, string> = {
  free:         'Free',
  professional: 'Pro',
  verified:     'Verified ✓',
};

const statusLabels: Record<string, string> = {
  new:                      'New — Awaiting Review',
  reviewing:                'In Review',
  needs_portfolio_review:   'Needs Portfolio Review',
  needs_more_info:          'Needs More Info',
  approved_pending_payment: 'Approved — Pending Payment',
  active:                   'Active Creator',
  rejected:                 'Rejected',
  suspended:                'Suspended',
  'in-review':              'In Review',
  'proposal-sent':          'Proposal Sent',
  accepted:                 'Accepted',
  'in-progress':            'In Progress',
  delivered:                'Delivered',
};

const priorityColors: Record<string, string> = {
  High:   '#ef4444',
  Medium: '#f9b032',
  Low:    '#505870',
};

const qualityColors: Record<string, string> = {
  Strong:         '#00d478',
  Good:           '#63b3ed',
  Fair:           '#f9b032',
  'Needs Detail': '#ef4444',
};

const urgencyColors: Record<string, string> = {
  High:            '#ef4444',
  Medium:          '#f9b032',
  Low:             '#00d478',
  'Not specified': '#505870',
};

const fitColors: Record<string, string> = {
  Strong: '#00d478',
  Good:   '#63b3ed',
  Okay:   '#f9b032',
  Weak:   '#ef4444',
};

const quoteReadinessColors: Record<string, string> = {
  'Ready to quote':                   '#00d478',
  'Nearly ready — confirm budget':    '#00d478',
  'Nearly ready — minor clarifications needed': '#63b3ed',
  'Needs 1–2 more details before quoting': '#f9b032',
  'Not ready — too many unknowns':    '#ef4444',
  'Not ready — build type unknown':   '#ef4444',
};

// ─── Supabase action helpers ──────────────────────────────────────────────────

async function updateRequestStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('buyer_requests')
    .update({ status })
    .eq('id', id);
  if (error) { console.error('[Admin] update buyer_request status:', error); return false; }
  return true;
}

/**
 * Comprehensive approval workflow action.
 * Updates creator_applications + cascades to user_profiles + creator_profiles.
 */
async function performApprovalAction(
  app: CreatorApplicationRow,
  action: 'approve_free' | 'approve_professional' | 'approve_verified'
        | 'needs_more_info' | 'reject' | 'suspend' | 'reviewing',
  opts: { reason?: string; fitScore?: number } = {},
): Promise<{ ok: boolean; profileId?: string }> {
  type StatusMap = Record<typeof action, string>;
  const statusMap: StatusMap = {
    approve_free:         'active',
    approve_professional: 'approved_pending_payment',
    approve_verified:     'approved_pending_payment',
    needs_more_info:      'needs_more_info',
    reject:               'rejected',
    suspend:              'suspended',
    reviewing:            'reviewing',
  };
  const newStatus = statusMap[action];

  // 1. Update creator_applications
  const appUpdate: Record<string, unknown> = {
    status:            newStatus,
    approval_status:   newStatus,
    admin_decision_at: new Date().toISOString(),
  };
  if ((action === 'reject' || action === 'suspend') && opts.reason) appUpdate.rejected_reason   = opts.reason;
  if (action === 'needs_more_info' && opts.reason)                 appUpdate.needs_info_reason = opts.reason;

  const { error: appErr } = await supabase
    .from('creator_applications')
    .update(appUpdate)
    .eq('id', app.id);
  if (appErr) { console.error('[Admin] performApprovalAction app update:', appErr); return { ok: false }; }

  // 2. Cascade to user_profiles (find by auth_user_id or email)
  const cascadeUserProfile = async (updates: Record<string, unknown>) => {
    if (app.auth_user_id) {
      await supabase.from('user_profiles').update(updates).eq('auth_user_id', app.auth_user_id);
    } else {
      await supabase.from('user_profiles').update(updates).eq('email', app.email);
    }
  };

  // 3. Handle approval-specific logic
  if (action === 'approve_free' || action === 'approve_professional' || action === 'approve_verified') {
    const tierMap: Record<string, string> = {
      approve_free:         'free',
      approve_professional: 'professional',
      approve_verified:     'verified',
    };
    const subMap: Record<string, string> = {
      approve_free:         'not_required',
      approve_professional: 'pending_payment',
      approve_verified:     'pending_payment',
    };
    const tier = tierMap[action];
    const subscription_status = subMap[action];
    const verif = action === 'approve_verified' ? 'pending' : 'unverified';

    // Update user_profiles
    await cascadeUserProfile({
      creator_application_status: newStatus,
      approval_status:            newStatus,
      account_type:               'creator',
    });

    // Upsert creator_profile — prefer row keyed by application; fall back to linked id (avoid duplicates)
    const { data: byApplicationId } = await supabase
      .from('creator_profiles')
      .select('id, public_profile_status')
      .eq('creator_application_id', app.id)
      .maybeSingle();

    let existingProfile = byApplicationId as { id: string; public_profile_status?: string } | null;

    if (!existingProfile && app.linked_creator_profile_id) {
      const { data: byLink } = await supabase
        .from('creator_profiles')
        .select('id, public_profile_status')
        .eq('id', app.linked_creator_profile_id)
        .maybeSingle();
      existingProfile = byLink as { id: string; public_profile_status?: string } | null;
    }

    if (existingProfile) {
      // Update existing profile — also stamp auth_user_id if not set
      await supabase
        .from('creator_profiles')
        .update({
          tier,
          approval_status:   newStatus,
          subscription_status,
          verification_status: verif,
          is_active:           true,
          ...(app.auth_user_id ? { auth_user_id: app.auth_user_id } : {}),
          ...(app.user_profile_id ? { user_profile_id: app.user_profile_id } : {}),
          creator_application_id: app.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id);

      // Link back to application
      await supabase
        .from('creator_applications')
        .update({ linked_creator_profile_id: existingProfile.id })
        .eq('id', app.id);

      // Ensure user_profiles.creator_profile_id is set
      await cascadeUserProfile({ creator_profile_id: existingProfile.id });

      return { ok: true, profileId: existingProfile.id };
    } else {
      // Create new creator_profile
      const fitScore = opts.fitScore ?? 50;
      const payload = buildCreatorProfileInsert(app as unknown as DBCreatorApplicationRow, fitScore);
      const fullPayload = {
        ...(payload as unknown as Record<string, unknown>),
        tier,
        approval_status:        newStatus,
        subscription_status,
        verification_status:  verif,
        public_profile_status: 'hidden',
        auth_user_id:           app.auth_user_id ?? null,
        user_profile_id:        app.user_profile_id ?? null,
        is_active:              true,
      };
      const { data: newProfile, error: cpErr } = await supabase
        .from('creator_profiles')
        .insert(fullPayload)
        .select('id')
        .single();

      if (cpErr) {
        console.error('[Admin] create creator_profile on approval:', cpErr);
      } else if (newProfile) {
        await supabase.from('creator_applications').update({ linked_creator_profile_id: newProfile.id }).eq('id', app.id);
        await cascadeUserProfile({ creator_profile_id: newProfile.id });
        return { ok: true, profileId: newProfile.id };
      }
    }
  } else {
    // For non-approval actions, still update user_profiles
    await cascadeUserProfile({ creator_application_status: newStatus });

    // For reject/suspend: hide creator_profile if it exists
    if (action === 'reject' || action === 'suspend') {
      if (app.linked_creator_profile_id) {
        await supabase
          .from('creator_profiles')
          .update({
            public_profile_status: 'hidden',
            is_active:             false,
            ...(action === 'suspend' ? { approval_status: 'suspended' } : {}),
          })
          .eq('id', app.linked_creator_profile_id);
      }
    }
  }

  return { ok: true };
}

async function setProfileVisibility_v2(
  profileId: string,
  status: 'public' | 'hidden' | 'paused',
): Promise<boolean> {
  const { error } = await supabase
    .from('creator_profiles')
    .update({ public_profile_status: status })
    .eq('id', profileId);
  if (error) { console.error('[Admin] setProfileVisibility:', error); return false; }
  return true;
}


async function saveBuiltPacket(
  requestId: string,
  packet: GeneratedBuildPacket,
): Promise<{ id: string } | null> {
  const rowPayload = {
    business_summary:        packet.businessSummary,
    recommended_build:     packet.recommendedBuild,
    customer_problem:      packet.problem,
    suggested_copy:        { direction: packet.suggestedCopyDirection, cta: packet.ctaStrategy },
    form_fields:           packet.formFields.map((f) => ({ field: f })),
    design_direction:      packet.designDirection,
    automation_needs:      packet.automationNeeds,
    creator_instructions:  packet.creatorInstructions,
    quality_checklist:     packet.qualityChecklist,
    launch_checklist:      packet.launchChecklist,
    suggested_page_sections: packet.suggestedPageSections,
    ai_summary:            packet.aiSummary,
    generated_by:          'manual',
    updated_at:            new Date().toISOString(),
  };

  const { data: existing, error: lookupErr } = await supabase
    .from('build_packets')
    .select('id')
    .eq('request_id', requestId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupErr) console.error('[Admin] saveBuiltPacket lookup:', lookupErr);

  let packetId: string;

  if (existing && typeof (existing as { id?: string }).id === 'string') {
    packetId = (existing as { id: string }).id;
    const { error: upErr } = await supabase.from('build_packets').update(rowPayload).eq('id', packetId);
    if (upErr) { console.error('[Admin] save build_packet update:', upErr); return null; }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('build_packets')
      .insert({
        ...rowPayload,
        request_id: requestId,
        order_id:   null,
      })
      .select('id')
      .single();
    if (insErr || !inserted) { console.error('[Admin] save build_packet insert:', insErr); return null; }
    packetId = (inserted as { id: string }).id;
  }

  const { data: ord } = await supabase.from('orders').select('id').eq('request_id', requestId).maybeSingle();
  const oid = ord && typeof (ord as { id?: string }).id === 'string' ? (ord as { id: string }).id : null;
  if (oid) {
    await linkBuildPacketToOrder(oid, packetId);
  }

  return { id: packetId };
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: unknown): string {
  return safeDate(iso);
}

function fixEncoding(s: string): string {
  return s
    .replace(/â€"/g, '–')
    .replace(/â€"/g, '—')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"');
}

function rowToRequest(row: BuyerRequestRow) {
  return {
    fullName:       row.full_name,
    email:          row.email,
    phone:          '',
    businessName:   row.business_name,
    industry:       row.industry,
    websiteSocial:  row.website_social ?? '',
    buildType:      row.build_type as never,
    mainGoal:       row.main_goal,
    currentProblem: row.current_problem,
    budget:         row.budget ?? '',
    deadline:       row.deadline ?? '',
    styleNotes:     row.style_notes ?? '',
    sourceType: row.source_type ?? undefined,
    sourceWorkflowTitle: row.source_workflow_title ?? undefined,
    customizationNotes: row.customization_notes ?? undefined,
  };
}

function buildCreatorSummary(app: CreatorApplicationRow, review: CreatorApplicationReview): string {
  return [
    `Creator: ${safeText(app.full_name, 'Unknown')} (${safeText(app.email)})`,
    `Tools: ${safeArray<string>(app.tools).join(', ') || 'None listed'}`,
    `Niches: ${safeArray<string>(app.niches).join(', ') || 'None listed'}`,
    `Experience: ${app.experience}`,
    `Availability: ${app.available_hours} hours/week`,
    `Portfolio: ${app.portfolio_url ?? 'Not provided'}`,
    `Status: ${app.status}`,
    `Applied: ${fmtDate(app.created_at)}`,
    ``,
    `AI REVIEW`,
    `Fit Score: ${review.candidateFitScore}/100 (${review.fitLabel})`,
    `Decision: ${review.recommendedDecision}`,
    `Strengths: ${review.strengths.join('; ')}`,
    `Concerns: ${review.concerns.length > 0 ? review.concerns.join('; ') : 'None'}`,
  ].join('\n');
}

function buildPacketSummaryText(row: BuyerRequestRow, packet: GeneratedBuildPacket): string {
  return [
    `=== MicroBuild AI Operations Summary ===`,
    `Request: ${row.business_name} — ${row.build_type}`,
    `Submitted: ${fmtDate(row.created_at)}`,
    ``,
    `OVERVIEW`,
    packet.aiSummary,
    ``,
    `SCORES`,
    `Lead Quality: ${packet.leadQualityLabel} (${packet.leadQualityScore}/100)`,
    `Priority: ${packet.priorityLabel}  |  Fit: ${packet.fitRating}  |  Urgency: ${packet.urgencyRating}`,
    `Complexity: ${packet.complexityRating}  |  Revenue Potential: ${packet.revenuePotentialRating}`,
    `Quote Readiness: ${packet.quoteReadiness}`,
    `Price Range: ${packet.suggestedPriceRange}`,
    `Fulfillment: ${packet.estimatedFulfillmentDifficulty}`,
    ``,
    `RECOMMENDED NEXT ACTION`,
    packet.adminNextAction,
    ``,
    `MISSING INFO`,
    packet.missingInfoFlags.length > 0 ? packet.missingInfoFlags.map(f => `• ${f}`).join('\n') : 'None',
    ``,
    `RISK FLAGS`,
    packet.riskFlags.length > 0 ? packet.riskFlags.map(f => `• ${f}`).join('\n') : 'None',
  ].join('\n');
}

// ─── Shared components ────────────────────────────────────────────────────────

function SectionState({
  loading, error, empty, emptyMsg,
}: { loading: boolean; error: boolean; empty: boolean; emptyMsg: string }) {
  if (loading) return <div className="admin-state-row admin-loading">Loading…</div>;
  if (error)   return <div className="admin-state-row admin-error">Failed to load — check console for details.</div>;
  if (empty)   return <div className="admin-state-row admin-empty">{emptyMsg}</div>;
  return null;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ─── Status Dropdown (buyer requests) ────────────────────────────────────────

const REQ_STATUS_OPTIONS = [
  { value: 'new',           label: '● New'           },
  { value: 'in-review',     label: '● In Review'     },
  { value: 'proposal-sent', label: '● Proposal Sent' },
  { value: 'accepted',      label: '● Accepted'      },
  { value: 'rejected',      label: '● Rejected'      },
];

function StatusDropdown({
  id, initialStatus, onStatusChange,
}: {
  id: string;
  initialStatus: string;
  onStatusChange?: (id: string, newStatus: string) => void;
}) {
  const [current, setCurrent] = useState(initialStatus);
  const [saving, setSaving]   = useState(false);
  const [failed, setFailed]   = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    setFailed(false);
    const ok = await updateRequestStatus(id, next);
    setSaving(false);
    if (!ok) {
      setCurrent(prev);
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } else {
      onStatusChange?.(id, next);
    }
  }

  return (
    <div className={`status-dropdown-wrap${failed ? ' status-dropdown--error' : ''}`}>
      <select
        className="status-dropdown"
        value={current}
        onChange={handleChange}
        disabled={saving}
        style={{ color: statusColors[current] ?? '#8a94a6' }}
      >
        {REQ_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {saving && <span className="status-saving">Saving…</span>}
      {failed && <span className="status-error-label">Failed — retry</span>}
    </div>
  );
}

// ─── Save Build Packet button ─────────────────────────────────────────────────

function SavePacketButton({
  requestId,
  packet,
  onSaved,
}: {
  requestId: string;
  packet: GeneratedBuildPacket;
  onSaved?: () => void;
}) {
  const [state, setState]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleSave() {
    setState('saving');
    const result = await saveBuiltPacket(requestId, packet);
    if (result) {
      setState('saved');
      setSavedId(result.id);
      onSaved?.();
      setTimeout(() => setState('idle'), 2500);
    } else {
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    }
  }

  if (state === 'saved') {
    return (
      <div className="save-packet-success">
        ✓ Packet saved{savedId ? ` · ID: ${savedId.slice(0, 8)}…` : ''}
      </div>
    );
  }
  return (
    <button
      className={`save-packet-btn${state === 'error' ? ' save-packet-btn--error' : ''}`}
      onClick={handleSave}
      disabled={state === 'saving'}
    >
      {state === 'saving' ? 'Saving…' : state === 'error' ? 'Failed — retry' : '⬇ Save to Supabase'}
    </button>
  );
}

// ─── AI Operations Panel ──────────────────────────────────────────────────────

type AiTab = 'summary' | 'missing' | 'followup' | 'brief' | 'proposal' | 'checklists' | 'automation';

const AI_TABS: { id: AiTab; label: string }[] = [
  { id: 'summary',    label: 'AI Summary'    },
  { id: 'missing',    label: 'Missing Info'  },
  { id: 'followup',   label: 'Follow-up Qs' },
  { id: 'brief',      label: 'Creator Brief' },
  { id: 'proposal',   label: 'Proposal'      },
  { id: 'checklists', label: 'Checklists'    },
  { id: 'automation', label: 'Automation'    },
];

function AiOpsPanel({
  row,
  packet,
  onPacketSaved,
}: {
  row: BuyerRequestRow;
  packet: GeneratedBuildPacket;
  onPacketSaved?: () => void;
}) {
  const [tab, setTab] = useState<AiTab>('summary');

  return (
    <div className="ai-ops-panel">
      <div className="ai-ops-label">
        ⚡ AI-style operations preview — rules-based MVP version. No AI API called.
      </div>

      <div className="ai-ops-tabs" role="tablist">
        {AI_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`ai-ops-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ai-ops-content">

        {tab === 'summary' && (
          <>
            <div className="ops-scores-grid">
              <div className="ops-score-cell">
                <span className="ops-score-label">Lead Quality</span>
                <span className="ops-score-value" style={{ color: qualityColors[packet.leadQualityLabel] }}>
                  {packet.leadQualityLabel} · {packet.leadQualityScore}/100
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Priority</span>
                <span className="ops-score-value" style={{ color: priorityColors[packet.priorityLabel] }}>
                  {packet.priorityLabel}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Fit Rating</span>
                <span className="ops-score-value" style={{ color: fitColors[packet.fitRating] }}>
                  {packet.fitRating}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Urgency</span>
                <span className="ops-score-value" style={{ color: urgencyColors[packet.urgencyRating] }}>
                  {packet.urgencyRating}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Quote Readiness</span>
                <span className="ops-score-value" style={{ color: quoteReadinessColors[packet.quoteReadiness] ?? '#8a94a6' }}>
                  {packet.quoteReadiness}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Price Range</span>
                <span className="ops-score-value">{packet.suggestedPriceRange}</span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Complexity</span>
                <span className="ops-score-value">{packet.complexityRating}</span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Fulfillment</span>
                <span className="ops-score-value">{packet.estimatedFulfillmentDifficulty}</span>
              </div>
            </div>

            <div className="ops-field">
              <div className="ops-field-label">AI Overview</div>
              <p>{packet.aiSummary}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Why This Build Fits</div>
              <p>{packet.whyThisBuildFits}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Creator Fit Recommendation</div>
              <p>{packet.creatorFitRecommendation}</p>
            </div>
            <div className="ops-copy-row">
              <CopyBtn text={buildPacketSummaryText(row, packet)} label="Copy Packet Summary" />
            </div>
          </>
        )}

        {tab === 'missing' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Missing Information ({packet.missingInfoFlags.length})</div>
              {packet.missingInfoFlags.length === 0
                ? <p className="ops-all-good">✓ No missing information flags — request is complete.</p>
                : <ul className="ops-flag-list ops-flags-warn">
                    {packet.missingInfoFlags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
              }
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Risk Flags ({packet.riskFlags.length})</div>
              {packet.riskFlags.length === 0
                ? <p className="ops-all-good">✓ No risk flags detected.</p>
                : <ul className="ops-flag-list ops-flags-risk">
                    {packet.riskFlags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
              }
            </div>
          </>
        )}

        {tab === 'followup' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Follow-up Questions</div>
              <ul className="ops-list">
                {packet.followUpQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
            <div className="ops-copy-row">
              <CopyBtn
                text={`Follow-up questions for ${row.business_name}:\n\n` + packet.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
                label="Copy Follow-up Questions"
              />
              <CopyBtn text={packet.buyerOutreachMessage} label="Copy Buyer Outreach Message" />
            </div>
          </>
        )}

        {tab === 'brief' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Creator Instructions</div>
              <p>{packet.creatorInstructions}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Page Sections</div>
              <ul className="ops-list">
                {packet.suggestedPageSections.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Design Direction</div>
              <p>{packet.designDirection}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Form Fields</div>
              <ul className="ops-list">
                {packet.formFields.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div className="ops-copy-row">
              <CopyBtn
                text={[
                  `Creator Brief — ${row.business_name}`,
                  '',
                  packet.creatorInstructions,
                  '',
                  'Page Sections:',
                  ...packet.suggestedPageSections.map((s) => `• ${s}`),
                  '',
                  'Design Direction:',
                  packet.designDirection,
                  '',
                  'Suggested Form Fields:',
                  ...packet.formFields.map((f) => `• ${f}`),
                ].join('\n')}
                label="Copy Creator Brief"
              />
            </div>
          </>
        )}

        {tab === 'proposal' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Proposal Angle</div>
              <p>{packet.suggestedProposalAngle}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Copy Direction</div>
              <p>{packet.suggestedCopyDirection}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Draft Proposal</div>
              <pre className="ops-proposal-draft">{packet.proposalDraft}</pre>
            </div>
            <div className="ops-copy-row">
              <CopyBtn text={packet.proposalDraft} label="Copy Proposal Draft" />
              <SavePacketButton requestId={row.id} packet={packet} onSaved={onPacketSaved} />
            </div>
          </>
        )}

        {tab === 'checklists' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Quality Checklist</div>
              <ul className="ops-list">
                {packet.qualityChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Launch Checklist</div>
              <ul className="ops-list">
                {packet.launchChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </>
        )}

        {tab === 'automation' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Automation Needs</div>
              <p>{packet.automationNeeds}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">CTA Strategy</div>
              <p>{packet.ctaStrategy}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Target Audience</div>
              <p>{packet.targetAudience}</p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Request → Project workflow (always visible on buyer cards) ───────────────

function wfCreatorBriefCopyText(packet: GeneratedBuildPacket): string {
  return [
    packet.businessSummary,
    '',
    'Customer problem:',
    packet.problem,
    '',
    'Recommended MicroBuild:',
    packet.recommendedBuild,
    '',
    'Creator instructions:',
    packet.creatorInstructions,
    '',
    'Quality checklist:',
    ...packet.qualityChecklist.map((line) => `• ${line}`),
  ].join('\n');
}

function wfBuyerProposalCopyText(packet: GeneratedBuildPacket): string {
  const draft = packet.proposalDraft?.trim()
    ? packet.proposalDraft
    : [packet.suggestedProposalAngle, '', packet.buyerOutreachMessage].filter(Boolean).join('\n\n');
  return draft || 'No proposal draft generated.';
}

function wfFullPacketCopyText(packet: GeneratedBuildPacket): string {
  return [
    '=== MicroBuild build packet (rules-based) ===',
    '',
    'Business summary:',
    packet.businessSummary,
    '',
    'Customer problem:',
    packet.problem,
    '',
    'Recommended MicroBuild:',
    packet.recommendedBuild,
    '',
    'Suggested page sections:',
    ...packet.suggestedPageSections.map((s) => `• ${s}`),
    '',
    'Suggested form fields:',
    ...packet.formFields.map((s) => `• ${s}`),
    '',
    'CTA strategy:',
    packet.ctaStrategy,
    '',
    'Automation:',
    packet.automationNeeds,
    '',
    'Creator instructions:',
    packet.creatorInstructions,
    '',
    'Quality checklist:',
    ...packet.qualityChecklist.map((s) => `• ${s}`),
    '',
    'Launch checklist:',
    ...packet.launchChecklist.map((s) => `• ${s}`),
  ].join('\n');
}

function wfLaunchChecklistCopyText(packet: GeneratedBuildPacket): string {
  return packet.launchChecklist.map((s) => `• ${s}`).join('\n');
}

type WorkflowDbPacket = {
  id: string;
  business_summary?: string;
  customer_problem?: string;
  recommended_build?: string;
  suggested_page_sections?: string[] | null;
  form_fields?: unknown[] | null;
  suggested_copy?: Record<string, unknown> | null;
  automation_needs?: string | null;
  creator_instructions?: string | null;
  quality_checklist?: string[] | null;
  launch_checklist?: string[] | null;
};

function CreatorAssignmentDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: CreatorAssignmentDiagnostics | null;
}) {
  if (!diagnostics) {
    return (
      <p className="req-project-workflow-empty-msg">
        Loading creator directory from Supabase…
      </p>
    );
  }
  return (
    <div className="creator-assign-diagnostics">
      <p className="req-project-workflow-empty-msg">
        No creators matched assignment rules (approval active / pending payment, legacy is_active flag, or linked active application).
      </p>
      <ul className="creator-assign-diagnostics-list">
        <li>Total creator_profiles rows: {diagnostics.totalProfilesInDb ?? '—'}</li>
        <li>Profiles with is_active = true: {diagnostics.profilesIsActiveTrueInDb ?? '—'}</li>
        <li>Public profiles (public_profile_status): {diagnostics.publicProfilesInDb ?? '—'}</li>
        <li>Profiles with approval active / pending payment: {diagnostics.profilesApprovalActiveOrPending}</li>
        <li>Extra profiles pulled via linked application IDs: {diagnostics.profilesFetchedViaLinkedApp}</li>
        <li>Active / pending-payment applications with linked_creator_profile_id: {diagnostics.linkedActiveApplications}</li>
        <li>Eligible after filters (assignment dropdown): {diagnostics.eligibleAfterFilter}</li>
      </ul>
      {diagnostics.errors.length > 0 && (
        <div className="creator-assign-diagnostics-err">
          <strong>Query errors:</strong>
          {diagnostics.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <p className="creator-assign-diagnostics-hint">
        Hidden profiles can still be assigned. If counts look wrong, check browser console for Supabase errors (RLS / policies).
      </p>
    </div>
  );
}

function RequestProjectWorkflow({
  row,
  packet,
  creatorProfiles,
  assignmentDiagnostics,
  onRefreshOrders,
  reloadNonce,
}: {
  row: BuyerRequestRow;
  packet: GeneratedBuildPacket;
  creatorProfiles: CreatorProfileSnap[];
  assignmentDiagnostics: CreatorAssignmentDiagnostics | null;
  onRefreshOrders: () => void;
  reloadNonce: number;
}) {
  const [loading, setLoading]                   = useState(true);
  const [order, setOrder]                       = useState<OrderPipelineRow | null>(null);
  const [dbPacket, setDbPacket]                 = useState<WorkflowDbPacket | null>(null);
  const [deliverable, setDeliverable]           = useState<DeliverablePlaceholder | null>(null);
  const [showGenPreview, setShowGenPreview]     = useState(false);
  const [packetDetailOpen, setPacketDetailOpen] = useState(false);
  const [selectedCreatorId, setSelectedCreatorId] = useState('');
  const [busySave, setBusySave]                 = useState(false);
  const [busyCreate, setBusyCreate]             = useState(false);
  const [busyAssign, setBusyAssign]             = useState(false);
  const [busyDeliv, setBusyDeliv]               = useState(false);
  const [busyStatus, setBusyStatus]             = useState(false);
  const [msgSave, setMsgSave]                   = useState<'idle' | 'ok' | 'err'>('idle');
  const [msgCreate, setMsgCreate]               = useState<'idle' | 'ok' | 'err'>('idle');
  const [msgAssign, setMsgAssign]               = useState<'idle' | 'ok' | 'err'>('idle');
  const [msgDeliv, setMsgDeliv]                 = useState<'idle' | 'ok' | 'err'>('idle');

  const refreshLocal = useCallback(async () => {
    setLoading(true);
    try {
      const o = await fetchOrderByRequestId(row.id);
      setOrder(o);
      const { data: bp, error: bpErr } = await supabase
        .from('build_packets')
        .select('id,business_summary,customer_problem,recommended_build,suggested_page_sections,form_fields,suggested_copy,automation_needs,creator_instructions,quality_checklist,launch_checklist,updated_at')
        .eq('request_id', row.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bpErr) console.error('[Admin] workflow load build_packets:', bpErr);
      setDbPacket((bp as WorkflowDbPacket | null) ?? null);
      if (o?.id) {
        const d = await fetchDeliverableByOrderId(o.id);
        setDeliverable(d);
      } else {
        setDeliverable(null);
      }
      const cid = o?.creator_id ?? '';
      setSelectedCreatorId(cid);
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal, reloadNonce]);

  const assignedCreator = creatorProfiles.find((c) => c.id === order?.creator_id);
  const packetSaved     = !!dbPacket?.id;
  const shortProjectId  = order?.id ? `${order.id.slice(0, 8)}…` : null;

  async function handleSavePacket() {
    setBusySave(true);
    setMsgSave('idle');
    const result = await saveBuiltPacket(row.id, packet);
    setBusySave(false);
    if (result) {
      setMsgSave('ok');
      await refreshLocal();
      onRefreshOrders();
      setTimeout(() => setMsgSave('idle'), 3500);
    } else {
      setMsgSave('err');
      setTimeout(() => setMsgSave('idle'), 5000);
    }
  }

  async function handleCreateProject() {
    setBusyCreate(true);
    setMsgCreate('idle');
    const result = await createOrderFromRequest({
      requestId: row.id,
      buildType: row.build_type,
      buyerUserId: row.user_id ?? null,
    });
    setBusyCreate(false);
    if (result) {
      setMsgCreate(result.isNew ? 'ok' : 'ok');
      onRefreshOrders();
      await refreshLocal();
      setTimeout(() => setMsgCreate('idle'), 3500);
    } else {
      setMsgCreate('err');
      setTimeout(() => setMsgCreate('idle'), 5000);
    }
  }

  async function handleAssignCreator() {
    if (!order?.id || !selectedCreatorId) return;
    setBusyAssign(true);
    setMsgAssign('idle');
    const ok = await setOrderCreatorProfile(order.id, selectedCreatorId);
    setBusyAssign(false);
    if (ok) {
      setMsgAssign('ok');
      onRefreshOrders();
      await refreshLocal();
      setTimeout(() => setMsgAssign('idle'), 3500);
    } else {
      setMsgAssign('err');
      setTimeout(() => setMsgAssign('idle'), 5000);
    }
  }

  async function handleAssignAndAdvance() {
    if (!order?.id || !selectedCreatorId) return;
    setBusyAssign(true);
    setMsgAssign('idle');
    const ok = await assignCreatorToOrder(order.id, selectedCreatorId);
    setBusyAssign(false);
    if (ok) {
      setMsgAssign('ok');
      onRefreshOrders();
      await refreshLocal();
      setTimeout(() => setMsgAssign('idle'), 3500);
    } else {
      setMsgAssign('err');
      setTimeout(() => setMsgAssign('idle'), 5000);
    }
  }

  async function handlePipelineStatus(st: OrderPipelineStatus) {
    if (!order?.id) return;
    setBusyStatus(true);
    const ok = await updateOrderStatus(order.id, st);
    setBusyStatus(false);
    if (ok) {
      onRefreshOrders();
      await refreshLocal();
    }
  }

  async function handleDeliverablePlaceholder() {
    if (!order?.id || !order.creator_id) return;
    setBusyDeliv(true);
    setMsgDeliv('idle');
    const result = await createDeliverablePlaceholder({
      orderId: order.id,
      creatorProfileId: order.creator_id,
    });
    setBusyDeliv(false);
    if (result) {
      setMsgDeliv('ok');
      await refreshLocal();
      setTimeout(() => setMsgDeliv('idle'), 3500);
    } else {
      setMsgDeliv('err');
      setTimeout(() => setMsgDeliv('idle'), 5000);
    }
  }

  const displayPacket = packet;

  return (
    <div className="req-project-workflow">
      <div className="req-project-workflow-head">
        <span className="req-project-workflow-title">Project Workflow</span>
        <span className="req-project-workflow-sub">
          Request → Build packet → Project → Creator → Status → Deliverables
        </span>
      </div>

      {loading ? (
        <div className="req-project-workflow-loading">Loading project state…</div>
      ) : (
        <>
          {/* Row 1: packet + project */}
          {!order ? (
            <div className="req-project-workflow-grid req-project-workflow-grid--noproject">
              <div className="req-project-workflow-col">
                <div className="req-project-workflow-label">Build packet</div>
                <div className="req-project-workflow-status-line">
                  <span className={packetSaved ? 'wf-tag wf-tag--ok' : 'wf-tag wf-tag--muted'}>
                    {packetSaved ? `Saved · ${dbPacket?.id?.slice(0, 8) ?? 'packet'}…` : 'Not saved to Supabase'}
                  </span>
                </div>
                <div className="req-project-workflow-actions">
                  <button
                    type="button"
                    className="wf-action-btn"
                    onClick={() => setShowGenPreview((v) => !v)}
                  >
                    {showGenPreview ? 'Hide generated preview' : 'Generate Build Packet'}
                  </button>
                  <button
                    type="button"
                    className="wf-action-btn wf-action-btn--primary"
                    onClick={handleSavePacket}
                    disabled={busySave}
                  >
                    {busySave ? 'Saving…' : packetSaved ? 'Save / Update Build Packet' : 'Save Build Packet'}
                  </button>
                  {msgSave === 'ok' && <span className="wf-feedback wf-feedback--ok">Saved</span>}
                  {msgSave === 'err' && <span className="wf-feedback wf-feedback--err">Save failed — check console</span>}
                </div>
                <button
                  type="button"
                  className={`wf-action-btn wf-action-btn--accent${packetDetailOpen ? ' active' : ''}`}
                  onClick={() => setPacketDetailOpen((v) => !v)}
                >
                  {packetDetailOpen ? 'Hide build packet panel' : 'View Build Packet'}
                </button>
              </div>
              <div className="req-project-workflow-col">
                <div className="req-project-workflow-label">Project</div>
                <p className="req-project-workflow-hint">No project yet for this request.</p>
                <button
                  type="button"
                  className="wf-action-btn wf-action-btn--accent"
                  onClick={handleCreateProject}
                  disabled={busyCreate}
                >
                  {busyCreate ? 'Creating…' : '+ Create Project'}
                </button>
                {msgCreate === 'ok' && <span className="wf-feedback wf-feedback--ok">Project ready</span>}
                {msgCreate === 'err' && <span className="wf-feedback wf-feedback--err">Could not create — check console</span>}
              </div>
            </div>
          ) : (
            <div className="req-project-workflow-grid">
              <div className="req-project-workflow-summary">
                <div className="req-project-workflow-kv">
                  <span className="kv-label">Project ID</span>
                  <span className="kv-val mono">{shortProjectId ?? '—'}</span>
                </div>
                <div className="req-project-workflow-kv">
                  <span className="kv-label">Project status</span>
                  <span
                    className="wf-tag"
                    style={{
                      color:       ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6',
                      borderColor: `${ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6'}44`,
                    }}
                  >
                    {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status ?? 'Unknown'}
                  </span>
                </div>
                <div className="req-project-workflow-kv">
                  <span className="kv-label">Payment</span>
                  <span className="wf-tag wf-tag--muted">{order.payment_status ?? 'unpaid'} (Stripe later)</span>
                </div>
                <div className="req-project-workflow-kv">
                  <span className="kv-label">Assigned creator</span>
                  <span className="kv-val">
                    {assignedCreator
                      ? `${assignedCreator.display_name ?? assignedCreator.full_name} · ${assignedCreator.tier ?? 'tier'}`
                      : 'Unassigned'}
                  </span>
                </div>
                <div className="req-project-workflow-kv">
                  <span className="kv-label">Build packet</span>
                  <span className={packetSaved ? 'wf-tag wf-tag--ok' : 'wf-tag wf-tag--warn'}>
                    {packetSaved ? `Saved · linked ${order.build_packet_id ? '✓' : '(save again to link)'}` : 'Not saved'}
                  </span>
                </div>
              </div>

              <div className="req-project-workflow-actions req-project-workflow-actions--wrap">
                <button type="button" className="wf-action-btn" onClick={() => setShowGenPreview((v) => !v)}>
                  {showGenPreview ? 'Hide generated preview' : 'Generate Build Packet'}
                </button>
                <button type="button" className="wf-action-btn wf-action-btn--primary" onClick={handleSavePacket} disabled={busySave}>
                  {busySave ? 'Saving…' : 'Save / Update Build Packet'}
                </button>
                <button type="button" className={`wf-action-btn${packetDetailOpen ? ' active' : ''}`} onClick={() => setPacketDetailOpen((v) => !v)}>
                  {packetDetailOpen ? 'Hide Build Packet' : 'View Build Packet'}
                </button>
                {msgSave === 'ok' && <span className="wf-feedback wf-feedback--ok">Saved</span>}
                {msgSave === 'err' && <span className="wf-feedback wf-feedback--err">Save failed</span>}
              </div>

              {/* Assign creator */}
              <div className="req-project-workflow-assign">
                <div className="req-project-workflow-label">Assign Creator</div>
                {creatorProfiles.length === 0 ? (
                  <CreatorAssignmentDiagnosticsPanel diagnostics={assignmentDiagnostics} />
                ) : (
                  <>
                    <div className="req-project-workflow-assign-row">
                      <select
                        className="wf-creator-select"
                        value={selectedCreatorId}
                        onChange={(e) => setSelectedCreatorId(e.target.value)}
                        disabled={busyAssign}
                      >
                        <option value="">Select creator profile…</option>
                        {creatorProfiles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.display_name ?? c.full_name) || 'Creator'} · tier {c.tier ?? '—'} · approval{' '}
                            {c.approval_status ?? '—'} · {c.verification_status ?? '—'} · visibility{' '}
                            {c.public_profile_status ?? '—'}
                            {c.contact_email ? ` · ${c.contact_email}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="wf-action-btn"
                        onClick={handleAssignCreator}
                        disabled={busyAssign || !selectedCreatorId}
                      >
                        {busyAssign ? '…' : 'Save assignment'}
                      </button>
                      <button
                        type="button"
                        className="wf-action-btn wf-action-btn--primary"
                        onClick={handleAssignAndAdvance}
                        disabled={busyAssign || !selectedCreatorId}
                      >
                        {busyAssign ? '…' : 'Assign & Mark Assigned'}
                      </button>
                    </div>
                    {msgAssign === 'ok' && (
                      <span className="wf-feedback wf-feedback--ok">
                        {assignedCreator
                          ? `Assigned: ${assignedCreator.display_name ?? assignedCreator.full_name}`
                          : 'Assignment saved'}
                      </span>
                    )}
                    {msgAssign === 'err' && <span className="wf-feedback wf-feedback--err">Assignment failed — check console</span>}
                  </>
                )}
              </div>

              {/* Pipeline buttons */}
              <div className="req-project-workflow-label">Project pipeline status</div>
              <div className="req-project-workflow-status-btns">
                {([
                  ['ready_to_quote', 'Ready to Quote'],
                  ['assigned',       'Mark Assigned'],
                  ['in_progress',    'In Progress'],
                  ['in_review',      'In Review'],
                  ['delivered',      'Delivered'],
                  ['completed',      'Completed'],
                  ['rejected',       'Reject'],
                  ['canceled',       'Cancel'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`wf-pipe-btn${order.order_status === id ? ' wf-pipe-btn--current' : ''}`}
                    disabled={busyStatus || order.order_status === id}
                    onClick={() => handlePipelineStatus(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Deliverables placeholder */}
              <div className="req-project-workflow-deliverable">
                <div className="req-project-workflow-label">Deliverables (placeholder)</div>
                {deliverable ? (
                  <div className="wf-deliverable-strip">
                    <span className="wf-tag wf-tag--muted">Status: {deliverable.delivery_status ?? 'draft'}</span>
                    <span className="wf-tag wf-tag--muted">Preview: {deliverable.preview_url?.trim() ? 'Set' : '—'}</span>
                    <span className="wf-tag wf-tag--muted">Delivery URL: {deliverable.live_url?.trim() ? 'Set' : '—'}</span>
                    <span className="wf-tag wf-tag--muted">GitHub: {deliverable.github_url?.trim() ? 'Set' : '—'}</span>
                  </div>
                ) : (
                  <>
                    <p className="req-project-workflow-hint">
                      {order.creator_id
                        ? 'Create a placeholder deliverable row for this order (no file upload yet).'
                        : 'Assign a creator before adding a deliverable placeholder.'}
                    </p>
                    <button
                      type="button"
                      className="wf-action-btn"
                      disabled={busyDeliv || !order.creator_id}
                      onClick={handleDeliverablePlaceholder}
                    >
                      {busyDeliv ? '…' : '+ Create deliverable placeholder'}
                    </button>
                    {msgDeliv === 'ok' && <span className="wf-feedback wf-feedback--ok">Placeholder created</span>}
                    {msgDeliv === 'err' && <span className="wf-feedback wf-feedback--err">Could not create — check console</span>}
                  </>
                )}
              </div>
            </div>
          )}

          <p className="req-proposal-deferred-badge" role="status">
            Proposal feature deferred — use <strong>Later: Proposals</strong> tab for test tools only.
          </p>

          {showGenPreview && (
            <div className="req-project-gen-preview">
              <div className="req-project-gen-preview-label">Generated preview (rules-based — same as AI Ops)</div>
              <p className="req-project-gen-preview-summary">{displayPacket.aiSummary}</p>
              <div className="req-project-gen-preview-mini">
                <span><strong>Recommended:</strong> {displayPacket.recommendedBuild}</span>
                <span><strong>Quote readiness:</strong> {displayPacket.quoteReadiness}</span>
              </div>
            </div>
          )}

          {packetDetailOpen && (
            <div className="req-project-packet-detail">
              <div className="req-project-packet-detail-copy-row">
                <CopyBtn text={wfCreatorBriefCopyText(displayPacket)} label="Copy Creator Brief" />
                <CopyBtn text={wfBuyerProposalCopyText(displayPacket)} label="Copy Buyer Proposal" />
                <CopyBtn text={wfFullPacketCopyText(displayPacket)} label="Copy Build Packet" />
                <CopyBtn text={wfLaunchChecklistCopyText(displayPacket)} label="Copy Launch Checklist" />
              </div>
              <div className="req-project-packet-sections">
                <section>
                  <h4>Business summary</h4>
                  <p>{dbPacket?.business_summary ?? displayPacket.businessSummary}</p>
                </section>
                <section>
                  <h4>Customer problem</h4>
                  <p>{dbPacket?.customer_problem ?? displayPacket.problem}</p>
                </section>
                <section>
                  <h4>Recommended MicroBuild</h4>
                  <p>{dbPacket?.recommended_build ?? displayPacket.recommendedBuild}</p>
                </section>
                <section>
                  <h4>Suggested page sections</h4>
                  <ul>
                    {(dbPacket?.suggested_page_sections?.length
                      ? dbPacket.suggested_page_sections
                      : displayPacket.suggestedPageSections
                    ).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Suggested form fields</h4>
                  <ul>
                    {(dbPacket?.form_fields?.length
                      ? dbPacket.form_fields.map((x) => safeText((x as { field?: unknown })?.field, String(x)))
                      : displayPacket.formFields
                    ).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>CTA strategy</h4>
                  <p>
                    {safeText(dbPacket?.suggested_copy?.cta as unknown, '') ||
                      displayPacket.ctaStrategy ||
                      '—'}
                  </p>
                </section>
                <section>
                  <h4>Automation opportunities</h4>
                  <p>{dbPacket?.automation_needs ?? displayPacket.automationNeeds}</p>
                </section>
                <section>
                  <h4>Creator instructions</h4>
                  <p>{dbPacket?.creator_instructions ?? displayPacket.creatorInstructions}</p>
                </section>
                <section>
                  <h4>Quality checklist</h4>
                  <ul>
                    {(dbPacket?.quality_checklist?.length
                      ? dbPacket.quality_checklist
                      : displayPacket.qualityChecklist
                    ).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Launch checklist</h4>
                  <ul>
                    {(dbPacket?.launch_checklist?.length
                      ? dbPacket.launch_checklist
                      : displayPacket.launchChecklist
                    ).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Order Card (Project Pipeline) ───────────────────────────────────────────

function OrderCard({
  order,
  activeCreators,
  assignmentDiagnostics,
  buyerBusinessName,
  buyerBuildType,
  deliverable,
  onUpdate,
  onDeliverableRefresh: _onDeliverableRefresh,
}: {
  order: OrderPipelineRow;
  activeCreators: CreatorProfileSnap[];
  assignmentDiagnostics: CreatorAssignmentDiagnostics | null;
  buyerBusinessName: string;
  buyerBuildType: string;
  deliverable: DeliverablePlaceholder | null;
  onUpdate: (id: string, updates: Partial<OrderPipelineRow>) => void;
  onDeliverableRefresh?: () => void;
}) {
  void _onDeliverableRefresh;
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigning, setAssigning]           = useState(false);
  const [selectedCreator, setSelectedCreator] = useState(order.creator_id ?? '');
  const [notesVal, setNotesVal]             = useState(order.admin_notes ?? '');
  const [savingNotes, setSavingNotes]       = useState(false);
  const [msgAssign, setMsgAssign]           = useState<'idle' | 'ok' | 'err'>('idle');
  const [pipelineMsg, setPipelineMsg]       = useState<'idle' | 'ok' | 'err'>('idle');
  const [adminClipMsg, setAdminClipMsg]     = useState<string | null>(null);
  const [workspacePacket, setWorkspacePacket] = useState<BuildPacketWorkspaceRow | null>(null);

  useEffect(() => {
    setSelectedCreator(order.creator_id ?? '');
  }, [order.creator_id]);

  useEffect(() => {
    let cancelled = false;
    void fetchBuildPacketForOrder(order).then((p) => {
      if (!cancelled) setWorkspacePacket(p);
    });
    return () => {
      cancelled = true;
    };
  }, [order.id, order.build_packet_id, order.request_id]);

  const [agreementSnap, setAgreementSnap] = useState<{
    status: string;
    buyerOk: boolean;
    creatorOk: boolean;
    missing: number;
    risks: number;
    changeNote: string | null;
  } | null>(null);
  const [agreementProposal, setAgreementProposal] = useState<ProjectProposalRow | null>(null);
  const [agreementBuyerRequest, setAgreementBuyerRequest] = useState<DatabaseBuyerRequestRow | null>(null);
  const [showAgreementPanel, setShowAgreementPanel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const row = await fetchProposalByOrderId(order.id);
      if (cancelled) return;
      setAgreementProposal(row);
      if (!row) {
        setAgreementSnap(null);
        return;
      }
      const view = getAgreementViewState(row);
      setAgreementSnap({
        status: displayAgreementStatus(row.agreement_status),
        buyerOk: view.buyerConfirmed,
        creatorOk: view.creatorConfirmed,
        missing: row.ai_missing_scope_items?.length ?? 0,
        risks: row.ai_risk_flags?.length ?? 0,
        changeNote: row.buyer_feedback?.trim() || null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  useEffect(() => {
    let cancelled = false;
    if (!order.request_id?.trim()) {
      setAgreementBuyerRequest(null);
      return;
    }
    void supabase
      .from('buyer_requests')
      .select('*')
      .eq('id', order.request_id.trim())
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAgreementBuyerRequest(data ? (data as DatabaseBuyerRequestRow) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [order.request_id]);

  const statusColor = ORDER_STATUS_COLORS[order.order_status] ?? '#8a94a6';
  const assignedCreator = activeCreators.find((c) => c.id === order.creator_id);
  const pipelineIdx = orderTimelineIndex(order.order_status);

  async function handleStatus(status: OrderPipelineStatus) {
    setUpdatingStatus(true);
    setPipelineMsg('idle');
    const ok = await updateOrderStatus(order.id, status);
    setUpdatingStatus(false);
    if (ok) {
      onUpdate(order.id, { order_status: status });
      setPipelineMsg('ok');
      setTimeout(() => setPipelineMsg('idle'), 4000);
    } else {
      setPipelineMsg('err');
      setTimeout(() => setPipelineMsg('idle'), 6000);
    }
  }

  async function handleAssign() {
    if (!selectedCreator) return;
    setAssigning(true);
    setMsgAssign('idle');
    const ok = await assignCreatorToOrder(order.id, selectedCreator);
    setAssigning(false);
    if (ok) {
      onUpdate(order.id, { creator_id: selectedCreator, order_status: 'assigned' });
      setMsgAssign('ok');
      setTimeout(() => setMsgAssign('idle'), 3500);
    } else {
      setMsgAssign('err');
      setTimeout(() => setMsgAssign('idle'), 5000);
    }
  }

  async function handleAdminClipboard(kind: 'brief' | 'delivery' | 'revision' | 'buyer' | 'completion' | 'checklist') {
    let text: string;
    switch (kind) {
      case 'brief':
        text = buildCreatorBriefCopy(order, workspacePacket);
        break;
      case 'delivery':
        text = buildDeliverySummaryCopy(order, deliverable, buyerBusinessName);
        break;
      case 'revision':
        text = buildRevisionRequestCopy(
          deliverable?.revision_note?.trim() || order.admin_notes?.trim() || '',
        );
        break;
      case 'buyer':
        text = buildBuyerUpdateCopy(order, workspacePacket);
        break;
      case 'completion':
        text = buildCompletionMessageCopy(order);
        break;
      case 'checklist':
        text = buildOperationalBuildChecklistCopy();
        break;
    }
    const ok = await copyTextToClipboard(text);
    setAdminClipMsg(ok ? 'Copied' : 'Copy failed');
    setTimeout(() => setAdminClipMsg(null), 2200);
  }

  return (
    <div className="order-card">
      <div className="order-card-header">
        <div className="order-card-title-col">
          <div className="order-card-title">
            {order.project_title ?? `Project ${order.id.slice(0, 8)}`}
          </div>
          <div className="order-card-type">{order.project_type ?? '—'}</div>
        </div>
        <div className="order-card-badges">
          <span className="order-status-badge"
            style={{ color: statusColor, borderColor: statusColor + '44', background: statusColor + '11' }}>
            {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
          </span>
          <span className="order-payment-badge"
            style={{ color: order.payment_status === 'paid' ? '#00d478' : '#8a94a6' }}>
            {order.payment_status ?? 'unpaid'}
          </span>
          <span className={`order-bp-badge${order.build_packet_id ? ' order-bp-badge--ok' : ''}`}>
            Packet {order.build_packet_id ? 'linked ✓' : 'not linked'}
          </span>
          {(order.selection_method === 'buyer_selected' || order.selected_by_buyer) ?
            (
              <span className="order-badge-buyer-selected" title="Creator chosen via buyer marketplace selection">
                Buyer-selected
              </span>
            )
          : null}
        </div>
      </div>

      <div className="order-card-buyer-context">
        <span className="order-buyer-label">Buyer / MicroBuild</span>
        <span className="order-buyer-val">{buyerBusinessName} · {buyerBuildType}</span>
      </div>

      <div className="order-card-agreement-strip" role="status">
        <span className="order-buyer-label">Project agreement</span>
        {agreementSnap ?
          (
            <span className="order-buyer-val">
              {agreementSnap.status}
              {' · '}
              Buyer {agreementSnap.buyerOk ? 'confirmed' : 'pending'}
              {' · '}
              Creator {agreementSnap.creatorOk ? 'confirmed' : 'pending'}
              {(agreementSnap.missing > 0 || agreementSnap.risks > 0) ?
                ` · ${agreementSnap.missing} missing · ${agreementSnap.risks} risks`
              : ''}
              {agreementSnap.changeNote ?
                ` · Change note: ${agreementSnap.changeNote.slice(0, 80)}${agreementSnap.changeNote.length > 80 ? '…' : ''}`
              : ''}
            </span>
          )
        : (
          <span className="order-buyer-val subtle">Not drafted — parties generate on project workspace</span>
        )}
        <button
          type="button"
          className="order-del-copy-btn order-agreement-toggle"
          onClick={() => setShowAgreementPanel((v) => !v)}
        >
          {showAgreementPanel ? 'Hide agreement' : 'View agreement'}
        </button>
      </div>

      {showAgreementPanel ?
        (
          <ProjectAgreementPanel
            role="admin"
            order={order}
            buyerRequest={agreementBuyerRequest}
            proposal={agreementProposal}
            creatorProfileId={order.creator_id ?? null}
            creatorDisplayName={
              assignedCreator?.display_name ?? assignedCreator?.full_name ?? 'Assigned creator'
            }
            buyerBusinessName={buyerBusinessName}
            compact
            onProposalUpdated={(row) => {
              setAgreementProposal(row);
              if (!row) {
                setAgreementSnap(null);
                return;
              }
              const view = getAgreementViewState(row);
              setAgreementSnap({
                status: displayAgreementStatus(row.agreement_status),
                buyerOk: view.buyerConfirmed,
                creatorOk: view.creatorConfirmed,
                missing: row.ai_missing_scope_items?.length ?? 0,
                risks: row.ai_risk_flags?.length ?? 0,
                changeNote: row.buyer_feedback?.trim() || null,
              });
            }}
          />
        )
      : null}

      <p className="order-msg-mod-placeholder">
        <strong>Message moderation</strong> coming later — buyer/creator threads are not reviewed from this panel in v1.
      </p>

      <div className="order-next-callout">
        <div className="order-next-callout-label">Next best admin action</div>
        <p className="order-next-callout-body">{getNextOrderAction(order.order_status)}</p>
        <p className="order-activity-line">
          Timestamps on file: created {fmtDate(order.created_at)} · updated {fmtDate(order.updated_at)}
        </p>
      </div>

      <div className="order-admin-copy-bar" role="group" aria-label="Copy snippets">
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('brief')}>
          Copy Creator Brief
        </button>
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('checklist')}>
          Copy Build Checklist
        </button>
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('buyer')}>
          Copy Buyer Update
        </button>
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('completion')}>
          Copy Completion Message
        </button>
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('delivery')}>
          Copy Delivery Summary
        </button>
        <button type="button" className="order-del-copy-btn" onClick={() => handleAdminClipboard('revision')}>
          Copy Revision Request
        </button>
        {adminClipMsg ? <span className="order-del-copy-msg">{adminClipMsg}</span> : null}
      </div>

      {/* Pipeline progress bar */}
      <div className="order-pipeline-bar">
        {ORDER_PIPELINE_STAGES.map((s) => {
          const done   = ORDER_PIPELINE_STAGES.findIndex((x) => x.id === s.id) < pipelineIdx;
          const active = s.id === order.order_status;
          return (
            <div key={s.id} className={`order-pipe-step${active ? ' active' : ''}${done ? ' done' : ''}`}>
              <div className="order-pipe-dot"
                style={{ background: done || active ? ORDER_STATUS_COLORS[s.id] ?? '#63b3ed' : 'var(--border)' }} />
              <span className="order-pipe-label">{s.label}</span>
            </div>
          );
        })}
      </div>
      {pipelineMsg === 'ok' && (
        <span className="wf-feedback wf-feedback--ok order-pipeline-feedback">Pipeline status saved</span>
      )}
      {pipelineMsg === 'err' && (
        <span className="wf-feedback wf-feedback--err order-pipeline-feedback">Status update failed — see console</span>
      )}

      {/* Details row */}
      <div className="order-card-details">
        <div className="order-detail">
          <span className="order-detail-label">Request ID</span>
          <span className="order-detail-val">{order.request_id?.slice(0, 8) ?? '—'}…</span>
        </div>
        <div className="order-detail">
          <span className="order-detail-label">Fee</span>
          <span className="order-detail-val">{order.microbuild_fee ?? '—'}</span>
        </div>
        <div className="order-detail">
          <span className="order-detail-label">Creator Payout</span>
          <span className="order-detail-val">{order.creator_payout ?? '—'}</span>
        </div>
        <div className="order-detail">
          <span className="order-detail-label">Created</span>
          <span className="order-detail-val">{fmtDate(order.created_at)}</span>
        </div>
      </div>

      {/* Creator assignment */}
      <div className="order-assign-row">
        <span className="order-assign-label">
          {assignedCreator
            ? `Assigned: ${assignedCreator.display_name ?? assignedCreator.full_name}`
            : 'Unassigned'}
        </span>
        <select
          className="order-creator-select"
          value={selectedCreator}
          onChange={(e) => setSelectedCreator(e.target.value)}
          disabled={assigning}
        >
          <option value="">Select creator…</option>
          {activeCreators.length === 0 && <option disabled>No eligible creators in dropdown</option>}
          {activeCreators.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.display_name ?? c.full_name) || 'Creator'} · tier {c.tier ?? '—'} · approval {c.approval_status ?? '—'} ·{' '}
              {c.verification_status ?? '—'} · visibility {c.public_profile_status ?? '—'}
              {c.contact_email ? ` · ${c.contact_email}` : ''}
            </option>
          ))}
        </select>
        <button
          className="order-assign-btn"
          onClick={handleAssign}
          disabled={!selectedCreator || assigning}
        >
          {assigning ? '…' : 'Assign & mark Assigned'}
        </button>
      </div>
      {msgAssign === 'ok' && (
        <span className="wf-feedback wf-feedback--ok order-assign-feedback">
          Assigned — status set to Assigned.
        </span>
      )}
      {msgAssign === 'err' && (
        <span className="wf-feedback wf-feedback--err order-assign-feedback">
          Assignment failed — check browser console for Supabase error.
        </span>
      )}

      {activeCreators.length === 0 && (
        <div className="order-assign-empty">
          <CreatorAssignmentDiagnosticsPanel diagnostics={assignmentDiagnostics} />
        </div>
      )}

      {!order.creator_id && (
        <p className="order-assign-warning">
          Assign a creator before relying on deliverable submissions from the creator workspace.
        </p>
      )}

      <div className="order-deliverable-compact">
        <span className="order-detail-label">Deliverable</span>
        <span className="order-del-tag">
          {deliverable
            ? DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status ?? '—'
            : 'None yet'}
        </span>
        <span className="subtle order-deliverable-tab-hint">Full review → Deliverables tab</span>
      </div>

      {/* Status action buttons */}
      <div className="order-status-actions">
        <span className="order-status-actions-label">Update Status:</span>
        {[
          { id: 'draft',          label: 'Draft' },
          { id: 'ready_to_quote', label: 'Ready to Quote' },
          { id: 'pending_payment',label: 'Pending Payment' },
          { id: 'assigned',       label: 'Assigned'        },
          { id: 'in_progress',    label: 'In Progress'    },
          { id: 'in_review',      label: 'In Review'      },
          { id: 'delivered',      label: 'Delivered'      },
          { id: 'completed',      label: 'Completed'      },
          { id: 'rejected',       label: 'Reject'         },
          { id: 'canceled',       label: 'Cancel'         },
        ].map(({ id, label }) => (
          <button
            key={id}
            className={`order-status-btn${order.order_status === id ? ' order-status-btn--active' : ''}`}
            style={order.order_status === id ? { borderColor: ORDER_STATUS_COLORS[id], color: ORDER_STATUS_COLORS[id] } : undefined}
            onClick={() => handleStatus(id as OrderPipelineStatus)}
            disabled={updatingStatus || order.order_status === id}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="order-notes-row">
        <textarea
          className="order-notes-input"
          placeholder="Admin notes (internal only)…"
          rows={2}
          value={notesVal}
          onChange={(e) => setNotesVal(e.target.value)}
        />
        <button
          className="order-notes-save"
          onClick={async () => {
            setSavingNotes(true);
            await supabase.from('orders').update({ admin_notes: notesVal }).eq('id', order.id);
            onUpdate(order.id, { admin_notes: notesVal });
            setSavingNotes(false);
          }}
          disabled={savingNotes || notesVal === (order.admin_notes ?? '')}
        >
          {savingNotes ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Project Pipeline Section ─────────────────────────────────────────────────

function ProjectPipelineSection({
  orders,
  requests,
  activeCreators,
  assignmentDiagnostics,
  loading,
  onOrderUpdate,
}: {
  orders: OrderPipelineRow[];
  requests: BuyerRequestRow[];
  activeCreators: CreatorProfileSnap[];
  assignmentDiagnostics: CreatorAssignmentDiagnostics | null;
  loading: boolean;
  onOrderUpdate: (id: string, updates: Partial<OrderPipelineRow>) => void;
}) {
  const [filter, setFilter] = useState('all');
  const [deliverablesByOrderId, setDeliverablesByOrderId] = useState<Record<string, DeliverablePlaceholder>>({});
  const [deliverablesNonce, setDeliverablesNonce] = useState(0);

  const bizByReq = useMemo(() => {
    const m: Record<string, { business_name: string; build_type: string }> = {};
    for (const r of requests) {
      m[r.id] = {
        business_name: r.business_name?.trim() ? r.business_name : 'Unknown business',
        build_type: r.build_type?.trim() ? r.build_type : '—',
      };
    }
    return m;
  }, [requests]);

  useEffect(() => {
    if (orders.length === 0) {
      setDeliverablesByOrderId({});
      return;
    }
    const ids = orders.map((o) => o.id);
    supabase
      .from('deliverables')
      .select(
        'id, order_id, creator_id, creator_profile_id, live_url, preview_url, github_url, notes, delivery_status, revision_note, revision_count, approved_at, submitted_at, updated_at',
      )
      .in('order_id', ids)
      .then(({ data, error }) => {
        if (error) {
          console.error('[Admin] batch deliverables:', error);
          return;
        }
        const map: Record<string, DeliverablePlaceholder> = {};
        for (const row of data ?? []) {
          map[(row as DeliverablePlaceholder).order_id] = row as DeliverablePlaceholder;
        }
        setDeliverablesByOrderId(map);
      });
  }, [orders, deliverablesNonce]);

  const FILTERS = [
    { id: 'all',           label: 'All' },
    { id: 'draft',         label: 'Draft' },
    { id: 'ready_to_quote',label: 'To Quote' },
    { id: 'assigned',      label: 'Assigned' },
    { id: 'in_progress',   label: 'In Progress' },
    { id: 'in_review',     label: 'In Review' },
    { id: 'delivered',     label: 'Delivered' },
    { id: 'completed',     label: 'Completed' },
  ];

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.order_status === filter);

  return (
    <section className="admin-section" id="section-pipeline">
      <div className="admin-section-header">
        <h2>Project Pipeline</h2>
        {!loading && <span className="admin-count">{orders.length}</span>}
      </div>
      <p className="pipeline-section-intro">
        Live orders from Supabase. Per-request controls (build packet, create project, assign creator) live in each card in the{' '}
        <a href="#section-buyers">Buyer Request Queue</a> directly above.
      </p>

      {loading ? (
        <div className="admin-state-row admin-loading">Loading projects…</div>
      ) : orders.length === 0 ? (
        <div className="admin-state-row admin-empty">
          No projects yet. Use the <strong>+ Create Project</strong> button on any buyer request above
          to start a project.
        </div>
      ) : (
        <>
          <div className="pipeline-filter-bar">
            {FILTERS.map(({ id, label }) => {
              const count = id === 'all' ? orders.length : orders.filter((o) => o.order_status === id).length;
              return (
                <button
                  key={id}
                  className={`pipeline-filter-tab${filter === id ? ' active' : ''}`}
                  style={filter === id && id !== 'all'
                    ? { color: ORDER_STATUS_COLORS[id], borderColor: ORDER_STATUS_COLORS[id] }
                    : undefined}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <span className="pipeline-filter-count">{count}</span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="admin-state-row admin-empty">No projects in this status.</div>
          ) : (
            <div className="pipeline-card-list">
              {filtered.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  activeCreators={activeCreators}
                  assignmentDiagnostics={assignmentDiagnostics}
                  buyerBusinessName={
                    order.request_id && bizByReq[order.request_id]
                      ? bizByReq[order.request_id].business_name
                      : 'Unknown request'
                  }
                  buyerBuildType={
                    order.request_id && bizByReq[order.request_id]
                      ? bizByReq[order.request_id].build_type
                      : '—'
                  }
                  deliverable={deliverablesByOrderId[order.id] ?? null}
                  onUpdate={onOrderUpdate}
                  onDeliverableRefresh={() => setDeliverablesNonce((n) => n + 1)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Quick Status Button ──────────────────────────────────────────────────────

function QuickStatusBtn({
  requestId, status, label, color, currentStatus, onStatusChange,
}: {
  requestId: string;
  status: string;
  label: string;
  color: string;
  currentStatus: string;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isCurrent = currentStatus === status;

  async function handle() {
    if (isCurrent) return;
    setSaving(true);
    const ok = await updateRequestStatus(requestId, status);
    setSaving(false);
    if (ok) onStatusChange(requestId, status);
  }

  return (
    <button
      className={`req-qa-btn${isCurrent ? ' req-qa-btn--active' : ''}`}
      style={isCurrent ? { borderColor: color, color } : undefined}
      onClick={handle}
      disabled={saving || isCurrent}
      title={isCurrent ? `Already: ${label}` : `Set status to: ${label}`}
    >
      {saving ? '…' : label}
    </button>
  );
}

// ─── Request queue: workflow source helpers ───────────────────────────────────

function adminWorkflowBackedRow(row: BuyerRequestRow): boolean {
  const st = safeText(row.source_type, '').toLowerCase();
  return st === 'workflow' || Boolean(row.requested_from_workflow) || Boolean(row.source_workflow_title?.trim());
}

function adminBuyerSourceHeading(row: BuyerRequestRow): string {
  return adminWorkflowBackedRow(row) ? 'Workflow customization' : 'Custom request';
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  enriched,
  onStatusChange,
  selected,
  onSelect,
  creatorProfiles,
  assignmentDiagnostics,
  onRefreshOrders,
  originalCreatorApplied,
  onViewApplicants,
}: {
  enriched: EnrichedRequest;
  onStatusChange: (id: string, newStatus: string) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
  creatorProfiles: CreatorProfileSnap[];
  assignmentDiagnostics: CreatorAssignmentDiagnostics | null;
  onRefreshOrders: () => void;
  /** True when source workflow publisher has an active request_application */
  originalCreatorApplied?: boolean;
  onViewApplicants?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wfNonce, setWfNonce]   = useState(0);
  const { row, packet } = enriched;

  const origSnap = row.source_creator_profile_id
    ? creatorProfiles.find((c) => c.id === row.source_creator_profile_id)
    : null;
  const origCreatorLabel =
    safeText(origSnap?.display_name).trim()
    || safeText(origSnap?.full_name).trim()
    || (row.source_creator_profile_id ? 'Original creator — open Profiles tab if name missing' : '—');

  const selPid = row.selected_creator_profile_id;
  const selSnap = selPid ? creatorProfiles.find((c) => safeText(c.id) === safeText(selPid)) : null;
  const selectedCreatorLabel =
    safeText(selSnap?.display_name).trim()
    || safeText(selSnap?.full_name).trim()
    || (selPid ? `${safeText(selPid).slice(0, 8)}…` : '—');

  return (
    <div className={`req-card${expanded ? ' req-card--open' : ''}${selected ? ' req-card--selected' : ''}`}>

      {/* Header */}
      <div className="req-card-header">
        {onSelect && (
          <input
            type="checkbox"
            className="card-select-checkbox"
            checked={!!selected}
            onChange={() => onSelect(row.id)}
            aria-label={`Select ${row.business_name}`}
          />
        )}
        <div className="req-card-badges">
          <span
            className="req-priority-pill"
            style={{
              backgroundColor: priorityColors[packet.priorityLabel] + '22',
              color:            priorityColors[packet.priorityLabel],
              borderColor:      priorityColors[packet.priorityLabel] + '55',
            }}
          >
            {packet.priorityLabel} Priority
          </span>
          <span
            className="req-fit-pill"
            style={{
              backgroundColor: fitColors[packet.fitRating] + '22',
              color:            fitColors[packet.fitRating],
              borderColor:      fitColors[packet.fitRating] + '55',
            }}
          >
            {packet.fitRating} Fit
          </span>
          <span
            className="req-quote-pill"
            style={{ color: quoteReadinessColors[packet.quoteReadiness] ?? '#8a94a6' }}
          >
            {packet.quoteReadiness}
          </span>
        </div>
        <div className="req-card-meta-right">
          <span
            className="req-quality-score"
            style={{ color: qualityColors[packet.leadQualityLabel] }}
          >
            {packet.leadQualityScore}/100
          </span>
          <span className="req-date">{fmtDate(row.created_at)}</span>
          <StatusDropdown
            id={row.id}
            initialStatus={row.status}
            onStatusChange={onStatusChange}
          />
        </div>
      </div>

      <div className="req-marketplace-strip" role="status" aria-label="Marketplace selection overview">
        <span className="req-mp-pill">
          Applicants: {typeof row.applications_count === 'number' ? row.applications_count : '—'}
        </span>
        <span className="req-mp-pill">
          Marketplace:{' '}
          {safeText(row.application_status).trim() ?
            safeText(row.application_status).replace(/_/g, ' ')
          : '—'}
        </span>
        {safeText(row.application_status).toLowerCase() === 'creator_selected' ?
          <span className="req-mp-pill req-mp-pill--buyer">Buyer-selected creator</span>
        : null}
        {row.selected_request_application_id ?
          (
            <span className="req-mp-pill req-mp-pill--muted" title={safeText(row.selected_request_application_id)}>
              Selected application: {safeText(row.selected_request_application_id).slice(0, 8)}…
            </span>
          )
        : null}
        {row.selected_creator_profile_id ?
          <span className="req-mp-pill req-mp-pill--muted">Selected creator linked</span>
        : null}
        <span className="req-mp-note subtle">
          Buyers normally pick applicants — manual assignment in the pipeline block is fallback only.
        </span>
      </div>

      {/* Body */}
      <div className="req-card-body">
        <div className="req-card-contact">
          <div className="req-business-name">{row.business_name}</div>
          <div className="req-industry">{row.industry}</div>
          <div className="req-contact-name">{row.full_name}</div>
          <div className="req-email">{row.email}</div>
        </div>

        <div className="req-card-details">
          <div className="req-detail-item">
            <span className="req-detail-label">Build</span>
            <span className="req-detail-value req-build-type">{row.build_type}</span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Budget</span>
            <span className="req-detail-value">{row.budget || '—'}</span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Deadline</span>
            <span className="req-detail-value" style={{ color: urgencyColors[packet.urgencyRating] }}>
              {row.deadline || '—'}
            </span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Price est.</span>
            <span className="req-detail-value">{packet.suggestedPriceRange}</span>
          </div>
        </div>

        <div className="req-card-action-col">
          <div className="req-next-action">{packet.adminNextAction}</div>
          {packet.missingInfoFlags.length > 0 && (
            <div className="req-missing-count" title={packet.missingInfoFlags.join('\n')}>
              ⚠ {packet.missingInfoFlags.length} missing field{packet.missingInfoFlags.length > 1 ? 's' : ''}
            </div>
          )}
          {packet.riskFlags.length > 0 && (
            <div className="req-risk-count" title={packet.riskFlags.join('\n')}>
              🔴 {packet.riskFlags.length} risk flag{packet.riskFlags.length > 1 ? 's' : ''}
            </div>
          )}
          <span className="req-card-scroll-hint">
            Full pipeline controls below →
          </span>
        </div>
      </div>

      {(adminWorkflowBackedRow(row) || (row.customization_notes ?? '').trim().length > 0) && (
        <div className="req-admin-workflow-strip">
          <div className="req-admin-workflow-strip-title">Buyer request source</div>
          <div className="req-admin-workflow-cols">
            <div>
              <span className="req-detail-label">Source type</span>
              <div className="req-detail-value">{adminBuyerSourceHeading(row)}</div>
            </div>
            <div>
              <span className="req-detail-label">Workflow title</span>
              <div className="req-detail-value">{row.source_workflow_title?.trim() || '—'}</div>
            </div>
            <div>
              <span className="req-detail-label">Original workflow creator</span>
              <div className="req-detail-value">{origCreatorLabel}</div>
            </div>
            {adminWorkflowBackedRow(row) ?
              (
                <>
                  <div>
                    <span className="req-detail-label">Original creator applied</span>
                    <div className="req-detail-value">{originalCreatorApplied ? 'Yes' : 'Not yet'}</div>
                  </div>
                  <div>
                    <span className="req-detail-label">Applicants</span>
                    <div className="req-detail-value">
                      {typeof row.applications_count === 'number' ? row.applications_count : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="req-detail-label">Selected creator</span>
                    <div className="req-detail-value">{selectedCreatorLabel}</div>
                  </div>
                </>
              )
            : null}
          </div>
          {(row.customization_notes ?? '').trim() ?
            (
              <div className="req-admin-workflow-notes">
                <span className="req-detail-label">Customization notes</span>
                <p className="req-admin-workflow-notes-body">
                  {row.customization_notes!.trim().slice(0, 420)}
                  {row.customization_notes!.trim().length > 420 ? '…' : ''}
                </p>
              </div>
            )
          : null}
          <div className="req-admin-workflow-notes">
            <span className="req-detail-label">Proposal angle</span>
            <p className="req-admin-workflow-notes-body">{packet.suggestedProposalAngle}</p>
          </div>
          <div className="req-admin-workflow-notes">
            <span className="req-detail-label">Creator brief (excerpt)</span>
            <p className="req-admin-workflow-notes-body">
              {packet.creatorInstructions.slice(0, 360)}
              {packet.creatorInstructions.length > 360 ? '…' : ''}
            </p>
          </div>
        </div>
      )}

      <details className="admin-advanced-project">
        <summary>Advanced: project &amp; build packet (fallback controls)</summary>
        <RequestProjectWorkflow
          row={row}
          packet={packet}
          creatorProfiles={creatorProfiles}
          assignmentDiagnostics={assignmentDiagnostics}
          onRefreshOrders={onRefreshOrders}
          reloadNonce={wfNonce}
        />
      </details>

      {/* Goal/problem summary */}
      <div className="req-card-summary">
        <span className="req-summary-label">Goal:</span> {row.main_goal}
        {row.current_problem && (
          <>
            <br />
            <span className="req-summary-label">Problem:</span>{' '}
            {row.current_problem.slice(0, 180)}{row.current_problem.length > 180 ? '…' : ''}
          </>
        )}
      </div>

      <div className="req-quick-actions req-quick-actions--primary">
        <span className="req-qa-label">Actions:</span>
        <button type="button" className="req-qa-btn" onClick={() => setDetailsOpen((v) => !v)}>
          {detailsOpen ? 'Hide details' : 'View details'}
        </button>
        {onViewApplicants ?
          (
            <button type="button" className="req-qa-btn" onClick={onViewApplicants}>
              View applicants
            </button>
          )
        : null}
        <QuickStatusBtn requestId={row.id} status="in-review" label="Mark Reviewed" color="#63b3ed" currentStatus={row.status} onStatusChange={onStatusChange} />
        <QuickStatusBtn requestId={row.id} status="needs-more-info" label="Needs More Info" color="#f9b032" currentStatus={row.status} onStatusChange={onStatusChange} />
        <QuickStatusBtn requestId={row.id} status="rejected" label="Close Request" color="#ef4444" currentStatus={row.status} onStatusChange={onStatusChange} />
      </div>

      {detailsOpen ?
        (
          <>
            <button
              type="button"
              className="req-ops-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? '▲ Hide AI Operations' : '▼ View AI Operations Panel'}
            </button>
            {expanded && <AiOpsPanel row={row} packet={packet} onPacketSaved={() => setWfNonce((n) => n + 1)} />}
          </>
        )
      : null}
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { id: RequestFilter; label: string; getCount: (e: EnrichedRequest[]) => number }[] = [
  { id: 'all',            label: 'All',            getCount: (e) => e.length },
  { id: 'new',            label: 'New',            getCount: (e) => e.filter((r) => r.row.status === 'new').length },
  { id: 'high-priority',  label: 'High Priority',  getCount: (e) => e.filter((r) => r.packet.priorityLabel === 'High').length },
  { id: 'needs-followup', label: 'Needs Follow-up',getCount: (e) => e.filter((r) => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail').length },
  { id: 'ready-to-quote', label: 'Ready to Quote', getCount: (e) => e.filter((r) => r.packet.quoteReadiness.startsWith('Ready') || r.packet.quoteReadiness.startsWith('Nearly')).length },
];

function applyFilter(enriched: EnrichedRequest[], filter: RequestFilter): EnrichedRequest[] {
  switch (filter) {
    case 'new':            return enriched.filter((r) => r.row.status === 'new');
    case 'high-priority':  return enriched.filter((r) => r.packet.priorityLabel === 'High');
    case 'needs-followup': return enriched.filter((r) => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail');
    case 'ready-to-quote': return enriched.filter((r) => r.packet.quoteReadiness.startsWith('Ready') || r.packet.quoteReadiness.startsWith('Nearly'));
    default:               return enriched;
  }
}

// ─── Creator Application Card ─────────────────────────────────────────────────

// ─── Admin Approval Panel (replaces ApprovalActionRow + CreateProfileButton) ──

type ApprovalAction = 'approve_free' | 'approve_professional' | 'approve_verified'
                    | 'needs_more_info' | 'reject' | 'suspend' | 'reviewing';

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

function AdminApprovalPanel({
  app,
  fitScore,
  onStatusChange,
}: {
  app: CreatorApplicationRow;
  fitScore: number;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [loading, setLoading]               = useState(false);
  const [lastAction, setLastAction]         = useState<string | null>(null);
  const [profileId, setProfileId]           = useState<string | null>(app.linked_creator_profile_id ?? null);
  const [profileVisibility, setProfileVis]  = useState<string>('hidden');
  const [togglingVis, setTogglingVis]       = useState(false);
  const [reasonInput, setReasonInput]       = useState('');
  const [showReasonFor, setShowReasonFor]   = useState<'reject' | 'needs_more_info' | null>(null);
  const [copied, setCopied]                 = useState<string | null>(null);

  const s    = app.status;
  const tier = safeText(app.tier, 'free');
  const name = safeText(app.full_name, 'the applicant');

  // Load existing linked profile visibility on mount
  useEffect(() => {
    if (app.linked_creator_profile_id) {
      supabase
        .from('creator_profiles')
        .select('id, public_profile_status')
        .eq('id', app.linked_creator_profile_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setProfileId(data.id);
            setProfileVis((data as { id: string; public_profile_status: string }).public_profile_status ?? 'hidden');
          }
        });
    }
  }, [app.linked_creator_profile_id]);

  async function doAction(action: ApprovalAction, reason?: string) {
    setLoading(true);
    const result = await performApprovalAction(app, action, { reason, fitScore });
    setLoading(false);
    if (result.ok) {
      const statusMap: Record<ApprovalAction, string> = {
        approve_free: 'active', approve_professional: 'approved_pending_payment',
        approve_verified: 'approved_pending_payment', needs_more_info: 'needs_more_info',
        reject: 'rejected', suspend: 'suspended', reviewing: 'reviewing',
      };
      const newStatus = statusMap[action];
      onStatusChange(app.id, newStatus);
      setLastAction(action);
      setShowReasonFor(null);
      setReasonInput('');
      if (result.profileId) {
        setProfileId(result.profileId);
        setProfileVis('hidden');
      }
    } else {
      console.error('[Admin] doAction failed:', action);
    }
  }

  async function handleToggleVisibility() {
    if (!profileId) return;
    const next = profileVisibility === 'public' ? 'hidden' : 'public';
    setTogglingVis(true);
    const ok = await setProfileVisibility_v2(profileId, next);
    if (ok) setProfileVis(next);
    setTogglingVis(false);
  }

  function handleCopy(text: string, key: string) {
    copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  // ── Generated messages ──────────────────────────────────────────────────────
  const tierPrice = tier === 'professional' ? '$15/mo' : tier === 'verified' ? '$25/mo' : 'Free';
  const messages: Record<string, string> = {
    approval_free:
      `Hi ${name},\n\nGreat news — your Free Creator application has been approved! ` +
      `Your MicroBuild creator account is now active. Log in to complete your profile and start receiving project matches.\n\nWelcome to MicroBuild!`,
    approval_professional:
      `Hi ${name},\n\nYour Professional Creator application has been approved! ` +
      `To activate your Pro account, you'll need to set up your ${tierPrice} subscription. ` +
      `We'll send you subscription instructions shortly. No charge today.\n\nWelcome to MicroBuild Pro!`,
    approval_verified:
      `Hi ${name},\n\nYour Verified Creator application has been conditionally approved. ` +
      `To complete verification, your submitted credentials and portfolio will be reviewed in detail. ` +
      `You'll also need to set up your ${tierPrice} subscription after verification is confirmed.\n\nWelcome to MicroBuild Verified!`,
    needs_more_info:
      `Hi ${name},\n\nThank you for applying to MicroBuild. We need a bit more information before we can make a decision:\n\n` +
      `${reasonInput || '[Add specific info needed here]'}\n\nPlease reply to this message with the requested details and we'll continue your review.`,
    rejection:
      `Hi ${name},\n\nThank you for applying to MicroBuild. After reviewing your application, we're not able to approve it at this time.\n\n` +
      `${reasonInput || '[Add reason/feedback here]'}\n\nYou're welcome to reapply in the future as your portfolio and experience grow.`,
  };

  const isApproved = ['active', 'approved_pending_payment'].includes(s);
  const isTerminal = ['rejected', 'suspended'].includes(s);

  return (
    <div className="admin-approval-panel">
      {/* Status indicator */}
      <div className="aap-current-status">
        <span className="aap-status-label">Status:</span>
        <span className={`aap-badge aap-badge--${s}`}>{s.replace(/_/g, ' ')}</span>
        {lastAction && <span className="aap-saved">✓ Saved</span>}
      </div>

      {/* Primary action buttons */}
      <div className="aap-btn-group">
        {/* Approve Free — only when tier is free */}
        {tier === 'free' && s !== 'active' && (
          <button
            className="approval-btn approval-btn--approve"
            onClick={() => doAction('approve_free')}
            disabled={loading}
            title="Approve — activates Free Creator account immediately, creates hidden creator profile"
          >
            ✓ Approve Free
          </button>
        )}

        {/* Approve Professional — only when tier is professional */}
        {tier === 'professional' && s !== 'approved_pending_payment' && s !== 'active' && (
          <button
            className="approval-btn approval-btn--approve"
            onClick={() => doAction('approve_professional')}
            disabled={loading}
            title="Approve — creates profile with pending_payment status, $15/mo required"
          >
            ✓ Approve Pro (Pending Payment)
          </button>
        )}

        {/* Approve Verified — only when tier is verified */}
        {tier === 'verified' && s !== 'approved_pending_payment' && s !== 'active' && (
          <button
            className="approval-btn approval-btn--approve"
            onClick={() => doAction('approve_verified')}
            disabled={loading}
            title="Approve — sets verification_status=pending, $25/mo required"
          >
            ✓ Approve Verified (Pending Payment)
          </button>
        )}

        {/* Reviewing */}
        {s !== 'reviewing' && !isTerminal && (
          <button
            className="approval-btn approval-btn--review"
            onClick={() => doAction('reviewing')}
            disabled={loading}
          >
            Mark In Review
          </button>
        )}

        {/* Needs More Info */}
        {s !== 'needs_more_info' && !isTerminal && (
          <button
            className="approval-btn approval-btn--info"
            onClick={() => setShowReasonFor(showReasonFor === 'needs_more_info' ? null : 'needs_more_info')}
            disabled={loading}
          >
            ? Needs Info
          </button>
        )}

        {/* Reject */}
        {s !== 'rejected' && (
          <button
            className="approval-btn approval-btn--reject"
            onClick={() => setShowReasonFor(showReasonFor === 'reject' ? null : 'reject')}
            disabled={loading}
          >
            ✗ Reject
          </button>
        )}

        {/* Suspend */}
        {s !== 'suspended' && (
          <button
            className="approval-btn approval-btn--suspend"
            onClick={() => doAction('suspend')}
            disabled={loading}
          >
            ⊘ Suspend
          </button>
        )}

        {loading && <span className="approval-saving">Saving…</span>}
      </div>

      {/* Reason input — shown when Needs Info or Reject is clicked */}
      {showReasonFor && (
        <div className="aap-reason-block">
          <textarea
            className="aap-reason-input"
            placeholder={
              showReasonFor === 'reject'
                ? 'Rejection reason (optional — shown to creator)'
                : 'What specific info is needed? (shown to creator in dashboard)'
            }
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            rows={3}
          />
          <div className="aap-reason-actions">
            <button
              className={`approval-btn ${showReasonFor === 'reject' ? 'approval-btn--reject' : 'approval-btn--info'}`}
              onClick={() => doAction(showReasonFor, reasonInput || undefined)}
              disabled={loading}
            >
              Confirm {showReasonFor === 'reject' ? 'Rejection' : 'Needs Info'}
            </button>
            <button className="approval-btn approval-btn--ghost" onClick={() => { setShowReasonFor(null); setReasonInput(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Profile management — shown when approved */}
      {isApproved && (
        <div className="aap-profile-section">
          {profileId ? (
            <div className="aap-profile-controls">
              <span className="aap-profile-label">Creator profile:</span>
              <button
                className={`approval-btn ${profileVisibility === 'public' ? 'approval-btn--public' : 'approval-btn--hidden'}`}
                onClick={handleToggleVisibility}
                disabled={togglingVis}
                title={profileVisibility === 'public' ? 'Hide from public /creators directory' : 'Make visible in /creators directory'}
              >
                {togglingVis ? '…' : profileVisibility === 'public' ? '🟢 Public — click to hide' : '⚫ Hidden — click to publish'}
              </button>
              <a className="approval-btn approval-btn--ghost" href={`/creator/${profileId}`} target="_blank" rel="noopener noreferrer">
                Preview →
              </a>
            </div>
          ) : (
            <button
              className="approval-btn approval-btn--create"
              onClick={() => doAction(tier === 'free' ? 'approve_free' : tier === 'professional' ? 'approve_professional' : 'approve_verified')}
              disabled={loading}
            >
              + Create Creator Profile
            </button>
          )}
        </div>
      )}

      {/* Copyable messages */}
      <div className="aap-messages">
        <div className="aap-msg-header">Copyable messages:</div>
        <div className="aap-msg-list">
          {tier === 'free' && (
            <div className="aap-msg-item">
              <span className="aap-msg-label">Approval (Free)</span>
              <button className="aap-copy-btn" onClick={() => handleCopy(messages.approval_free, 'free')}>
                {copied === 'free' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
          {tier === 'professional' && (
            <div className="aap-msg-item">
              <span className="aap-msg-label">Approval (Pro)</span>
              <button className="aap-copy-btn" onClick={() => handleCopy(messages.approval_professional, 'pro')}>
                {copied === 'pro' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
          {tier === 'verified' && (
            <div className="aap-msg-item">
              <span className="aap-msg-label">Approval (Verified)</span>
              <button className="aap-copy-btn" onClick={() => handleCopy(messages.approval_verified, 'verified')}>
                {copied === 'verified' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
          <div className="aap-msg-item">
            <span className="aap-msg-label">Needs More Info</span>
            <button className="aap-copy-btn" onClick={() => handleCopy(messages.needs_more_info, 'nmi')}>
              {copied === 'nmi' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="aap-msg-item">
            <span className="aap-msg-label">Rejection</span>
            <button className="aap-copy-btn" onClick={() => handleCopy(messages.rejection, 'rej')}>
              {copied === 'rej' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Preview ──────────────────────────────────────────────────────────

function ProfilePreview({ app, review }: { app: CreatorApplicationRow; review: CreatorApplicationReview }) {
  const name     = safeText(app.full_name, 'Unknown');
  const initials = name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
  const tColor   = tierColors[app.tier] ?? '#8a94a6';
  const tLabel   = tierLabels[app.tier] ?? app.tier;
  const fitColor = fitColors[review.fitLabel] ?? '#8a94a6';

  return (
    <div className="profile-preview">
      <div className="pp-label">Profile Preview — how this creator would appear if approved</div>
      <div className="pp-card">
        <div className="pp-header">
          <div className="pp-avatar">{initials}</div>
          <div className="pp-name-block">
            <div className="pp-name">{name}</div>
            <div className="pp-badges">
              <span className="pp-tier-badge" style={{ color: tColor, borderColor: tColor + '55', backgroundColor: tColor + '15' }}>
                {tLabel}
              </span>
              <span className="pp-score-badge" style={{ color: fitColor, borderColor: fitColor + '55', backgroundColor: fitColor + '12' }}>
                {review.candidateFitScore}/100 · {review.fitLabel}
              </span>
              {review.suggestedBadge !== 'Free Creator' && (
                <span className="pp-suggested">{review.suggestedBadge}</span>
              )}
            </div>
          </div>
        </div>

        {app.tier !== 'free' && app.requested_plan_price > 0 && (
          <div className="pp-plan-note">
            Subscription: ${app.requested_plan_price}/month — pending payment after approval
          </div>
        )}

        <div className="pp-section">
          {safeArray<string>(app.tools).slice(0, 6).map((t) => <span key={t} className="pp-chip">{t}</span>)}
          {safeArray<string>(app.tools).length > 6 && <span className="pp-chip pp-chip--more">+{safeArray<string>(app.tools).length - 6}</span>}
        </div>

        <div className="pp-section">
          {safeArray<string>(app.niches).slice(0, 4).map((n) => <span key={n} className="pp-chip pp-chip--niche">{n}</span>)}
          {safeArray<string>(app.niches).length > 4 && <span className="pp-chip pp-chip--more">+{safeArray<string>(app.niches).length - 4}</span>}
        </div>

        <div className="pp-meta">
          <span>{app.available_hours} hrs/week</span>
          {app.fulfillment_speed && <span>· {app.fulfillment_speed}</span>}
          {app.portfolio_url && (
            <a className="pp-link" href={app.portfolio_url} target="_blank" rel="noopener noreferrer">
              Portfolio ↗
            </a>
          )}
        </div>

        {(app.github_url || app.linkedin_url) && (
          <div className="pp-proof-links">
            {app.github_url && <a href={app.github_url} target="_blank" rel="noopener noreferrer" className="pp-proof-link">GitHub ↗</a>}
            {app.linkedin_url && <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" className="pp-proof-link">LinkedIn ↗</a>}
          </div>
        )}

        <div className="pp-tier-assessment">{review.tierFitAssessment}</div>
      </div>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function CreatorCard({
  app,
  onStatusChange,
  selected,
  onSelect,
}: {
  app: CreatorApplicationRow;
  onStatusChange: (id: string, newStatus: string) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const [status, setStatus]           = useState(app.status);
  const [reviewOpen, setReviewOpen]   = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeReviewTab, setActiveReviewTab] = useState<'review' | 'messages'>('review');

  const review = useMemo<CreatorApplicationReview>(() => {
    try {
      return generateCreatorReview({
        full_name:            safeText(app.full_name, 'Unknown'),
        email:                safeText(app.email),
        tools:                safeArray<string>(app.tools),
        niches:               safeArray<string>(app.niches),
        experience:           safeText(app.experience),
        available_hours:      safeText(app.available_hours, '0'),
        portfolio_url:        app.portfolio_url,
        portfolio_url_2:      app.portfolio_url_2,
        message:              app.message,
        tier:                 (safeText(app.tier, 'free')) as 'free' | 'professional' | 'verified',
        top_projects:         app.top_projects,
        service_capabilities: safeArray<string>(app.service_capabilities),
        fulfillment_speed:    app.fulfillment_speed,
        github_url:           app.github_url,
        linkedin_url:         app.linkedin_url,
        certifications:       app.certifications,
        credential_links:     safeArray<string>(app.credential_links),
        case_studies:         app.case_studies,
      });
    } catch (err) {
      console.error('[Admin] generateCreatorReview failed for', app.id, err);
      return {
        candidateFitScore: 0,
        fitLabel: 'Weak' as const,
        strengths: ['Review data is incomplete or malformed'],
        concerns: ['Could not generate review — check console'],
        missingPortfolioInfo: [],
        bestFitNiches: [],
        recommendedDecision: '⚠ Review skipped — data error',
        tierFitAssessment: 'Unable to assess — data missing',
        suggestedBadge: 'Free Creator',
        creatorFollowUpMessage: '',
        approvalMessage: '',
        rejectionMessage: '',
      };
    }
  }, [app]);

  const reviewFitColor = fitColors[review.fitLabel] ?? '#8a94a6';
  const tColor         = tierColors[app.tier] ?? '#8a94a6';

  // onStatusChange handler that also updates local state
  function handleStatusUpdated(id: string, newStatus: string) {
    setStatus(newStatus as typeof status);
    onStatusChange(id, newStatus);
  }

  return (
    <div className={`creator-card${selected ? ' creator-card--selected' : ''}`}>

      <div className="creator-card-header">
        {onSelect && (
          <input
            type="checkbox"
            className="card-select-checkbox"
            checked={!!selected}
            onChange={() => onSelect(app.id)}
            aria-label={`Select ${app.full_name}`}
          />
        )}
        <div className="creator-header-left">
          <div className="creator-name">{app.full_name || '—'}</div>
          <div className="creator-email">{app.email || '—'}</div>
          <div className="creator-tier-row">
            <span className="creator-tier-badge" style={{ color: tColor, borderColor: tColor + '55', backgroundColor: tColor + '15' }}>
              {tierLabels[app.tier] ?? app.tier}
            </span>
            {(app.requested_plan_price ?? 0) > 0 && (
              <span className="creator-plan-price">${app.requested_plan_price}/mo after approval</span>
            )}
            {app.auth_user_id && (
              <span className="creator-link-badge creator-link-badge--auth" title={`Auth ID: ${app.auth_user_id}`}>
                🔗 Auth linked
              </span>
            )}
            {app.linked_creator_profile_id && (
              <span className="creator-link-badge creator-link-badge--profile" title={`Profile ID: ${app.linked_creator_profile_id}`}>
                ✓ Profile created
              </span>
            )}
          </div>
          {app.admin_decision_at && (
            <div className="creator-decision-date">
              Decision: {fmtDate(app.admin_decision_at)}
            </div>
          )}
        </div>
        <div className="creator-card-right">
          <span
            className="creator-fit-badge"
            style={{ color: reviewFitColor, borderColor: reviewFitColor + '55', backgroundColor: reviewFitColor + '15' }}
          >
            {review.fitLabel} · {review.candidateFitScore}/100
          </span>
          <span
            className="creator-status-badge"
            style={{ color: statusColors[status] ?? '#8a94a6' }}
            title="Use the action buttons below to change status"
          >
            {statusLabels[status] ?? status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="creator-card-body">
        <div className="creator-detail">
          <span className="creator-detail-label">Tools</span>
          <div className="creator-chips">
            {safeArray<string>(app.tools).map((t) => <span key={t} className="creator-chip">{t}</span>)}
            {safeArray<string>(app.tools).length === 0 && <span className="creator-chip creator-chip--empty">None listed</span>}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Niches</span>
          <div className="creator-chips">
            {safeArray<string>(app.niches).map((n) => <span key={n} className="creator-chip">{n}</span>)}
            {safeArray<string>(app.niches).length === 0 && <span className="creator-chip creator-chip--empty">None listed</span>}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Availability</span>
          <span className="creator-detail-value">{app.available_hours} hrs/week
            {app.fulfillment_speed && <span className="creator-speed"> · {app.fulfillment_speed}</span>}
          </span>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Applied</span>
          <span className="creator-detail-value">{fmtDate(app.created_at)}</span>
        </div>
        {app.service_capabilities && app.service_capabilities.length > 0 && (
          <div className="creator-detail" style={{ gridColumn: '1 / -1' }}>
            <span className="creator-detail-label">Capabilities</span>
            <div className="creator-chips">
              {app.service_capabilities.map((c) => <span key={c} className="creator-chip creator-chip--capability">{c}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Admin reason callouts */}
      {status === 'needs_more_info' && app.needs_info_reason && (
        <div className="creator-reason-callout creator-reason-callout--info">
          <span className="creator-reason-label">📋 More info requested:</span>
          <span className="creator-reason-text">{app.needs_info_reason}</span>
        </div>
      )}
      {(status === 'rejected' || status === 'suspended') && app.rejected_reason && (
        <div className="creator-reason-callout creator-reason-callout--warn">
          <span className="creator-reason-label">{status === 'suspended' ? '⛔ Suspension reason:' : '✗ Rejection reason:'}</span>
          <span className="creator-reason-text">{app.rejected_reason}</span>
        </div>
      )}
      {app.admin_notes && (
        <div className="creator-reason-callout creator-reason-callout--note">
          <span className="creator-reason-label">📝 Admin notes:</span>
          <span className="creator-reason-text">{app.admin_notes}</span>
        </div>
      )}

      {/* Decision */}
      <div className="creator-decision">{review.recommendedDecision}</div>

      {/* Unified approval panel — buttons + profile management + copyable messages */}
      <AdminApprovalPanel app={app} fitScore={review.candidateFitScore} onStatusChange={handleStatusUpdated} />

      {/* Expandable toggles */}
      <div className="creator-toggle-row">
        <button
          className="creator-review-toggle"
          onClick={() => { setReviewOpen((v) => !v); setPreviewOpen(false); }}
          aria-expanded={reviewOpen}
        >
          {reviewOpen ? '▲ Hide AI Review' : '▼ AI Review'}
        </button>
        <button
          className="creator-review-toggle"
          onClick={() => { setPreviewOpen((v) => !v); setReviewOpen(false); }}
          aria-expanded={previewOpen}
        >
          {previewOpen ? '▲ Hide Preview' : '▼ Profile Preview'}
        </button>
      </div>

      {/* Profile preview */}
      {previewOpen && <ProfilePreview app={app} review={review} />}

      {/* AI Review panel */}
      {reviewOpen && (
        <div className="creator-review-panel">
          <div className="ai-ops-label">
            ⚡ AI-style candidate review — rules-based MVP version. No AI API called.
          </div>

          {/* Review sub-tabs */}
          <div className="creator-review-tabs">
            <button
              className={`creator-review-tab${activeReviewTab === 'review' ? ' active' : ''}`}
              onClick={() => setActiveReviewTab('review')}
            >Analysis</button>
            <button
              className={`creator-review-tab${activeReviewTab === 'messages' ? ' active' : ''}`}
              onClick={() => setActiveReviewTab('messages')}
            >Messages</button>
          </div>

          {activeReviewTab === 'review' && (
            <>
              <div className="ops-field">
                <div className="ops-field-label">Tier Fit Assessment</div>
                <p>{review.tierFitAssessment}</p>
              </div>

              {review.strengths.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Strengths ({review.strengths.length})</div>
                  <ul className="ops-flag-list">
                    {review.strengths.map((s) => <li key={s} className="creator-strength-item">{s}</li>)}
                  </ul>
                </div>
              )}

              {review.concerns.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Concerns ({review.concerns.length})</div>
                  <ul className="ops-flag-list ops-flags-warn">
                    {review.concerns.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}

              {review.missingPortfolioInfo.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Missing Info</div>
                  <ul className="ops-flag-list ops-flags-risk">
                    {review.missingPortfolioInfo.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}

              <div className="ops-field">
                <div className="ops-field-label">Best Fit Niches</div>
                <div className="creator-chips" style={{ marginTop: '0.25rem' }}>
                  {review.bestFitNiches.map((n) => <span key={n} className="creator-chip creator-chip--accent">{n}</span>)}
                </div>
              </div>

              {app.case_studies && (
                <div className="ops-field">
                  <div className="ops-field-label">Case Studies (submitted)</div>
                  <p className="creator-case-studies">{app.case_studies.slice(0, 300)}{app.case_studies.length > 300 ? '…' : ''}</p>
                </div>
              )}

              <div className="ops-copy-row">
                <CopyBtn text={review.creatorFollowUpMessage} label="Copy Follow-up Message" />
                <CopyBtn text={buildCreatorSummary(app, review)} label="Copy Candidate Summary" />
              </div>
            </>
          )}

          {activeReviewTab === 'messages' && (
            <>
              <div className="ops-field">
                <div className="ops-field-label">Approval Message</div>
                <pre className="ops-proposal-draft">{review.approvalMessage}</pre>
                <div className="ops-copy-row" style={{ marginTop: '0.5rem' }}>
                  <CopyBtn text={review.approvalMessage} label="Copy Approval Message" />
                </div>
              </div>
              <div className="ops-field">
                <div className="ops-field-label">Rejection Message</div>
                <pre className="ops-proposal-draft">{review.rejectionMessage}</pre>
                <div className="ops-copy-row" style={{ marginTop: '0.5rem' }}>
                  <CopyBtn text={review.rejectionMessage} label="Copy Rejection Message" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

interface EBState { error: Error | null }
class SectionErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, EBState> {
  constructor(props: { name: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Admin] ${this.props.name} crashed:`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="admin-section-crash">
          <strong>⚠ Section error ({this.props.name})</strong>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Workflow Templates ───────────────────────────────────────────────────────
// Preset copyable message blocks for common admin workflows.

const WORKFLOW_TEMPLATES = [
  {
    id: 'new-buyer-followup',
    label: 'New Buyer Follow-up',
    tag: 'Buyer',
    text: `Hi [Name],\n\nThank you for your MicroBuild request! We've received your submission and our team is reviewing it now.\n\nWe'll be in touch within 1–2 business days with a proposal.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'missing-info',
    label: 'Missing Info Request',
    tag: 'Buyer',
    text: `Hi [Name],\n\nThank you for your request for [Build Type]. To prepare your proposal, we need a bit more information:\n\n- [Missing field 1]\n- [Missing field 2]\n\nPlease reply with these details and we'll get your proposal out quickly.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'quote-proposal',
    label: 'Quote Proposal Starter',
    tag: 'Buyer',
    text: `Hi [Name],\n\nHere's the proposal for your [Build Type] for [Business Name]:\n\nProject: [Build Type]\nScope: [Brief scope]\nTimeline: [X business days]\nPrice: $[Amount]\n\nThis includes:\n- [Feature 1]\n- [Feature 2]\n- [Feature 3]\n\nTo move forward, reply "Approved" and we'll assign your creator.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'creator-approval',
    label: 'Creator Approval',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nWe're excited to let you know that your MicroBuild creator application has been approved!\n\nYour tier: [Free / Professional / Verified]\nNext step: [Sign in and complete your profile / Activate your subscription]\n\nWelcome to the MicroBuild creator network.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'creator-rejection',
    label: 'Creator Rejection',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nThank you for applying to become a MicroBuild creator.\n\nAfter reviewing your application, we're unable to approve it at this time. [Reason if applicable.]\n\nYou're welcome to reapply in 60 days with additional portfolio examples.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'pro-payment-pending',
    label: 'Pro Plan — Pending Payment',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nYour Professional Creator application has been approved!\n\nTo activate your account, please complete your $15/month subscription. Once payment is confirmed, your profile will go live on MicroBuild.\n\n[Payment link will be here when Stripe is integrated.]\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'verified-proof-request',
    label: 'Verified — Proof Request',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nThank you for applying for Verified Creator status.\n\nTo complete verification, please provide:\n- A link to your professional portfolio\n- Certifications or credentials\n- At least one case study with business outcomes\n- GitHub or LinkedIn profile\n\nSend these to [contact] and we'll complete your verification review.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'profile-improvement',
    label: 'Profile Improvement Request',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nYour MicroBuild creator profile is live but could be stronger. A few improvements would significantly increase your project match rate:\n\n- Add a detailed bio (aim for 80+ characters)\n- Include at least 2 portfolio examples\n- List the tools and platforms you work with\n- Add your GitHub or LinkedIn profile\n\nLog in to update your profile.\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'profile-published',
    label: 'Profile Approved & Published',
    tag: 'Creator',
    text: `Hi [Creator Name],\n\nGreat news — your MicroBuild creator profile is now live and visible to buyers!\n\nNext steps:\n- Keep your availability updated\n- Add new portfolio examples as you complete work\n- Respond quickly when matched — speed improves your ranking\n\nWelcome to the marketplace!\n\nBest,\nMicroBuild Team`,
  },
  {
    id: 'buyer-handoff',
    label: 'Buyer → Creator Handoff',
    tag: 'Project',
    text: `Hi [Creator Name],\n\nWe have a new project match for you!\n\nBuyer: [Business Name]\nBuild Type: [Build Type]\nBudget: [Budget]\nTimeline: [Timeline]\n\nProject brief:\n[Paste build packet summary here]\n\nTo accept this project, reply to this message. The buyer has been notified of the match.\n\nBest,\nMicroBuild Ops`,
  },
] as const;

function WorkflowTemplates() {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  function copyTemplate(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  }

  return (
    <section className="admin-section admin-section--dim">
      <div className="admin-section-header">
        <h2>Workflow Templates</h2>
        <span className="admin-section-count">{WORKFLOW_TEMPLATES.length} templates</span>
      </div>
      <p className="wf-intro">Preset message blocks for common admin workflows. Click to copy.</p>
      <div className="wf-grid">
        {WORKFLOW_TEMPLATES.map((t) => (
          <div key={t.id} className="wf-card">
            <div className="wf-card-header">
              <span className="wf-label">{t.label}</span>
              <span className={`wf-tag wf-tag--${t.tag.toLowerCase()}`}>{t.tag}</span>
            </div>
            <pre className="wf-preview">{t.text.slice(0, 100)}…</pre>
            <button
              className={`wf-copy-btn${copiedId === t.id ? ' copied' : ''}`}
              onClick={() => copyTemplate(t.id, t.text)}
            >
              {copiedId === t.id ? '✓ Copied' : 'Copy Message'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Section navigation ───────────────────────────────────────────────────────

function showAdminSection(active: AdminSectionId, section: AdminSectionId): boolean {
  return active === section;
}

// ─── Batch action bar ─────────────────────────────────────────────────────────

function BatchActionBar({
  type,
  count,
  summaries,
  onClear,
}: {
  type: string;
  count: number;
  summaries: string[];
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopySummaries() {
    const text = summaries.join('\n\n' + '─'.repeat(40) + '\n\n');
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleExport() {
    const text = summaries.join('\n\n' + '─'.repeat(40) + '\n\n');
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `microbuild-${type}-export-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Admin] export failed:', err);
    }
  }

  return (
    <div className="batch-action-bar">
      <span className="batch-count">{count} selected</span>
      <button
        className={`batch-btn${copied ? ' batch-btn--copied' : ''}`}
        onClick={handleCopySummaries}
      >
        {copied ? '✓ Copied' : `Copy ${count} Summar${count !== 1 ? 'ies' : 'y'}`}
      </button>
      <button className="batch-btn batch-btn--export" onClick={handleExport}>
        Export as .txt
      </button>
      <button className="batch-btn batch-btn--clear" onClick={onClear}>
        ✕ Clear
      </button>
    </div>
  );
}

// ─── Profile Quality Card ─────────────────────────────────────────────────────

function ProfileQualityCard({ profile }: { profile: DBCreatorProfileRow }) {
  const strength   = useMemo(() => analyzeProfileStrength(profile), [profile]);
  const scoreColor = psGetStrengthColor(strength.score);
  const tierColors: Record<string, string> = {
    free: '#8a94a6', professional: '#63b3ed', verified: '#f9b032',
  };
  const tColor = tierColors[profile.tier] ?? '#8a94a6';

  const [copied,    setCopied]   = useState(false);
  const [vis,       setVis]      = useState(profile.public_profile_status);
  const [toggling,  setToggling] = useState(false);

  const improvementMsg = [
    `Hi ${profile.display_name ?? profile.full_name},`,
    ``,
    `Your MicroBuild creator profile could be stronger. Here's what would help most:`,
    ``,
    ...strength.improvements.slice(0, 4).map((i) => `• ${i}`),
    ``,
    `Log in to update your profile and improve your match rate.`,
    ``,
    `Best,`,
    `MicroBuild Team`,
  ].join('\n');

  function handleCopy() {
    copyToClipboard(improvementMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleToggleVis() {
    const next = vis === 'public' ? 'hidden' : 'public';
    setToggling(true);
    const ok = await setProfileVisibility_v2(profile.id, next);
    if (ok) setVis(next);
    setToggling(false);
  }

  return (
    <div className={`pq-card${strength.score < 40 ? ' pq-card--critical' : strength.score < 60 ? ' pq-card--warn' : ''}`}>
      <div className="pq-card-header">
        <div className="pq-identity">
          <span className="pq-name">{profile.display_name ?? profile.full_name}</span>
          <span className="pq-tier-badge" style={{ color: tColor, borderColor: tColor + '44', background: tColor + '10' }}>
            {profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)}
          </span>
          <span className={`pq-vis-status${vis === 'public' ? ' pq-vis-status--public' : ' pq-vis-status--hidden'}`}>
            {vis === 'public' ? '🟢 Public' : '🔴 Hidden'}
          </span>
        </div>
        <div className="pq-score">
          <span className="pq-score-num" style={{ color: scoreColor }}>{strength.score}</span>
          <span className="pq-score-label" style={{ color: scoreColor }}>{strength.label}</span>
        </div>
      </div>

      {strength.riskFlags.length > 0 && (
        <div className="pq-risks">
          {strength.riskFlags.map((f) => (
            <span key={f} className="pq-risk-flag">⚠ {f}</span>
          ))}
        </div>
      )}

      {strength.missingItems.length > 0 && (
        <div className="pq-missing">
          <span className="pq-missing-label">Top gaps:</span>
          {strength.missingItems.slice(0, 3).map((m) => (
            <span key={m} className="pq-missing-item">{m}</span>
          ))}
          {strength.missingItems.length > 3 && (
            <span className="pq-missing-more">+{strength.missingItems.length - 3} more</span>
          )}
        </div>
      )}

      {strength.strengths.length > 0 && (
        <div className="pq-strengths">
          {strength.strengths.slice(0, 2).map((s) => (
            <span key={s} className="pq-strength-chip">✓ {s}</span>
          ))}
        </div>
      )}

      <div className="pq-actions">
        <button
          className={`pq-vis-btn${vis === 'public' ? ' pq-vis-btn--hide' : ' pq-vis-btn--publish'}`}
          onClick={handleToggleVis}
          disabled={toggling}
        >
          {toggling ? 'Saving…' : vis === 'public' ? 'Hide Profile' : 'Make Public'}
        </button>
        <button className={`pq-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy Improvement Msg'}
        </button>
      </div>
    </div>
  );
}

// ─── Profile Quality Queue ────────────────────────────────────────────────────

type PQFilter = 'all' | 'weak' | 'hidden-active' | 'public-risks';

function ProfileQualityQueue({
  profiles, loading, error,
}: {
  profiles: DBCreatorProfileRow[];
  loading: boolean;
  error: boolean;
}) {
  const [filter, setFilter] = useState<PQFilter>('all');

  // Pre-compute strength per profile once
  const enriched = useMemo(
    () => profiles.map((p) => ({ p, s: analyzeProfileStrength(p) })),
    [profiles],
  );

  const weakCount      = enriched.filter(({ s }) => s.score < 50).length;
  const hiddenActive   = enriched.filter(({ p }) =>
    p.public_profile_status !== 'public' &&
    (p.approval_status === 'active' || p.approval_status === 'approved_pending_payment'),
  ).length;
  const publicRisks    = enriched.filter(({ p, s }) =>
    p.public_profile_status === 'public' && (s.score < 60 || s.riskFlags.length > 0),
  ).length;

  const filtered = useMemo(() => {
    switch (filter) {
      case 'weak':         return enriched.filter(({ s }) => s.score < 50);
      case 'hidden-active':return enriched.filter(({ p }) =>
        p.public_profile_status !== 'public' &&
        (p.approval_status === 'active' || p.approval_status === 'approved_pending_payment'),
      );
      case 'public-risks': return enriched.filter(({ p, s }) =>
        p.public_profile_status === 'public' && (s.score < 60 || s.riskFlags.length > 0),
      );
      default:             return enriched;
    }
  }, [enriched, filter]);

  const TABS: { id: PQFilter; label: string; count: number }[] = [
    { id: 'all',           label: 'All Profiles',   count: profiles.length },
    { id: 'weak',          label: 'Low Strength',   count: weakCount        },
    { id: 'hidden-active', label: 'Hidden Active',  count: hiddenActive     },
    { id: 'public-risks',  label: 'Public Risks',   count: publicRisks      },
  ];

  return (
    <section className="admin-section" id="section-profiles">
      <div className="admin-section-header">
        <h2>Profile Quality Queue</h2>
        {!loading && <span className="admin-count">{profiles.length}</span>}
      </div>

      <SectionState
        loading={loading}
        error={error}
        empty={!loading && !error && profiles.length === 0}
        emptyMsg="No creator profiles yet. Approve a creator application and create their profile."
      />

      {!loading && !error && profiles.length > 0 && (
        <>
          <div className="pq-filter-bar">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`pq-filter-btn${filter === t.id ? ' active' : ''}`}
                onClick={() => setFilter(t.id)}
              >
                {t.label}
                <span className="pq-filter-count">{t.count}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="admin-state-row admin-empty">No profiles match this filter.</div>
          ) : (
            <div className="pq-card-grid">
              {filtered.map(({ p }) => (
                <SectionErrorBoundary key={p.id} name={`Profile ${p.id}`}>
                  <ProfileQualityCard profile={p} />
                </SectionErrorBoundary>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Platform Health Snapshot ─────────────────────────────────────────────────

function PlatformHealthSnapshot({
  requests, applications, profiles, loading, ordersCount, publishedWorkflowsCount,
}: {
  requests: BuyerRequestRow[];
  applications: CreatorApplicationRow[];
  profiles: DBCreatorProfileRow[];
  loading: boolean;
  ordersCount?: number;
  publishedWorkflowsCount?: number;
}) {
  const activeCreators  = applications.filter((a) => a.status === 'active').length;
  const publicProfiles  = profiles.filter((p) => p.public_profile_status === 'public').length;
  const pendingReview   = applications.filter((a) => a.status === 'new' || a.status === 'reviewing').length;
  const pendingPayment  = applications.filter((a) => a.status === 'approved_pending_payment').length;
  const noProfileActive = applications.filter((a) => a.status === 'active' && !a.linked_creator_profile_id).length;
  const weakPublic      = profiles.filter((p) =>
    p.public_profile_status === 'public' && analyzeProfileStrength(p).score < 50,
  ).length;

  const healthScore = Math.min(
    100,
    (activeCreators   > 0 ? 30 : 0) +
    (publicProfiles   > 0 ? 25 : 0) +
    (noProfileActive === 0 ? 20 : Math.max(0, 15 - noProfileActive * 5)) +
    (weakPublic      === 0 ? 15 : Math.max(0, 10 - weakPublic * 3)) +
    (pendingReview   === 0 ? 10 : 5),
  );
  const healthLabel =
    healthScore >= 85 ? '✅ Healthy'          :
    healthScore >= 60 ? '⚡ Needs Attention'   :
                        '⚠ Action Required';
  const healthColor =
    healthScore >= 85 ? '#00d478' :
    healthScore >= 60 ? '#f9b032' :
                        '#ef4444';

  return (
    <section className="admin-section admin-section--dim" id="section-health">
      <div className="admin-section-header">
        <h2>Platform Health Snapshot</h2>
        {!loading && (
          <span
            className="health-score-badge"
            style={{ color: healthColor, borderColor: healthColor + '44', background: healthColor + '10' }}
          >
            {healthLabel} · {healthScore}/100
          </span>
        )}
      </div>

      {loading ? (
        <div className="admin-state-row admin-loading">Computing health…</div>
      ) : (
        <>
          <div className="health-grid">
            <div className="health-cell">
              <span className="health-val">{requests.length}</span>
              <span className="health-label">Buyer Requests</span>
            </div>
            <div className="health-cell">
              <span className="health-val" style={{ color: applications.length > 0 ? '#63b3ed' : undefined }}>
                {applications.length}
              </span>
              <span className="health-label">Creator Apps</span>
            </div>
            <div className="health-cell">
              <span className="health-val" style={{ color: activeCreators > 0 ? '#00d478' : '#8a94a6' }}>
                {activeCreators}
              </span>
              <span className="health-label">Active Creators</span>
            </div>
            <div className="health-cell">
              <span className="health-val" style={{ color: publicProfiles > 0 ? '#00d478' : '#8a94a6' }}>
                {publicProfiles}
              </span>
              <span className="health-label">Public Profiles</span>
            </div>
            <div className="health-cell">
              <span className="health-val" style={{ color: pendingReview > 0 ? '#f9b032' : '#8a94a6' }}>
                {pendingReview}
              </span>
              <span className="health-label">Pending Review</span>
            </div>
            <div className="health-cell">
              <span className="health-val" style={{ color: pendingPayment > 0 ? '#63b3ed' : '#8a94a6' }}>
                {pendingPayment}
              </span>
              <span className="health-label">Pending Payment</span>
            </div>
            <div className="health-cell">
              <span className="health-val">{ordersCount ?? '—'}</span>
              <span className="health-label">Open Projects</span>
            </div>
            <div className="health-cell">
              <span className="health-val">{publishedWorkflowsCount ?? '—'}</span>
              <span className="health-label">Published Workflows</span>
            </div>
          </div>

          <div className="health-flags health-flags--system">
            <span className="health-flag health-flag--warn">⚠ Temp dev RLS — replace before production</span>
            <span className="health-flag health-flag--warn">⚠ Admin auth not hardened</span>
            <span className="health-flag health-flag--info">ℹ Payments / Stripe not active</span>
            <span className="health-flag health-flag--info">ℹ External AI not connected — rules-based only</span>
            <span className="health-flag health-flag--info">ℹ Proposal/pricing deferred — no enforcement</span>
          </div>

          {(noProfileActive > 0 || weakPublic > 0) && (
            <div className="health-flags">
              {noProfileActive > 0 && (
                <span className="health-flag health-flag--warn">
                  ⚠ {noProfileActive} active creator{noProfileActive !== 1 ? 's' : ''} without a profile — create from approval panel
                </span>
              )}
              {weakPublic > 0 && (
                <span className="health-flag health-flag--info">
                  ℹ {weakPublic} public profile{weakPublic !== 1 ? 's' : ''} scoring below 50 — review Profile Quality Queue
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type MarketplaceReqAppRow = MarketplaceAppAdminRow;

interface PublishedWorkflowAdminRow {
  id: string;
  title: string;
  creator_profile_id: string;
  workflow_status: string | null;
  visibility_status: string | null;
  ai_review_status: string | null;
  ai_quality_score: number | null;
  ai_publish_readiness: string | null;
  ai_review_summary: string | null;
  ai_missing_items: string[];
  ai_risk_flags: string[];
  ai_suggested_improvements: string[];
  ai_recommended_action: string | null;
  ai_reviewed_at: string | null;
  auto_publish_eligible: boolean | null;
}

export default function Admin() {
  const [requests, setRequests]             = useState<BuyerRequestRow[]>([]);
  const [applications, setApplications]     = useState<CreatorApplicationRow[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<DBCreatorProfileRow[]>([]);
  const [templates, setTemplates]           = useState<MicroBuildListing[]>([]);
  const [orders, setOrders]                 = useState<OrderPipelineRow[]>([]);
  const [activeCreators, setActiveCreators] = useState<CreatorProfileSnap[]>([]);
  const [creatorAssignmentDiag, setCreatorAssignmentDiag] = useState<CreatorAssignmentDiagnostics | null>(null);
  const [reqLoading, setReqLoading]         = useState(true);
  const [appLoading, setAppLoading]         = useState(true);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [tplLoading, setTplLoading]         = useState(true);
  const [ordersLoading, setOrdersLoading]   = useState(true);
  const [reqError, setReqError]             = useState(false);
  const [appError, setAppError]             = useState(false);
  const [profilesError, setProfilesError]   = useState(false);
  const [reqFilter, setReqFilter]           = useState<RequestFilter>('all');
  // Creator app status filter
  const [appStatusFilter, setAppStatusFilter] = useState<'all' | 'pending' | 'approved' | 'terminal'>('all');
  // Batch selection
  const [selectedApps, setSelectedApps]     = useState<Set<string>>(new Set());
  const [selectedReqs, setSelectedReqs]     = useState<Set<string>>(new Set());
  const [requestApplications, setRequestApplications] = useState<MarketplaceReqAppRow[]>([]);
  const [publishedWorkflowRows, setPublishedWorkflowRows] = useState<PublishedWorkflowAdminRow[]>([]);
  const [workflowAdminTab, setWorkflowAdminTab] = useState<
    'published' | 'ai_ok' | 'needs' | 'risk' | 'hidden' | 'all'
  >('all');
  const [activeSection, setActiveSection] = useState<AdminSectionId>('command');
  const [marketplaceRefreshNonce, setMarketplaceRefreshNonce] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const fromHash = adminSectionFromHash(location.hash);
    if (fromHash) setActiveSection(fromHash);
  }, [location.hash]);

  useEffect(() => {
    supabase
      .from('buyer_requests')
      .select(
        [
          'id,user_id,full_name,email,business_name,industry,website_social,build_type,main_goal,current_problem,budget,deadline,style_notes,status,created_at',
          'visibility_status,application_status,selected_creator_profile_id,selected_request_application_id,applications_count',
          'source_type,source_workflow_id,source_workflow_title,source_creator_profile_id,customization_notes,requested_from_workflow',
        ].join(','),
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Admin] buyer_requests:', error); setReqError(true); }
        else setRequests(((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeBuyerRequest));
        setReqLoading(false);
      });

    supabase
      .from('creator_applications')
      .select([
        'id,full_name,email,tools,niches,experience,available_hours',
        'portfolio_url,portfolio_url_2,message,status,created_at,updated_at',
        'tier,requested_plan_price,top_projects,service_capabilities',
        'fulfillment_speed,github_url,linkedin_url,certifications,credential_links,case_studies',
        // Approval workflow columns (account-approval-workflow.sql)
        'auth_user_id,user_profile_id,approval_status,admin_notes',
        'admin_decision_at,rejected_reason,needs_info_reason,linked_creator_profile_id',
      ].join(','))
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Admin] creator_applications:', error); setAppError(true); }
        else setApplications(((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeCreatorApp));
        setAppLoading(false);
      });

    fetchTemplates().then(({ listings }) => {
      setTemplates(listings);
      setTplLoading(false);
    });

    // Project pipeline — assignment list uses approval_status + linked apps (not is_active-only)
    fetchAllOrders().then((data) => { setOrders(data); setOrdersLoading(false); });
    fetchCreatorProfilesForAssignment().then(({ creators, diagnostics }) => {
      setActiveCreators(creators);
      setCreatorAssignmentDiag(diagnostics);
    });

    supabase
      .from('creator_profiles')
      .select([
        'id, user_id, auth_user_id, user_profile_id, creator_application_id',
        'display_name, full_name, tier, approval_status, public_profile_status',
        'bio, tools, niches, portfolio_links, github_url, linkedin_url',
        'available_hours, certifications, credential_links, proof_links',
        'case_studies, education_or_coursework, skills, badges',
        'completed_builds_count, average_rating, created_at, updated_at',
        'verification_status, subscription_status, profile_photo_url, slug',
        'is_active, rating, builds_completed',
      ].join(', '))
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Admin] creator_profiles:', error);
          setProfilesError(true);
        } else {
          setCreatorProfiles(
            ((data ?? []) as unknown as Record<string, unknown>[]).map(
              (r) => normalizeCreatorProfile(r) as unknown as DBCreatorProfileRow,
            ),
          );
        }
        setProfilesLoading(false);
      });

    supabase
      .from('request_applications')
      .select(
        'id,buyer_request_id,creator_profile_id,application_status,proposal_message,fit_reason,estimated_timeline,proposed_price,order_id,created_at',
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Admin] request_applications:', error);
        else {
          setRequestApplications(
            ((data ?? []) as Record<string, unknown>[]).map((r) => ({
              id:                 safeText(r.id, ''),
              buyer_request_id:   safeText(r.buyer_request_id),
              creator_profile_id: safeText(r.creator_profile_id),
              application_status:
                r.application_status != null ? safeText(r.application_status) : null,
              proposal_message: r.proposal_message != null ? safeText(r.proposal_message) : null,
              fit_reason: r.fit_reason != null ? safeText(r.fit_reason) : null,
              estimated_timeline: r.estimated_timeline != null ? safeText(r.estimated_timeline) : null,
              proposed_price:
                typeof r.proposed_price === 'number' && Number.isFinite(r.proposed_price)
                  ? r.proposed_price
                  : null,
              order_id: r.order_id != null ? safeText(r.order_id) : null,
              created_at: r.created_at != null ? safeText(r.created_at) : null,
            })),
          );
        }
      });

    supabase
      .from('published_workflows')
      .select(
        [
          'id',
          'title',
          'creator_profile_id',
          'workflow_status',
          'visibility_status',
          'ai_review_status',
          'ai_quality_score',
          'ai_publish_readiness',
          'ai_review_summary',
          'ai_missing_items',
          'ai_risk_flags',
          'ai_suggested_improvements',
          'ai_recommended_action',
          'ai_reviewed_at',
          'auto_publish_eligible',
        ].join(','),
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Admin] published_workflows:', error);
        else {
          setPublishedWorkflowRows(
            ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
              id:                 safeText(r.id, ''),
              title:              safeText(r.title, ''),
              creator_profile_id: safeText(r.creator_profile_id),
              workflow_status:    r.workflow_status != null ? safeText(r.workflow_status) : null,
              visibility_status:  r.visibility_status != null ? safeText(r.visibility_status) : null,
              ai_review_status:   r.ai_review_status != null ? safeText(r.ai_review_status) : null,
              ai_quality_score:
                typeof r.ai_quality_score === 'number' && Number.isFinite(r.ai_quality_score) ?
                  r.ai_quality_score
                : null,
              ai_publish_readiness:
                r.ai_publish_readiness != null ? safeText(r.ai_publish_readiness) : null,
              ai_review_summary: r.ai_review_summary != null ? safeText(r.ai_review_summary) : null,
              ai_missing_items: Array.isArray(r.ai_missing_items) ? r.ai_missing_items.map(String) : [],
              ai_risk_flags: Array.isArray(r.ai_risk_flags) ? r.ai_risk_flags.map(String) : [],
              ai_suggested_improvements:
                Array.isArray(r.ai_suggested_improvements) ? r.ai_suggested_improvements.map(String) : [],
              ai_recommended_action:
                r.ai_recommended_action != null ? safeText(r.ai_recommended_action) : null,
              ai_reviewed_at: r.ai_reviewed_at != null ? safeText(r.ai_reviewed_at) : null,
              auto_publish_eligible:
                typeof r.auto_publish_eligible === 'boolean' ? r.auto_publish_eligible : null,
            }))
          );
        }
      });
  }, []);

  useEffect(() => {
    supabase
      .from('request_applications')
      .select(
        'id,buyer_request_id,creator_profile_id,application_status,proposal_message,fit_reason,estimated_timeline,proposed_price,order_id,created_at',
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Admin] request_applications refresh:', error);
        else {
          setRequestApplications(
            ((data ?? []) as Record<string, unknown>[]).map((r) => ({
              id: safeText(r.id, ''),
              buyer_request_id: safeText(r.buyer_request_id),
              creator_profile_id: safeText(r.creator_profile_id),
              application_status: r.application_status != null ? safeText(r.application_status) : null,
              proposal_message: r.proposal_message != null ? safeText(r.proposal_message) : null,
              fit_reason: r.fit_reason != null ? safeText(r.fit_reason) : null,
              estimated_timeline: r.estimated_timeline != null ? safeText(r.estimated_timeline) : null,
              proposed_price:
                typeof r.proposed_price === 'number' && Number.isFinite(r.proposed_price) ? r.proposed_price : null,
              order_id: r.order_id != null ? safeText(r.order_id) : null,
              created_at: r.created_at != null ? safeText(r.created_at) : null,
            })),
          );
        }
      });
  }, [marketplaceRefreshNonce]);

  // Enriched requests with AI packets — per-row isolation so one bad row can't crash
  const enriched = useMemo<EnrichedRequest[]>(
    () =>
      requests.flatMap((row) => {
        try {
          return [{ row, packet: generateBuildPacket(rowToRequest(row)) }];
        } catch (err) {
          console.error('[Admin] generateBuildPacket failed for row', row.id, err);
          return [];
        }
      }),
    [requests],
  );

  const filtered = useMemo(() => applyFilter(enriched, reqFilter), [enriched, reqFilter]);

  // Optimistic status update helpers
  function handleRequestStatusChange(id: string, newStatus: string) {
    setRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: newStatus } : r)
    );
  }
  function handleAppStatusChange(id: string, newStatus: string) {
    setApplications((prev) =>
      prev.map((a) => a.id === id ? { ...a, status: newStatus } : a)
    );
    fetchCreatorProfilesForAssignment().then(({ creators, diagnostics }) => {
      setActiveCreators(creators);
      setCreatorAssignmentDiag(diagnostics);
    });
  }
  function handleOrderUpdate(id: string, updates: Partial<OrderPipelineRow>) {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...updates } : o));
  }

  const reloadOrders = useCallback(() => {
    fetchAllOrders().then(setOrders);
  }, []);

  // Batch selection helpers
  function toggleSelectApp(id: string) {
    setSelectedApps((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectReq(id: string) {
    setSelectedReqs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function clearAppSelection()  { setSelectedApps(new Set()); }
  function clearReqSelection()  { setSelectedReqs(new Set()); }

  // Buyer metrics
  const highPriorityCount  = enriched.filter((e) => e.packet.priorityLabel === 'High').length;
  const needsFollowupCount = enriched.filter((e) => e.packet.missingInfoFlags.length > 2 || e.packet.leadQualityLabel === 'Needs Detail').length;
  const readyToQuoteCount  = enriched.filter((e) => e.packet.quoteReadiness.startsWith('Ready') || e.packet.quoteReadiness.startsWith('Nearly')).length;
  const newReqCount        = requests.filter((r) => r.status === 'new').length;

  // Creator metrics
  const pendingReviewCount     = applications.filter((a) => a.status === 'new' || a.status === 'reviewing').length;
  const needsMoreInfoCount     = applications.filter((a) => a.status === 'needs_more_info').length;
  const approvedPendingCount   = applications.filter((a) => a.status === 'approved_pending_payment').length;
  const activeCreatorCount     = applications.filter((a) => a.status === 'active').length;
  const rejectedSuspendedCount = applications.filter((a) => a.status === 'rejected' || a.status === 'suspended').length;

  // Creator app status filter
  const filteredApps = useMemo(() => {
    switch (appStatusFilter) {
      case 'pending':  return applications.filter((a) => a.status === 'new' || a.status === 'reviewing' || a.status === 'needs_more_info');
      case 'approved': return applications.filter((a) => a.status === 'active' || a.status === 'approved_pending_payment');
      case 'terminal': return applications.filter((a) => a.status === 'rejected' || a.status === 'suspended');
      default:         return applications;
    }
  }, [applications, appStatusFilter]);

  /** Workflow-first-right: original publisher submitted an active marketplace application */
  const originalWorkflowCreatorAppliedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of requestApplications) {
      const rid = safeText(a.buyer_request_id);
      const req = requests.find((x) => safeText(x.id) === rid);
      if (!req?.source_creator_profile_id) continue;
      if (safeText(a.creator_profile_id) !== safeText(req.source_creator_profile_id)) continue;
      const st = safeText(a.application_status, '').toLowerCase();
      if (['submitted', 'shortlisted', 'buyer_selected'].includes(st)) m.set(rid, true);
    }
    return m;
  }, [requestApplications, requests]);

  const workflowsPublishedLive = useMemo(
    () =>
      publishedWorkflowRows.filter((w) => {
        const s = safeText(w.workflow_status, '').toLowerCase();
        const vis = safeText(w.visibility_status, '').toLowerCase();
        return s === 'published' && vis === 'public';
      }),
    [publishedWorkflowRows],
  );

  const workflowsAiApprovedQueue = useMemo(
    () =>
      publishedWorkflowRows.filter((w) => safeText(w.ai_review_status, '').toLowerCase() === 'ai_approved'),
    [publishedWorkflowRows],
  );

  const workflowsNeedsImprovement = useMemo(
    () =>
      publishedWorkflowRows.filter(
        (w) => safeText(w.ai_review_status, '').toLowerCase() === 'needs_improvement',
      ),
    [publishedWorkflowRows],
  );

  const workflowsRiskFlagged = useMemo(
    () =>
      publishedWorkflowRows.filter(
        (w) => safeText(w.ai_review_status, '').toLowerCase() === 'risk_flagged',
      ),
    [publishedWorkflowRows],
  );

  const workflowsHidden = useMemo(
    () =>
      publishedWorkflowRows.filter((w) => {
        const s = safeText(w.workflow_status, '').toLowerCase();
        const vis = safeText(w.visibility_status, '').toLowerCase();
        return s === 'hidden' || vis === 'hidden' || s === 'archived';
      }),
    [publishedWorkflowRows],
  );

  const workflowsAdminFiltered = useMemo(() => {
    switch (workflowAdminTab) {
      case 'published': return workflowsPublishedLive;
      case 'ai_ok': return workflowsAiApprovedQueue;
      case 'needs': return workflowsNeedsImprovement;
      case 'risk': return workflowsRiskFlagged;
      case 'hidden': return workflowsHidden;
      default: return publishedWorkflowRows;
    }
  }, [
    workflowAdminTab,
    publishedWorkflowRows,
    workflowsPublishedLive,
    workflowsAiApprovedQueue,
    workflowsNeedsImprovement,
    workflowsRiskFlagged,
    workflowsHidden,
  ]);

  const [workflowAdminNotice, setWorkflowAdminNotice] = useState<string | null>(null);

  function creatorLabelForWorkflowProfile(cpId: string): string {
    const id = safeText(cpId);
    const p = creatorProfiles.find((c) => safeText(c.id) === id);
    if (!p) return `${id.slice(0, 8)}…`;
    const nm = `${safeText(p.display_name)}`.trim() || safeText(p.full_name, 'Creator').trim();
    return nm || 'Creator';
  }

  async function adminWorkflowOverridePublish(id: string) {
    setWorkflowAdminNotice(null);
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from('published_workflows')
      .update({
        workflow_status: 'published',
        visibility_status: 'public',
        ai_review_status: 'published',
        updated_at: ts,
      })
      .eq('id', id);
    if (error) {
      setWorkflowAdminNotice(error.message);
      return;
    }
    setPublishedWorkflowRows((prev) =>
      prev.map((w) =>
        w.id === id ?
          {
            ...w,
            workflow_status: 'published',
            visibility_status: 'public',
            ai_review_status: 'published',
          }
        : w,
      ),
    );
  }

  async function adminWorkflowHide(id: string) {
    setWorkflowAdminNotice(null);
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from('published_workflows')
      .update({
        workflow_status: 'hidden',
        visibility_status: 'hidden',
        updated_at: ts,
      })
      .eq('id', id);
    if (error) {
      setWorkflowAdminNotice(error.message);
      return;
    }
    setPublishedWorkflowRows((prev) =>
      prev.map((w) =>
        w.id === id ?
          { ...w, workflow_status: 'hidden', visibility_status: 'hidden' }
        : w,
      ),
    );
  }

  async function adminWorkflowArchive(id: string) {
    setWorkflowAdminNotice(null);
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from('published_workflows')
      .update({
        workflow_status: 'archived',
        visibility_status: 'hidden',
        updated_at: ts,
      })
      .eq('id', id);
    if (error) {
      setWorkflowAdminNotice(error.message);
      return;
    }
    setPublishedWorkflowRows((prev) =>
      prev.map((w) =>
        w.id === id ?
          { ...w, workflow_status: 'archived', visibility_status: 'hidden' }
        : w,
      ),
    );
  }

  async function adminWorkflowMarkNeedsImprovement(id: string) {
    setWorkflowAdminNotice(null);
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from('published_workflows')
      .update({
        workflow_status: 'draft',
        visibility_status: 'hidden',
        ai_review_status: 'needs_improvement',
        updated_at: ts,
      })
      .eq('id', id);
    if (error) {
      setWorkflowAdminNotice(error.message);
      return;
    }
    setPublishedWorkflowRows((prev) =>
      prev.map((w) =>
        w.id === id ?
          {
            ...w,
            workflow_status: 'draft',
            visibility_status: 'hidden',
            ai_review_status: 'needs_improvement',
          }
        : w,
      ),
    );
  }

  // Batch summaries (built from enriched/review data)
  const selectedAppSummaries = useMemo(
    () => applications
      .filter((a) => selectedApps.has(a.id))
      .map((a) => {
        const tools   = safeArray<string>(a.tools).join(', ') || 'None listed';
        const niches  = safeArray<string>(a.niches).join(', ') || 'None listed';
        return [
          `=== Creator Application: ${safeText(a.full_name, 'Unknown')} ===`,
          `Email: ${safeText(a.email)}`,
          `Tier: ${safeText(a.tier, 'free')} | Status: ${safeText(a.status)}`,
          `Tools: ${tools}`,
          `Niches: ${niches}`,
          `Portfolio: ${a.portfolio_url ?? 'Not provided'}`,
          `Applied: ${fmtDate(a.created_at)}`,
        ].join('\n');
      }),
    [applications, selectedApps],
  );

  const selectedReqSummaries = useMemo(
    () => enriched
      .filter((e) => selectedReqs.has(e.row.id))
      .map((e) => {
        const { row, packet } = e;
        return [
          `=== Buyer Request: ${safeText(row.business_name)} ===`,
          `Industry: ${safeText(row.industry)} | Build: ${safeText(row.build_type)}`,
          `Budget: ${row.budget ?? 'Not specified'} | Deadline: ${row.deadline ?? 'Not specified'}`,
          `Lead Quality: ${packet.leadQualityLabel} (${packet.leadQualityScore}/100)`,
          `Quote Readiness: ${packet.quoteReadiness}`,
          `Priority: ${packet.priorityLabel} | Fit: ${packet.fitRating}`,
          `Submitted: ${fmtDate(row.created_at)}`,
        ].join('\n');
      }),
    [enriched, selectedReqs],
  );

  const creatorNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of activeCreators) {
      m[c.id] = safeText(c.display_name).trim() || safeText(c.full_name, 'Creator');
    }
    for (const p of creatorProfiles) {
      m[p.id] = safeText(p.display_name).trim() || safeText(p.full_name, 'Creator');
    }
    return m;
  }, [activeCreators, creatorProfiles]);

  const bizByOrderId = useMemo(() => {
    const reqBiz: Record<string, string> = {};
    for (const r of requests) {
      reqBiz[r.id] = safeText(r.business_name, 'Unknown business');
    }
    const m: Record<string, string> = {};
    for (const o of orders) {
      m[o.id] =
        o.request_id && reqBiz[o.request_id]
          ? reqBiz[o.request_id]
          : safeText(o.project_title, 'Project');
    }
    return m;
  }, [orders, requests]);

  const buyerRequestsForDeferred = useMemo(
    () => requests.map((r) => r as unknown as DatabaseBuyerRequestRow),
    [requests],
  );

  return (
    <div className="admin-page">

      {/* ── Command center header ────────────────────────────────────────── */}
      <div className="admin-command-header">
        <div className="container">
          <div className="admin-header-top">
            <div>
              <div className="admin-eyebrow">MicroBuild Operations</div>
              <h1 className="admin-title">AI Command Center</h1>
              <p className="admin-sub">
                AI operations command center · oversight &amp; override · proposal/payment workflow deferred
              </p>
            </div>
            <span className="admin-badge-internal">Internal Only</span>
          </div>
        </div>
      </div>

      {/* ── Dev-mode warning ─────────────────────────────────────────────── */}
      <div className="admin-auth-warning">
        <div className="container">
          <strong>⚠️ Development admin dashboard — not protected.</strong>{' '}
          Admin auth is deferred to a later phase. Do not deploy this publicly until
          Supabase Auth and admin role policies are added.
          See <code>supabase/migrations/admin-auth-notes.sql</code> for the hardening guide.
        </div>
      </div>

      <div className="container admin-body">

        {showAdminSection(activeSection, 'command') && (
          <>
            {(!reqLoading || !appLoading) && (
              <AdminCommandCenter
                enriched={enriched}
                applications={applications}
                orders={orders}
                deliverables={[]}
                workflows={publishedWorkflowRows}
                onNavigate={setActiveSection}
              />
            )}
            <AdminMetricsStrip
              reqLoading={reqLoading}
              requestsLen={requests.length}
              newReqCount={newReqCount}
              highPriorityCount={highPriorityCount}
              readyToQuoteCount={readyToQuoteCount}
              needsFollowupCount={needsFollowupCount}
              appLoading={appLoading}
              pendingReviewCount={pendingReviewCount}
              needsMoreInfoCount={needsMoreInfoCount}
              approvedPendingCount={approvedPendingCount}
              activeCreatorCount={activeCreatorCount}
              rejectedSuspendedCount={rejectedSuspendedCount}
            />
          </>
        )}

        {showAdminSection(activeSection, 'marketplace') && (
          <AdminMarketplaceApplications
            applications={requestApplications}
            requests={requests as unknown as import('../types/database').BuyerRequestRow[]}
            creatorNameById={creatorNameById}
            onRefresh={() => setMarketplaceRefreshNonce((n) => n + 1)}
          />
        )}

        {showAdminSection(activeSection, 'workflows') && (
        <section className="admin-section" id="section-workflows">
          <div className="admin-section-header">
            <h2>Published Workflows</h2>
            {!profilesLoading && (
              <span className="admin-count">{publishedWorkflowRows.length}</span>
            )}
          </div>
          <p className="admin-section-intro">
            Rules-based AI review before Browse. Admin is oversight/override — creators iterate on AI feedback first.
          </p>
          {workflowAdminNotice ?
            (
              <div className="admin-auth-warning">
                <strong>Workflow action error:</strong> {workflowAdminNotice}
              </div>
            )
          : null}
          <div className="req-filter-bar" style={{ marginBottom: '1rem' }}>
            {(
              [
                ['all', 'All workflows', publishedWorkflowRows.length],
                ['published', 'Published (live)', workflowsPublishedLive.length],
                ['ai_ok', 'AI approved queue', workflowsAiApprovedQueue.length],
                ['needs', 'Needs improvement', workflowsNeedsImprovement.length],
                ['risk', 'Risk flagged', workflowsRiskFlagged.length],
                ['hidden', 'Hidden / delisted', workflowsHidden.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={`req-filter-tab${workflowAdminTab === key ? ' active' : ''}`}
                onClick={() => setWorkflowAdminTab(key)}
              >
                {label}
                <span className="req-filter-count">{count}</span>
              </button>
            ))}
          </div>
          {workflowsAdminFiltered.length === 0 ?
            <div className="admin-state-row admin-empty">No workflows in this filter.</div>
          : (
            <div className="admin-wf-table-wrap">
              <table className="admin-market-mini-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Creator</th>
                    <th>Status</th>
                    <th>AI</th>
                    <th>Score</th>
                    <th>Readiness</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workflowsAdminFiltered.slice(0, 50).map((w) => (
                    <tr key={w.id}>
                      <td>{safeText(w.title)}</td>
                      <td>{creatorLabelForWorkflowProfile(w.creator_profile_id)}</td>
                      <td>{safeText(w.workflow_status, '—')} / {safeText(w.visibility_status, '—')}</td>
                      <td>{safeText(w.ai_review_status, '—')}</td>
                      <td>{w.ai_quality_score ?? '—'}</td>
                      <td>{safeText(w.ai_publish_readiness, '—')}</td>
                      <td>
                        <details className="admin-wf-ai-details">
                          <summary>View AI review</summary>
                          <p>{safeText(w.ai_review_summary, '—')}</p>
                          {w.ai_missing_items.length > 0 ?
                            <p><strong>Missing:</strong> {w.ai_missing_items.slice(0, 3).join('; ')}</p>
                          : null}
                          {w.ai_risk_flags.length > 0 ?
                            <p><strong>Risks:</strong> {w.ai_risk_flags.join('; ')}</p>
                          : null}
                        </details>
                        <div className="wf-admin-row-actions">
                          <button type="button" className="batch-btn" onClick={() => void adminWorkflowOverridePublish(w.id)}>Override publish</button>
                          <button type="button" className="batch-btn" onClick={() => void adminWorkflowHide(w.id)}>Hide</button>
                          <button type="button" className="batch-btn" onClick={() => void adminWorkflowArchive(w.id)}>Archive</button>
                          <button type="button" className="batch-btn" onClick={() => void adminWorkflowMarkNeedsImprovement(w.id)}>Mark needs improvement</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

                {showAdminSection(activeSection, 'buyers') && (
        <>
        {/* ── Buyer Requests ────────────────────────────────────────────────── */}
        <section className="admin-section" id="section-buyers">
          <div className="admin-section-header">
            <h2>Buyer Request Queue</h2>
            {!reqLoading && <span className="admin-count">{requests.length}</span>}
          </div>

          <SectionState
            loading={reqLoading}
            error={reqError}
            empty={!reqLoading && !reqError && requests.length === 0}
            emptyMsg="No buyer requests yet. Apply the dev admin read policy from supabase/policies.sql, then refresh."
          />

          {!reqLoading && !reqError && requests.length > 0 && (
            <SectionErrorBoundary name="Buyer Requests">
            <>
              <div className="req-filter-bar">
                {FILTER_TABS.map((t) => {
                  const count = t.getCount(enriched);
                  return (
                    <button
                      key={t.id}
                      className={`req-filter-tab${reqFilter === t.id ? ' active' : ''}`}
                      onClick={() => setReqFilter(t.id)}
                    >
                      {t.label}
                      <span className="req-filter-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Batch bar */}
              {selectedReqs.size > 0 && (
                <BatchActionBar
                  type="buyers"
                  count={selectedReqs.size}
                  summaries={selectedReqSummaries}
                  onClear={clearReqSelection}
                />
              )}

              {filtered.length === 0 && (
                <div className="admin-state-row admin-empty">No requests match this filter.</div>
              )}

              <div className="req-card-list">
                {filtered.map((e) => (
                  <SectionErrorBoundary key={e.row.id} name={`Request ${e.row.id}`}>
                    <RequestCard
                      enriched={e}
                      onStatusChange={handleRequestStatusChange}
                      selected={selectedReqs.has(e.row.id)}
                      onSelect={toggleSelectReq}
                      creatorProfiles={activeCreators}
                      assignmentDiagnostics={creatorAssignmentDiag}
                      onRefreshOrders={reloadOrders}
                      originalCreatorApplied={originalWorkflowCreatorAppliedMap.get(e.row.id) ?? false}
                      onViewApplicants={() => setActiveSection('marketplace')}
                    />
                  </SectionErrorBoundary>
                ))}
              </div>
            </>
            </SectionErrorBoundary>
          )}
        </section>

        </>)}

        {showAdminSection(activeSection, 'pipeline') && (
        <>
        {/* ── Project Pipeline (orders / creators / deliverables) ───────────── */}
        <SectionErrorBoundary name="Project Pipeline">
          <ProjectPipelineSection
            orders={orders}
            requests={requests}
            activeCreators={activeCreators}
            assignmentDiagnostics={creatorAssignmentDiag}
            loading={ordersLoading}
            onOrderUpdate={handleOrderUpdate}
          />
        </SectionErrorBoundary>
        </>)}

        {showAdminSection(activeSection, 'creators') && (
        <>
        {/* ── Creator Applications ──────────────────────────────────────────── */}
        <section className="admin-section" id="section-creators">
          <div className="admin-section-header">
            <h2>Creator Review Queue</h2>
            {!appLoading && <span className="admin-count">{applications.length}</span>}
          </div>

          <SectionState
            loading={appLoading}
            error={appError}
            empty={!appLoading && !appError && applications.length === 0}
            emptyMsg="No creator applications yet. Apply the dev admin read policy from supabase/policies.sql."
          />

          {!appLoading && !appError && applications.length > 0 && (
            <SectionErrorBoundary name="Creator Applications">
              <>
                {/* Status filter bar */}
                <div className="app-status-filter-bar">
                  {([
                    { id: 'all',      label: 'All',           count: applications.length },
                    { id: 'pending',  label: 'Pending Review', count: pendingReviewCount + needsMoreInfoCount },
                    { id: 'approved', label: 'Approved',       count: approvedPendingCount + activeCreatorCount },
                    { id: 'terminal', label: 'Closed',         count: rejectedSuspendedCount },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      className={`app-filter-tab${appStatusFilter === tab.id ? ' active' : ''}`}
                      onClick={() => setAppStatusFilter(tab.id)}
                    >
                      {tab.label}
                      <span className="app-filter-count">{tab.count}</span>
                    </button>
                  ))}
                </div>

                {/* Batch bar */}
                {selectedApps.size > 0 && (
                  <BatchActionBar
                    type="creators"
                    count={selectedApps.size}
                    summaries={selectedAppSummaries}
                    onClear={clearAppSelection}
                  />
                )}

                <div className="creator-card-list">
                  {filteredApps.map((a) => (
                    <SectionErrorBoundary key={a.id} name={`Creator ${a.id}`}>
                      <CreatorCard
                        app={a}
                        onStatusChange={handleAppStatusChange}
                        selected={selectedApps.has(a.id)}
                        onSelect={toggleSelectApp}
                      />
                    </SectionErrorBoundary>
                  ))}
                  {filteredApps.length === 0 && (
                    <div className="admin-state-row admin-empty">No applications match this filter.</div>
                  )}
                </div>
              </>
            </SectionErrorBoundary>
          )}
        </section>

        </>)}

        <section className="admin-section admin-section--dim" style={{ display: activeSection === "health" ? undefined : "none" }}>
          <div className="admin-section-header">
            <h2>MicroBuild Listings</h2>
            {!tplLoading && <span className="admin-count">{templates.length}</span>}
          </div>

          <SectionState
            loading={tplLoading}
            error={false}
            empty={!tplLoading && templates.length === 0}
            emptyMsg="No templates found."
          />

          {!tplLoading && templates.length > 0 && (
            <div className="tpl-table">
              <div className="tpl-table-head">
                <span>Title</span>
                <span>Category</span>
                <span>Industry</span>
                <span>Price</span>
                <span>Turnaround</span>
                <span>Status</span>
              </div>
              {templates.map((l) => (
                <div key={l.id} className="tpl-table-row">
                  <span className="tpl-title">{l.title}</span>
                  <span>{l.category}</span>
                  <span>{l.targetIndustry}</span>
                  <span>${l.startingPrice}</span>
                  <span>{fixEncoding(l.estimatedTurnaround)}</span>
                  <span style={{ color: statusColors[l.status] ?? 'inherit' }}>● {l.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Profile Quality Queue ─────────────────────────────────────────── */}
        <SectionErrorBoundary name="Profile Quality Queue">
          <ProfileQualityQueue
            profiles={creatorProfiles}
            loading={profilesLoading}
            error={profilesError}
          />
        </SectionErrorBoundary>

        {/* ── Workflow Templates ────────────────────────────────────────────── */}
        <SectionErrorBoundary name="Workflow Templates">
          <div id="section-templates">
            <WorkflowTemplates />
          </div>
        </SectionErrorBoundary>

        {showAdminSection(activeSection, 'deliverables') && (
          <AdminDeliverablesSection
            orders={orders}
            bizByOrderId={bizByOrderId}
            creatorNameById={creatorNameById}
            onOrderUpdate={handleOrderUpdate}
          />
        )}

        {showAdminSection(activeSection, 'messages') && (
          <AdminMessagesPlaceholder conversationHintCount={requestApplications.length} />
        )}

        {showAdminSection(activeSection, 'health') && (
        <>
        {/* ── Platform Health Snapshot ──────────────────────────────────────── */}
        <SectionErrorBoundary name="Platform Health Snapshot">
          <PlatformHealthSnapshot
            requests={requests}
            applications={applications}
            profiles={creatorProfiles}
            loading={reqLoading || appLoading || profilesLoading}
            ordersCount={orders.length}
            publishedWorkflowsCount={publishedWorkflowRows.length}
          />
        </SectionErrorBoundary>
        </>)}

        {showAdminSection(activeSection, 'deferred') && (
          <AdminDeferredProposals buyerRequests={buyerRequestsForDeferred} />
        )}

        {/* ── Phase 3+ placeholders ─────────────────────────────────────────── */}
        <div className="admin-placeholders">
          <section className="admin-section admin-section--dim">
            <div className="admin-section-header">
              <h2>AI Build Packets (GPT-4o)</h2>
              <span className="admin-placeholder-tag">Phase 3</span>
            </div>
            <div className="admin-placeholder">
              Real GPT-4o packets via Supabase Edge Function (server-side, no frontend API keys) in Phase 3.
              Use &ldquo;Save to Supabase&rdquo; in the Proposal tab of each request to store the rules-based packet now.
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
