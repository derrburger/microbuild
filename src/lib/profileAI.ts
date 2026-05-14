/**
 * MicroBuild — Profile AI (Rule-Based)
 *
 * Generates rule-based profile quality analysis for creator profiles.
 * No external AI API calls. All scoring is deterministic from profile data.
 *
 * Used in:
 *   - Creator dashboard (self-view score + improvement list)
 *   - Admin creator review queue
 *   - Public profile quality gating
 */

import type { CreatorProfileRow } from '../types/database';

// ─── Safe accessors ────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileStrengthResult {
  /** 0–100 composite profile strength score. */
  score: number;
  /** Short label: Starter | Developing | Strong | Expert */
  label: 'Starter' | 'Developing' | 'Strong' | 'Expert';
  /** Percentage-like display value. */
  displayPct: number;
  /** Individual section scores (0–100 each). */
  sections: {
    identity: number;
    expertise: number;
    portfolio: number;
    credentials: number;
    availability: number;
  };
  /** Ordered list of missing/incomplete items to fix. */
  missingItems: string[];
  /** Ranked improvement suggestions. */
  improvements: string[];
  /** Positive strengths to highlight. */
  strengths: string[];
  /** Short paragraph summary for the creator to read. */
  summary: string;
  /** Risk flags for admin. */
  riskFlags: string[];
  /** Recommended badges based on current data. */
  recommendedBadges: string[];
  /** Verification path recommendation. */
  verificationPath: string;
}

export interface CreatorReadinessResult {
  /** Is this creator ready to take on paid work? */
  ready: boolean;
  /** 0–100 readiness score. */
  score: number;
  /** Human-readable verdict. */
  verdict: string;
  /** What's blocking readiness. */
  blockers: string[];
  /** Short admin review summary (1–3 sentences). */
  adminSummary: string;
}

// ─── Score section: Identity ──────────────────────────────────────────────────
// bio, display_name, avatar, GitHub/LinkedIn

function scoreIdentity(
  profile: Partial<CreatorProfileRow>,
): { score: number; missing: string[] } {
  let pts = 0;
  const missing: string[] = [];

  if (safeStr(profile.bio).length > 60) { pts += 30; }
  else if (safeStr(profile.bio).length > 0) { pts += 12; missing.push('Expand your bio (aim for 60+ characters)'); }
  else { missing.push('Write a bio describing your work and background'); }

  if (safeStr(profile.display_name)) { pts += 20; }
  else { missing.push('Set a display name'); }

  if (safeStr(profile.github_url)) { pts += 25; }
  else { missing.push('Add your GitHub profile link'); }

  if (safeStr(profile.linkedin_url)) { pts += 15; }
  else { missing.push('Add your LinkedIn profile'); }

  if (safeStr(profile.profile_photo_url)) { pts += 10; }
  else { missing.push('Upload a profile photo'); }

  return { score: Math.min(pts, 100), missing };
}

// ─── Score section: Expertise ─────────────────────────────────────────────────
// tools, niches, certifications, education

function scoreExpertise(
  profile: Partial<CreatorProfileRow>,
): { score: number; missing: string[] } {
  let pts = 0;
  const missing: string[] = [];
  const tools  = safeArr<string>(profile.tools);
  const niches = safeArr<string>(profile.niches);
  const certs  = safeArr<string>(profile.certifications);

  if (tools.length >= 5)       pts += 30;
  else if (tools.length >= 2)  pts += 18;
  else if (tools.length >= 1)  pts += 8;
  else missing.push('List the tools and platforms you work with');

  if (niches.length >= 3)      pts += 30;
  else if (niches.length >= 1) pts += 15;
  else missing.push('Specify your industry specializations');

  if (certs.length > 0)        pts += 20;
  else missing.push('Add any relevant certifications');

  if (safeStr(profile.education_or_coursework)) pts += 10;
  else missing.push('Mention relevant education or online coursework');

  if (safeStr(profile.case_studies).length > 100) pts += 10;
  else missing.push('Describe 1–2 specific projects with results');

  return { score: Math.min(pts, 100), missing };
}

// ─── Score section: Portfolio ─────────────────────────────────────────────────

