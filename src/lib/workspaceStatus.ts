/**
 * Project workspace status timeline + next-action helpers (UI-only, no schema changes).
 */

import type { OrderPipelineRow, DeliverablePlaceholder } from './orders';
import type { ProjectProposalRow } from '../types/database';
import { getAgreementViewState } from './projectAgreement';
import { handoffStatusLabel, buyerCanReviewDelivery } from './deliverables';

export const WORKSPACE_STATUS_STEPS: readonly { id: string; label: string }[] = [
  { id: 'request', label: 'Request submitted' },
  { id: 'creator', label: 'Creator selected' },
  { id: 'agreement', label: 'Agreement confirmed' },
  { id: 'build', label: 'Build in progress' },
  { id: 'delivery', label: 'Delivery submitted' },
  { id: 'completed', label: 'Completed' },
];

export type WorkspaceStatusStep = (typeof WORKSPACE_STATUS_STEPS)[number] & {
  dateIso?: string | null;
};

export function getWorkspaceStatusSteps(params: {
  order: OrderPipelineRow;
  buyerRequestCreatedAt?: string | null;
  proposal: ProjectProposalRow | null;
  deliverable: DeliverablePlaceholder | null;
}): WorkspaceStatusStep[] {
  const { order, buyerRequestCreatedAt, proposal, deliverable } = params;
  const agreement = getAgreementViewState(proposal);

  const agreementDate =
    agreement.phase === 'confirmed'
      ? proposal?.locked_at ?? proposal?.creator_confirmed_at ?? proposal?.buyer_confirmed_at ?? null
      : null;

  const buildDate =
    ['in_progress', 'in_review', 'delivered', 'completed'].includes(order.order_status)
      ? order.updated_at
      : null;

  const deliveryDate =
    deliverable && deliverable.delivery_status !== 'draft' ? deliverable.submitted_at : null;

  const completedDate = order.order_status === 'completed' ? order.updated_at : null;

  return [
    { ...WORKSPACE_STATUS_STEPS[0], dateIso: buyerRequestCreatedAt ?? null },
    { ...WORKSPACE_STATUS_STEPS[1], dateIso: order.creator_id ? order.created_at : null },
    { ...WORKSPACE_STATUS_STEPS[2], dateIso: agreementDate },
    { ...WORKSPACE_STATUS_STEPS[3], dateIso: buildDate },
    { ...WORKSPACE_STATUS_STEPS[4], dateIso: deliveryDate },
    { ...WORKSPACE_STATUS_STEPS[5], dateIso: completedDate },
  ];
}

/** Active step index (0..5) for workspace timeline highlight. */
export function getWorkspaceStatusActiveIndex(params: {
  order: OrderPipelineRow;
  proposal: ProjectProposalRow | null;
  deliverable: DeliverablePlaceholder | null;
}): number {
  const { order, proposal, deliverable } = params;
  const agreement = getAgreementViewState(proposal);

  if (order.order_status === 'completed') return 5;
  if (deliverable && deliverable.delivery_status !== 'draft') return 4;
  if (['in_progress', 'in_review', 'delivered'].includes(order.order_status)) return 3;
  if (agreement.phase === 'confirmed') return 3;
  if (order.creator_id && agreement.phase !== 'none') return 2;
  if (order.creator_id) return 1;
  if (order.request_id) return 0;
  return 0;
}

export function agreementStatusBadgeLabel(proposal: ProjectProposalRow | null): string {
  const view = getAgreementViewState(proposal);
  if (view.phase === 'none') return 'No agreement yet';
  if (view.phase === 'confirmed') return 'Agreement confirmed';
  if (view.phase === 'changes_requested') return 'Changes requested';
  if (view.phase === 'buyer_confirmed') return 'Waiting for creator';
  if (view.phase === 'creator_confirmed') return 'Waiting for buyer';
  return 'Agreement in progress';
}

export function agreementConfirmationSummary(proposal: ProjectProposalRow | null): string {
  const view = getAgreementViewState(proposal);
  if (view.phase === 'none') return 'No agreement drafted yet.';
  if (view.phase === 'confirmed') return 'Agreement locked — ready to build.';
  if (view.phase === 'changes_requested') {
    const note = proposal?.buyer_feedback?.trim();
    return note ? `Changes requested: ${note}` : 'Changes requested — continue in Messages.';
  }
  if (view.phase === 'buyer_confirmed') return 'Waiting for creator confirmation.';
  if (view.phase === 'creator_confirmed') return 'Waiting for buyer confirmation.';
  return 'Both parties should review and confirm scope.';
}

export type NextBestAction = {
  title: string;
  detail: string;
  tone: 'neutral' | 'action' | 'success' | 'warn';
};

