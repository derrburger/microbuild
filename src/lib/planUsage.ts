/**
 * Plan usage counters for entitlement checks.
 * Counts are computed client-side for v1; move to RPC/Edge Function before production billing.
 */

import { supabase } from './supabase';
import type { PlanUsageCounts } from './entitlements';

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isActiveBuyerRequest(row: {
  deleted_at?: string | null;
  archived_at?: string | null;
  canceled_at?: string | null;
  visibility_status?: string | null;
  status?: string | null;
}): boolean {
  if (row.deleted_at || row.archived_at || row.canceled_at) return false;
  const vis = (row.visibility_status ?? '').toLowerCase();
  if (vis === 'completed' || vis === 'closed') return false;
  const st = (row.status ?? '').toLowerCase();
  if (st === 'rejected') return false;
  return true;
}

export function countBuyerUsageFromRequests(
  rows: {
    created_at?: string | null;
    deleted_at?: string | null;
    archived_at?: string | null;
    canceled_at?: string | null;
    visibility_status?: string | null;
    status?: string | null;
  }[],
): Pick<PlanUsageCounts, 'buyerActiveRequests' | 'buyerMonthlyRequests'> {
  const monthStart = startOfMonthIso();
  let active = 0;
  let monthly = 0;
  for (const r of rows) {
    const created = r.created_at ?? '';
    if (created >= monthStart) monthly++;
    if (isActiveBuyerRequest(r)) active++;
  }
  return { buyerActiveRequests: active, buyerMonthlyRequests: monthly };
}

export async function fetchBuyerPlanUsage(params: {
  email: string;
  authUserId?: string | null;
}): Promise<Pick<PlanUsageCounts, 'buyerActiveRequests' | 'buyerMonthlyRequests'>> {
  let q = supabase
    .from('buyer_requests')
    .select('created_at, deleted_at, archived_at, canceled_at, visibility_status, status');

  if (params.authUserId) {
    q = q.or(`email.eq.${params.email},user_id.eq.${params.authUserId}`);
  } else {
    q = q.eq('email', params.email);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[planUsage] fetchBuyerPlanUsage:', error);
    return { buyerActiveRequests: 0, buyerMonthlyRequests: 0 };
  }
  return countBuyerUsageFromRequests((data ?? []) as Parameters<typeof countBuyerUsageFromRequests>[0]);
}

export async function fetchCreatorPlanUsage(creatorProfileId: string): Promise<
  Pick<PlanUsageCounts, 'creatorApplicationsThisMonth' | 'creatorActiveApplications' | 'creatorPublishedWorkflows'>
> {
  const monthStart = startOfMonthIso();

  const [appsRes, wfRes] = await Promise.all([
    supabase
      .from('request_applications')
      .select('id, application_status, created_at')
      .eq('creator_profile_id', creatorProfileId),
    supabase
      .from('published_workflows')
      .select('id, workflow_status')
      .eq('creator_profile_id', creatorProfileId)
      .eq('workflow_status', 'published'),
  ]);

  if (appsRes.error) console.error('[planUsage] applications:', appsRes.error);
  if (wfRes.error) console.error('[planUsage] workflows:', wfRes.error);

  const apps = (appsRes.data ?? []) as { application_status?: string; created_at?: string }[];
  let monthly = 0;
  let active = 0;
  for (const a of apps) {
    if ((a.created_at ?? '') >= monthStart) monthly++;
    const st = (a.application_status ?? '').toLowerCase();
    if (st !== 'rejected' && st !== 'withdrawn' && st !== 'admin_blocked') active++;
  }

  const published = (wfRes.data ?? []).length;

  return {
    creatorApplicationsThisMonth: monthly,
    creatorActiveApplications: active,
    creatorPublishedWorkflows: published,
  };
}
