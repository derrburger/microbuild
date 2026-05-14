import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { BuyerRequest, MicroBuildCategory, MicroBuildListing } from '../types';
import { mockListings } from '../data/mockListings';
import { fetchTemplateBySlug } from '../lib/templates';
import { insertBuyerRequest } from '../lib/supabase';
import type { SupabaseInsertError } from '../lib/supabase';
import { generateBuildPacket } from '../lib/buildPacket';
import type { GeneratedBuildPacket } from '../lib/buildPacket';
import './Request.css';

const buildTypes: Array<MicroBuildCategory | 'Not sure'> = [
  'Quote Funnel',
  'Booking Page',
  'Review Booster',
  'Trust Page',
  'Package Selector',
  'Not sure',
];

const budgetOptions = [
  'Under $100',
  '$100–$200',
  '$200–$400',
  '$400–$800',
  '$800+',
  'Not sure yet',
];

const deadlineOptions = [
  'ASAP — within a week',
  '1–2 weeks',
  '2–4 weeks',
  'No hard deadline',
];

const initialForm: BuyerRequest = {
  fullName: '',
  email: '',
  phone: '',
  businessName: '',
  industry: '',
  websiteSocial: '',
  buildType: '',
  mainGoal: '',
  currentProblem: '',
  budget: '',
  deadline: '',
  styleNotes: '',
};

/** User-facing message for a Supabase insert error (no internals exposed). */
function friendlyErrorMessage(err: SupabaseInsertError): string {
  if (err.code === '42501') {
    return (
      'Submission is temporarily unavailable — our database policies are still being configured. ' +
      'Please email us directly and we will get back to you within 24 hours. ' +
      '(Check the browser console for technical details.)'
    );
  }
  return (
    'There was a problem submitting your request. Please try again or email us directly. ' +
    '(Check the browser console for technical details.)'
  );
}

