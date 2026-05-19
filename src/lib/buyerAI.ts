/**
 * MicroBuild — Buyer AI (Rule-Based)
 *
 * Rules-based buyer request intelligence used across:
 *   - /request form live preview
 *   - Buyer dashboard recommendations
 *   - Admin buyer request queue
 *
 * No external AI API calls. All scoring is deterministic from request data.
 */

// ─── Shared data shape ────────────────────────────────────────────────────────

/** Works with both form data (camelCase) and DB row snippets (snake_case) */
export interface BuyerRequestData {
  business_name?: string;
  industry?: string;
  build_type?: string;
  main_goal?: string;
  current_problem?: string;
  budget?: string | null;
  deadline?: string | null;
  style_notes?: string | null;
  website_social?: string | null;
  /** workflow-request-linking.sql */
  source_type?: string | null;
  source_workflow_title?: string | null;
  customization_notes?: string | null;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RequestPreview {
  recommendedBuild: string;
  readinessScore: number;
  readinessLabel: string;
  readinessColor: string;
  missingFields: string[];
  complexity: string;
  suggestedNextStep: string;
  estimatedPriceRange: string;
}

export interface RequestTimelineStage {
  id: string;
  label: string;
  description: string;
  active: boolean;
  done: boolean;
  color: string;
}

export interface BuyerDashboardAnalysis {
  recommendedBuild: string;
  recommendedReason: string;
  missingBusinessFields: string[];
}

// ─── Safe helpers ─────────────────────────────────────────────────────────────

function s(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb; }
function low(v: unknown): string { return s(v).toLowerCase(); }

// ─── Recommended build logic ──────────────────────────────────────────────────

const GOAL_MAP: [string[], string][] = [
  [['quote', 'pricing', 'price', 'estimate', 'lead', 'get quote'],      'Quote Funnel'],
  [['booking', 'appointment', 'schedule', 'book', 'calendar'],           'Booking Page'],
  [['review', 'google review', 'testimonial', 'star', 'reputation'],     'Review Booster'],
  [['package', 'option', 'tier', 'what do you offer', 'confus', 'choose'], 'Package Selector'],
  [['trust', 'before', 'after', 'show work', 'gallery', 'portfolio'],   'Before/After Trust Page'],
];

const INDUSTRY_MAP: [string[], string][] = [
  [['pool', 'hvac', 'landscap', 'roofing', 'plumb', 'electrician', 'painting', 'pressure wash', 'pest', 'gutter'], 'Quote Funnel'],
  [['auto detail', 'car wash', 'salon', 'spa', 'barbershop', 'nail', 'lash', 'estheti'],                             'Package Selector'],
  [['cleaning', 'house clean', 'maid', 'junk removal', 'move'],                                                       'Quote Funnel'],
  [['restaurant', 'catering', 'food', 'bakery'],                                                                       'Booking Page'],
  [['contractor', 'remodel', 'flooring', 'tile', 'drywall', 'handyman'],                                              'Quote Funnel'],
];

export function getRecommendedBuild(data: BuyerRequestData): { build: string; reason: string } {
  const src = low(data.source_type);
  const wfTitle = s(data.source_workflow_title);
  if ((src === 'workflow' || wfTitle) && s(data.build_type)) {
    return {
      build: s(data.build_type),
      reason:
        wfTitle ?
          `Anchored to reusable workflow “${wfTitle}”`
        : 'Based on your workflow customization request',
    };
  }

  const bt = low(data.build_type);
  if (bt && bt !== 'not sure' && bt !== '') {
    return { build: s(data.build_type), reason: 'Based on your selection' };
  }

  const text = `${low(data.main_goal)} ${low(data.current_problem)}`;
  for (const [keywords, build] of GOAL_MAP) {
    if (keywords.some((k) => text.includes(k))) {
      return { build, reason: 'Based on your stated goal and problem' };
    }
  }

  const ind = low(data.industry);
  for (const [keywords, build] of INDUSTRY_MAP) {
    if (keywords.some((k) => ind.includes(k))) {
      return { build, reason: `Common solution for ${s(data.industry, 'your industry')}` };
    }
  }

  return { build: 'Quote Funnel', reason: 'Best starting point for most local service businesses' };
}

// ─── Quote readiness ──────────────────────────────────────────────────────────

export function getQuoteReadiness(data: BuyerRequestData): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (s(data.business_name).length > 2)                                 score += 10;
  if (s(data.industry).length > 2)                                       score += 10;
  if (s(data.main_goal).length > 10)                                     score += 20;
  if (s(data.current_problem).length > 30)                               score += 20;
  const bt = s(data.build_type);
  if (bt && bt !== 'Not sure' && bt !== 'Not sure — recommend one')      score += 15;
  const bud = s(data.budget);
  if (bud && !bud.toLowerCase().includes('not sure'))                    score += 10;
  const dl = s(data.deadline);
  if (dl && !dl.toLowerCase().includes('no hard'))                       score += 10;
  if (s(data.website_social).length > 5)                                 score += 5;
  const cust = s(data.customization_notes);
  if (cust.length > 80)                                                  score += 10;
  else if (cust.length > 20)                                           score += 5;

