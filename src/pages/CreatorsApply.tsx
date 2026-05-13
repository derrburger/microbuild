import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreatorApplication } from '../types';
import { insertCreatorApplication } from '../lib/supabase';
import type { SupabaseInsertError } from '../lib/supabase';
import './CreatorsApply.css';

function friendlyErrorMessage(err: SupabaseInsertError): string {
  if (err.code === '42501') {
    return (
      'Submission is temporarily unavailable — our database policies are still being configured. ' +
      'Please email us directly and we will get back to you within 24 hours. ' +
      '(Check the browser console for technical details.)'
    );
  }
  return (
    'There was a problem submitting your application. Please try again or email us directly. ' +
    '(Check the browser console for technical details.)'
  );
}

const toolOptions = [
  'Webflow',
  'Framer',
  'Carrd',
  'HTML / CSS / JS',
  'React',
  'Next.js',
  'Zapier',
  'Make (Integromat)',
  'Typeform / Tally',
  'Notion',
  'Figma',
  'Canva',
  'Copywriting',
  'Other no-code tools',
];

const nicheOptions = [
  'Pool Cleaning',
  'Auto Detailing',
  'Painting',
  'Landscaping / Lawn Care',
  'Pressure Washing',
  'Cleaning Companies',
  'Contractors / Handymen',
  'Mobile Mechanics',
  'Barbershops / Salons',
  'Electricians / Plumbers',
  'Local service (general)',
];

const hoursOptions = ['1–5 hrs/week', '5–10 hrs/week', '10–20 hrs/week', '20+ hrs/week'];

const initialForm: CreatorApplication = {
  fullName: '',
  email: '',
  tools: [],
  portfolioUrl: '',
  portfolioUrl2: '',
  niches: [],
  experience: '',
  availableHours: '',
  message: '',
};

