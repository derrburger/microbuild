/**
 * MicroBuild — Rules-based workflow “AI” review (no external APIs).
 * Future: replace with Supabase Edge Functions + real model.
 */

import type {
  CreatorProfileRow,
  WorkflowAiPublishReadiness,
  WorkflowAiReviewStatus,
} from '../types/database';

export interface WorkflowReviewInput {
  title: string;
  category: string;
  targetIndustry: string;
  description: string;
  includedFeatures: string;
  setupRequirements: string;
  startingPrice: number | null;
  estimatedTurnaround: string;
  previewUrl: string;
  creatorProfile?: CreatorProfileRow | null;
}

export interface WorkflowAIAnalysis {
  qualityScore: number;
  missingItems: string[];
  riskFlags: string[];
  suggestedImprovements: string[];
  readinessLabel: WorkflowAiPublishReadiness;
  recommendedAction: string;
  aiReviewStatus: WorkflowAiReviewStatus;
  autoPublishEligible: boolean;
  summary: string;
}

function norm(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.trim();
}

function numPrice(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

/** Primary score 0–100 from checklist + optional creator bonus */
export function analyzeWorkflowQuality(input: WorkflowReviewInput): number {
  let score = 0;
  const title = norm(input.title);
  const cat = norm(input.category);
  const ind = norm(input.targetIndustry);
  const desc = norm(input.description);
  const feats = norm(input.includedFeatures);
  const setup = norm(input.setupRequirements);
  const turn = norm(input.estimatedTurnaround);
  const preview = norm(input.previewUrl);
  const price = numPrice(input.startingPrice);

  if (title.length >= 3) score += 10;
  if (cat.length >= 2) score += 10;
  if (ind.length >= 2) score += 10;
  if (desc.length >= 80) score += 15;
  else if (desc.length >= 40) score += 8;
  if (feats.length >= 40) score += 15;
  else if (feats.length >= 15) score += 8;
  if (setup.length >= 20) score += 10;
  else if (setup.length >= 8) score += 4;
  if (price != null && price >= 25 && price <= 75000) score += 10;
  else if (price != null && price > 0) score += 4;
  if (turn.length >= 3) score += 10;
  if (preview.length > 8 && /^https?:\/\//i.test(preview)) score += 10;

  const p = input.creatorProfile;
  if (p) {
    const tier = norm(p.tier).toLowerCase();
    if (tier === 'verified') score += 5;
    else if (tier === 'professional') score += 3;
    const vs = norm(p.verification_status).toLowerCase();
    if (vs === 'verified') score += 3;
    if (typeof p.profile_strength_score === 'number' && p.profile_strength_score >= 60) {
      score += Math.min(5, Math.round(p.profile_strength_score / 25));
    }
  }

  return Math.min(100, Math.max(0, score));
}

export function getWorkflowMissingItems(input: WorkflowReviewInput): string[] {
  const out: string[] = [];
  const title = norm(input.title);
  const cat = norm(input.category);
  const ind = norm(input.targetIndustry);
  const desc = norm(input.description);
  const feats = norm(input.includedFeatures);
  const setup = norm(input.setupRequirements);
  const turn = norm(input.estimatedTurnaround);
  const preview = norm(input.previewUrl);
  const price = numPrice(input.startingPrice);

  if (title.length < 3) out.push('Short or missing title');
  if (cat.length < 2) out.push('Category not specified');
  if (ind.length < 2) out.push('Target industry not specified');
  if (desc.length < 80) out.push('Description should explain outcomes and scope (aim for 80+ characters)');
  if (feats.length < 40) out.push('Included deliverables / features need more detail');
  if (setup.length < 20) out.push('Setup requirements from the buyer are unclear');
  if (price == null || price <= 0) out.push('Starting price missing');
  else if (price < 25) out.push('Starting price looks too low — clarify what is included');
  if (turn.length < 3) out.push('Estimated turnaround missing');
  if (!/^https?:\/\//i.test(preview)) out.push('Live preview or demo URL helps buyers trust the workflow');
  return out;
}

const PAYMENT_OUTSIDE_RE =
  /\b(venmo|zelle|cash ?app|paypal\.me|wire transfer|paypal friends|pay outside|off[- ]platform)\b/i;

const UNSUPPORTED_RE =
  /\b(guaranteed\s+#?1|100%\s+(success|roi)|instant\s+ranking|make\s+\$\d|\bmillion\b|\bdouble\s+your\b)\b/i;

export function getWorkflowRiskFlags(input: WorkflowReviewInput): string[] {
  const flags: string[] = [];
  const title = norm(input.title);
  const desc = norm(input.description);
  const feats = norm(input.includedFeatures);
  const setup = norm(input.setupRequirements);
  const turn = norm(input.estimatedTurnaround);
  const preview = norm(input.previewUrl);
  const price = numPrice(input.startingPrice);
  const blob = `${title}\n${desc}\n${feats}`;

  if (desc.length > 0 && desc.length < 50 && feats.length < 20) {
    flags.push('Vague description — scope and deliverables are unclear');
  }
  if (feats.length < 25) {
    flags.push('No clear deliverables listed');
  }
  if (price != null && (price < 15 || price > 120000)) {
    flags.push('Unrealistic or unclear pricing — verify what is included');
  }
  if (
    (/\b(same\s*day|within\s*hours?|1\s*h(r|our))\b/i.test(turn) && desc.length + feats.length > 400)
    || (() => {
      const m = turn.match(/\b(\d+)\s*(minute|min)s?\b/i);
      return m && feats.length > 200 && Number(m[1]) < 120;
    })()
  ) {
    flags.push('Turnaround may be unrealistic for the stated scope');
  }
  if (setup.length < 12 && feats.length > 80) {
    flags.push('Missing setup requirements — buyers need to know what access you require');
  }
  if (!/^https?:\/\//i.test(preview) && desc.length > 60) {
    flags.push('No preview / proof link — add a demo or reference build');
  }
  if (UNSUPPORTED_RE.test(blob)) {
    flags.push('Unsupported or hype claims detected — keep promises factual');
  }
  if (title.length + desc.length + feats.length < 80) {
    flags.push('Duplicate or near-empty workflow');
  }
  if (PAYMENT_OUTSIDE_RE.test(blob)) {
    flags.push('External or off-platform payment language — remove before publishing');
  }
  const caps = (blob.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (caps > 6 || /(.)\1{6,}/i.test(title + desc)) {
    flags.push('Spammy or unsafe formatting detected');
  }

  return [...new Set(flags)];
}

export function getWorkflowReadinessLabel(
  score: number,
  riskFlags: string[],
): WorkflowAiPublishReadiness {
  if (riskFlags.length > 0) return 'needs_work';
  if (score >= 85) return 'public_ready';
  if (score >= 70) return 'ready';
  if (score >= 50) return 'needs_work';
  return 'not_ready';
}

export function getWorkflowRecommendedAction(
  score: number,
  riskFlags: string[],
  missing: string[],
): string {
  if (riskFlags.length > 0) {
    return 'Address risk flags before submitting again — workflows with risks stay hidden from buyers.';
  }
  if (score >= 85 && missing.length === 0) {
    return 'Strong workflow — eligible for automatic publish after AI review.';
  }
  if (score >= 70) {
    return 'AI approved — you may publish when ready, or tighten copy to aim for instant publish next time.';
  }
  if (score >= 50) {
    return 'Needs improvement — update missing fields and clarify deliverables, then run review again.';
  }
  return 'Not ready — expand description, pricing, turnaround, and proof links before review.';
}

export function getWorkflowSuggestedImprovements(
  missing: string[],
  riskFlags: string[],
): string[] {
  const tips: string[] = [];
  if (missing.includes('Description should explain outcomes and scope (aim for 80+ characters)')) {
    tips.push('Add a concise paragraph: who it is for, what ships, and what the buyer receives.');
  }
  if (missing.some((m) => m.includes('deliverables'))) {
    tips.push('Bullet the concrete outputs (pages, automations, integrations, assets).');
  }
  if (missing.some((m) => m.includes('Setup requirements'))) {
    tips.push('State what access you need (domain, hosting, brand assets, API keys).');
  }
  if (missing.some((m) => m.includes('preview'))) {
    tips.push('Link to a staging demo, Loom, or portfolio slice that matches this workflow.');
  }
  for (const r of riskFlags) {
    if (r.includes('payment')) tips.push('Remove off-platform payment wording — checkout will live on MicroBuild later.');
    if (r.includes('Unrealistic')) tips.push('Adjust turnaround or narrow scope so timelines are credible.');
  }
  if (tips.length === 0 && missing.length > 0) {
    tips.push('Work through the missing checklist items above.');
  }
  return [...new Set(tips)];
}

export function shouldAutoApproveWorkflow(score: number, riskFlags: string[]): boolean {
  return riskFlags.length === 0 && score >= 70;
}

export function shouldAutoPublishWorkflow(score: number, riskFlags: string[]): boolean {
  return riskFlags.length === 0 && score >= 85;
}

function reviewStatusFromScore(score: number, riskFlags: string[]): WorkflowAiReviewStatus {
  if (riskFlags.length > 0) return 'risk_flagged';
  if (score >= 70) return 'ai_approved';
  return 'needs_improvement';
}

export function buildWorkflowAISummary(input: WorkflowReviewInput, analysis: WorkflowAIAnalysis): string {
  const title = norm(input.title) || 'This workflow';
  const rs = analysis.aiReviewStatus.replace(/_/g, ' ');
  return `${title}: rules-based score ${analysis.qualityScore}/100; status ${rs}; readiness ${analysis.readinessLabel.replace(/_/g, ' ')}. ${analysis.recommendedAction}`;
}

/** Full analysis bundle for persisting to published_workflows */
export function runWorkflowAIReview(input: WorkflowReviewInput): WorkflowAIAnalysis {
  const baseScore = analyzeWorkflowQuality(input);
  const missing = getWorkflowMissingItems(input);
  const riskFlags = getWorkflowRiskFlags(input);
  const readinessLabel = getWorkflowReadinessLabel(baseScore, riskFlags);
  const aiReviewStatus = reviewStatusFromScore(baseScore, riskFlags);
  const autoPublishEligible = shouldAutoPublishWorkflow(baseScore, riskFlags);

  const suggested = getWorkflowSuggestedImprovements(missing, riskFlags);
  const recommendedAction = getWorkflowRecommendedAction(baseScore, riskFlags, missing);

  const draft: WorkflowAIAnalysis = {
    qualityScore: baseScore,
    missingItems: missing,
    riskFlags,
    suggestedImprovements: suggested,
    readinessLabel,
    recommendedAction,
    aiReviewStatus,
    autoPublishEligible,
    summary: '',
  };
  draft.summary = buildWorkflowAISummary(input, draft);
  return draft;
}
