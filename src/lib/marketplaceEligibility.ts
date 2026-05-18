import type { BuyerRequestRow, CreatorProfileRow } from '../types/database';

function norm(s: unknown, fb = ''): string {
  if (typeof s === 'string') return s.trim().toLowerCase();
  return fb;
}

/** True when creators may still compete to apply */
export function isBuyerRequestOpenForApplications(row: BuyerRequestRow | null | undefined): boolean {
  if (!row) return false;
  const vr = norm(row.visibility_status ?? 'open', 'open');
  const app = norm(row.application_status ?? 'open', 'open');
  if (vr === 'draft' || vr === 'closed' || vr === 'completed') return false;
  if (['creator_selected', 'in_progress', 'completed', 'closed', 'draft'].includes(app)) return false;
  return true;
}

/**
 * Minimal gate for voluntary marketplace applications — does not replace admin oversight.
 */
export function creatorEligibleForApplying(p: CreatorProfileRow | null): { ok: boolean; message: string } {
  if (!p?.id)
    return { ok: false, message: 'Creator profile must exist and be linked before applying.' };

  const approval = norm(p.approval_status ?? 'draft', 'draft');
  if (approval === 'rejected' || approval === 'suspended')
    return { ok: false, message: 'Application is not permitted while your creator account is inactive.' };

  if (!['active', 'approved_pending_payment'].includes(approval))
    return { ok: false, message: 'Creator profile must be active before applying.' };

  if (!p.is_active && approval !== 'active' && approval !== 'approved_pending_payment')
    return { ok: false, message: 'Creator profile must be active before applying.' };

  return { ok: true, message: '' };
}
