import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { BuyerRequest, MicroBuildCategory, MicroBuildListing } from '../types';
import { mockListings } from '../data/mockListings';
import { fetchTemplateBySlug } from '../lib/templates';
import { insertBuyerRequest } from '../lib/supabase';
import type { SupabaseInsertError } from '../lib/supabase';
import { generateBuildPacket } from '../lib/buildPacket';
import type { GeneratedBuildPacket } from '../lib/buildPacket';
import { previewBuyerRequest } from '../lib/buyerAI';
import './Request.css';

// ─── Constants ─────────────────────────────────────────────────────────────────

const BUILD_OPTIONS: { value: MicroBuildCategory | 'Not sure — recommend one'; icon: string; desc: string; price: string }[] = [
  { value: 'Quote Funnel',              icon: '💰', desc: 'Captures lead info + instant price range', price: '$150–$300' },
  { value: 'Booking Page',              icon: '📅', desc: 'Online appointment scheduling for your service', price: '$150–$300' },
  { value: 'Review Booster',            icon: '⭐', desc: 'Routes happy customers to Google reviews', price: '$100–$200' },
  { value: 'Package Selector',          icon: '📦', desc: 'Let customers choose and understand your tiers', price: '$200–$400' },
  { value: 'Trust Page',                icon: '🏆', desc: 'Before/after gallery + testimonials + strong CTA', price: '$200–$350' },
  { value: 'Not sure — recommend one',  icon: '🤔', desc: "Tell us your goal and we'll recommend the right build", price: 'Custom' },
];

const GOAL_OPTIONS = [
  { value: 'Get more quote requests',               icon: '💰', desc: 'Capture leads who want a price' },
  { value: 'Get more bookings',                     icon: '📅', desc: 'Turn visitors into scheduled appointments' },
  { value: 'Get more Google reviews',               icon: '⭐', desc: 'Route happy customers to leave reviews' },
  { value: 'Reduce repetitive customer questions',  icon: '🔁', desc: 'Answer FAQs before customers call' },
  { value: 'Show before/after work better',         icon: '🏆', desc: 'Prove your quality with a visual gallery' },
  { value: 'Improve trust before customers call',   icon: '🤝', desc: 'Build credibility before the first contact' },
  { value: 'Not sure yet',                          icon: '💡', desc: "Tell us your problem and we'll suggest a goal" },
];

const BUDGET_OPTIONS = [
  'Under $100', '$100–$200', '$200–$400', '$400–$800', '$800+', 'Not sure yet',
];

const DEADLINE_OPTIONS = [
  'ASAP — within a week', '1–2 weeks', '2–4 weeks', 'No hard deadline',
];

const CTA_OPTIONS = [
  'Call us', 'Text us', 'Book online', 'Request a quote', 'Leave a review', 'Not sure',
];

const LEAD_SOURCE_OPTIONS = [
  'Google search', 'Google Maps / Business', 'Word of mouth', 'Instagram / Social',
  'Door hanger / mailer', 'Referral from customer', 'Other',
];

// ─── Extended form state ────────────────────────────────────────────────────────

interface ExtendedForm extends BuyerRequest {
  cityState: string;
  instagramUrl: string;
  googleBusinessUrl: string;
  preferredCta: string;
  servicesOffered: string;
  targetCustomer: string;
  leadSource: string;
}

const INITIAL_FORM: ExtendedForm = {
  fullName: '', email: '', phone: '',
  businessName: '', industry: '', websiteSocial: '',
  buildType: '', mainGoal: '', currentProblem: '',
  budget: '', deadline: '', styleNotes: '',
  cityState: '', instagramUrl: '', googleBusinessUrl: '',
  preferredCta: '', servicesOffered: '', targetCustomer: '', leadSource: '',
};

// ─── Error message ──────────────────────────────────────────────────────────────

function friendlyErrorMessage(err: SupabaseInsertError): string {
  if (err.code === '42501') {
    return (
      'Submission is temporarily unavailable — our database policies are still being configured. ' +
      'Please email us directly and we will get back to you within 24 hours.'
    );
  }
  return 'There was a problem submitting your request. Please try again or email us directly.';
}

// ─── Pack extra fields into style_notes ────────────────────────────────────────

