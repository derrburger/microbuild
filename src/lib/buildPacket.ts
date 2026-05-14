/**
 * buildPacket.ts — Rules-based AI Build Packet generator (MVP).
 *
 * Produces a structured creative brief from buyer request form data using
 * deterministic template logic. No external API calls are made.
 *
 * All UI surfaces label this as:
 *   "AI-style operations preview — rules-based MVP version"
 *
 * Phase 3 upgrade path: replace generateBuildPacket() with a call to a
 * Supabase Edge Function that invokes GPT-4o server-side. The
 * GeneratedBuildPacket interface shape is intentionally stable so no UI
 * changes are needed when the real AI backend is wired.
 *
 * NO AI API KEYS belong in this file or in any frontend file.
 */

import type { BuyerRequest } from '../types';

// ─── Exported score types ─────────────────────────────────────────────────────

export type UrgencyRating    = 'High' | 'Medium' | 'Low' | 'Not specified';
export type ComplexityRating = 'Low' | 'Medium' | 'High';
export type RevenueRating    = 'High' | 'Medium-High' | 'Medium' | 'Low-Medium' | 'Low' | 'Unknown';
export type QualityLabel     = 'Strong' | 'Good' | 'Fair' | 'Needs Detail';
export type PriorityLabel    = 'Low' | 'Medium' | 'High';
export type FitRating        = 'Weak' | 'Okay' | 'Good' | 'Strong';

// ─── Full packet interface ────────────────────────────────────────────────────

export interface GeneratedBuildPacket {
  // ── Business context ──────────────────────────────────────────────────────
  businessSummary: string;
  targetAudience: string;
  problem: string;
  aiSummary: string;

  // ── Build recommendation ──────────────────────────────────────────────────
  recommendedBuild: string;
  whyThisBuildFits: string;
  suggestedPageSections: string[];

  // ── Creative brief ────────────────────────────────────────────────────────
  ctaStrategy: string;
  suggestedCopyDirection: string;
  designDirection: string;

  // ── Technical brief ───────────────────────────────────────────────────────
  formFields: string[];
  automationNeeds: string;

  // ── Delivery & admin ─────────────────────────────────────────────────────
  creatorInstructions: string;
  suggestedProposalAngle: string;
  proposalDraft: string;
  qualityChecklist: string[];
  launchChecklist: string[];

  // ── Admin intelligence ────────────────────────────────────────────────────
  adminNextAction: string;
  priorityLabel: PriorityLabel;
  fitRating: FitRating;
  leadQualityScore: number;        // 0–100
  leadQualityLabel: QualityLabel;
  urgencyRating: UrgencyRating;
  complexityRating: ComplexityRating;
  revenuePotentialRating: RevenueRating;
  missingInfoFlags: string[];
  riskFlags: string[];
  followUpQuestions: string[];
}

// ─── Static lookup tables ─────────────────────────────────────────────────────

const suggestedFormFields: Record<string, string[]> = {
  'Quote Funnel': [
    'Service type or project scope (dropdown or multi-select)',
    'Size / quantity inputs (sq ft, units, pool size, room count, etc.)',
    'Location or zip code (service area check)',
    'Preferred contact time',
    'Name, email, phone (gates the quote reveal)',
  ],
  'Booking Page': [
    'Service selection (dropdown or visual cards)',
    'Preferred date and time (calendar picker)',
    'Address or service area',
    'Name, email, phone',
    'Notes or special requests (optional)',
  ],
  'Review Booster': [
    'Star rating selector (large tap targets, 1–5)',
    'Short feedback text (optional — shown for 1–3 star only)',
    'Customer name (optional)',
  ],
  'Trust Page': [
    'Before/after image pairs (static content — up to 6 pairs)',
    'Customer testimonial quotes (2–4)',
    'Star rating display (pulled from owner input)',
    'CTA destination link (booking page, phone, or form)',
  ],
  'Package Selector': [
    'Vehicle or project type selector (sedan, SUV, truck, etc.)',
    'Package tier choice (visual side-by-side cards)',
    'Add-on checkboxes with individual prices',
    'Running total display (updates on add-on selection)',
    'Booking or contact destination per package',
  ],
};

