import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { BuyerRequest, MicroBuildCategory } from '../types';
import { mockListings } from '../data/mockListings';
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

export default function Request() {
  const [searchParams] = useSearchParams();
  const prefillSlug = searchParams.get('build');
  const prefillListing = prefillSlug ? mockListings.find((l) => l.slug === prefillSlug) : null;

  const [form, setForm] = useState<BuyerRequest>({
    ...initialForm,
    buildType: prefillListing ? prefillListing.category : '',
  });
  const [submitted, setSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log('Buyer request (mock):', form);
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

            <button type="submit" className="btn btn-primary btn-lg form-submit">
              Submit Request →
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
