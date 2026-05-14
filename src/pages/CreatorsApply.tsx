import { useState } from 'react';
import { Link } from 'react-router-dom';
import { insertCreatorApplication } from '../lib/supabase';
import type { SupabaseInsertError } from '../lib/supabase';
import type { CreatorTier } from '../types';
import './CreatorsApply.css';

// ─── Static options ───────────────────────────────────────────────────────────

const toolOptions = [
  'Webflow', 'Framer', 'Carrd', 'HTML / CSS / JS', 'React', 'Next.js',
  'Zapier', 'Make (Integromat)', 'Typeform / Tally', 'Fillout', 'Notion',
  'Figma', 'Canva', 'Copywriting', 'Other no-code tools',
];

const nicheOptions = [
  'Pool Cleaning', 'Auto Detailing', 'Painting', 'Landscaping / Lawn Care',
  'Pressure Washing', 'Cleaning Companies', 'Contractors / Handymen',
  'Mobile Mechanics', 'Barbershops / Salons', 'Electricians / Plumbers',
  'Local service (general)',
];

const hoursOptions = ['1–5 hrs/week', '5–10 hrs/week', '10–20 hrs/week', '20+ hrs/week'];

const serviceCapabilityOptions = [
  'Quote Funnels', 'Booking Pages', 'Review Boosters', 'Trust / Portfolio Pages',
  'Package Selectors', 'Lead Capture Pages', 'Email / SMS Automation',
  'Analytics & Conversion Tracking', 'Conditional Logic Forms', 'Custom Integrations',
];

const fulfillmentSpeedOptions = [
  'Same day (1 business day)',
  '2–3 business days',
  '3–5 business days',
  '1 week',
];

// ─── Tier config ──────────────────────────────────────────────────────────────

interface TierConfig {
  id: CreatorTier;
  name: string;
  price: string;
  priceNote: string;
  planPrice: number;
  badge: string;
  badgeColor: string;
  description: string;
  highlights: string[];
  requirements: string[];
  priority: string;
}