const suggestedPageSections: Record<string, string[]> = {
  'Quote Funnel': [
    'Header — business logo, short trust line ("Get your quote in 60 seconds")',
    'Step 1 — Service type question (2–4 options)',
    'Step 2 — Scope question (size, quantity, condition)',
    'Step 3 — Location or service area',
    'Lead capture gate — name, email, phone before quote',
    'Quote reveal screen — estimate range + instant booking CTA',
    'Thank-you screen — confirmation message + next step',
  ],
  'Booking Page': [
    'Hero — headline + brief social proof ("100+ customers served")',
    'Service selector — what are they booking?',
    'Calendar + time picker — available slots only',
    'Contact details form — name, email, phone, address',
    'Confirmation screen — booking summary + what to expect',
  ],
  'Review Booster': [
    'Business header — name, logo, "How did we do?"',
    'Star rating selector — large, mobile-friendly',
    'Happy path (4–5 stars) — "Thank you! Please share your experience:" + Google link',
    'Unhappy path (1–3 stars) — private feedback form (sent to owner only)',
    'Thank-you screen — "Thanks for your feedback" message',
  ],
  'Trust Page': [
    'Hero — business name, tagline, star rating, CTA',
    'Before/after gallery — image slider or grid (3–6 pairs)',
    'Testimonials section — 2–4 customer quotes with names',
    'Why us — 3–4 service highlights with icons',
    'Final CTA — high-contrast button (quote / book / call)',
  ],
  'Package Selector': [
    'Hero — "Find the right package for your [vehicle/project]"',
    'Vehicle or project type selector (filter)',
    'Package cards — side-by-side with included items and prices',
    'Add-on section — checkboxes with price deltas + running total',
    '"Book Now" CTA per package — routes to booking tool',
  ],
};

const ctaStrategies: Record<string, string> = {
  'Quote Funnel':
    'Gate the price estimate behind a lead form. Reveal the quote only after name, email, and phone are captured. ' +
    'On the reveal screen, the primary CTA should be action-oriented: "Book Your Free Estimate", "Claim Your Quote", or "Get Scheduled Today." ' +
    'Avoid generic "Contact Us" — it reduces conversion by ~40% vs. a specific CTA.',
  'Booking Page':
    'Single-goal page — every element drives toward the calendar. Minimize clicks: service → date → details → confirm. ' +
    'Show one trust signal above the fold (number of jobs completed, years in business, or average rating). ' +
    'Never route the user to a general contact page — each booking type should have its own destination.',
  'Review Booster':
    'Make the 5-star tap feel natural and obvious. Use warm, positive framing: "Tell us how we did." ' +
    'The Google review link should open in a new tab immediately — no intermediate steps. ' +
    'CTA copy: "Share Your Experience" (high stars) vs. "Let us make it right" (low stars).',
  'Trust Page':
    'One strong CTA at the end, above the fold, and possibly floating. ' +
    'Use specific action copy tied to the before/after proof: "Get Results Like These", "Book Your [Service] Today." ' +
    'Include a trust indicator near the CTA (star count, years in business, or job count).',
  'Package Selector':
    'Highlight one package as "Most Popular" or "Best Value." ' +
    '"Book Now" buttons belong on each individual package card — never route to a generic contact form. ' +
    'Show price savings for higher tiers. Add-on upsells should appear inline, not on a separate page.',
};

const automationNeeds: Record<string, string> = {
  'Quote Funnel':
    'Email notification to business owner on every lead (include: name, email, phone, service type, estimate range). ' +
    'Auto-reply to lead with their estimate and a "Book Now" link. ' +
    'Optional: route to CRM (HubSpot, Jobber, etc.) via webhook.',
  'Booking Page':
    'Confirmation email to customer (booking summary, time, address). ' +
    'Notification email to business owner with full booking details. ' +
    'Optional: Google Calendar invite via Calendly integration or calendar link.',
  'Review Booster':
    'Conditional route: 4–5 stars → immediate redirect to Google Business review URL. ' +
    '1–3 stars → private feedback form, sends to business email (NOT posted publicly). ' +
    'Optional: track star rating submissions in a spreadsheet via Zapier.',
  'Trust Page':
    'Static display page — no form automation required. ' +
    'CTA button routes to business\'s existing booking page, contact form, or phone link. ' +
    'Optional: "Share this page" button with UTM tracking link for referral measurement.',
  'Package Selector':
    '"Book Now" CTA per package routes to the business\'s existing booking tool (Calendly, Square, Jobber). ' +
    'Optional: send package selection summary to business owner by email when customer clicks Book Now.',
};