function scorePortfolio(
  profile: Partial<CreatorProfileRow>,
): { score: number; missing: string[] } {
  let pts = 0;
  const missing: string[] = [];
  const links = safeArr<string>(profile.portfolio_links);

  if (links.length >= 3)       pts += 60;
  else if (links.length >= 2)  pts += 40;
  else if (links.length >= 1)  pts += 25;
  else missing.push('Add at least one portfolio link to show your work');

  if (links.length < 2 && links.length > 0) {
    missing.push('Add a second portfolio example for stronger credibility');
  }

  if (safeStr(profile.github_url)) pts += 20;
  if (safeStr(profile.case_studies).length > 50) pts += 20;
  else missing.push('Write a brief case study showing business impact');

  return { score: Math.min(pts, 100), missing };
}

// ─── Score section: Credentials ──────────────────────────────────────────────

function scoreCredentials(
  profile: Partial<CreatorProfileRow>,
): { score: number; missing: string[] } {
  let pts = 0;
  const missing: string[] = [];
  const credLinks = safeArr<string>(profile.credential_links);
  const proofLinks = safeArr<string>(profile.proof_links);
  const certs = safeArr<string>(profile.certifications);
  const tier  = safeStr(profile.tier, 'free');

  if (tier === 'free') {
    pts = 70; // Free tier — credentials not required for base score
  } else {
    if (credLinks.length > 0 || proofLinks.length > 0) { pts += 40; }
    else { missing.push('Add credential or proof links to support your tier level'); }

    if (certs.length > 0) { pts += 30; }
    else { missing.push('List any professional certifications'); }

    if (safeStr(profile.education_or_coursework)) { pts += 20; }
    if (safeStr(profile.github_url)) { pts += 10; }

    if (tier === 'verified' && credLinks.length === 0) {
      missing.push('Verified tier requires at least one credential link');
    }
  }

  return { score: Math.min(pts, 100), missing };
}

// ─── Score section: Availability ─────────────────────────────────────────────

function scoreAvailability(
  profile: Partial<CreatorProfileRow>,
): { score: number; missing: string[] } {
  let pts = 0;
  const missing: string[] = [];
  const hours = safeStr(profile.available_hours, '');

  if (hours.length > 0) { pts += 60; }
  else { missing.push('Set your weekly availability (e.g. "10–15 hrs/week")'); }

  // Extra credit for fulfilled builds
  const builds = safeNum(profile.completed_builds_count, 0);
  if (builds >= 10) pts += 40;
  else if (builds >= 3) pts += 20;
  else if (builds >= 1) pts += 10;

  return { score: Math.min(pts, 100), missing };
}

// ─── Composite scorer ─────────────────────────────────────────────────────────