export default function Request() {
  const [searchParams] = useSearchParams();
  const prefillSlug = searchParams.get('build');

  // Synchronous mock fallback for instant UI (builds the form label immediately)
  const mockPrefill: MicroBuildListing | null = prefillSlug
    ? (mockListings.find((l) => l.slug === prefillSlug) ?? null)
    : null;

  const [prefillListing, setPrefillListing] = useState<MicroBuildListing | null>(mockPrefill);
  // UUID of the template from Supabase (null when not available or using mock fallback)
  const [templateDbId, setTemplateDbId] = useState<string | null>(null);

  const [form, setForm] = useState<BuyerRequest>({
    ...initialForm,
    buildType: mockPrefill?.category ?? '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [packet, setPacket] = useState<GeneratedBuildPacket | null>(null);

  // Fetch the real template from Supabase when slug is present so we can:
  //   1. Store the actual UUID for the template_id FK
  //   2. Keep the sidebar listing in sync with live data
  useEffect(() => {
    if (!prefillSlug) return;
    fetchTemplateBySlug(prefillSlug).then(({ listing, fromSupabase }) => {
      if (listing) {
        setPrefillListing(listing);
        // Only use the ID as a FK if this came from the real database
        setTemplateDbId(fromSupabase ? listing.id : null);
        // Keep buildType in sync (only override if user hasn't changed it yet)
        setForm((prev) =>
          prev.buildType === '' || prev.buildType === (mockPrefill?.category ?? '')
            ? { ...prev, buildType: listing.category }
            : prev
        );
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSlug]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await insertBuyerRequest({
      full_name:          form.fullName,
      email:              form.email,
      phone:              form.phone      || null,
      business_name:      form.businessName,
      industry:           form.industry,
      website_social:     form.websiteSocial || null,
      build_type:         form.buildType  || 'Not sure',
      main_goal:          form.mainGoal,
      current_problem:    form.currentProblem,
      budget:             form.budget     || null,
      deadline:           form.deadline   || null,
      style_notes:        form.styleNotes || null,
      // FK columns — all null for guest submissions without auth
      user_id:             null,
      business_profile_id: null,
      // Use the real Supabase UUID when available; null is fine and accepted by schema
      template_id:         templateDbId,
      status:             'new',
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyErrorMessage(error));
      return;
    }

    setPacket(generateBuildPacket(form, prefillListing?.title));
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="request-page">
        <div className="container request-success">
          <div className="success-icon">✓</div>
          <h2>Request Received</h2>
          <p>
            Thanks, <strong>{form.fullName}</strong>. We received your request for{' '}
            <strong>{form.businessName}</strong>. This is an early-access submission — we review every
            request manually and will reach out within 1–2 business days with next steps.
          </p>
          <p className="success-note">
            No payment is collected at this stage. We'll send a scope and price confirmation before anything moves forward.
          </p>
          <Link to="/browse" className="btn btn-ghost btn-sm">
            Browse More MicroBuilds
          </Link>

          {packet && (
            <div className="success-analysis">
              <h3 className="success-analysis-title">What we'll review next</h3>
              <p className="success-analysis-sub">
                Here's what our team will look at when they review your request.
                We'll confirm scope and pricing with you before anything moves forward.
              </p>
              <div className="success-analysis-grid">
                <div className="success-analysis-item">
                  <span className="success-analysis-label">Business</span>
                  <span className="success-analysis-value">{form.businessName} · {form.industry}</span>
                </div>
                <div className="success-analysis-item">
                  <span className="success-analysis-label">Requested Build</span>
                  <span className="success-analysis-value">{packet.recommendedBuild}</span>
                </div>
                <div className="success-analysis-item">
                  <span className="success-analysis-label">Business Goal</span>
                  <span className="success-analysis-value">{form.mainGoal || '—'}</span>
                </div>
                <div className="success-analysis-item">
                  <span className="success-analysis-label">Current Problem</span>
                  <span className="success-analysis-value">{form.currentProblem || '—'}</span>
                </div>
                {form.budget && (
                  <div className="success-analysis-item">
                    <span className="success-analysis-label">Budget Indicated</span>
                    <span className="success-analysis-value">{form.budget}</span>
                  </div>
                )}
                {form.deadline && (
                  <div className="success-analysis-item">
                    <span className="success-analysis-label">Deadline</span>
                    <span className="success-analysis-value">{form.deadline}</span>
                  </div>
                )}
              </div>
              <p className="success-analysis-note">
                Our team reviews every request manually. We'll reach out within 1–2 business days
                with a scope summary and pricing confirmation.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="request-page">
      <div className="request-hero">
        <div className="container">
          <h1 className="request-title">Request a MicroBuild</h1>
          <p className="request-sub">
            Tell us about your business and what you want to accomplish. The more detail you give,
            the better we can scope and price your build.
          </p>
        </div>
      </div>

      <div className="container request-body">
        <div className="request-grid">
          <form className="request-form" onSubmit={handleSubmit} noValidate>

            {/* Section 1: Contact Info */}
            <fieldset className="form-group-block">
              <legend>Contact Info</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Your Name *</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={form.fullName}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="jane@smithpools.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="form-group form-group--half">
                <label htmlFor="phone">Phone Number (optional)</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* Section 2: Your Business */}
            <fieldset className="form-group-block">
              <legend>Your Business</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="businessName">Business Name *</label>
                  <input
                    id="businessName"
                    name="businessName"
                    type="text"
                    required
                    placeholder="Smith Pool Services"
                    value={form.businessName}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="industry">Industry / Trade *</label>
                  <input
                    id="industry"
                    name="industry"
                    type="text"
                    required
                    placeholder="e.g. Pool Cleaning, Auto Detailing, Painting…"
                    value={form.industry}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="websiteSocial">
                  Website or Social Profile
                  <span className="label-hint"> — optional but helpful</span>
                </label>
                <input
                  id="websiteSocial"
                  name="websiteSocial"
                  type="text"
                  placeholder="https://yoursite.com or @yourinstagram"
                  value={form.websiteSocial}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* Section 3: Your Project */}
            <fieldset className="form-group-block">
              <legend>Your Project</legend>
              <div className="form-group">
                <label htmlFor="buildType">MicroBuild Type *</label>
                <select
                  id="buildType"
                  name="buildType"
                  required
                  value={form.buildType}
                  onChange={handleChange}
                >
                  <option value="">Select a build type…</option>
                  {buildTypes.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt === 'Not sure' ? "Not sure — help me choose" : bt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="mainGoal">
                  Main Goal *
                  <span className="label-hint"> — what should this MicroBuild accomplish?</span>
                </label>
                <input
                  id="mainGoal"
                  name="mainGoal"
                  type="text"
                  required
                  placeholder="e.g. Capture quote leads from Instagram traffic, reduce DMs asking about pricing…"
                  value={form.mainGoal}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="currentProblem">
                  Current Problem *
                  <span className="label-hint"> — what's not working right now?</span>
                </label>
                <textarea
                  id="currentProblem"
                  name="currentProblem"
                  required
                  rows={4}
                  placeholder="e.g. People visit my Google Business page but I have no good way to collect their info. I get calls but half of them ghost when I send a quote because they weren't expecting the price."
                  value={form.currentProblem}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* Section 4: Scope & Preferences */}
            <fieldset className="form-group-block">
              <legend>Scope & Preferences</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="budget">Budget Range</label>
                  <select id="budget" name="budget" value={form.budget} onChange={handleChange}>
                    <option value="">Select a range…</option>
                    {budgetOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="deadline">Deadline</label>
                  <select id="deadline" name="deadline" value={form.deadline} onChange={handleChange}>
                    <option value="">Select a timeline…</option>
                    {deadlineOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="styleNotes">
                  Style Notes
                  <span className="label-hint"> — optional: colors, tone, references, what you like/dislike</span>
                </label>
                <textarea
                  id="styleNotes"
                  name="styleNotes"
                  rows={3}
                  placeholder="e.g. Clean and professional, dark background, keep it simple. Similar feel to Jobber or ServiceTitan. No generic stock photos."
                  value={form.styleNotes}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {submitError && (
              <div className="form-error-banner">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg form-submit"
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit Request →'}
            </button>
            <p className="form-disclaimer">
              No payment required at this stage. We'll review your request and follow up within 1–2 business days.
            </p>
          </form>

          <div className="request-sidebar">
            <div className="request-info-card">
              <h3>What happens after you submit?</h3>
              <ol className="request-steps">
                <li>
                  <strong>We review your request</strong>
                  <span>Usually within 1–2 business days. We read every submission.</span>
                </li>
                <li>
                  <strong>We send a proposal</strong>
                  <span>Scope, price, and turnaround confirmed before anything moves forward.</span>
                </li>
                <li>
                  <strong>A creator builds it</strong>
                  <span>A vetted MicroBuild creator receives a structured brief and gets to work.</span>
                </li>
                <li>
                  <strong>You review and approve</strong>
                  <span>One revision round included. Payment is released only after approval.</span>
                </li>
                <li>
                  <strong>Go live</strong>
                  <span>Share your MicroBuild link and start collecting leads, bookings, or reviews.</span>
                </li>
              </ol>
            </div>

            {prefillListing && (
              <div className="request-build-ref">
                <span className="build-ref-label">Requesting this build:</span>
                <strong>{prefillListing.title}</strong>
                <span className="build-ref-price">Starting from ${prefillListing.startingPrice}</span>
              </div>
            )}

            <div className="request-note-card">
              <p>
                MicroBuild is in early access. Every request is reviewed by a real person — not an automated system.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