const designDirections: Record<string, string> = {
  'Quote Funnel':
    'Step-by-step wizard format — one question per screen, progress bar at top. ' +
    'Mobile-first. Card-based answer selections (tappable, not radio buttons). ' +
    'Business logo top-left. Green or brand accent for primary CTAs. ' +
    'Quote reveal screen: large bold estimate, secondary text "Final price confirmed after on-site visit."',
  'Booking Page':
    'Clean, minimal — one goal per page. Calendar takes center stage. ' +
    'Business logo header. Muted background, strong contrast for available time slots. ' +
    'No navigation links or distractions — this is a conversion page.',
  'Review Booster':
    'Friendly, warm tone. Large star icons (minimum 48px tap targets). ' +
    'Business name and logo prominent — customer needs to know whose review they\'re leaving. ' +
    'Green for positive feedback path. Neutral for private feedback.',
  'Trust Page':
    'Bold full-width hero with a strong headline. Before/after images: slider on desktop, swipe cards on mobile. ' +
    'Testimonial cards: name, one-sentence quote, star rating. ' +
    'High-contrast final CTA — should feel like the natural next step after seeing the work.',
  'Package Selector':
    'Side-by-side package cards on desktop, vertical stack on mobile. ' +
    'Recommended tier highlighted with a colored border or badge. ' +
    'Running total updates in real time (sticky summary on mobile).',
};

const qualityChecklists: Record<string, string[]> = {
  'Quote Funnel': [
    '□  All 3–5 quote questions functional with correct skip-logic',
    '□  Price estimate displays correctly for every input combination',
    '□  Lead capture form gates the quote reveal (no bypass)',
    '□  Email notification fires on every submission — test with a real address',
    '□  Mobile layout tested on iOS Safari and Chrome Android',
    '□  Business logo, brand colors, and contact info applied correctly',
    '□  Thank-you message and next step are clear',
    '□  Form loads in under 2 seconds on 4G',
  ],
  'Booking Page': [
    '□  Calendar shows correct available dates and times',
    '□  Booking confirmation email sends to customer — test with real address',
    '□  Business notification email sends — test with real address',
    '□  Address/service area input validates correctly',
    '□  Mobile layout is tap-friendly — all buttons minimum 44px',
    '□  Logo and branding applied correctly',
    '□  Redirect or thank-you message shows after successful booking',
    '□  No blocked time slots shown as available',
  ],
  'Review Booster': [
    '□  4–5 star selection redirects to the correct Google review URL',
    '□  1–3 star selection shows the private feedback form (not Google)',
    '□  Private feedback email sends to business owner — test both paths',
    '□  Page loads in under 1.5s — this is shared via text message',
    '□  Star tap targets are large enough on mobile (≥ 48px)',
    '□  Business name and branding are correct and recognizable',
    '□  No dead links — Google review URL is live and tested',
  ],
  'Trust Page': [
    '□  All before/after image pairs load correctly on all devices',
    '□  Testimonial quotes display with correct attribution',
    '□  Star rating display is accurate',
    '□  CTA button routes to the correct destination URL',
    '□  Mobile gallery layout scrolls smoothly — no layout shift',
    '□  OpenGraph meta tags set — page shows correct title/image when shared',
    '□  Page load time under 3s (image optimization checked)',
  ],
  'Package Selector': [
    '□  All packages show correct names, descriptions, and prices',
    '□  Add-on checkboxes update the running total correctly',
    '□  Vehicle/project type selector filters correctly',
    '□  Each "Book Now" CTA routes to the correct destination',
    '□  Mobile card layout is scrollable and readable',
    '□  Recommended package badge/highlight is visible',
    '□  Branding applied: logo, color scheme, business name',
  ],
};

