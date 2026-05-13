/**
 * buildPacket.ts — Frontend-only, deterministic AI Build Packet generator.
 *
 * Produces a structured brief from buyer request data using template logic.
 * No API calls are made. This mirrors the output that a real AI pipeline
 * (Phase 3) would produce, useful for previewing and manually reviewing
 * requests in the MVP phase.
 */

import type { BuyerRequest } from '../types';

export interface GeneratedBuildPacket {
  businessSummary: string;
  targetAudience: string;
  problem: string;
  recommendedBuild: string;
  suggestedCopyDirection: string;
  formFields: string[];
  automationNeeds: string;
  designDirection: string;
  creatorInstructions: string;
  qualityChecklist: string[];
}

// ─── Per-build-type templates ─────────────────────────────────────────────────

const buildTypeFormFields: Record<string, string[]> = {
  'Quote Funnel': [
    'Service type or project scope (dropdown or multi-select)',
    'Size / quantity inputs (sq ft, # of units, pool size, etc.)',
    'Location or zip code',
    'Preferred contact time',
    'Name, email, phone (before quote reveal)',
  ],
  'Booking Page': [
    'Service selection',
    'Preferred date and time (calendar picker)',
    'Address or service area',
    'Name, email, phone',
    'Notes or special requests (optional)',
  ],
  'Review Booster': [
    'Star rating selector (1–5)',
    'Short feedback text (for low ratings)',
    'Name (optional)',
  ],
  'Trust Page': [
    'Before/after image pairs (up to 6)',
    'Customer testimonial quotes',
    'Star rating display (pulled from input)',
    'Primary CTA destination',
  ],
  'Package Selector': [
    'Vehicle or project type selector',
    'Package tier choice (visual cards)',
    'Add-on checkboxes with prices',
    'Booking or contact destination',
  ],
};

const buildTypeAutomation: Record<string, string> = {
  'Quote Funnel':
    'Email notification on every submission (to business owner). Optional: auto-reply email to lead with their estimate and a booking link.',
  'Booking Page':
    'Confirmation email to customer. Notification to business with booking details. Optional: calendar invite via Calendly or Google Calendar link.',
  'Review Booster':
    'Conditional routing: 4–5 stars → redirect to Google review URL. 1–3 stars → private feedback form submission sent to business email.',
  'Trust Page':
    'CTA button routes to a booking page, contact form, or phone link. No form automation required — static display page.',
  'Package Selector':
    'Booking CTA per package routes to the business\'s booking tool. Optional: price summary email to customer on selection.',
};

const buildTypeDesign: Record<string, string> = {
  'Quote Funnel':
    'Step-by-step form wizard. Progress indicator. Mobile-first. Clean white or dark card layout. Green accent for the CTA. Business logo at the top.',
  'Booking Page':
    'Full-width calendar. Clean time slot grid. Business logo header. Minimal distractions — one goal: complete the booking.',
  'Review Booster':
    'Large star selector (prominent, tap-friendly). Simple layout with business name and logo. Positive energy — green for happy, subtle for feedback.',
  'Trust Page':
    'Bold full-width hero. Before/after slider images. Testimonial cards. Star rating display. Strong CTA at the bottom. Dark or brand-color background.',
  'Package Selector':
    'Side-by-side package cards. Highlighted recommended tier. Add-on checkboxes below each card. Sticky "Book Now" CTA per package. Mobile-scrollable card layout.',
};

const buildTypeChecklist: Record<string, string[]> = {
  'Quote Funnel': [
    'All 3–5 quote questions are functional and skip-logic works',
    'Price estimate displays correctly for each input combination',
    'Lead capture form gates the quote reveal',
    'Email notification fires on every submission',
    'Mobile layout tested on iOS Safari and Chrome Android',
    'Business logo, colors, and contact info are correctly applied',
    'Thank-you message and next step are clear',
  ],
  'Booking Page': [
    'Calendar shows correct available dates and times',
    'Booking confirmation email sends successfully',
    'Business notification email sends successfully',
    'Address or service area input is validated',
    'Mobile layout is tap-friendly',
    'Logo and branding applied correctly',
    'Redirect or thank-you message is shown after booking',
  ],
  'Review Booster': [
    '4–5 star selection redirects to the correct Google review URL',
    '1–3 star selection shows the private feedback form',
    'Private feedback email sends to business owner',
    'Page loads fast (< 2s) — used via text message links',
    'Mobile-optimized (large tap targets for stars)',
    'Business name and branding are correct',
  ],
  'Trust Page': [
    'All before/after image pairs load correctly',
    'Testimonial quotes display with correct attribution',
    'Star rating display is accurate',
    'CTA button routes to the correct destination',
    'Mobile gallery layout is properly responsive',
    'Page shares cleanly as a link (OpenGraph meta tags)',
  ],
  'Package Selector': [
    'All packages display with correct names, descriptions, and prices',
    'Add-on checkboxes update the price display correctly',
    'Vehicle/project type selector filters correctly',
    '"Book Now" CTA routes to the correct destination per package',
    'Mobile card layout scrolls cleanly',
    'Branding applied: logo, color scheme, business name',
  ],
};

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateBuildPacket(
  form: BuyerRequest,
  templateTitle?: string
): GeneratedBuildPacket {
  const buildType = form.buildType || 'Quote Funnel';

  const businessSummary = [
    `${form.businessName} is a ${form.industry} business`,
    form.websiteSocial ? `with an online presence at ${form.websiteSocial}` : '',
    `operated by ${form.fullName}`,
    form.budget ? `with a budget of ${form.budget}` : '',
  ]
    .filter(Boolean)
    .join(', ')
    .replace(', with', ' with')
    + '.';

  const targetAudience = `Homeowners and local customers looking for ${form.industry.toLowerCase()} services. Primary intent: getting a price, booking, or evaluating the business.`;

  const suggestedCopyDirection = [
    `Headline: Focus on speed and ease — "${form.industry} made simple" or "Get your ${buildType.toLowerCase()} in 60 seconds."`,
    `Subheadline: Address the friction point directly. Example: "Stop losing leads — get your quote before they scroll away."`,
    `CTA button: Use action verbs — "Get My Quote", "See Packages", "Book Now", "Share My Review."`,
    form.styleNotes ? `Style notes from client: ${form.styleNotes}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const recommendedBuild = templateTitle
    ? `${templateTitle} (${buildType})`
    : `${buildType} — tailored for ${form.industry}`;

  const creatorInstructions = [
    `Build type: ${buildType} for ${form.businessName} (${form.industry}).`,
    `Main goal: ${form.mainGoal}`,
    `Problem to solve: ${form.currentProblem}`,
    `Turnaround expectation: ${form.deadline || 'No hard deadline stated'}.`,
    `Apply the business's branding. If brand assets are not provided, use a clean professional look with a green or blue primary accent.`,
    `Keep the flow under 5 steps. Test on mobile before delivery.`,
    `Deliver a shareable link and a brief usage guide.`,
  ].join(' ');

  return {
    businessSummary,
    targetAudience,
    problem: form.currentProblem || 'Not specified.',
    recommendedBuild,
    suggestedCopyDirection,
    formFields:
      buildTypeFormFields[buildType] ??
      buildTypeFormFields['Quote Funnel'],
    automationNeeds:
      buildTypeAutomation[buildType] ??
      buildTypeAutomation['Quote Funnel'],
    designDirection:
      buildTypeDesign[buildType] ??
      buildTypeDesign['Quote Funnel'],
    creatorInstructions,
    qualityChecklist:
      buildTypeChecklist[buildType] ??
      buildTypeChecklist['Quote Funnel'],
  };
}
