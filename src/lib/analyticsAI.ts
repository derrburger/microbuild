/**
 * MicroBuild — Analytics AI Monitor v1
 *
 * Rules-based insights only. No external AI APIs.
 * Produces actionable cards with severity, explanation, and recommended next steps.
 */

import { analyzeProfileStrength } from './profileAI';
import { isWorkflowCustomizationBuyerRequest } from './marketplace';
import type {
  AdminPlatformAnalytics,
  AnalyticsContext,
  BuyerAnalyticsOverview,
  CreatorAnalyticsOverview,
} from './analytics';
import {
  fetchDeliverablesByOrderIds,
  fetchOrdersByCreatorProfile,
  fetchOrdersByRequestIds,
} from './orders';
import type { BuyerRequestRow } from '../types/database';
import { supabase } from './supabase';

const LOG_TAG = '[analyticsAI]';

export type InsightSeverity = 'info' | 'warning' | 'urgent' | 'positive';

export interface AnalyticsInsight {
  id: string;
  title: string;
  severity: InsightSeverity;
  explanation: string;
  recommendedAction: string;
  relatedLink: string | null;
}

function norm(v: unknown, fb = ''): string {
  if (typeof v === 'string') return v.trim();
  if (v == null) return fb;
  return String(v).trim();
}

function pushInsight(
  list: AnalyticsInsight[],
  insight: AnalyticsInsight,
): void {
  if (list.some((x) => x.id === insight.id)) return;
  list.push(insight);
}

// ─── Shared detectors ─────────────────────────────────────────────────────────

export function detectWeakProfileAreas(ctx: AnalyticsContext): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  const cp = ctx.creatorProfile;
  if (!cp) return out;

  const strength = analyzeProfileStrength(cp);

  if (norm(cp.public_profile_status).toLowerCase() !== 'public') {
    pushInsight(out, {
      id: 'profile-not-public',
      title: 'Profile is not public',
      severity: 'warning',
      explanation: 'Buyers cannot discover your profile while visibility is hidden or paused.',
      recommendedAction: 'Set your profile to public when you are ready to receive applications.',
      relatedLink: '/dashboard/profile',
    });
  }

  if (strength.score < 70) {
    pushInsight(out, {
      id: 'profile-strength-low',
      title: 'Profile strength below 70',
      severity: 'warning',
      explanation: `Your profile strength is ${strength.score}/100 (${strength.label}). Weak sections reduce buyer trust.`,
      recommendedAction: 'Complete missing profile sections highlighted in your profile editor.',
      relatedLink: '/dashboard/profile',
    });
  }

  const portfolio = [...(cp.portfolio_links ?? [])];
  if (norm(cp.portfolio_url)) portfolio.push(norm(cp.portfolio_url));
  if (portfolio.filter(Boolean).length === 0) {
    pushInsight(out, {
      id: 'profile-missing-portfolio',
      title: 'Missing portfolio link',
      severity: 'info',
      explanation: 'No portfolio links are listed on your profile.',
      recommendedAction: 'Add at least one portfolio or proof link.',
      relatedLink: '/dashboard/profile',
    });
  }

  if (!norm(cp.profile_photo_url)) {
    pushInsight(out, {
      id: 'profile-missing-avatar',
      title: 'Missing profile photo',
      severity: 'info',
      explanation: 'Profiles with a photo tend to convert better in applicant review.',
      recommendedAction: 'Upload a profile photo in your profile settings.',
      relatedLink: '/dashboard/profile',
    });
  }

  if (strength.sections.expertise < 60 || (cp.tools?.length ?? 0) < 2 || (cp.niches?.length ?? 0) < 1) {
    pushInsight(out, {
      id: 'profile-weak-expertise',
      title: 'Weak bio, tools, or niches',
      severity: 'info',
      explanation: 'Your expertise section is thin — buyers may not understand your fit.',
      recommendedAction: 'Add tools, niches, and a clear bio describing who you help.',
      relatedLink: '/dashboard/profile',
    });
  }

  return out;
}