const launchChecklists: Record<string, string[]> = {
  'Quote Funnel': [
    '☑  Update Instagram bio link to the quote funnel URL',
    '☑  Add the URL to your Google Business "website" field',
    '☑  Send 3 test submissions and confirm email notifications arrive',
    '☑  Reply to the first 10 leads within 1 hour to benchmark response rate',
    '☑  Share the link in your next Instagram story: "Get an instant quote →"',
  ],
  'Booking Page': [
    '☑  Set your calendar availability for the next 4 weeks',
    '☑  Send a test booking to confirm all emails send correctly',
    '☑  Update Instagram bio and Google Business with the booking link',
    '☑  Add the link as your SMS auto-reply for new inquiries',
    '☑  Confirm time zone is correct in your calendar settings',
  ],
  'Review Booster': [
    '☑  Confirm your Google review link is live and accepts new reviews',
    '☑  Test the happy path (5 stars → Google redirect)',
    '☑  Test the unhappy path (2 stars → private feedback email received)',
    '☑  Add the review link to your post-job text message template',
    '☑  Send it to your last 10 completed customers this week',
  ],
  'Trust Page': [
    '☑  Upload your 3–6 strongest before/after image pairs',
    '☑  Add 2–4 real customer testimonials with first names',
    '☑  Set the correct CTA destination URL',
    '☑  Share on Instagram stories and in your bio link',
    '☑  Test that the page renders correctly when shared on Facebook',
  ],
  'Package Selector': [
    '☑  Confirm all prices match your current pricing',
    '☑  Test each "Book Now" CTA routes correctly',
    '☑  Update Instagram bio link',
    '☑  Set your auto-DM reply to include the selector link',
    '☑  Send to 5 recent customers for feedback before full launch',
  ],
};

const whyThisBuildFits: Record<string, (form: BuyerRequest) => string> = {
  'Quote Funnel': (f) =>
    `A Quote Funnel is the strongest match for ${f.businessName} because their goal is "${f.mainGoal}." ` +
    `${f.industry} businesses typically lose 60–80% of website visitors before any contact is made — ` +
    `a quote funnel captures contact details and delivers an instant estimate before the visitor leaves. ` +
    `This directly addresses: "${f.currentProblem.slice(0, 100)}${f.currentProblem.length > 100 ? '…' : ''}"`,
  'Booking Page': (f) =>
    `A Booking Page is the right fit for ${f.businessName} because their goal is "${f.mainGoal}." ` +
    `${f.industry} businesses with consistent service types benefit from eliminating the friction between ` +
    `"interested visitor" and "confirmed appointment." A booking page removes back-and-forth scheduling ` +
    `and solves: "${f.currentProblem.slice(0, 100)}${f.currentProblem.length > 100 ? '…' : ''}"`,
  'Review Booster': (f) =>
    `A Review Booster is ideal for ${f.businessName} because ${f.industry} businesses depend heavily on ` +
    `Google review count and rating when customers compare locally. ` +
    `The stated goal — "${f.mainGoal}" — is best served by a frictionless post-job review flow. ` +
    `This addresses: "${f.currentProblem.slice(0, 90)}${f.currentProblem.length > 90 ? '…' : ''}"`,
  'Trust Page': (f) =>
    `A Trust Page fits ${f.businessName} because ${f.industry} is a visually-evaluated service — ` +
    `customers choose based on seeing proof of the work. The goal "${f.mainGoal}" is best achieved by ` +
    `showing before/after evidence with testimonials and a clear call to action. ` +
    `Addresses: "${f.currentProblem.slice(0, 90)}${f.currentProblem.length > 90 ? '…' : ''}"`,
  'Package Selector': (f) =>
    `A Package Selector is right for ${f.businessName} because "${f.mainGoal}" implies customers ` +
    `need to self-select before committing. ${f.industry} businesses with tiered services reduce ` +
    `pre-booking questions significantly when customers self-sort. ` +
    `Solves: "${f.currentProblem.slice(0, 90)}${f.currentProblem.length > 90 ? '…' : ''}"`,
};

const buildTypeFollowUpQuestions: Record<string, string[]> = {
  'Quote Funnel': [
    'What specific services will be quoted through this funnel?',
    'Do you already have a pricing structure, or should we suggest estimate ranges?',
    'Where will most traffic come from — Instagram, Google, or direct sharing?',
    'Do you have a business logo and brand colors ready to apply?',
    'What is the one thing that stops people from contacting you today?',
  ],
  'Booking Page': [
    'What services will customers be able to book through this page?',
    'Do you already use a calendar tool (Calendly, Square, Jobber)?',
    'What are your typical available days and hours?',
    'Do you serve a specific geographic area or city?',
    'How many bookings per week do you typically handle?',
  ],
  'Review Booster': [
    'What is your Google Business listing URL? (Needed for the 5-star redirect)',
    'How do you currently ask customers for reviews — text, email, or in person?',
    'Which email should receive the private unhappy-customer feedback?',
    'How many jobs do you complete per week on average?',
    'Do you have a business logo and name spelling to include on the page?',
  ],
  'Trust Page': [
    'Can you provide 3–6 before/after image pairs from recent completed jobs?',
    'Do you have 2–4 real customer testimonials with first names you can share?',
    'Where should the main CTA button route — booking page, phone, or contact form?',
    'Do you have a brand color palette or logo file to use?',
    'Is this page primarily for Instagram traffic, Google traffic, or warm-lead sharing?',
  ],
  'Package Selector': [
    'What are the names and prices of each service package you want to display?',
    'What vehicle or project types will customers be selecting between?',
    'What optional add-ons do you offer, and what does each cost?',
    'Where should each "Book Now" CTA button route?',
    'Should customers see a running total as they add options?',
  ],
};

