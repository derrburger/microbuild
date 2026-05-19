/**
 * Rules-based applicant comparison for buyer review — no external APIs.
 */

import type { BuyerRequestRow, CreatorProfileRow, RequestApplicationRow } from '../types/database';
import type { BuyerApplicantResolved } from './marketplace';
import { creatorDisplayName, generateApplicantFitScore } from './marketplace';

function norm(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function lc(s: unknown): string {
  return norm(s).toLowerCase();
}

export interface BuyerApplicantReviewInsight {
  fitScore: number;
  strengths: string[];
  concerns: string[];
  recommendedBuyerDecision: string;
  timelineConfidenceLabel: string;
  timelineConfidenceScore: number;
  proposalClarityScore: number;
  /** Non-null when this applicant published the workflow behind a workflow-based request */
  originalWorkflowCreatorAdvantage: string | null;
}

function proposalClarity(app: RequestApplicationRow | BuyerApplicantResolved): number {
  const p = norm(app.proposal_message);
  let score = 35;
  if (p.length >= 400) score += 28;
  else if (p.length >= 120) score += 18;
  else if (p.length >= 40) score += 8;
  const sentences = p.split(/[.!?]+/).filter((x) => norm(x).length > 10);
  if (sentences.length >= 3) score += 12;
  if (/\d/.test(p)) score += 8;
  return Math.min(100, Math.max(15, score));
}

function timelineConfidence(
  app: RequestApplicationRow | BuyerApplicantResolved,
  creator: CreatorProfileRow | null,
): { label: string; score: number } {
  const tl = norm(app.estimated_timeline);
  let score = 40;
  if (tl.length >= 8) score += 15;
  if (/\d/.test(tl)) score += 12;
  if (/week|day|business/i.test(tl)) score += 10;
  const builds =
    typeof creator?.completed_builds_count === 'number' && isFinite(creator.completed_builds_count)
      ? creator.completed_builds_count
      : 0;
  if (builds >= 5) score += 15;
  else if (builds >= 1) score += 8;
  score = Math.min(100, Math.max(20, score));
  let label = 'Moderate';
  if (score >= 78) label = 'High';
  else if (score >= 55) label = 'Good';
  return { label, score };
}

export function analyzeApplicantForBuyerReview(
  app: RequestApplicationRow | BuyerApplicantResolved,
  creator: CreatorProfileRow | null,
  buyerRequest: Partial<BuyerRequestRow>,
): BuyerApplicantReviewInsight {
  const fitScore = generateApplicantFitScore(app, creator, buyerRequest ?? null);
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (fitScore >= 72) strengths.push('Strong overall fit score against your brief and creator signals.');
  else if (fitScore >= 55) strengths.push('Solid fit — worth comparing side-by-side with other applicants.');

  const vs = lc(creator?.verification_status);
  if (vs === 'verified') strengths.push('Verified creator profile.');

  const tier = lc(creator?.tier);
  if (tier === 'professional' || tier === 'verified') strengths.push(`Elevated tier (${tier || 'listed'}).`);

  if (typeof creator?.profile_strength_score === 'number' && creator.profile_strength_score >= 65) {
    strengths.push(`Healthy profile strength (${creator.profile_strength_score}/100).`);
  }

  const propLen = norm(app.proposal_message).length;
  if (propLen >= 120) strengths.push('Proposal explains approach with useful detail.');
  if (norm(app.fit_reason).length >= 40) strengths.push('Clear rationale for why they fit your MicroBuild.');

  const srcPid = norm(buyerRequest.source_creator_profile_id);
  const appPid = norm(creator?.id);
  let originalWorkflowCreatorAdvantage: string | null = null;
  const workflowBacked =
    lc(buyerRequest.source_type) === 'workflow' ||
    buyerRequest.requested_from_workflow === true ||
    Boolean(norm(buyerRequest.source_workflow_title));
  if (srcPid && appPid && srcPid === appPid && workflowBacked) {
    originalWorkflowCreatorAdvantage =
      'Published the reusable workflow you customized — likely fastest path to interpret customization notes and ship.';
    strengths.push(originalWorkflowCreatorAdvantage);
  }

  if (propLen < 60) concerns.push('Proposal is brief — confirm scope and expectations in Messages before selecting.');
  if (!norm(app.estimated_timeline)) concerns.push('No timeline stated — ask for a concrete delivery window.');
  if (app.proposed_price == null || norm(String(app.proposed_price)) === '') {
    concerns.push('No proposed price on file — clarify budget alignment.');
  }
  if (vs === 'unverified' || vs === '' || vs === 'pending') concerns.push('Verification still pending — weigh portfolio and messages.');
  if (typeof creator?.profile_strength_score === 'number' && creator.profile_strength_score < 45) {
    concerns.push('Profile strength is on the lower side — review public profile and samples.');
  }

  const { label: timelineConfidenceLabel, score: timelineConfidenceScore } = timelineConfidence(app, creator);
  const proposalClarityScore = proposalClarity(app);

  let recommendedBuyerDecision =
    'Compare applicants, use Messages for clarifications, then select the creator who best matches scope and timeline.';
  if (fitScore >= 78 && concerns.length <= 1) {
    recommendedBuyerDecision = 'Strong candidate — shortlist or select after a quick message thread if anything is unclear.';
  } else if (concerns.length >= 3) {
    recommendedBuyerDecision = 'Gather detail over Messages before committing — several gaps flagged below.';
  } else if (originalWorkflowCreatorAdvantage) {
    recommendedBuyerDecision =
      'Original workflow publisher is a strong default — still compare others if you want a different style or price.';
  }

  return {
    fitScore,
    strengths: strengths.slice(0, 6),
    concerns: concerns.slice(0, 6),
    recommendedBuyerDecision,
    timelineConfidenceLabel,
    timelineConfidenceScore,
    proposalClarityScore,
    originalWorkflowCreatorAdvantage,
  };
}

/** Compact ranking blurb for the expanded request panel */
export function summarizeApplicantRankingForBuyer(
  items: BuyerApplicantResolved[],
  buyerRequest: Partial<BuyerRequestRow>,
): string {
  if (!items.length) return 'No applicants to rank yet.';
  const scored = items.map((a) => ({
    app: a,
    score: generateApplicantFitScore(a, Array.isArray(a.creator_profiles) ? a.creator_profiles[0] ?? null : a.creator_profiles ?? null, buyerRequest),
  }));
  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  const name = creatorDisplayName(top.app.creator_profiles ?? null);
  return `Rules-based ranking: ${name} leads on fit (${top.score}/100). Compare timeline, price, and proposal clarity on each card before you select.`;
}