export function detectApplicationPerformanceIssues(
  overview: CreatorAnalyticsOverview,
): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  const apps = overview.applications;
  const projects = overview.projects;

  if (apps.totalSubmitted >= 3 && apps.selected === 0 && apps.rejected >= 2) {
    pushInsight(out, {
      id: 'apps-no-selections',
      title: 'Many applications but no selections',
      severity: 'warning',
      explanation: `You submitted ${apps.totalSubmitted} applications with ${apps.rejected} rejections and no buyer selections yet.`,
      recommendedAction: 'Review recent applications — strengthen fit reasons, timeline, and pricing clarity.',
      relatedLink: '/dashboard/applications',
    });
  }

  if (apps.selected > 0 && projects.totalAssigned === 0) {
    pushInsight(out, {
      id: 'apps-selected-no-project',
      title: 'Selected but no project activity',
      severity: 'urgent',
      explanation: 'You have selected applications but no assigned project orders yet.',
      recommendedAction: 'Check Messages and project workspace — confirm the buyer completed selection.',
      relatedLink: '/dashboard/projects',
    });
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (apps.totalSubmitted === 0) {
    pushInsight(out, {
      id: 'apps-none',
      title: 'No applications yet',
      severity: 'info',
      explanation: 'You have not applied to any open buyer requests.',
      recommendedAction: 'Browse open requests and submit your first application.',
      relatedLink: '/browse',
    });
  }

  if (apps.totalSubmitted > 0 && apps.totalSubmitted <= 2) {
    pushInsight(out, {
      id: 'apps-few',
      title: 'Limited application history',
      severity: 'info',
      explanation: 'Apply to more open requests to build selection data.',
      recommendedAction: 'Review Buyer Requests and submit tailored applications.',
      relatedLink: '/browse',
    });
  }

  void thirtyDaysAgo;
  return out;
}

export async function detectStalledProjects(ctx: AnalyticsContext): Promise<AnalyticsInsight[]> {
  const out: AnalyticsInsight[] = [];
  if (!ctx.creatorProfileId) return out;

  const orders = await fetchOrdersByCreatorProfile(ctx.creatorProfileId);
  const stalledCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stalled = orders.filter((o) => {
    const st = norm(o.order_status).toLowerCase();
    if (!['assigned', 'in_progress', 'in_review'].includes(st)) return false;
    const updated = Date.parse(norm(o.updated_at));
    return Number.isFinite(updated) && updated < stalledCutoff;
  });

  if (stalled.length > 0) {
    pushInsight(out, {
      id: 'projects-stalled',
      title: `${stalled.length} stalled project${stalled.length === 1 ? '' : 's'}`,
      severity: 'urgent',
      explanation: 'These projects have had no status update in over 7 days.',
      recommendedAction: 'Post a progress update in Messages or advance the project workspace.',
      relatedLink: stalled[0]?.id ? `/dashboard/projects/${stalled[0].id}` : '/dashboard/projects',
    });
  }

  for (const o of orders) {
    const st = norm(o.order_status).toLowerCase();
    const agr = norm(o.agreement_status).toLowerCase();
    if (['assigned', 'in_progress'].includes(st) && agr !== 'confirmed' && !agr.includes('confirmed')) {
      pushInsight(out, {
        id: `agreement-unconfirmed-${o.id}`,
        title: 'Agreement not confirmed',
        severity: 'warning',
        explanation: `Project "${norm(o.project_title, 'Untitled')}" is active but the agreement is not fully confirmed.`,
        recommendedAction: 'Open the project workspace and confirm the Project Agreement.',
        relatedLink: `/dashboard/projects/${o.id}`,
      });
      break;
    }
  }

  return out;
}

export function detectWorkflowOpportunities(overview: CreatorAnalyticsOverview): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  const wf = overview.workflows;

  if (wf.totalCreated === 0) {
    pushInsight(out, {
      id: 'workflows-none',
      title: 'No workflows created',
      severity: 'info',
      explanation: 'Published workflows help buyers request customized builds from you.',
      recommendedAction: 'Create your first reusable workflow in the Workflows studio.',
      relatedLink: '/dashboard/workflows',
    });
  } else if (wf.published === 0) {
    pushInsight(out, {
      id: 'workflows-unpublished',
      title: 'No published workflows',
      severity: 'warning',
      explanation: `You have ${wf.totalCreated} workflow draft(s) but none published yet.`,
      recommendedAction: 'Run AI review and publish a workflow when readiness is green.',
      relatedLink: '/dashboard/workflows',
    });
  }

  if (wf.needsImprovement > 0) {
    pushInsight(out, {
      id: 'workflows-needs-improvement',
      title: `${wf.needsImprovement} workflow(s) need improvement`,
      severity: 'warning',
      explanation: 'AI review flagged workflows that need clearer scope or missing items.',
      recommendedAction: 'Open each flagged workflow and address missing items.',
      relatedLink: '/dashboard/workflows',
    });
  }

  if (wf.published > 0 && wf.requestsFromWorkflows === 0) {
    pushInsight(out, {
      id: 'workflows-no-requests',
      title: 'Published workflow has no requests yet',
      severity: 'info',
      explanation: 'Your published workflows have not generated buyer customization requests yet.',
      recommendedAction: 'Improve workflow title, pricing clarity, and preview — share your Browse link.',
      relatedLink: '/dashboard/workflows',
    });
  }

  if (wf.requestsFromWorkflows > 0) {
    pushInsight(out, {
      id: 'workflows-has-requests',
      title: 'Workflow requests are coming in',
      severity: 'positive',
      explanation: `${wf.requestsFromWorkflows} buyer request(s) were generated from your published workflows.`,
      recommendedAction: 'Review workflow customization requests and apply early as the original publisher.',
      relatedLink: '/dashboard/applications',
    });
  }

  return out;
}