  let label = 'Not ready';
  let color = '#ef4444';
  if (score >= 80) { label = 'Ready to quote';   color = '#00d478'; }
  else if (score >= 60) { label = 'Nearly ready'; color = '#63b3ed'; }
  else if (score >= 40) { label = 'Needs detail'; color = '#f9b032'; }
  else if (score >= 20) { label = 'Missing info'; color = '#f97316'; }

  return { score, label, color };
}

// ─── Missing info flags ───────────────────────────────────────────────────────

export function getMissingInfoFlags(data: BuyerRequestData): string[] {
  const flags: string[] = [];
  if (!s(data.business_name))                              flags.push('Business name missing');
  if (!s(data.industry))                                   flags.push('Industry / trade not specified');
  if (s(data.main_goal).length < 10)                       flags.push('Business goal is too vague or missing');
  if (s(data.current_problem).length < 30)                 flags.push('Problem description needs more detail');
  const bt = s(data.build_type);
  const workflowish = low(data.source_type) === 'workflow' || s(data.source_workflow_title).length > 0;
  if ((!bt || bt === 'Not sure' || bt === 'Not sure — recommend one') && !workflowish)
                                                           flags.push('Specific MicroBuild type not selected');
  if (!s(data.budget) || s(data.budget).toLowerCase().includes('not sure'))
                                                           flags.push('Budget range not provided');
  if (!s(data.deadline) || s(data.deadline).toLowerCase().includes('no hard'))
                                                           flags.push('No timeline indicated');
  if (!s(data.website_social))                             flags.push('Website or social link not provided');
  return flags;
}

// ─── Complexity rating ────────────────────────────────────────────────────────

export function getComplexityRating(data: BuyerRequestData): string {
  const bt = low(data.build_type);
  const goal = low(data.main_goal);

  if (bt === 'not sure' || bt === 'not sure — recommend one') return 'TBD — needs scoping';
  if (bt.includes('review')) return 'Simple';
  if (bt.includes('quote funnel') || bt.includes('booking')) return 'Standard';
  if (bt.includes('package') || bt.includes('before') || bt.includes('trust')) return 'Standard';

  const goalCount = [
    goal.includes('quote'), goal.includes('book'), goal.includes('review'),
    goal.includes('package'), goal.includes('trust'),
  ].filter(Boolean).length;

  if (goalCount > 1) return 'Complex — multiple goals';
  return 'Standard';
}

// ─── Price range ──────────────────────────────────────────────────────────────

export function getSuggestedPriceRange(data: BuyerRequestData): string {
  const bt = low(data.build_type);
  const complexity = getComplexityRating(data);

  if (bt.includes('review'))  return '$100–$200';
  if (bt.includes('quote'))   return complexity === 'Complex — multiple goals' ? '$250–$500' : '$150–$300';
  if (bt.includes('booking')) return '$150–$300';
  if (bt.includes('package')) return '$200–$400';
  if (bt.includes('trust') || bt.includes('before')) return '$200–$350';
  if (complexity === 'Complex — multiple goals') return '$350–$600+';
  return '$150–$350';
}

// ─── Priority score ───────────────────────────────────────────────────────────

export function getPriorityScore(data: BuyerRequestData): { score: number; label: string; color: string } {
  let score = 0;

  const bud = s(data.budget);
  if (bud.includes('$800+'))                         score += 30;
  else if (bud.includes('$400'))                     score += 25;
  else if (bud.includes('$200'))                     score += 20;
  else if (bud.includes('$100'))                     score += 15;
  else if (!bud || bud.toLowerCase().includes('not sure')) score += 5;

  const dl = s(data.deadline);
  if (dl.includes('ASAP') || dl.includes('week'))    score += 30;
  else if (dl.includes('1–2'))                       score += 20;
  else if (dl.includes('2–4'))                       score += 15;
  else                                               score += 5;

  const readiness = getQuoteReadiness(data);
  score += Math.floor(readiness.score * 0.4);

  let label = 'Low';
  let color = '#8a94a6';
  if (score >= 65)      { label = 'High';   color = '#00d478'; }
  else if (score >= 40) { label = 'Medium'; color = '#f9b032'; }

  return { score: Math.min(100, score), label, color };
}