export function getWorkspaceNextAction(params: {
  role: 'buyer' | 'creator';
  order: OrderPipelineRow;
  proposal: ProjectProposalRow | null;
  deliverable: DeliverablePlaceholder | null;
}): NextBestAction {
  const { role, order, proposal, deliverable } = params;
  const agreement = getAgreementViewState(proposal);
  const ds = deliverable?.delivery_status;

  if (role === 'creator') {
    if (ds === 'revision_needed') {
      return {
        title: 'Respond to revision request',
        detail: 'Update your preview or delivery URLs and resubmit when the changes are ready.',
        tone: 'warn',
      };
    }
    if (agreement.phase === 'changes_requested') {
      return {
        title: 'Review requested agreement changes',
        detail: 'Check the change note, edit the draft if needed, then confirm when scope is clear.',
        tone: 'warn',
      };
    }
    if (agreement.phase !== 'confirmed') {
      return {
        title: 'Review agreement and confirm scope',
        detail: 'Read the Project Agreement below and confirm when scope, timeline, and delivery requirements are clear.',
        tone: 'action',
      };
    }
    if (order.order_status === 'in_review' && ds === 'submitted') {
      return {
        title: 'Waiting for buyer review',
        detail: 'Your delivery is with the buyer. They can accept or request a revision.',
        tone: 'neutral',
      };
    }
    if (!deliverable || ds === 'draft') {
      return {
        title: 'Start build and submit preview',
        detail: 'Use the Creator Brief and Build Checklist, then submit preview and delivery URLs when ready.',
        tone: 'action',
      };
    }
    if (order.order_status === 'completed' || ds === 'approved') {
      return {
        title: 'Project delivery approved',
        detail: 'Your delivery is approved or complete. Keep artifact links up to date if anything changes.',
        tone: 'success',
      };
    }
    return {
      title: 'Submit delivery package',
      detail: 'Ensure preview and live URLs are current, then save your deliverable submission.',
      tone: 'action',
    };
  }

  // buyer
  if (agreement.phase === 'changes_requested') {
    const note = proposal?.buyer_feedback?.trim();
    return {
      title: 'Review requested agreement changes',
      detail: note ?? 'Update the agreement draft or confirm once changes are resolved.',
      tone: 'warn',
    };
  }
  if (agreement.phase !== 'confirmed' && !agreement.buyerConfirmed) {
    return {
      title: 'Review and confirm agreement',
      detail: 'Confirm the Project Agreement when scope and timeline match what you expect.',
      tone: 'action',
    };
  }
  if (agreement.phase !== 'confirmed' && agreement.buyerConfirmed) {
    return {
      title: 'Waiting for creator confirmation',
      detail: 'You confirmed the agreement. The creator still needs to confirm before build is locked.',
      tone: 'neutral',
    };
  }
  if (buyerCanReviewDelivery(deliverable)) {
    return {
      title: 'Review delivery',
      detail: 'Open preview and final links in Deliverables & Handoff. Accept when ready or request a revision.',
      tone: 'action',
    };
  }
  if (ds === 'revision_needed') {
    return {
      title: 'Waiting for creator update',
      detail: 'Your revision request was sent. The creator will resubmit when changes are ready.',
      tone: 'neutral',
    };
  }
  if (order.order_status === 'completed' || deliverable?.delivery_status === 'approved') {
    return {
      title: 'Delivery accepted',
      detail: 'Your MicroBuild delivery was accepted. Save your live link and message your creator if needed.',
      tone: 'success',
    };
  }
  if (deliverable && ds === 'submitted' && order.order_status === 'in_review') {
    return {
      title: 'Creator submitted delivery',
      detail: 'Links are in Deliverables & Handoff. Review and accept when scope matches your agreement.',
      tone: 'action',
    };
  }
  if (['assigned', 'in_progress', 'in_review'].includes(order.order_status)) {
    return {
      title: 'Track build progress',
      detail: 'Your creator is working on scope. Message them if you need to share missing info.',
      tone: 'neutral',
    };
  }
  return {
    title: 'Message creator with missing info',
    detail: 'Use project chat if the brief needs clarification before build begins.',
    tone: 'neutral',
  };
}

export function deliverableBadgeLabel(
  order: OrderPipelineRow,
  deliverable: DeliverablePlaceholder | null,
): string {
  return handoffStatusLabel(order, deliverable);
}

export function formatWorkspaceDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

/** Grouped build checklist for workspace UI. */
export const BUILD_CHECKLIST_GROUPS: readonly { title: string; items: readonly string[] }[] = [
  {
    title: 'Understand scope',
    items: [
      'Understand buyer goal — align copy and structure with their stated outcome.',
      'Review business links — scan website/social noted on the request for tone and offerings.',
    ],
  },
  {
    title: 'Build page / workflow',
    items: [
      'Build page/funnel structure — sections match suggested MicroBuild type.',
      'Add form/CTA — primary conversion matches brief.',
      'Check mobile layout — readable tap targets and spacing.',
      'Add trust/review/proof sections — testimonials or placeholders where brief asks.',
    ],
  },
  {
    title: 'Test links / forms',
    items: ['Test links/forms — open preview and verify submissions route correctly.'],
  },
  {
    title: 'Submit preview',
    items: ['Submit preview — paste staging/preview URL for MicroBuild review.'],
  },
  {
    title: 'Submit delivery',
    items: ['Submit delivery — paste production/live URL when approved internally.'],
  },
];