export async function detectAgreementRisks(ctx: AnalyticsContext): Promise<AnalyticsInsight[]> {
  const out: AnalyticsInsight[] = [];
  if (!ctx.creatorProfileId) return out;

  const { data, error } = await supabase
    .from('project_proposals')
    .select('id, order_id, agreement_status, buyer_confirmed_at, creator_confirmed_at')
    .eq('creator_profile_id', ctx.creatorProfileId);

  if (error) {
    console.error(`${LOG_TAG} detectAgreementRisks:`, error);
    return out;
  }

  for (const row of data ?? []) {
    const st = norm(row.agreement_status).toLowerCase();
    if (st === 'changes_requested') {
      pushInsight(out, {
        id: `agreement-changes-${row.order_id ?? row.id}`,
        title: 'Agreement changes requested',
        severity: 'urgent',
        explanation: 'A buyer or counterparty requested changes to the project agreement.',
        recommendedAction: 'Open the project workspace, review the change note, and update the agreement.',
        relatedLink: row.order_id ? `/dashboard/projects/${row.order_id}` : '/dashboard/projects',
      });
      break;
    }
  }

  return out;
}

export async function detectDeliveryRisks(ctx: AnalyticsContext): Promise<AnalyticsInsight[]> {
  const out: AnalyticsInsight[] = [];
  if (!ctx.creatorProfileId) return out;

  const orders = await fetchOrdersByCreatorProfile(ctx.creatorProfileId);
  const deliverables = await fetchDeliverablesByOrderIds(orders.map((o) => o.id));

  for (const o of orders) {
    const st = norm(o.order_status).toLowerCase();
    const del = deliverables[o.id];
    if (st === 'in_progress' && !del) {
      pushInsight(out, {
        id: `delivery-none-${o.id}`,
        title: 'No deliverable submitted',
        severity: 'warning',
        explanation: `Project "${norm(o.project_title, 'Untitled')}" is in progress but no deliverable has been submitted.`,
        recommendedAction: 'Submit a deliverable preview or progress link in the project workspace.',
        relatedLink: `/dashboard/projects/${o.id}`,
      });
      break;
    }
    if (del && norm(del.delivery_status).toLowerCase() === 'submitted') {
      pushInsight(out, {
        id: `delivery-pending-review-${o.id}`,
        title: 'Delivery pending buyer review',
        severity: 'info',
        explanation: 'Your deliverable was submitted and is waiting for buyer review.',
        recommendedAction: 'Follow up in Messages if review is taking longer than expected.',
        relatedLink: `/dashboard/projects/${o.id}`,
      });
      break;
    }
  }

  return out;
}

export function generateCreatorInsights(overview: CreatorAnalyticsOverview): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [
    ...detectWeakProfileAreas(overview.context),
    ...detectApplicationPerformanceIssues(overview),
    ...detectWorkflowOpportunities(overview),
  ];

  if (overview.messaging.conversationsNeedingReply > 0) {
    pushInsight(out, {
      id: 'messages-needs-reply',
      title: `${overview.messaging.conversationsNeedingReply} conversation(s) need a reply`,
      severity: 'warning',
      explanation: 'The last message in some threads was sent to you without a follow-up reply.',
      recommendedAction: 'Open Messages and respond to waiting conversations.',
      relatedLink: '/messages',
    });
  }

  if (overview.agreements.changesRequested > 0) {
    pushInsight(out, {
      id: 'agreements-changes-count',
      title: 'Agreement changes requested',
      severity: 'urgent',
      explanation: `${overview.agreements.changesRequested} agreement(s) have changes requested.`,
      recommendedAction: 'Review and update agreements in your project workspaces.',
      relatedLink: '/dashboard/projects',
    });
  }

  if (overview.profile.strengthScore != null && overview.profile.strengthScore >= 75 && overview.applications.selected > 0) {
    pushInsight(out, {
      id: 'creator-on-track',
      title: 'You are on track',
      severity: 'positive',
      explanation: 'Profile strength and application activity look healthy.',
      recommendedAction: 'Keep availability updated and respond quickly to messages.',
      relatedLink: '/dashboard',
    });
  }

  return out.slice(0, 12);
}