// ─── Proposal angle ───────────────────────────────────────────────────────────

export function getProposalAngle(data: BuyerRequestData): string {
  const wf = s(data.source_workflow_title);
  const cust = s(data.customization_notes);
  if (wf) {
    const bn = s(data.business_name, 'your business');
    const tail =
      cust.length > 40 ?
        ` Buyer customization priorities: ${cust.slice(0, 220)}${cust.length > 220 ? '…' : ''}`
      : ' Gather any remaining brand assets and integrations early.';
    return `${bn} is customizing the reusable MicroBuild workflow “${wf}”.${tail}`;
  }
  const bt = low(data.build_type);
  const ind = low(data.industry);
  const goal = low(data.main_goal);
  const bn = s(data.business_name, 'your business');

  if (bt.includes('quote') || goal.includes('quote'))
    return `${bn} needs a frictionless way to capture lead info and set price expectations upfront. A clean quote funnel reduces ghost-after-quote behavior.`;
  if (bt.includes('review') || goal.includes('review'))
    return `${bn} has happy customers but isn't capturing reviews consistently. A review booster converts the post-job moment into a Google rating.`;
  if (bt.includes('booking') || goal.includes('book'))
    return `${bn} loses leads when they can't book instantly. A booking page converts traffic into scheduled appointments without phone tag.`;
  if (bt.includes('package') || goal.includes('package') || goal.includes('option'))
    return `${bn} is losing buyers who don't understand their service options. A package selector guides customers to the right tier before they call.`;
  if (bt.includes('trust') || bt.includes('before') || goal.includes('trust'))
    return `${bn} does great work but buyers can't see it. A before/after trust page builds credibility and converts skeptical visitors into callers.`;
  if (ind.includes('pool') || ind.includes('landscap') || ind.includes('hvac'))
    return `${bn} operates in a trust-first industry where a professional quote or booking page dramatically improves conversion from organic and social traffic.`;

  return `${bn} can capture more leads with a targeted landing page that matches their buyer's intent and converts traffic into a clear action.`;
}

// ─── Follow-up questions ──────────────────────────────────────────────────────

export function getFollowUpQuestions(data: BuyerRequestData): string[] {
  const flags = getMissingInfoFlags(data);
  const questions: string[] = [];

  if (flags.some((f) => f.includes('Budget')))
    questions.push('What budget range are you working with? Even a rough estimate helps us scope the right solution.');
  if (flags.some((f) => f.includes('timeline')))
    questions.push('Do you have a deadline or launch target? We want to make sure we can deliver on time.');
  if (flags.some((f) => f.includes('goal')))
    questions.push('What does success look like for this build? More calls, more bookings, more reviews?');
  if (flags.some((f) => f.includes('Problem')))
    questions.push("What's the biggest thing not working right now? The more specific, the better we can solve it.");
  if (!s(data.website_social))
    questions.push('Do you have a website, Google Business listing, or Instagram page we can reference?');
  if (!s(data.build_type) || low(data.build_type) === 'not sure')
    questions.push("Are you open to us recommending the specific build type based on your goal?");

  if (questions.length === 0) {
    questions.push('Do you have brand colors, fonts, or a design reference we should match?');
    questions.push("Is there a specific CTA you want visitors to take — call, text, book, or get a quote?");
    questions.push("Who is your ideal customer? (e.g. homeowners 35-60 in your city, property managers, etc.)");
  }

  return questions.slice(0, 5);
}

// ─── Creator brief summary ────────────────────────────────────────────────────