function packStyleNotes(form: ExtendedForm): string {
  const parts: string[] = [];
  if (form.styleNotes.trim()) parts.push(`[Visual Notes]\n${form.styleNotes.trim()}`);

  const ctx: string[] = [];
  if (form.cityState)        ctx.push(`City/State: ${form.cityState}`);
  if (form.instagramUrl)     ctx.push(`Instagram: ${form.instagramUrl}`);
  if (form.googleBusinessUrl) ctx.push(`Google Business: ${form.googleBusinessUrl}`);
  if (form.preferredCta)     ctx.push(`Preferred CTA: ${form.preferredCta}`);
  if (form.servicesOffered)  ctx.push(`Services: ${form.servicesOffered}`);
  if (form.targetCustomer)   ctx.push(`Target Customer: ${form.targetCustomer}`);
  if (form.leadSource)       ctx.push(`Lead Source: ${form.leadSource}`);

  if (ctx.length > 0) parts.push(`[Business Context]\n${ctx.join('\n')}`);
  return parts.join('\n\n');
}

// ─── AI Preview Panel ───────────────────────────────────────────────────────────

function AiPreviewPanel({ form }: { form: ExtendedForm }) {
  const preview = useMemo(() => previewBuyerRequest({
    business_name:   form.businessName,
    industry:        form.industry,
    build_type:      form.buildType,
    main_goal:       form.mainGoal,
    current_problem: form.currentProblem,
    budget:          form.budget || null,
    deadline:        form.deadline || null,
    website_social:  form.websiteSocial || form.instagramUrl || null,
  }), [form]);

  const hasEnough = form.businessName.length > 1 || form.industry.length > 1 || form.mainGoal.length > 5;
  if (!hasEnough) return null;

  return (
    <div className="req-ai-preview">
      <div className="req-ai-preview-header">
        <span className="req-ai-badge">⚡ AI-style Request Preview · Rules-based</span>
        <span className="req-ai-readiness" style={{ color: preview.readinessColor }}>
          {preview.readinessLabel} · {preview.readinessScore}/100
        </span>
      </div>

      <div className="req-ai-grid">
        <div className="req-ai-cell">
          <span className="req-ai-cell-label">Recommended Build</span>
          <span className="req-ai-cell-value">{preview.recommendedBuild}</span>
        </div>
        <div className="req-ai-cell">
          <span className="req-ai-cell-label">Est. Price Range</span>
          <span className="req-ai-cell-value">{preview.estimatedPriceRange}</span>
        </div>
        <div className="req-ai-cell">
          <span className="req-ai-cell-label">Complexity</span>
          <span className="req-ai-cell-value">{preview.complexity}</span>
        </div>
        <div className="req-ai-cell">
          <span className="req-ai-cell-label">Quote Readiness</span>
          <span className="req-ai-cell-value" style={{ color: preview.readinessColor }}>
            {preview.readinessLabel}
          </span>
        </div>
      </div>

      {preview.missingFields.length > 0 && (
        <div className="req-ai-missing">
          <span className="req-ai-missing-label">To improve readiness, add:</span>
          <ul className="req-ai-missing-list">
            {preview.missingFields.slice(0, 4).map((f) => (
              <li key={f} className="req-ai-missing-item">○ {f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="req-ai-next-step">
        <span className="req-ai-step-icon">→</span> {preview.suggestedNextStep}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function Request() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const prefillSlug = searchParams.get('build');

  const mockPrefill: MicroBuildListing | null = prefillSlug
    ? (mockListings.find((l) => l.slug === prefillSlug) ?? null)
    : null;

  const [prefillListing, setPrefillListing] = useState<MicroBuildListing | null>(mockPrefill);
  const [templateDbId,   setTemplateDbId]   = useState<string | null>(null);
  const [form,           setForm]           = useState<ExtendedForm>({
    ...INITIAL_FORM,
    buildType: mockPrefill?.category ?? '',
  });
  const [submitted,   setSubmitted]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [packet,      setPacket]      = useState<GeneratedBuildPacket | null>(null);

  useEffect(() => {
    if (!prefillSlug) return;
    fetchTemplateBySlug(prefillSlug).then(({ listing, fromSupabase }) => {
      if (listing) {
        setPrefillListing(listing);
        setTemplateDbId(fromSupabase ? listing.id : null);
        setForm((prev) =>
          prev.buildType === '' || prev.buildType === (mockPrefill?.category ?? '')
            ? { ...prev, buildType: listing.category }
            : prev
        );
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSlug]);

  function set(field: keyof ExtendedForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    set(e.target.name as keyof ExtendedForm, e.target.value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const packedNotes = packStyleNotes(form);

    const { error } = await insertBuyerRequest({
      full_name:           form.fullName,
      email:               form.email,
      phone:               form.phone     || null,
      business_name:       form.businessName,
      industry:            form.industry,
      website_social:      form.websiteSocial || form.instagramUrl || form.googleBusinessUrl || null,
      build_type:          form.buildType || 'Not sure',
      main_goal:           form.mainGoal  || form.buildType || 'Not specified',
      current_problem:     form.currentProblem || 'Not provided',
      budget:              form.budget    || null,
      deadline:            form.deadline  || null,
      style_notes:         packedNotes   || null,
      user_id:             null,
      business_profile_id: null,
      template_id:         templateDbId,
      status:              'new',
    });

    setSubmitting(false);

    if (error) { setSubmitError(friendlyErrorMessage(error)); return; }

    setPacket(generateBuildPacket({
      fullName: form.fullName, email: form.email, phone: form.phone,
      businessName: form.businessName, industry: form.industry,
      websiteSocial: form.websiteSocial || form.instagramUrl || '',
      buildType: (form.buildType || 'Not sure') as MicroBuildCategory | 'Not sure',
      mainGoal: form.mainGoal, currentProblem: form.currentProblem,
      budget: form.budget, deadline: form.deadline, styleNotes: packedNotes,
    }, prefillListing?.title));
    setSubmitted(true);
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="request-page">
        <div className="container request-success">
          <div className="success-check">✓</div>
          <h2 className="success-title">Request Received</h2>
          <p className="success-message">
            Thanks, <strong>{form.fullName}</strong>. We received your request for{' '}
            <strong>{form.businessName}</strong>. Every request is reviewed manually — we'll reach out
            within 1–2 business days with next steps.
          </p>
          <p className="success-note">
            No payment is collected at this stage. We'll confirm scope and pricing before anything moves forward.
          </p>

          {/* Next Steps */}
          <div className="success-timeline">
            {[
              { icon: '✉', step: 'Request received',  desc: 'Your request is in the queue. We read every one.' },
              { icon: '🔍', step: 'We review it',      desc: 'Typically within 1–2 business days.' },
              { icon: '📋', step: 'We send a proposal', desc: 'Scope, price, and timeline confirmed first.' },
              { icon: '⚙', step: 'Creator builds it', desc: 'A vetted creator gets a structured brief.' },
              { icon: '✅', step: 'You approve & go live', desc: 'One revision round included.' },
            ].map((s) => (
              <div key={s.step} className="success-step">
                <span className="success-step-icon">{s.icon}</span>
                <div>
                  <div className="success-step-label">{s.step}</div>
                  <div className="success-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="success-ctas">
            {user && (
              <Link to="/dashboard" className="btn btn-primary btn-sm">View Dashboard →</Link>
            )}
            <Link to="/browse" className="btn btn-ghost btn-sm">Browse More MicroBuilds</Link>
          </div>

          {/* AI review of submission */}
          {packet && (
            <div className="success-analysis">
              <h3 className="success-analysis-title">What our team will review</h3>
              <p className="success-analysis-sub">
                Here's a summary of your request. We'll confirm all details before scoping.
              </p>
              <div className="success-analysis-grid">
                <div className="sai">
                  <span className="sai-label">Business</span>
                  <span className="sai-value">{form.businessName} · {form.industry}</span>
                </div>
                <div className="sai">
                  <span className="sai-label">Recommended Build</span>
                  <span className="sai-value">{packet.recommendedBuild}</span>
                </div>
                <div className="sai">
                  <span className="sai-label">Goal</span>
                  <span className="sai-value">{form.mainGoal || '—'}</span>
                </div>
                <div className="sai">
                  <span className="sai-label">Estimated Price</span>
                  <span className="sai-value">{packet.suggestedPriceRange}</span>
                </div>
                {form.budget && (
                  <div className="sai">
                    <span className="sai-label">Budget Indicated</span>
                    <span className="sai-value">{form.budget}</span>
                  </div>
                )}
                {form.deadline && (
                  <div className="sai">
                    <span className="sai-label">Timeline</span>
                    <span className="sai-value">{form.deadline}</span>
                  </div>
                )}
              </div>
              {packet.missingInfoFlags.length > 0 && (
                <div className="success-missing">
                  <span className="success-missing-label">Our team may ask about:</span>
                  <ul>
                    {packet.missingInfoFlags.slice(0, 3).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="request-page">
      <div className="request-hero">
        <div className="container">
          <h1 className="request-title">Request a MicroBuild</h1>
          <p className="request-sub">
            Tell us about your business and what you want to accomplish.
            The more detail you give, the faster we can scope and price your build.
          </p>
          {user && (
            <p className="request-logged-in-note">
              Signed in as <strong>{user.email}</strong> ·{' '}
              <Link to="/dashboard" className="req-dashboard-link">View Dashboard</Link>
            </p>
          )}
        </div>
      </div>

      <div className="container request-body">
        <div className="request-grid">
          <form className="request-form" onSubmit={handleSubmit} noValidate>

            {/* ── Section 1: Business Basics ─────────────────────── */}
            <fieldset className="form-group-block">
              <legend>Business Basics</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fullName">Your Name *</label>
                  <input id="fullName" name="fullName" type="text" required
                    placeholder="Jane Smith" value={form.fullName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="businessName">Business Name *</label>
                  <input id="businessName" name="businessName" type="text" required
                    placeholder="Smith Pool Services" value={form.businessName} onChange={handleChange} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input id="email" name="email" type="email" required
                    placeholder="jane@smithpools.com" value={form.email} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone <span className="label-hint">(optional)</span></label>
                  <input id="phone" name="phone" type="tel"
                    placeholder="(555) 555-5555" value={form.phone} onChange={handleChange} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="industry">Industry / Trade *</label>
                  <input id="industry" name="industry" type="text" required
                    placeholder="Pool Cleaning, Auto Detailing, HVAC…" value={form.industry} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="cityState">City, State <span className="label-hint">(optional)</span></label>
                  <input id="cityState" name="cityState" type="text"
                    placeholder="Phoenix, AZ" value={form.cityState} onChange={handleChange} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="websiteSocial">Website URL <span className="label-hint">(optional)</span></label>
                <input id="websiteSocial" name="websiteSocial" type="url"
                  placeholder="https://yoursite.com" value={form.websiteSocial} onChange={handleChange} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="instagramUrl">Instagram / Social <span className="label-hint">(optional)</span></label>
                  <input id="instagramUrl" name="instagramUrl" type="text"
                    placeholder="@yourhandle or https://instagram.com/…" value={form.instagramUrl} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="googleBusinessUrl">Google Business Profile <span className="label-hint">(optional)</span></label>
                  <input id="googleBusinessUrl" name="googleBusinessUrl" type="url"
                    placeholder="https://g.page/yourbusiness" value={form.googleBusinessUrl} onChange={handleChange} />
                </div>
              </div>
            </fieldset>

            {/* ── Section 2: Business Goal ───────────────────────── */}
            <fieldset className="form-group-block">
              <legend>Business Goal</legend>
              <p className="form-section-sub">What does success look like for you?</p>
              <div className="req-goal-grid">
                {GOAL_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`req-goal-card${form.mainGoal === opt.value ? ' req-goal-card--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="mainGoal"
                      value={opt.value}
                      checked={form.mainGoal === opt.value}
                      onChange={handleChange}
                    />
                    <span className="req-goal-icon">{opt.icon}</span>
                    <span className="req-goal-label">{opt.value}</span>
                    <span className="req-goal-desc">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* ── Section 3: Requested MicroBuild ───────────────── */}
            <fieldset className="form-group-block">
              <legend>Requested MicroBuild</legend>
              <p className="form-section-sub">Which build type fits your goal? Select "Not sure" and we'll recommend one.</p>
              <div className="req-build-grid">
                {BUILD_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`req-build-card${form.buildType === opt.value ? ' req-build-card--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="buildType"
                      value={opt.value}
                      checked={form.buildType === opt.value}
                      onChange={handleChange}
                    />
                    <div className="req-build-card-inner">
                      <span className="req-build-icon">{opt.icon}</span>
                      <div className="req-build-info">
                        <span className="req-build-name">{opt.value}</span>
                        <span className="req-build-desc">{opt.desc}</span>
                      </div>
                      <span className="req-build-price">{opt.price}</span>
                    </div>
                  </label>
                ))}
              </div>
              {prefillListing && (
                <div className="req-prefill-note">
                  Pre-selected from: <strong>{prefillListing.title}</strong> · Starting from ${prefillListing.startingPrice}
                </div>
              )}
            </fieldset>

            {/* ── Section 4: Current Problem ────────────────────── */}
            <fieldset className="form-group-block">
              <legend>Current Problem</legend>
              <p className="form-section-sub">What's not working right now? The more specific, the better.</p>
              <div className="req-problem-examples">
                {[
                  '"People ask for prices but never book"',
                  '"I answer the same questions every day"',
                  '"I need more Google reviews"',
                  '"Customers don\'t understand my packages"',
                  '"My website doesn\'t convert visitors"',
                ].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="req-example-chip"
                    onClick={() => set('currentProblem', ex.replace(/^"|"$/g, ''))}
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <div className="form-group">
                <label htmlFor="currentProblem">Describe your situation *</label>
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

            {/* ── Section 5: Scope Details ──────────────────────── */}
            <fieldset className="form-group-block">
              <legend>Scope Details</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="budget">Budget Range</label>
                  <select id="budget" name="budget" value={form.budget} onChange={handleChange}>
                    <option value="">Select a range…</option>
                    {BUDGET_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="deadline">Timeline / Deadline</label>
                  <select id="deadline" name="deadline" value={form.deadline} onChange={handleChange}>
                    <option value="">Select a timeline…</option>
                    {DEADLINE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Preferred CTA <span className="label-hint">(what should visitors do?)</span></label>
                <div className="req-cta-row">
                  {CTA_OPTIONS.map((cta) => (
                    <label
                      key={cta}
                      className={`req-cta-chip${form.preferredCta === cta ? ' req-cta-chip--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="preferredCta"
                        value={cta}
                        checked={form.preferredCta === cta}
                        onChange={handleChange}
                      />
                      {cta}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="servicesOffered">Services You Offer <span className="label-hint">(optional)</span></label>
                  <input id="servicesOffered" name="servicesOffered" type="text"
                    placeholder="Pool cleaning, maintenance, repair, equipment install"
                    value={form.servicesOffered} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="targetCustomer">Target Customer <span className="label-hint">(optional)</span></label>
                  <input id="targetCustomer" name="targetCustomer" type="text"
                    placeholder="Homeowners 35-65 in Phoenix area"
                    value={form.targetCustomer} onChange={handleChange} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="leadSource">Current Lead Source <span className="label-hint">(optional)</span></label>
                  <select id="leadSource" name="leadSource" value={form.leadSource} onChange={handleChange}>
                    <option value="">How do most leads find you?</option>
                    {LEAD_SOURCE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="styleNotes">Style Notes <span className="label-hint">(optional — colors, tone, references)</span></label>
                <textarea
                  id="styleNotes"
                  name="styleNotes"
                  rows={3}
                  placeholder="e.g. Clean and professional, dark background. Similar feel to Jobber or ServiceTitan. No generic stock photos."
                  value={form.styleNotes}
                  onChange={handleChange}
                />
              </div>
            </fieldset>

            {/* ── AI Preview ────────────────────────────────────── */}
            <AiPreviewPanel form={form} />

            {submitError && (
              <div className="form-error-banner">{submitError}</div>
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

          {/* Sidebar */}
          <div className="request-sidebar">
            <div className="request-info-card">
              <h3>What happens after you submit?</h3>
              <ol className="request-steps">
                <li><strong>We review your request</strong><span>Usually within 1–2 business days. We read every submission.</span></li>
                <li><strong>We send a proposal</strong><span>Scope, price, and turnaround confirmed before anything moves forward.</span></li>
                <li><strong>A creator builds it</strong><span>A vetted MicroBuild creator receives a structured brief and gets to work.</span></li>
                <li><strong>You review and approve</strong><span>One revision round included. Payment released only after approval.</span></li>
                <li><strong>Go live</strong><span>Share your MicroBuild link and start collecting leads, bookings, or reviews.</span></li>
              </ol>
            </div>

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