export async function generateCreatorInsightsAsync(
  overview: CreatorAnalyticsOverview,
): Promise<AnalyticsInsight[]> {
  const [stalled, agreement, delivery] = await Promise.all([
    detectStalledProjects(overview.context),
    detectAgreementRisks(overview.context),
    detectDeliveryRisks(overview.context),
  ]);

  const base = generateCreatorInsights(overview);
  const merged = [...base, ...stalled, ...agreement, ...delivery];
  const seen = new Set<string>();
  return merged.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  }).slice(0, 14);
}

// ─── Buyer insights ───────────────────────────────────────────────────────────

async function fetchBuyerRequestRows(email: string) {
  const { data, error } = await supabase
    .from('buyer_requests')
    .select(
      'id, email, business_name, applications_count, application_status, visibility_status, selected_creator_profile_id, source_type, customization_notes, requested_from_workflow, source_workflow_id, updated_at',
    )
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`${LOG_TAG} buyer requests:`, error);
    return [];
  }
  return data ?? [];
}

export async function generateBuyerInsights(
  overview: BuyerAnalyticsOverview,
): Promise<AnalyticsInsight[]> {
  const out: AnalyticsInsight[] = [];
  const ctx = overview.context;
  const rows = await fetchBuyerRequestRows(ctx.email);

  for (const r of rows) {
    const count = Number(r.applications_count ?? 0);
    const appSt = norm(r.application_status).toLowerCase();
    const vis = norm(r.visibility_status).toLowerCase();

    if (vis === 'open' && count === 0 && !norm(r.selected_creator_profile_id)) {
      pushInsight(out, {
        id: `buyer-no-applicants-${r.id}`,
        title: `"${norm(r.business_name, 'Request')}" has no applicants yet`,
        severity: 'info',
        explanation: 'Your open request is visible but no creators have applied.',
        recommendedAction: 'Wait for applications or refine your request details to attract creators.',
        relatedLink: '/dashboard/requests',
      });
      break;
    }

    if (count > 0 && !norm(r.selected_creator_profile_id) && ['open', 'reviewing_applicants'].includes(appSt)) {
      pushInsight(out, {
        id: `buyer-review-applicants-${r.id}`,
        title: 'Applicants waiting for your review',
        severity: 'warning',
        explanation: `${count} creator(s) applied — review and shortlist or select a winner.`,
        recommendedAction: 'Open My Requests and review applicant proposals.',
        relatedLink: '/dashboard/requests',
      });
      break;
    }

    if (isWorkflowCustomizationBuyerRequest(r as unknown as BuyerRequestRow) && norm(r.customization_notes).length < 40) {
      pushInsight(out, {
        id: `buyer-workflow-detail-${r.id}`,
        title: 'Workflow customization needs more detail',
        severity: 'info',
        explanation: 'A workflow-based request has minimal customization notes.',
        recommendedAction: 'Add specifics about your business, brand, and desired changes.',
        relatedLink: '/dashboard/requests',
      });
    }
  }

  const orders = await fetchOrdersByRequestIds(rows.map((r) => norm(r.id)).filter(Boolean));
  for (const o of orders) {
    const agr = norm(o.agreement_status).toLowerCase();
    const st = norm(o.order_status).toLowerCase();
    if (['assigned', 'in_progress'].includes(st) && agr !== 'confirmed') {
      pushInsight(out, {
        id: `buyer-agreement-${o.id}`,
        title: 'Creator selected but agreement not confirmed',
        severity: 'warning',
        explanation: 'Your project is assigned but the Project Agreement is not fully confirmed.',
        recommendedAction: 'Open the project workspace and confirm the agreement with your creator.',
        relatedLink: `/dashboard/projects/${o.id}`,
      });
      break;
    }
  }

  const deliverables = await fetchDeliverablesByOrderIds(orders.map((o) => o.id));
  for (const o of orders) {
    const del = deliverables[o.id];
    if (del && norm(del.delivery_status).toLowerCase() === 'submitted') {
      pushInsight(out, {
        id: `buyer-delivery-review-${o.id}`,
        title: 'Delivery submitted — needs your review',
        severity: 'urgent',
        explanation: 'A creator submitted a deliverable awaiting your approval or revision request.',
        recommendedAction: 'Review the deliverable in your project workspace.',
        relatedLink: `/dashboard/projects/${o.id}`,
      });
      break;
    }
  }

  if (overview.messaging.conversationsNeedingReply > 0) {
    pushInsight(out, {
      id: 'buyer-messages-reply',
      title: `${overview.messaging.conversationsNeedingReply} message thread(s) need a reply`,
      severity: 'warning',
      explanation: 'Creators are waiting on your response in one or more conversations.',
      recommendedAction: 'Open Messages and reply to pending threads.',
      relatedLink: '/messages',
    });
  }

  if (overview.requests.totalRequests === 0) {
    pushInsight(out, {
      id: 'buyer-no-requests',
      title: 'No requests submitted yet',
      severity: 'info',
      explanation: 'Submit your first MicroBuild request to start matching with creators.',
      recommendedAction: 'Use Request a MicroBuild or customize a workflow on Browse.',
      relatedLink: '/request',
    });
  }

  if (overview.projects.completedProjects > 0) {
    pushInsight(out, {
      id: 'buyer-completed',
      title: 'Completed projects on record',
      severity: 'positive',
      explanation: `${overview.projects.completedProjects} project(s) marked completed.`,
      recommendedAction: 'Consider submitting a new request or leaving a review when available.',
      relatedLink: '/dashboard',
    });
  }

  return out.slice(0, 12);
}

