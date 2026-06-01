import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import {
  buyerPricingPlans,
  creatorPricingPlans,
  BUYER_PRICING_NOTE,
  CREATOR_PRICING_NOTE,
} from '../lib/pricingPlans';
import CTASection from '../components/CTASection';
import './Pricing.css';

function accountRoleLabel(accountType: string | undefined): string {
  if (accountType === 'creator') return 'Creator';
  if (accountType === 'buyer') return 'Buyer';
  return 'Member';
}

function buyerPlanCtaPath(planId: string, signedIn: boolean, defaultPath: string): string {
  if (signedIn && planId !== 'pro') return '/dashboard/billing';
  return defaultPath;
}

export default function Pricing() {
  const { user, loading: authLoading } = useAuth();
  const { profile: userProfile, loading: profileLoading } = useUserProfileRow();

  const signedIn = Boolean(user);
  const accountType = userProfile?.account_type;
  const showSignedInBanner = signedIn && !authLoading && !profileLoading && accountType;

  return (
    <div className="pricing-page">
      <div className="pricing-hero">
        <div className="container">
          <div className="pricing-access-badge">Early Access Pricing</div>
          <h1 className="pricing-title">Simple, Transparent Pricing</h1>
          <p className="pricing-sub">
            Choose a buyer plan to request MicroBuilds, or join as a creator and publish workflows.
          </p>
        </div>
      </div>

      <div className="container pricing-body">
        {showSignedInBanner && (
          <div className="pricing-signed-in-banner">
            <p>
              You are signed in as <strong>{accountRoleLabel(accountType)}</strong>.
              View your tailored Billing &amp; Plans for your account.
            </p>
            <Link to="/dashboard/billing" className="btn btn-primary btn-sm">
              Billing &amp; Plans
            </Link>
          </div>
        )}

        {/* ── Buyer Plans ───────────────────────────────────────────── */}
        <section className="pricing-section" id="buyer-plans" aria-labelledby="pricing-buyers-heading">
          <div className="pricing-section-header">
            <h2 id="pricing-buyers-heading" className="pricing-section-title">
              Buyer Plans
            </h2>
            <p className="pricing-section-lead">
              For businesses that want to request MicroBuilds, review creators, and manage projects.
            </p>
          </div>

          <div className="pricing-grid pricing-grid--buyer">
            {buyerPricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`pricing-card${plan.highlighted ? ' pricing-card--highlighted' : ''}`}
              >
                {plan.highlighted && (
                  <div className="pricing-badge">Recommended</div>
                )}
                <div className="pricing-card-header">
                  <h3 className="tier-name">{plan.name}</h3>
                  <div className="tier-price">
                    {plan.priceMonthly === 'custom' ? (
                      <span className="price-value">{plan.priceLabel}</span>
                    ) : (
                      <span className="price-value pricing-price-monthly">{plan.priceLabel}</span>
                    )}
                  </div>
                  <p className="tier-description">{plan.description}</p>
                </div>
                <ul className="tier-features">
                  {plan.features.map((f) => (
                    <li key={f}>
                      <span className="tier-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="tier-cta">
                  <Link
                    to={buyerPlanCtaPath(plan.id, signedIn, plan.ctaPath)}
                    className={`btn btn-lg${plan.highlighted ? ' btn-primary' : ' btn-ghost'}`}
                  >
                    {signedIn && plan.id !== 'free' && plan.id !== 'pro'
                      ? 'View Buyer Plans'
                      : plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="pricing-section-footer">
            <p className="pricing-section-note">{BUYER_PRICING_NOTE}</p>
          </div>
        </section>

        {/* ── Creator Plans ─────────────────────────────────────────── */}
        <section className="pricing-section pricing-section--creators" id="creator-plans" aria-labelledby="pricing-creators-heading">
          <div className="pricing-section-header">
            <h2 id="pricing-creators-heading" className="pricing-section-title">
              Creator Plans
            </h2>
            <p className="pricing-section-lead">
              For builders who want to apply to requests, publish workflows, and grow a creator profile.
            </p>
          </div>

          <div className="pricing-grid">
            {creatorPricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`pricing-card${plan.highlighted ? ' pricing-card--highlighted' : ''}`}
              >
                {plan.highlighted && (
                  <div className="pricing-badge">Popular</div>
                )}
                <div className="pricing-card-header">
                  <h3 className="tier-name">{plan.name}</h3>
                  <div className="tier-price">
                    <span className="price-value pricing-price-monthly">{plan.priceLabel}</span>
                  </div>
                  <p className="tier-description">{plan.description}</p>
                </div>
                <ul className="tier-features">
                  {plan.features.map((f) => (
                    <li key={f}>
                      <span className="tier-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="pricing-creator-limits">
                  <span>{plan.limits.applicationsPerMonth} applications/month</span>
                  <span>{plan.limits.publishedWorkflows} published workflows</span>
                </div>
                <div className="tier-cta">
                  {signedIn ? (
                    <Link to="/dashboard/billing" className="btn btn-lg btn-primary">
                      View Creator Plans
                    </Link>
                  ) : (
                    <Link to="/creators/apply" className="btn btn-lg btn-primary">
                      Apply as Creator
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pricing-section-footer">
            <p className="pricing-section-note">{CREATOR_PRICING_NOTE}</p>
            <p className="pricing-section-note pricing-section-note--muted">
              Checkout is not active yet — subscriptions activate when Stripe is connected.
            </p>
          </div>
        </section>

        <div className="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>What are buyer plans?</h3>
              <p>
                Monthly plans for businesses requesting MicroBuilds, reviewing creators, and managing
                projects. Free Buyer is $0/mo; paid tiers add more requests and management tools.
              </p>
            </div>
            <div className="faq-item">
              <h3>Is checkout active?</h3>
              <p>
                Not yet. You can browse plans and use the marketplace. Checkout coming soon when
                Stripe is connected — no charges on this page.
              </p>
            </div>
            <div className="faq-item">
              <h3>What do creator plans include?</h3>
              <p>
                Creator plans unlock publishing, applications, analytics, and trust signals.{' '}
                {CREATOR_PRICING_NOTE}
              </p>
            </div>
            <div className="faq-item">
              <h3>When are creators charged?</h3>
              <p>
                Not on signup. Paid creator tiers may require admin approval first. Checkout is not
                active yet.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CTASection
        title="Ready to get started?"
        subtitle="Choose a buyer plan or apply as a creator to publish workflows on the marketplace."
        primaryLabel="Start Free"
        primaryTo={signedIn ? '/dashboard/billing' : '/signin'}
        secondaryLabel="Apply as Creator"
        secondaryTo="/creators/apply"
      />
    </div>
  );
}