export function getCreatorBriefSummary(data: BuyerRequestData): string {
  const wf = s(data.source_workflow_title);
  const origin =
    wf ? `This request originated from reusable workflow: ${wf}.`
    : '';
  const { build } = getRecommendedBuild(data);
  const bn = s(data.business_name, 'Local business');
  const ind = s(data.industry, 'service industry');
  const goal = s(data.main_goal, 'generate leads');
  const problem = s(data.current_problem, 'No conversion from current traffic');

  return [
    origin,
    `Build a ${build} for ${bn} (${ind}).`,
    `Goal: ${goal}.`,
    `Problem: ${problem.slice(0, 200)}`,
    `Budget: ${s(data.budget, 'TBD')} · Timeline: ${s(data.deadline, 'TBD')}`,
    data.website_social ? `Reference: ${data.website_social}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Admin next action ────────────────────────────────────────────────────────

export function getAdminNextAction(data: BuyerRequestData, status?: string): string {
  const wfHint =
    low(data.source_type) === 'workflow' || s(data.source_workflow_title)
      ? '🧩 Workflow customization — reconcile customization_notes with the starter workflow deliverables before quoting. '
      : '';
  const readiness = getQuoteReadiness(data);
  const st = s(status, 'new');

  if (st === 'needs-more-info') return wfHint + 'Waiting for buyer response — follow up if no reply in 2 days';
  if (st === 'proposal-sent')   return wfHint + 'Proposal sent — follow up in 2–3 days if no response';
  if (st === 'in-progress')     return wfHint + 'Build in progress — check with creator for update';
  if (st === 'delivered')       return wfHint + 'Delivered — confirm buyer approval and close out';
  if (st === 'completed')       return wfHint + 'Completed — consider requesting a testimonial';

  if (readiness.score >= 70) return wfHint + 'Ready to prepare proposal — assign creator and send draft';
  if (readiness.score >= 45) return wfHint + 'Follow up for missing details before scoping';
  return wfHint + 'Send intake follow-up to fill gaps before quoting';
}

// ─── Request timeline stages ──────────────────────────────────────────────────

const TIMELINE_STAGES = [
  { id: 'new',            label: 'Submitted',       desc: 'Request received by MicroBuild team' },
  { id: 'in-review',      label: 'Under Review',    desc: 'Team is reviewing your request' },
  { id: 'needs-more-info',label: 'Needs More Info', desc: 'Team has questions for you' },
  { id: 'proposal-sent',  label: 'Proposal Ready',  desc: 'Scope and pricing confirmed' },
  { id: 'in-progress',    label: 'In Progress',     desc: 'Creator is building your MicroBuild' },
  { id: 'delivered',      label: 'Delivered',       desc: 'Build is ready for your review' },
  { id: 'completed',      label: 'Completed',       desc: 'Live and approved' },
];

const STAGE_ORDER = ['new','in-review','needs-more-info','proposal-sent','in-progress','delivered','completed'];

export function getRequestTimeline(status: string): RequestTimelineStage[] {
  const currentIdx = STAGE_ORDER.indexOf(status);
  return TIMELINE_STAGES.map((stage) => {
    const idx = STAGE_ORDER.indexOf(stage.id);
    const active = idx === currentIdx;
    const done   = idx < currentIdx;
    const color  = done ? '#00d478' : active ? '#63b3ed' : '#3a3d4a';
    return { ...stage, description: stage.desc, active, done, color };
  });
}

// ─── Full preview analysis (for form live preview) ────────────────────────────

export function previewBuyerRequest(data: BuyerRequestData): RequestPreview {
  const { build } = getRecommendedBuild(data);
  const readiness = getQuoteReadiness(data);
  const missing   = getMissingInfoFlags(data);
  const complexity = getComplexityRating(data);
  const priceRange = getSuggestedPriceRange(data);

  let nextStep = 'Fill in your goal and problem to get a recommendation.';
  if (readiness.score >= 70) nextStep = "You're ready to submit. We'll prepare a proposal within 1–2 business days.";
  else if (readiness.score >= 45) nextStep = `Add ${missing[0]?.toLowerCase() ?? 'more details'} to reach quote-ready status.`;
  else if (missing.length > 0) nextStep = `Start with: ${missing[0]}.`;

  return {
    recommendedBuild: build,
    readinessScore:   readiness.score,
    readinessLabel:   readiness.label,
    readinessColor:   readiness.color,
    missingFields:    missing,
    complexity,
    suggestedNextStep: nextStep,
    estimatedPriceRange: priceRange,
  };
}

// ─── Buyer dashboard analysis ─────────────────────────────────────────────────

export function analyzeBuyerDashboard(
  requests: BuyerRequestData[],
  latestRequest?: BuyerRequestData,
): BuyerDashboardAnalysis {
  const base = latestRequest ?? requests[0];
  const { build, reason } = base ? getRecommendedBuild(base) : { build: 'Quote Funnel', reason: 'Great starting point for most businesses' };

  const requestedTypes = new Set(requests.map((r) => low(r.build_type)));
  const untried = ['Quote Funnel','Booking Page','Review Booster','Package Selector','Before/After Trust Page']
    .filter((b) => !requestedTypes.has(b.toLowerCase()));

  const nextBuild = untried[0] ?? build;
  const nextReason = untried.length > 0
    ? `You haven't tried a ${nextBuild} yet — it's a common next step for businesses like yours`
    : reason;

  const missingBusinessFields: string[] = [];
  if (base) {
    if (!s(base.website_social))   missingBusinessFields.push('Website or social link');
    if (!s(base.budget))           missingBusinessFields.push('Budget range');
    if (!s(base.deadline))         missingBusinessFields.push('Project timeline');
  }

  return {
    recommendedBuild: nextBuild,
    recommendedReason: nextReason,
    missingBusinessFields,
  };
}