const proposalAngles: Record<string, (f: BuyerRequest) => string> = {
  'Quote Funnel': (f) =>
    `We'll build a mobile-first quote funnel for ${f.businessName} that captures ${f.industry} leads ` +
    `before they bounce. The funnel walks visitors through 3–4 quick questions, then gates the estimate ` +
    `behind a contact form — giving you their name, email, and phone before revealing pricing. ` +
    `You get every lead, automatically.`,
  'Booking Page': (f) =>
    `We'll build a clean, distraction-free booking page for ${f.businessName} that lets ${f.industry} ` +
    `customers schedule in under 2 minutes — no phone call required. The page connects to your calendar, ` +
    `sends confirmation emails, and eliminates back-and-forth scheduling entirely.`,
  'Review Booster': (f) =>
    `We'll build a smart review page for ${f.businessName} that routes happy ${f.industry} customers ` +
    `straight to Google and captures unhappy feedback privately. Simple, mobile-friendly, and safe — ` +
    `one tap for 5-star customers, a quiet form for everyone else.`,
  'Trust Page': (f) =>
    `We'll build a proof-focused trust page for ${f.businessName} showcasing real ${f.industry} results ` +
    `— before/after images, customer testimonials, and a clear call to action. ` +
    `Built to share on social and send to warm leads who need that final push to book.`,
  'Package Selector': (f) =>
    `We'll build a self-serve package selector for ${f.businessName} that lets ${f.industry} customers ` +
    `pick their tier, add options, and book instantly — no back-and-forth quoting needed. ` +
    `Includes a live running total and separate "Book Now" CTAs per package.`,
};

// ─── Scoring functions ────────────────────────────────────────────────────────

function scoreLeadQuality(form: BuyerRequest): { score: number; label: QualityLabel } {
  let score = 0;

  // Contact completeness (max 20)
  if (form.fullName.trim().length > 1)  score += 8;
  if (form.email.includes('@'))          score += 7;
  if (form.phone.trim().length > 5)      score += 5;

  // Business completeness (max 15)
  if (form.businessName.trim().length > 1) score += 8;
  if (form.industry.trim().length > 1)     score += 7;

  // Project clarity (max 40)
  if (form.buildType && form.buildType !== 'Not sure') score += 12;
  else if (form.buildType === 'Not sure') score += 4;

  const goalLen = form.mainGoal.trim().length;
  if (goalLen > 60)        score += 14;
  else if (goalLen > 20)   score += 8;
  else if (goalLen > 0)    score += 3;

  const problemLen = form.currentProblem.trim().length;
  if (problemLen > 100)    score += 14;
  else if (problemLen > 40) score += 8;
  else if (problemLen > 0)  score += 3;

  // Scope signals (max 20)
  if (form.budget && form.budget !== '')     score += 10;
  if (form.deadline && form.deadline !== '') score += 7;
  if (form.websiteSocial.trim().length > 3)  score += 3;

  // Style context (max 5)
  if (form.styleNotes.trim().length > 10) score += 5;

  const capped = Math.min(score, 100);
  let label: QualityLabel;
  if (capped >= 80)      label = 'Strong';
  else if (capped >= 60) label = 'Good';
  else if (capped >= 40) label = 'Fair';
  else                   label = 'Needs Detail';

  return { score: capped, label };
}

function scoreUrgency(deadline: string): UrgencyRating {
  if (!deadline) return 'Not specified';
  if (deadline.toLowerCase().includes('asap') || deadline.includes('within a week')) return 'High';
  if (deadline.includes('1–2') || deadline.includes('1-2')) return 'Medium';
  if (deadline.includes('2–4') || deadline.includes('2-4')) return 'Low';
  if (deadline.toLowerCase().includes('no hard deadline')) return 'Low';
  return 'Not specified';
}