export default function CreatorsApply() {
  const [form, setForm] = useState<CreatorApplication>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleToolToggle(tool: string) {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter((t) => t !== tool)
        : [...prev.tools, tool],
    }));
  }

  function handleNicheToggle(niche: string) {
    setForm((prev) => ({
      ...prev,
      niches: prev.niches.includes(niche)
        ? prev.niches.filter((n) => n !== niche)
        : [...prev.niches, niche],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await insertCreatorApplication({
      full_name: form.fullName,
      email: form.email,
      tools: form.tools,
      portfolio_url: form.portfolioUrl || null,
      portfolio_url_2: form.portfolioUrl2 || null,
      niches: form.niches,
      experience: form.experience,
      available_hours: form.availableHours,
      message: form.message || null,
      status: 'new',
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyErrorMessage(error));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="creators-page">
        <div className="container creators-success">
          <div className="success-icon">✓</div>
          <h2>Application Submitted</h2>
          <p>
            Thanks, <strong>{form.fullName}</strong>. We review every application manually. If your
            skills are a good fit for current MicroBuild needs, we'll reach out within 3–5 business days.
          </p>
          <p className="success-note">
            We're selective because build quality directly affects buyer outcomes. We'll be direct with feedback either way.
          </p>
          <Link to="/" className="btn btn-ghost btn-sm">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="creators-page">
      <div className="creators-hero">
        <div className="container">
          <div className="creators-badge">Now accepting applications</div>
          <h1 className="creators-title">Apply as a MicroBuild Creator</h1>
          <p className="creators-sub">
            Build focused revenue tools for local service businesses. Earn per project. Work async. Clear briefs, no scope creep.
          </p>
        </div>
      </div>

      <div className="container creators-body">
        <div className="creators-grid">
          <form className="creators-form" onSubmit={handleSubmit} noValidate>

            {/* Contact */}
            <fieldset className="form-group-block">
              <legend>Contact Info</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Full Name *</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    placeholder="Alex Rivera"
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
                    placeholder="alex@example.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </fieldset>

            {/* Tools */}
            <fieldset className="form-group-block">
              <legend>Tools You Use</legend>
              <p className="chips-label">Select everything you're comfortable delivering with:</p>
              <div className="chips-grid">
                {toolOptions.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    className={`chip-btn${form.tools.includes(tool) ? ' selected' : ''}`}
                    onClick={() => handleToolToggle(tool)}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Portfolio */}
            <fieldset className="form-group-block">
              <legend>Portfolio Links</legend>
              <div className="form-group">
                <label htmlFor="portfolioUrl">
                  Primary Portfolio or Work Sample *
                  <span className="label-hint"> — a live page, Behance, GitHub, etc.</span>
                </label>
                <input
                  id="portfolioUrl"
                  name="portfolioUrl"
                  type="text"
                  required
                  placeholder="https://yourportfolio.com"
                  value={form.portfolioUrl}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="portfolioUrl2">
                  Second Link
                  <span className="label-hint"> — optional: another project, social, or Notion doc</span>
                </label>
                <input
                  id="portfolioUrl2"
                  name="portfolioUrl2"
                  type="text"
                  placeholder="https://..."
                  value={form.portfolioUrl2}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* Niches */}
            <fieldset className="form-group-block">
              <legend>Industries You Know</legend>
              <p className="chips-label">
                Select trades or local service niches you have experience with or strong interest in building for:
              </p>
              <div className="chips-grid">
                {nicheOptions.map((niche) => (
                  <button
                    key={niche}
                    type="button"
                    className={`chip-btn${form.niches.includes(niche) ? ' selected' : ''}`}
                    onClick={() => handleNicheToggle(niche)}
                  >
                    {niche}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Experience & Availability */}
            <fieldset className="form-group-block">
              <legend>Experience & Availability</legend>
              <div className="form-group">
                <label htmlFor="experience">
                  Relevant Experience *
                  <span className="label-hint"> — landing pages, funnels, lead-gen tools, or similar</span>
                </label>
                <textarea
                  id="experience"
                  name="experience"
                  required
                  rows={5}
                  placeholder="Describe the most relevant things you've built. What were they for? What did they accomplish? Include URLs or screenshots if you can."
                  value={form.experience}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="availableHours">Available Hours Per Week *</label>
                <select
                  id="availableHours"
                  name="availableHours"
                  required
                  value={form.availableHours}
                  onChange={handleChange}
                >
                  <option value="">Select availability…</option>
                  {hoursOptions.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="message">
                  Anything else?
                  <span className="label-hint"> — optional</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  placeholder="Why do you want to build for MicroBuild? Questions? Constraints we should know about?"
                  value={form.message}
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
              {submitting ? 'Submitting…' : 'Submit Application →'}
            </button>
            <p className="form-disclaimer">
              Applications are reviewed manually. We'll respond within 3–5 business days.
            </p>
          </form>

          <div className="creators-sidebar">
            <div className="creators-info-card">
              <h3>What we're looking for</h3>
              <ul className="creators-criteria">
                <li>Able to build standalone, mobile-first pages — no full website needed</li>
                <li>Clean execution: fast load, correct layout on mobile, functional forms</li>
                <li>Comfortable working from a structured brief without a lot of back-and-forth</li>
                <li>Delivers on time — MicroBuilds have short, predictable scopes</li>
                <li>Can brand a page to match a local business (colors, logo, tone)</li>
              </ul>
            </div>

            <div className="creators-info-card">
              <h3>Why build with MicroBuild?</h3>
              <ul className="creators-benefits">
                <li>
                  <span>💰</span>
                  <div>
                    <strong>Earn per project</strong>
                    <p>Rates start at $60/build and scale with complexity. Short scopes mean fast turnaround and frequent payouts.</p>
                  </div>
                </li>
                <li>
                  <span>📋</span>
                  <div>
                    <strong>Structured briefs</strong>
                    <p>Every project comes with a full AI build packet — copy, form fields, design direction, and a quality checklist. No guessing.</p>
                  </div>
                </li>
                <li>
                  <span>⏰</span>
                  <div>
                    <strong>Async, focused work</strong>
                    <p>MicroBuilds are intentionally small. Deliver on your schedule. No discovery calls required.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="creators-note-card">
              <p>
                MicroBuild is in early access. Creator spots are limited — we're onboarding selectively to maintain quality.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
