import { useMemo } from 'react';
import type { AdminSectionId } from './adminSections';

export type CommandCenterRequestSnap = {
  id: string;
  status: string;
  applications_count?: number | null;
  application_status?: string | null;
  selected_creator_profile_id?: string | null;
};

export type CommandCenterAppSnap = {
  id: string;
  status: string;
  linked_creator_profile_id?: string | null;
};

export type CommandCenterOrderSnap = {
  id: string;
  order_status: string;
  creator_id?: string | null;
};

export type CommandCenterDeliverableSnap = {
  order_id: string;
  delivery_status?: string | null;
};

export type CommandCenterWorkflowSnap = {
  id: string;
  ai_review_status?: string | null;
  ai_risk_flags?: string[];
  workflow_status?: string | null;
};

export type CommandCenterEnrichedSnap = {
  row: CommandCenterRequestSnap & { business_name?: string };
  packet: {
    priorityLabel: string;
    quoteReadiness: string;
    missingInfoFlags: string[];
    leadQualityLabel: string;
  };
};

type AiCard = {
  id: string;
  count: number;
  title: string;
  explanation: string;
  action: string;
  section: AdminSectionId;
  tone: 'urgent' | 'warn' | 'info' | 'ok';
};

function toneClass(tone: AiCard['tone']): string {
  return `ai-cc-card ai-cc-card--${tone}`;
}

function safeLower(v: unknown): string {
  if (v == null) return '';
  return String(v).toLowerCase();
}