function scoreComplexity(buildType: string, styleNotes: string): ComplexityRating {
  const highComplexity = ['Booking Page', 'Package Selector'];
  const lowComplexity  = ['Review Booster', 'Trust Page'];
  const base: ComplexityRating =
    highComplexity.includes(buildType) ? 'High' :
    lowComplexity.includes(buildType)  ? 'Low'  : 'Medium';
  if (base === 'Low' && styleNotes.trim().length > 80)    return 'Medium';
  if (base === 'Medium' && styleNotes.trim().length > 120) return 'High';
  return base;
}

function scoreRevenuePotential(budget: string, industry: string): RevenueRating {
  if (budget.includes('$800+'))       return 'High';
  if (budget.includes('$400'))        return 'Medium-High';
  if (budget.includes('$200'))        return 'Medium';
  if (budget.includes('$100–'))       return 'Low-Medium';
  if (budget.includes('Under $100'))  return 'Low';
  const highValue = ['hvac', 'roofing', 'plumbing', 'electrical', 'concrete', 'remodeling', 'landscaping'];
  const ind = industry.toLowerCase();
  if (highValue.some((k) => ind.includes(k))) return 'Medium-High';
  return 'Unknown';
}

function scorePriority(score: number, urgency: UrgencyRating): PriorityLabel {
  if (score >= 65 && urgency === 'High') return 'High';
  if (score >= 60 || urgency === 'High') return 'High';
  if (score >= 45 || urgency === 'Medium') return 'Medium';
  return 'Low';
}

function scoreFitRating(score: number, buildType: string): FitRating {
  if (!buildType || buildType === 'Not sure') return 'Weak';
  if (score >= 78) return 'Strong';
  if (score >= 58) return 'Good';
  if (score >= 38) return 'Okay';
  return 'Weak';
}

function getMissingInfoFlags(form: BuyerRequest): string[] {
  const flags: string[] = [];
  if (!form.phone.trim())
    flags.push('Phone number not provided — cannot call buyer directly');
  if (!form.budget || form.budget === 'Not sure yet')
    flags.push('Budget not stated — cannot scope proposal without range confirmation');
  if (!form.deadline)
    flags.push('No deadline indicated — low urgency signal, may lose momentum');
  if (!form.websiteSocial.trim())
    flags.push('No website or social link — unable to review existing brand before building');
  if (form.mainGoal.trim().length < 20)
    flags.push('Business goal is vague — follow up before scoping');
  if (form.currentProblem.trim().length < 30)
    flags.push('Problem description is minimal — follow up to understand pain point');
  if (!form.styleNotes.trim())
    flags.push('No style direction provided — creator will use default professional approach');
  if (!form.buildType || form.buildType === 'Not sure')
    flags.push('Build type not selected — help buyer choose the right MicroBuild before accepting');
  return flags;
}

function getRiskFlags(form: BuyerRequest, score: number, urgency: UrgencyRating): string[] {
  const flags: string[] = [];
  if (form.budget === 'Under $100')
    flags.push('Budget may be below minimum — clarify expectations before accepting this request');
  if ((!form.budget || form.budget === 'Not sure yet') && form.mainGoal.trim().length < 30)
    flags.push('Unclear budget + vague goal — high risk of scope mismatch without a discovery call');
  if (urgency === 'High' && score < 55)
    flags.push('High urgency + low request clarity — risk of building wrong thing under time pressure');
  if (!form.buildType || form.buildType === 'Not sure')
    flags.push('No build type selected — do not assign creator until type is confirmed');
  if (!form.websiteSocial.trim())
    flags.push('No existing online presence found — may need brand setup support during build');
  return flags;
}

function deriveAdminNextAction(
  form: BuyerRequest, score: number, urgency: UrgencyRating
): string {
  if (!form.buildType || form.buildType === 'Not sure')
    return '❓ Help buyer choose MicroBuild type — schedule a 10-minute discovery call before scoping';
  if (score >= 80 && urgency === 'High')
    return '⚡ Fast-track — high-quality urgent request. Assign creator and send proposal today';
  if (score >= 75)
    return '✅ Ready to quote — review request and send proposal within 24 hours';
  if (score >= 60 && form.budget && form.budget !== 'Not sure yet')
    return '📋 Good fit — confirm budget and send scoped proposal';
  if (score >= 60)
    return '📋 Good fit — follow up to confirm budget before quoting';
  if (score >= 40)
    return '📞 Contact buyer to clarify goal and problem before scoping';
  return '❓ Low detail — send a discovery questionnaire before investing in a proposal';
}

