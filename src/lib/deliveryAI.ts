/**
 * AI Delivery Monitor — rules-based only, no external AI APIs.
 */

import type { ProjectProposalRow } from '../types/database';
import type { DeliverablePlaceholder, OrderPipelineRow } from './orders';
import {
  getHandoffDisplayStatus,
  isReadableUrl,
  buyerCanReviewDelivery,
  type HandoffDisplayStatus,
} from './deliverables';
import { getAgreementViewState } from './projectAgreement';

export type DeliveryInsightSeverity = 'info' | 'ready' | 'warning' | 'urgent' | 'positive';

export interface DeliveryInsight {
  id: string;
  title: string;
  severity: DeliveryInsightSeverity;
  explanation: string;
  recommendedAction: string;
}

export interface DeliveryMonitorInput {
  order: OrderPipelineRow;
  deliverable: DeliverablePlaceholder | null;
  proposal: ProjectProposalRow | null;
  role: 'buyer' | 'creator' | 'admin';
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function hasUrl(v: string | null | undefined): boolean {
  return Boolean(norm(v));
}

function invalidLinkInsight(prefix: string, label: string, url: string | null | undefined): DeliveryInsight | null {
  const t = norm(url);
  if (!t) return null;
  if (isReadableUrl(t)) return null;
  return {
    id: `${prefix}-invalid-${label}`,
    title: `Invalid-looking ${label}`,
    severity: 'warning',
    explanation: `The ${label} may not open correctly: "${t.slice(0, 80)}${t.length > 80 ? '…' : ''}".`,
    recommendedAction: 'Update the link to include a valid domain (e.g. https://yoursite.com).',
  };
}

export function analyzeDeliveryHandoff(input: DeliveryMonitorInput): DeliveryInsight[] {
  const { order, deliverable, proposal, role } = input;
  const insights: DeliveryInsight[] = [];
  const agreement = getAgreementViewState(proposal);
  const hs: HandoffDisplayStatus = getHandoffDisplayStatus(order, deliverable);

  if (agreement.phase !== 'confirmed' && deliverable && hs !== 'not_submitted') {
    insights.push({
      id: 'agreement-not-confirmed',
      title: 'Agreement not confirmed',
      severity: 'warning',
      explanation: 'Delivery was submitted before both parties confirmed the Project Agreement.',
      recommendedAction:
        role === 'buyer'
          ? 'Review and confirm the agreement, then proceed with delivery review.'
          : 'Confirm the agreement in Messages if scope is clear, then continue handoff.',
    });
  }

  if (!deliverable || hs === 'not_submitted') {
    insights.push({
      id: 'nothing-submitted',
      title: 'No delivery submitted yet',
      severity: role === 'creator' ? 'ready' : 'info',
      explanation:
        role === 'creator'
          ? 'The buyer is waiting for a preview or final delivery link.'
          : 'The creator has not submitted preview or delivery links yet.',
      recommendedAction:
        role === 'creator'
          ? 'Submit a preview first if the buyer should review before final handoff.'
          : 'Message your creator if you need a timeline update.',
    });
    return insights.slice(0, 6);
  }

  const previewInvalid = invalidLinkInsight('delivery', 'preview link', deliverable.preview_url);
  if (previewInvalid) insights.push(previewInvalid);

  const liveInvalid = invalidLinkInsight('delivery', 'final delivery link', deliverable.live_url);
  if (liveInvalid) insights.push(liveInvalid);

  if (hasUrl(deliverable.preview_url) && !hasUrl(deliverable.live_url) && hs === 'preview_submitted') {
    insights.push({
      id: 'preview-no-final',
      title: 'Preview submitted — final delivery missing',
      severity: role === 'creator' ? 'ready' : 'info',
      explanation: 'A preview link is available but the final production/delivery URL is not submitted yet.',
      recommendedAction:
        role === 'creator'
          ? 'Submit the final delivery URL when the build is ready for handoff.'
          : 'Review the preview and message the creator if you are ready for the final link.',
    });
  }

  if (!norm(deliverable.notes) && (hasUrl(deliverable.preview_url) || hasUrl(deliverable.live_url))) {
    insights.push({
      id: 'missing-notes',
      title: 'Missing delivery notes',
      severity: 'info',
      explanation: 'No delivery notes were included — test credentials or change summaries help buyers review faster.',
      recommendedAction:
        role === 'creator'
          ? 'Add notes explaining what was delivered and how to test it.'
          : 'Ask the creator for testing instructions via Messages if needed.',
    });
  }

  if (role === 'buyer' && buyerCanReviewDelivery(deliverable)) {
    insights.push({
      id: 'buyer-review-pending',
      title: 'Delivery waiting for your review',
      severity: 'ready',
      explanation: 'The creator submitted links for your review. Accept when ready or request a revision with clear notes.',
      recommendedAction: 'Open the delivery links, verify scope, then Accept Delivery or Request Revision.',
    });
  }

  if (role === 'creator' && deliverable.delivery_status === 'revision_needed') {
    const note = norm(deliverable.revision_note);
    insights.push({
      id: 'revision-action-needed',
      title: 'Revision requested — your action needed',
      severity: 'urgent',
      explanation: note
        ? `Buyer feedback: ${note.slice(0, 160)}${note.length > 160 ? '…' : ''}`
        : 'The buyer requested changes to the delivery.',
      recommendedAction: 'Update your links, describe what changed, and resubmit the delivery.',
    });
  }

  if (hs === 'approved' || hs === 'completed') {
    insights.push({
      id: 'delivery-approved',
      title: 'Delivery approved',
      severity: 'positive',
      explanation: 'This project delivery has been accepted. Keep artifact links available if anything changes.',
      recommendedAction:
        role === 'buyer'
          ? 'Save your live link and message the creator if post-launch support is needed.'
          : 'Monitor Messages for any post-delivery questions from the buyer.',
    });
  }

  if (role === 'admin' && deliverable.delivery_status === 'submitted' && order.order_status === 'in_review') {
    insights.push({
      id: 'admin-oversight',
      title: 'Delivery in buyer review',
      severity: 'info',
      explanation: 'Creator submitted delivery — buyer can accept or request revision without admin approval.',
      recommendedAction: 'Monitor only if a dispute arises; no admin action required for standard handoff.',
    });
  }

  if (role === 'buyer' && hs === 'revision_requested') {
    insights.push({
      id: 'buyer-waiting-revision',
      title: 'Waiting for creator update',
      severity: 'info',
      explanation: 'Your revision request was sent. The creator will update and resubmit.',
      recommendedAction: 'Message the creator if you need to clarify the revision note.',
    });
  }

  const severityOrder: Record<DeliveryInsightSeverity, number> = {
    urgent: 0,
    warning: 1,
    ready: 2,
    info: 3,
    positive: 4,
  };

  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 6);
}

export function getPrimaryDeliveryInsight(input: DeliveryMonitorInput): DeliveryInsight | null {
  const list = analyzeDeliveryHandoff(input);
  return list[0] ?? null;
}