export function analyzeProfileStrength(
  profile: Partial<CreatorProfileRow>,
): ProfileStrengthResult {
  const identity     = scoreIdentity(profile);
  const expertise    = scoreExpertise(profile);
  const portfolio    = scorePortfolio(profile);
  const credentials  = scoreCredentials(profile);
  const availability = scoreAvailability(profile);

  const tier = safeStr(profile.tier, 'free');

  // Weighted composite (total 100)
  const score = Math.round(
    identity.score * 0.20 +
    expertise.score * 0.25 +
    portfolio.score * 0.25 +
    credentials.score * 0.15 +
    availability.score * 0.15,
  );

  const label: ProfileStrengthResult['label'] =
    score >= 80 ? 'Expert'     :
    score >= 60 ? 'Strong'     :
    score >= 35 ? 'Developing' :
    'Starter';

  // Collect all missing items, deduplicated, ordered by section weight
  const allMissing = [
    ...portfolio.missing,
    ...identity.missing,
    ...expertise.missing,
    ...credentials.missing,
    ...availability.missing,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  // Strengths
  const strengths: string[] = [];
  if (identity.score >= 60)      strengths.push('Strong personal identity section');
  if (expertise.score >= 60)     strengths.push('Well-defined tools and niches');
  if (portfolio.score >= 60)     strengths.push('Portfolio examples provided');
  if (credentials.score >= 60)   strengths.push('Credentials are complete for your tier');
  if (availability.score >= 60)  strengths.push('Availability is clearly stated');
  if (safeNum(profile.completed_builds_count, 0) >= 5)
                                 strengths.push('Proven track record with completed builds');
  if (safeNum(profile.average_rating, 0) >= 4.5)
                                 strengths.push('Excellent rating from past clients');

  // Improvement suggestions (positively framed)
  const improvements: string[] = allMissing.slice(0, 5);

  // Risk flags (for admin view)
  const riskFlags: string[] = [];
  if (!safeStr(profile.bio))          riskFlags.push('No bio — profile will look incomplete publicly');
  if (safeArr(profile.portfolio_links).length === 0)
    riskFlags.push('No portfolio links — credibility is low');
  if (tier === 'verified' && safeArr(profile.credential_links).length === 0)
    riskFlags.push('Verified tier claimed but no credentials submitted');
  if (!safeStr(profile.available_hours))
    riskFlags.push('Availability not set — cannot estimate project fit');

  // Recommended badges
  const recommendedBadges: string[] = [];
  if (tier === 'verified' && safeStr(profile.verification_status) === 'verified') {
    recommendedBadges.push('Verified Creator ✓');
  } else if (tier === 'professional') {
    recommendedBadges.push('MicroBuild Pro');
  } else {
    recommendedBadges.push('MicroBuild Creator');
  }
  if (safeNum(profile.completed_builds_count, 0) >= 10) {
    recommendedBadges.push('10+ Builds');
  }
  if (safeNum(profile.average_rating, 0) >= 4.8) {
    recommendedBadges.push('Top Rated');
  }

  // Verification path
  const verificationPath =
    tier === 'verified'
      ? 'Submit credentials and proof links, then request admin verification.'
      : tier === 'professional'
      ? 'Build your portfolio to 3+ examples and complete 3+ paid projects to qualify for Verified.'
      : 'Complete 5+ projects and upgrade to Professional tier to unlock higher-paying work.';

  // Summary paragraph
  const name = safeStr(profile.display_name || profile.full_name, 'Your');
  const toolCount = safeArr(profile.tools).length;
  const nicheCount = safeArr(profile.niches).length;
  const summary = [
    `${name}'s profile scores ${score}/100 (${label}).`,
    toolCount > 0
      ? `You have ${toolCount} tool${toolCount !== 1 ? 's' : ''} listed`
        + (nicheCount > 0 ? ` and specialize in ${nicheCount} niche${nicheCount !== 1 ? 's' : ''}.` : '.')
      : 'Your expertise section is incomplete — add your tools and niches.',
    improvements.length > 0
      ? `Top next step: ${improvements[0].toLowerCase()}.`
      : 'Great work — your profile is well-rounded.',
  ].join(' ');

  return {
    score,
    label,
    displayPct: score,
    sections: {
      identity:    identity.score,
      expertise:   expertise.score,
      portfolio:   portfolio.score,
      credentials: credentials.score,
      availability: availability.score,
    },
    missingItems:     allMissing,
    improvements,
    strengths,
    summary,
    riskFlags,
    recommendedBadges,
    verificationPath,
  };
}

// ─── Creator readiness ────────────────────────────────────────────────────────

export function analyzeCreatorReadiness(
  profile: Partial<CreatorProfileRow>,
): CreatorReadinessResult {
  const strength = analyzeProfileStrength(profile);
  const blockers: string[] = [];

  if (safeArr(profile.portfolio_links).length === 0) {
    blockers.push('No portfolio links');
  }
  if (!safeStr(profile.bio)) {
    blockers.push('Bio is missing');
  }
  if (!safeStr(profile.available_hours)) {
    blockers.push('Availability not specified');
  }
  if (safeArr(profile.tools).length === 0) {
    blockers.push('No tools listed');
  }

  const ready = blockers.length === 0 && strength.score >= 40;
  const score = ready ? strength.score : Math.max(0, strength.score - blockers.length * 15);

  const verdict =
    score >= 75 ? 'Ready — strong candidate for project matching' :
    score >= 50 ? 'Nearly ready — minor gaps to address' :
    score >= 30 ? 'Developing — complete core sections before matching' :
    'Not ready — profile needs significant work';

  const name = safeStr(profile.display_name || profile.full_name, 'This creator');
  const tier = safeStr(profile.tier, 'free');
  const adminSummary = [
    `${name} is a ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier applicant scoring ${score}/100 on readiness.`,
    blockers.length > 0
      ? `Blockers: ${blockers.join(', ')}.`
      : 'No critical blockers found.',
    strength.riskFlags.length > 0
      ? `Admin flags: ${strength.riskFlags[0]}.`
      : 'Profile appears solid for approval.',
  ].join(' ');

  return { ready, score, verdict, blockers, adminSummary };
}

// ─── Section display helpers ──────────────────────────────────────────────────

export function getStrengthColor(score: number): string {
  if (score >= 80) return '#00d478';
  if (score >= 60) return '#63b3ed';
  if (score >= 35) return '#f9b032';
  return '#ef4444';
}

export function getStrengthBarWidth(score: number): string {
  return `${Math.max(4, score)}%`;
}