// ─── Admin insights ───────────────────────────────────────────────────────────

export function generateAdminInsights(platform: AdminPlatformAnalytics): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];

  if (platform.openBuyerRequests > 0) {
    pushInsight(out, {
      id: 'admin-open-requests',
      title: `${platform.openBuyerRequests} open buyer request(s)`,
      severity: 'info',
      explanation: 'Buyer requests are open for creator applications.',
      recommendedAction: 'Review the buyer queue for stale or high-priority leads.',
      relatedLink: '/admin#buyers',
    });
  }

  if (platform.pendingCreatorApplications > 0) {
    pushInsight(out, {
      id: 'admin-pending-creators',
      title: `${platform.pendingCreatorApplications} creator application(s) pending`,
      severity: 'warning',
      explanation: 'New creator onboarding applications need admin review.',
      recommendedAction: 'Open Creator Applications in the command center.',
      relatedLink: '/admin#creators',
    });
  }

  if (platform.deliverablesNeedingReview > 0) {
    pushInsight(out, {
      id: 'admin-deliverables-review',
      title: `${platform.deliverablesNeedingReview} deliverable(s) awaiting review`,
      severity: 'urgent',
      explanation: 'Submitted deliverables may need admin or buyer follow-up.',
      recommendedAction: 'Open the Deliverables tab in admin.',
      relatedLink: '/admin#deliverables',
    });
  }

  if (platform.stalledProjects > 0) {
    pushInsight(out, {
      id: 'admin-stalled',
      title: `${platform.stalledProjects} stalled project(s)`,
      severity: 'urgent',
      explanation: 'Projects with no update in 7+ days may need intervention.',
      recommendedAction: 'Review the project pipeline for stuck orders.',
      relatedLink: '/admin#pipeline',
    });
  }

  if (platform.publishedWorkflows > 0) {
    pushInsight(out, {
      id: 'admin-workflows-live',
      title: `${platform.publishedWorkflows} published workflow(s) live`,
      severity: 'positive',
      explanation: 'Creators have published workflows visible on Browse.',
      recommendedAction: 'Spot-check AI review flags on Published Workflows.',
      relatedLink: '/admin#workflows',
    });
  }

  if (!platform.hasEnoughData) {
    pushInsight(out, {
      id: 'admin-no-data',
      title: 'Platform data is sparse',
      severity: 'info',
      explanation: 'Not enough marketplace activity yet for rich admin analytics.',
      recommendedAction: 'Seed test requests or wait for live marketplace usage.',
      relatedLink: '/admin',
    });
  }

  return out.slice(0, 10);
}

export function getNextBestActions(insights: AnalyticsInsight[]): AnalyticsInsight[] {
  const priority: Record<InsightSeverity, number> = {
    urgent: 0,
    warning: 1,
    info: 2,
    positive: 3,
  };

  return [...insights]
    .sort((a, b) => priority[a.severity] - priority[b.severity])
    .slice(0, 5);
}