export default function AdminCommandCenter({
  enriched,
  applications,
  orders,
  deliverables,
  workflows,
  onNavigate,
}: {
  enriched: CommandCenterEnrichedSnap[];
  applications: CommandCenterAppSnap[];
  orders: CommandCenterOrderSnap[];
  deliverables: CommandCenterDeliverableSnap[];
  workflows: CommandCenterWorkflowSnap[];
  onNavigate: (section: AdminSectionId) => void;
}) {
  const pendingReview = applications.filter((a) => a.status === 'new' || a.status === 'reviewing');
  const needsMoreInfoApps = applications.filter((a) => a.status === 'needs_more_info');
  const profilelessApproved = applications.filter(
    (a) =>
      (a.status === 'active' || a.status === 'approved_pending_payment') &&
      !a.linked_creator_profile_id,
  );

  const highPriority = enriched.filter((e) => e.packet.priorityLabel === 'High');
  const needsFollowup = enriched.filter(
    (e) => e.packet.missingInfoFlags.length > 2 || e.packet.leadQualityLabel === 'Needs Detail',
  );
  const readyToQuote = enriched.filter(
    (e) =>
      e.packet.quoteReadiness.startsWith('Ready') || e.packet.quoteReadiness.startsWith('Nearly'),
  );

  const requestsWithApplicants = enriched.filter(
    (e) =>
      (typeof e.row.applications_count === 'number' ? e.row.applications_count : 0) > 0 &&
      !e.row.selected_creator_profile_id &&
      safeLower(e.row.application_status) !== 'creator_selected',
  );

  const unassignedProjects = orders.filter(
    (o) => !o.creator_id && !['completed', 'canceled', 'rejected'].includes(o.order_status),
  );
  const inProgressProjects = orders.filter((o) =>
    ['in_progress', 'assigned', 'ready_to_quote'].includes(o.order_status),
  );

  const deliverablesNeedingReview = deliverables.filter((d) => {
    const st = safeLower(d.delivery_status);
    return st === 'submitted' || st === 'in_review' || st === 'revision_needed';
  });

  const workflowsNeedingAi = workflows.filter((w) => {
    const st = safeLower(w.ai_review_status);
    return (
      st === 'needs_improvement' ||
      st === 'pending' ||
      (w.ai_risk_flags?.length ?? 0) > 0 ||
      safeLower(w.workflow_status) === 'draft'
    );
  });

  const riskFlagsCount =
    enriched.filter((e) => e.packet.missingInfoFlags.length > 0).length +
    workflows.filter((w) => (w.ai_risk_flags?.length ?? 0) > 0).length;

  const cards: AiCard[] = useMemo(() => {
    const list: AiCard[] = [];

    if (pendingReview.length > 0) {
      list.push({
        id: 'creator-review',
        count: pendingReview.length,
        title: 'Creator applications need review',
        explanation: 'New or in-review creator signups waiting for an admin decision.',
        action: 'Open Creator Applications',
        section: 'creators',
        tone: 'urgent',
      });
    }

    if (requestsWithApplicants.length > 0) {
      list.push({
        id: 'buyer-applicants',
        count: requestsWithApplicants.length,
        title: 'Buyer requests with applicants waiting',
        explanation: 'Creators applied; buyer selection is the default path — monitor for stuck requests.',
        action: 'Open Marketplace Applications',
        section: 'marketplace',
        tone: 'warn',
      });
    }

    if (highPriority.length > 0) {
      list.push({
        id: 'high-priority',
        count: highPriority.length,
        title: 'High-priority buyer requests',
        explanation: 'Rules-based scoring flagged urgency — review scope and marketplace status.',
        action: 'Open Buyer Requests',
        section: 'buyers',
        tone: 'urgent',
      });
    }

    if (needsFollowup.length > 0) {
      list.push({
        id: 'needs-followup',
        count: needsFollowup.length,
        title: 'Requests needing buyer/creator follow-up',
        explanation: 'Missing fields or weak lead detail — clarify before advancing the project.',
        action: 'Open Buyer Requests',
        section: 'buyers',
        tone: 'warn',
      });
    }

    if (unassignedProjects.length > 0) {
      list.push({
        id: 'unassigned',
        count: unassignedProjects.length,
        title: 'Projects without assigned creator',
        explanation: 'Orders exist but no creator is linked — use pipeline fallback assignment if buyer selection stalled.',
        action: 'Open Projects / Pipeline',
        section: 'pipeline',
        tone: 'urgent',
      });
    }

    if (inProgressProjects.length > 0) {
      list.push({
        id: 'in-progress',
        count: inProgressProjects.length,
        title: 'Projects in progress',
        explanation: 'Active builds — spot-check workspace and deliverable status.',
        action: 'Open Projects / Pipeline',
        section: 'pipeline',
        tone: 'info',
      });
    }

    if (deliverablesNeedingReview.length > 0) {
      list.push({
        id: 'deliverables',
        count: deliverablesNeedingReview.length,
        title: 'Deliverables needing review',
        explanation: 'Submissions or revisions awaiting admin approval or delivery marking.',
        action: 'Open Deliverables',
        section: 'deliverables',
        tone: 'warn',
      });
    }

    if (workflowsNeedingAi.length > 0) {
      list.push({
        id: 'workflows-ai',
        count: workflowsNeedingAi.length,
        title: 'Workflows needing AI improvement',
        explanation: 'Draft, flagged, or needs-improvement workflows — creators iterate first; admin is override only.',
        action: 'Open Published Workflows',
        section: 'workflows',
        tone: 'info',
      });
    }

    if (profilelessApproved.length > 0) {
      list.push({
        id: 'profileless',
        count: profilelessApproved.length,
        title: 'Approved creators missing profiles',
        explanation: 'Create or link creator profiles from the approval panel.',
        action: 'Open Creator Applications',
        section: 'creators',
        tone: 'urgent',
      });
    }

    if (needsMoreInfoApps.length > 0) {
      list.push({
        id: 'creator-needs-info',
        count: needsMoreInfoApps.length,
        title: 'Creator applications awaiting info',
        explanation: 'Applicants must respond before you can approve.',
        action: 'Open Creator Applications',
        section: 'creators',
        tone: 'info',
      });
    }

    if (readyToQuote.length > 0) {
      list.push({
        id: 'ready-scope',
        count: readyToQuote.length,
        title: 'Requests ready to scope (no proposal enforcement)',
        explanation: 'Quote readiness is high — proposal/payment workflow is deferred; focus on marketplace match and project creation.',
        action: 'Open Buyer Requests',
        section: 'buyers',
        tone: 'ok',
      });
    }

    if (riskFlagsCount > 0) {
      list.push({
        id: 'risks',
        count: riskFlagsCount,
        title: 'Risk flags / missing info',
        explanation: 'Aggregated missing buyer fields and workflow AI risk flags.',
        action: 'Review Buyer Requests & Workflows',
        section: 'buyers',
        tone: 'warn',
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'clear',
        count: 0,
        title: 'Nothing needs action right now',
        explanation: 'No urgent rules-based signals. Spot-check Platform Health or open queues when you want a manual pass.',
        action: 'View Platform Health',
        section: 'health',
        tone: 'ok',
      });
    }

    return list;
  }, [
    pendingReview.length,
    requestsWithApplicants.length,
    highPriority.length,
    needsFollowup.length,
    unassignedProjects.length,
    inProgressProjects.length,
    deliverablesNeedingReview.length,
    workflowsNeedingAi.length,
    profilelessApproved.length,
    needsMoreInfoApps.length,
    readyToQuote.length,
    riskFlagsCount,
  ]);

  const focus = useMemo(() => {
    const top = cards.find((c) => c.tone === 'urgent') ?? cards[0];
    if (!top || top.id === 'clear') {
      return 'No urgent items — use section tabs to drill into buyers, creators, projects, or workflows.';
    }
    return `${top.title} (${top.count}) — ${top.explanation}`;
  }, [cards]);

  return (
    <section className="admin-section admin-command-center" id="section-command">
      <CommandCenterHeader />
      <p className="admin-command-focus">
        <strong>Suggested focus today:</strong> {focus}
      </p>
      <div className="ai-cc-grid">
        {cards.map((card) => (
          <article key={card.id} className={toneClass(card.tone)}>
            <div className="ai-cc-count">{card.count}</div>
            <h3 className="ai-cc-card-title">{card.title}</h3>
            <p className="ai-cc-card-desc">{card.explanation}</p>
            <button type="button" className="ai-cc-card-btn" onClick={() => onNavigate(card.section)}>
              {card.action}
            </button>
          </article>
        ))}
      </div>
      <p className="admin-command-footnote">
        Rules-based only · live Supabase counts · no external AI API · proposal/pricing enforcement deferred
      </p>
    </section>
  );
}

function CommandCenterHeader() {
  return (
    <div className="admin-section-header">
      <h2>AI Command Center</h2>
      <span className="admin-section-badge">Rules-based</span>
    </div>
  );
}