const TIERS: TierConfig[] = [
  {
    id:          'free',
    name:        'Free Creator',
    price:       'Free',
    priceNote:   'No subscription required',
    planPrice:   0,
    badge:       'Free',
    badgeColor:  '#8a94a6',
    description: 'For creators just getting started with MicroBuild. Build a track record and upgrade when ready.',
    highlights:  ['No monthly cost', 'Admin approval required', 'Access to standard projects'],
    requirements:['Basic portfolio (at least 1 link)', 'Tool list', 'Availability'],
    priority:    'Standard marketplace placement',
  },
  {
    id:          'professional',
    name:        'Professional Creator',
    price:       '$15/mo',
    priceNote:   'After admin approval — no charge today',
    planPrice:   15,
    badge:       'Pro',
    badgeColor:  '#63b3ed',
    description: 'For experienced builders with a proven portfolio. Higher project eligibility and better visibility.',
    highlights:  ['Priority placement in matching', 'Eligible for higher-value projects', 'MicroBuild Pro badge'],
    requirements:['Strong portfolio (2+ examples)', 'Top project descriptions', 'Service capabilities', 'Fulfillment speed'],
    priority:    'Priority marketplace placement',
  },
  {
    id:          'verified',
    name:        'Verified Creator',
    price:       '$25/mo',
    priceNote:   'After admin approval — no charge today',
    planPrice:   25,
    badge:       'Verified ✓',
    badgeColor:  '#f9b032',
    description: 'For seasoned professionals with credentials, case studies, and verified real-client work.',
    highlights:  ['Verified badge in marketplace', 'Highest-value project eligibility', 'Strongest trust signal for buyers'],
    requirements:['Portfolio', 'GitHub or LinkedIn', 'Certifications or credential links', 'Case studies with real results'],
    priority:    'Top-tier marketplace placement',
  },
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface ApplyForm {
  fullName: string;
  email: string;
  tools: string[];
  portfolioUrl: string;
  portfolioUrl2: string;
  niches: string[];
  experience: string;
  availableHours: string;
  message: string;
  // Professional+
  topProjects: string;
  serviceCapabilities: string[];
  fulfillmentSpeed: string;
  // Verified only
  githubUrl: string;
  linkedinUrl: string;
  certifications: string;
  credentialLinksRaw: string;
  caseStudies: string;
}

const emptyForm: ApplyForm = {
  fullName: '', email: '', tools: [], portfolioUrl: '', portfolioUrl2: '',
  niches: [], experience: '', availableHours: '', message: '',
  topProjects: '', serviceCapabilities: [], fulfillmentSpeed: '',
  githubUrl: '', linkedinUrl: '', certifications: '', credentialLinksRaw: '', caseStudies: '',
};

// ─── Error helper ─────────────────────────────────────────────────────────────

function friendlyErrorMessage(err: SupabaseInsertError): string {
  if (err.code === '42501') {
    return (
      'Submission is temporarily unavailable — database policies are still being configured. ' +
      'Please email us directly and we will follow up within 24 hours. ' +
      '(Check the browser console for technical details.)'
    );
  }
  return (
    'There was a problem submitting your application. Please try again or email us directly. ' +
    '(Check the browser console for technical details.)'
  );
}

// ─── Tier selection cards ─────────────────────────────────────────────────────

function TierCard({ tier, selected, onSelect }: {
  tier: TierConfig;
  selected: boolean;
  onSelect: (id: CreatorTier) => void;
}) {
  return (
    <div
      className={`tier-card${selected ? ' tier-card--selected' : ''}`}
      onClick={() => onSelect(tier.id)}
      style={{ '--tier-color': tier.badgeColor } as React.CSSProperties}
    >
      <div className="tier-card-top">
        <div>
          <span className="tier-badge" style={{ color: tier.badgeColor, borderColor: tier.badgeColor + '44', backgroundColor: tier.badgeColor + '18' }}>
            {tier.badge}
          </span>
          <div className="tier-name">{tier.name}</div>
        </div>
        <div className="tier-price-block">
          <div className="tier-price">{tier.price}</div>
          <div className="tier-price-note">{tier.priceNote}</div>
        </div>
      </div>

      <p className="tier-description">{tier.description}</p>

      <ul className="tier-highlights">
        {tier.highlights.map((h) => <li key={h}>{h}</li>)}
      </ul>

      <div className="tier-priority">{tier.priority}</div>

      <button
        type="button"
        className={`tier-select-btn${selected ? ' tier-select-btn--active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onSelect(tier.id); }}
        style={selected ? { borderColor: tier.badgeColor, color: tier.badgeColor } : undefined}
      >
        {selected ? '✓ Selected' : 'Select this tier →'}
      </button>
    </div>
  );
}

// ─── Chip toggle helper ───────────────────────────────────────────────────────

function ChipGroup({ label, hint, options, selected, onToggle }: {
  label: string; hint?: string; options: string[];
  selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <fieldset className="form-group-block">
      <legend>{label}{hint && <span className="label-hint"> — {hint}</span>}</legend>
      <div className="chips-grid">
        {options.map((opt) => (
          <button
            key={opt} type="button"
            className={`chip-btn${selected.includes(opt) ? ' selected' : ''}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreatorsApply() {
  const [selectedTier, setSelectedTier] = useState<CreatorTier | null>(null);
  const [form, setForm]                 = useState<ApplyForm>(emptyForm);
  const [submitted, setSubmitted]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);

  const tierConfig = selectedTier ? TIERS.find((t) => t.id === selectedTier)! : null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleMultiToggle(field: 'tools' | 'niches' | 'serviceCapabilities', value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).includes(value)
        ? (prev[field] as string[]).filter((v) => v !== value)
        : [...(prev[field] as string[]), value],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTier) return;
    setSubmitting(true);
    setSubmitError(null);

    const credentialLinks = form.credentialLinksRaw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const { error } = await insertCreatorApplication({
      full_name:        form.fullName,
      email:            form.email,
      tools:            form.tools,
      portfolio_url:    form.portfolioUrl || null,
      portfolio_url_2:  form.portfolioUrl2 || null,
      niches:           form.niches,
      experience:       form.experience,
      available_hours:  form.availableHours,
      message:          form.message || null,
      status:           'new',
      tier:             selectedTier,
      requested_plan_price: tierConfig?.planPrice ?? 0,
      // Professional+
      top_projects:        form.topProjects        || null,
      service_capabilities: form.serviceCapabilities,
      fulfillment_speed:    form.fulfillmentSpeed  || null,
      // Verified only
      github_url:           form.githubUrl         || null,
      linkedin_url:         form.linkedinUrl        || null,
      certifications:       form.certifications     || null,
      credential_links:     credentialLinks,
      case_studies:         form.caseStudies        || null,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyErrorMessage(error));
      return;
    }

    setSubmitted(true);
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (submitted && tierConfig) {
    return (
      <div className="creators-page">
        <div className="container creators-success">
          <div className="success-icon">✓</div>
          <h2>Application Submitted</h2>
          <div className="success-tier-badge" style={{ color: tierConfig.badgeColor, borderColor: tierConfig.badgeColor + '44', backgroundColor: tierConfig.badgeColor + '15' }}>
            {tierConfig.badge} — {tierConfig.name}
          </div>
          <p>
            Thanks, <strong>{form.fullName}</strong>. We review every application manually.
            {selectedTier !== 'free'
              ? ' We\'ll review your portfolio and credentials within 3–5 business days. If approved, we\'ll send subscription activation instructions before your account goes live. You won\'t be charged today.'
              : ' If your skills are a good fit, we\'ll reach out within 3–5 business days.'}
          </p>
          <p className="success-note">
            We're selective because build quality directly affects buyer outcomes. We'll be direct with feedback either way.
          </p>
          <Link to="/" className="btn btn-ghost btn-sm">Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── Tier selection ────────────────────────────────────────────────────────────
  if (!selectedTier) {
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
          <div className="tier-select-header">
            <h2>Step 1 — Choose your creator tier</h2>
            <p className="tier-select-sub">
              Select the tier that best matches your experience. You won't be charged today — payment is only required after admin approval for paid tiers.
            </p>
          </div>

          <div className="tier-cards-grid">
            {TIERS.map((t) => (
              <TierCard key={t.id} tier={t} selected={selectedTier === t.id} onSelect={setSelectedTier} />
            ))}
          </div>

          <div className="tier-info-banner">
            <strong>Not sure which tier to choose?</strong> Start with Free and upgrade later. Tier upgrades are handled by the MicroBuild team after your initial application is reviewed.
          </div>
        </div>
      </div>
    );
  }

  // ── Application form ──────────────────────────────────────────────────────────
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

            {/* Tier badge + change option */}
            <div
              className="selected-tier-banner"
              style={{ borderColor: tierConfig!.badgeColor + '55', backgroundColor: tierConfig!.badgeColor + '10' }}
            >
              <div className="stb-left">
                <span
                  className="tier-badge"
                  style={{ color: tierConfig!.badgeColor, borderColor: tierConfig!.badgeColor + '44', backgroundColor: tierConfig!.badgeColor + '18' }}
                >
                  {tierConfig!.badge}
                </span>
                <span className="stb-name">{tierConfig!.name}</span>
                {tierConfig!.planPrice > 0 && (
                  <span className="stb-price">
                    {tierConfig!.price} after approval — no charge today
                  </span>
                )}
              </div>
              <button
                type="button"
                className="stb-change-btn"
                onClick={() => setSelectedTier(null)}
              >
                Change tier
              </button>
            </div>

            {/* Contact Info */}
            <fieldset className="form-group-block">
              <legend>Contact Info</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Full Name *</label>
                  <input id="fullName" name="fullName" type="text" required placeholder="Alex Rivera" value={form.fullName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input id="email" name="email" type="email" required placeholder="alex@example.com" value={form.email} onChange={handleChange} />
                </div>
              </div>
            </fieldset>

            {/* Tools */}
            <ChipGroup
              label="Tools You Use"
              hint="select everything you're comfortable delivering with"
              options={toolOptions}
              selected={form.tools}
              onToggle={(v) => handleMultiToggle('tools', v)}
            />

            {/* Portfolio */}
            <fieldset className="form-group-block">
              <legend>Portfolio Links</legend>
              <div className="form-group">
                <label htmlFor="portfolioUrl">
                  Primary Portfolio or Work Sample *
                  <span className="label-hint"> — a live page, Behance, GitHub, etc.</span>
                </label>
                <input id="portfolioUrl" name="portfolioUrl" type="text" required placeholder="https://yourportfolio.com" value={form.portfolioUrl} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="portfolioUrl2">
                  Second Link
                  <span className="label-hint"> — optional: another project, social, or Notion doc</span>
                </label>
                <input id="portfolioUrl2" name="portfolioUrl2" type="text" placeholder="https://..." value={form.portfolioUrl2} onChange={handleChange} />
              </div>
            </fieldset>

            {/* ── Professional+ fields ──────────────────────────────────── */}
            {(selectedTier === 'professional' || selectedTier === 'verified') && (
              <>
                <fieldset className="form-group-block tier-gated-block">
                  <legend>Top Projects *
                    <span className="tier-gated-label">Professional+</span>
                  </legend>
                  <div className="form-group">
                    <textarea
                      id="topProjects" name="topProjects" required rows={4}
                      placeholder="Describe your 2–3 strongest builds. What were they? What did they accomplish? Include URLs if possible."
                      value={form.topProjects} onChange={handleChange}
                    />
                  </div>
                </fieldset>

                <ChipGroup
                  label="Service Capabilities"
                  hint="select every build type you can deliver"
                  options={serviceCapabilityOptions}
                  selected={form.serviceCapabilities}
                  onToggle={(v) => handleMultiToggle('serviceCapabilities', v)}
                />

                <fieldset className="form-group-block tier-gated-block">
                  <legend>Fulfillment Speed *
                    <span className="tier-gated-label">Professional+</span>
                  </legend>
                  <div className="form-group">
                    <select id="fulfillmentSpeed" name="fulfillmentSpeed" required value={form.fulfillmentSpeed} onChange={handleChange}>
                      <option value="">Select typical delivery speed…</option>
                      {fulfillmentSpeedOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </fieldset>
              </>
            )}

            {/* ── Verified-only fields ──────────────────────────────────── */}
            {selectedTier === 'verified' && (
              <>
                <fieldset className="form-group-block tier-gated-block tier-gated-block--verified">
                  <legend>Professional Profiles
                    <span className="tier-gated-label tier-gated-label--verified">Verified Only</span>
                  </legend>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="githubUrl">GitHub Profile URL *</label>
                      <input id="githubUrl" name="githubUrl" type="text" required placeholder="https://github.com/yourusername" value={form.githubUrl} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="linkedinUrl">LinkedIn Profile URL</label>
                      <input id="linkedinUrl" name="linkedinUrl" type="text" placeholder="https://linkedin.com/in/..." value={form.linkedinUrl} onChange={handleChange} />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="form-group-block tier-gated-block tier-gated-block--verified">
                  <legend>Credentials & Certifications *
                    <span className="tier-gated-label tier-gated-label--verified">Verified Only</span>
                  </legend>
                  <div className="form-group">
                    <label htmlFor="certifications">
                      Certifications / Coursework / Degree
                      <span className="label-hint"> — e.g. Webflow University, Google UX, HubSpot, university degree</span>
                    </label>
                    <textarea id="certifications" name="certifications" rows={3} placeholder="List any relevant certifications, courses, or degree programs you have completed." value={form.certifications} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="credentialLinksRaw">
                      Proof / Credential Links
                      <span className="label-hint"> — one URL per line (certificate pages, badges, Credly, etc.)</span>
                    </label>
                    <textarea id="credentialLinksRaw" name="credentialLinksRaw" rows={3} placeholder={"https://credential.net/...\nhttps://www.credly.com/..."} value={form.credentialLinksRaw} onChange={handleChange} />
                  </div>
                </fieldset>

                <fieldset className="form-group-block tier-gated-block tier-gated-block--verified">
                  <legend>Case Studies *
                    <span className="tier-gated-label tier-gated-label--verified">Verified Only</span>
                  </legend>
                  <div className="form-group">
                    <textarea
                      id="caseStudies" name="caseStudies" required rows={5}
                      placeholder="Describe real client projects with measurable results. Include the business type, the problem you solved, what you built, and the outcome (e.g. leads generated, conversion rate, client feedback)."
                      value={form.caseStudies} onChange={handleChange}
                    />
                  </div>
                </fieldset>
              </>
            )}

            {/* Niches */}
            <ChipGroup
              label="Industries You Know"
              hint="select trades or local service niches you have experience with"
              options={nicheOptions}
              selected={form.niches}
              onToggle={(v) => handleMultiToggle('niches', v)}
            />

            {/* Experience & Availability */}
            <fieldset className="form-group-block">
              <legend>Experience & Availability</legend>
              <div className="form-group">
                <label htmlFor="experience">
                  Relevant Experience *
                  <span className="label-hint"> — landing pages, funnels, lead-gen tools, or similar</span>
                </label>
                <textarea
                  id="experience" name="experience" required rows={5}
                  placeholder="Describe the most relevant things you've built. What were they for? What did they accomplish? Include URLs or screenshots if you can."
                  value={form.experience} onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="availableHours">Available Hours Per Week *</label>
                <select id="availableHours" name="availableHours" required value={form.availableHours} onChange={handleChange}>
                  <option value="">Select availability…</option>
                  {hoursOptions.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="message">Anything else? <span className="label-hint"> — optional</span></label>
                <textarea
                  id="message" name="message" rows={3}
                  placeholder="Why do you want to build for MicroBuild? Questions? Constraints we should know about?"
                  value={form.message} onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* Pricing notice */}
            {tierConfig!.planPrice > 0 && (
              <div className="pricing-notice" style={{ borderColor: tierConfig!.badgeColor + '44', backgroundColor: tierConfig!.badgeColor + '08' }}>
                <strong>Pricing transparency:</strong> The {tierConfig!.name} tier costs <strong>{tierConfig!.price}</strong> after admin approval.
                You will not be charged today. If approved, we will send subscription activation instructions before your account goes live.
                You can decline at that point at no cost.
              </div>
            )}

            {submitError && (
              <div className="form-error-banner">{submitError}</div>
            )}

            <button type="submit" className="btn btn-primary btn-lg form-submit" disabled={submitting}>
              {submitting ? 'Submitting…' : `Submit ${tierConfig!.name} Application →`}
            </button>
            <p className="form-disclaimer">
              Applications are reviewed manually. We'll respond within 3–5 business days.
            </p>
          </form>

          {/* Sidebar */}
          <div className="creators-sidebar">
            <div className="creators-info-card tier-req-card">
              <h3>
                <span style={{ color: tierConfig!.badgeColor }}>{tierConfig!.badge}</span>
                {' '}Requirements
              </h3>
              <ul className="creators-criteria">
                {tierConfig!.requirements.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>

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
              <p>MicroBuild is in early access. Creator spots are limited — we're onboarding selectively to maintain quality.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