function buildProposalDraft(
  form: BuyerRequest,
  recommendedBuild: string,
  complexity: ComplexityRating
): string {
  const timeline = complexity === 'High' ? '5–7 business days' :
                   complexity === 'Medium' ? '3–5 business days' : '2–3 business days';
  const buildType = (form.buildType && form.buildType !== 'Not sure')
    ? form.buildType : 'Quote Funnel';

  const whatYouGet: Record<string, string> = {
    'Quote Funnel':      'a mobile-first lead capture funnel that delivers an instant estimate and captures their contact info before they leave',
    'Booking Page':      'a standalone booking page connected to your calendar with automatic confirmation emails — no phone calls needed',
    'Review Booster':    'a smart review routing page that sends happy customers to Google and captures unhappy feedback privately',
    'Trust Page':        'a shareable proof page with before/after images, customer testimonials, and a direct CTA built to convert warm leads',
    'Package Selector':  'a self-serve package selector with a live running total and direct "Book Now" CTAs per tier — no back-and-forth quoting',
  };

  return [
    `Hi ${form.fullName},`,
    '',
    `Thanks for your interest in MicroBuild. Here is how we would scope the ${buildType} for ${form.businessName}:`,
    '',
    `Build: ${recommendedBuild}`,
    `What you get: ${whatYouGet[buildType] ?? whatYouGet['Quote Funnel']}.`,
    `Timeline: ${timeline} from kickoff.`,
    form.budget && form.budget !== 'Not sure yet'
      ? `Investment: Your indicated budget is ${form.budget}. We will confirm exact scope and pricing in a quick 5-minute call before anything moves forward.`
      : 'Investment: To be confirmed after a quick 5-minute scoping call — no surprise charges.',
    '',
    `To move forward, reply to confirm you are ready and I will send the full project brief for your review.`,
    '',
    '— MicroBuild Team',
  ].join('\n');
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateBuildPacket(
  form: BuyerRequest,
  templateTitle?: string
): GeneratedBuildPacket {
  const buildType = (form.buildType && form.buildType !== 'Not sure')
    ? form.buildType : 'Quote Funnel';

  // Scores
  const { score, label }  = scoreLeadQuality(form);
  const urgency            = scoreUrgency(form.deadline);
  const complexity         = scoreComplexity(buildType, form.styleNotes);
  const revenue            = scoreRevenuePotential(form.budget, form.industry);
  const priority           = scorePriority(score, urgency);
  const fitRating          = scoreFitRating(score, form.buildType ?? '');
  const missingInfoFlags   = getMissingInfoFlags(form);
  const riskFlags          = getRiskFlags(form, score, urgency);
  const adminNextAction    = deriveAdminNextAction(form, score, urgency);

  // Business summary
  const websitePart = form.websiteSocial.trim()
    ? ` with an online presence at ${form.websiteSocial.trim()}` : '';
  const budgetPart = form.budget && form.budget !== 'Not sure yet'
    ? ` Budget indicated: ${form.budget}.` : '';
  const businessSummary =
    `${form.businessName} is a ${form.industry} business operated by ${form.fullName}` +
    `${websitePart}.${budgetPart}`;

  const targetAudience =
    `Local ${form.industry.toLowerCase()} customers — primarily homeowners or small business owners ` +
    `searching for ${form.industry.toLowerCase()} services online, via Google, or through social media. ` +
    `Primary conversion intent: ${
      buildType === 'Quote Funnel'   ? 'getting a price estimate quickly' :
      buildType === 'Booking Page'   ? 'scheduling a service appointment' :
      buildType === 'Review Booster' ? 'sharing their service experience' :
      buildType === 'Trust Page'     ? 'evaluating the business before contacting' :
                                       'comparing and selecting a service package'}.`;

  const recommendedBuild = templateTitle
    ? `${templateTitle} (${buildType})`
    : `${buildType} — tailored for ${form.businessName} (${form.industry})`;

  const whyFits = (whyThisBuildFits[buildType] ?? whyThisBuildFits['Quote Funnel'])(form);
  const proposalAngle = (proposalAngles[buildType] ?? proposalAngles['Quote Funnel'])(form);
  const proposalDraft = buildProposalDraft(form, recommendedBuild, complexity);

  const creatorInstructions = [
    `Build: ${buildType} for ${form.businessName} (${form.industry}).`,
    `Owner: ${form.fullName} | Contact: ${form.email}${form.phone ? ` / ${form.phone}` : ''}.`,
    `Goal: ${form.mainGoal}`,
    `Core problem to solve: ${form.currentProblem}`,
    form.styleNotes
      ? `Style direction from client: ${form.styleNotes}`
      : 'No style notes — use clean professional defaults with green primary accent.',
    `Deadline: ${form.deadline || 'No hard deadline stated'}.`,
    'Apply business branding. If brand assets are not provided, request them before starting.',
    'Deliver: shareable link + 1-page usage guide.',
  ].filter(Boolean).join(' ');

  const copyDirection = [
    `Headline: Lead with the outcome, not the service. For ${form.industry}: ` +
    (buildType === 'Quote Funnel'   ? `"Get Your ${form.industry} Quote in 60 Seconds" or "Instant Estimate — No Phone Call Required"` :
     buildType === 'Booking Page'   ? `"Book Your ${form.industry} Service Online" or "Schedule in 2 Minutes"` :
     buildType === 'Review Booster' ? `"How Did We Do?" or "Share Your ${form.businessName} Experience"` :
     buildType === 'Trust Page'     ? `"See Our Work" or "Real Results from Real ${form.industry} Jobs"` :
                                      `"Find the Right ${form.industry} Package for You"`) + '.',
    `Subheadline: Address the friction — "${form.currentProblem.slice(0, 80)}${form.currentProblem.length > 80 ? '…' : ''}"`,
    form.styleNotes ? `Style notes from client: ${form.styleNotes}.` : '',
  ].filter(Boolean).join(' ');

  // AI summary (admin-facing overview)
  const missingNote = missingInfoFlags.length > 0
    ? `${missingInfoFlags.length} missing info flag(s).`
    : 'Request appears complete.';
  const riskNote = riskFlags.length > 0 ? ` ${riskFlags.length} risk flag(s).` : '';
  const aiSummary =
    `${form.businessName} (${form.industry}) is requesting a ${buildType} to ${form.mainGoal.toLowerCase().replace(/\.$/, '') || 'achieve their business goal'}. ` +
    `Lead quality: ${score}/100 (${label}) | Priority: ${priority} | Urgency: ${urgency} | Complexity: ${complexity} | Revenue potential: ${revenue}. ` +
    `${missingNote}${riskNote} ` +
    adminNextAction.replace(/^[⚡✅📋📞❓]\s*/, '');

  const followUpQuestions = (buildTypeFollowUpQuestions[buildType] ?? buildTypeFollowUpQuestions['Quote Funnel']).concat(
    missingInfoFlags.length > 3
      ? ['Can you tell us more about your business goals so we can scope the right build for you?']
      : []
  );

  return {
    businessSummary,
    targetAudience,
    problem: form.currentProblem || 'Not specified in submission.',
    aiSummary,

    recommendedBuild,
    whyThisBuildFits: whyFits,
    suggestedPageSections: suggestedPageSections[buildType] ?? suggestedPageSections['Quote Funnel'],

    ctaStrategy:             ctaStrategies[buildType] ?? ctaStrategies['Quote Funnel'],
    suggestedCopyDirection:  copyDirection,
    designDirection:         designDirections[buildType] ?? designDirections['Quote Funnel'],

    formFields:      suggestedFormFields[buildType] ?? suggestedFormFields['Quote Funnel'],
    automationNeeds: automationNeeds[buildType] ?? automationNeeds['Quote Funnel'],

    creatorInstructions,
    suggestedProposalAngle: proposalAngle,
    proposalDraft,
    qualityChecklist: qualityChecklists[buildType] ?? qualityChecklists['Quote Funnel'],
    launchChecklist:  launchChecklists[buildType]  ?? launchChecklists['Quote Funnel'],

    adminNextAction,
    priorityLabel:          priority,
    fitRating,
    leadQualityScore:        score,
    leadQualityLabel:        label,
    urgencyRating:           urgency,
    complexityRating:        complexity,
    revenuePotentialRating:  revenue,
    missingInfoFlags,
    riskFlags,
    followUpQuestions,
  };
}
