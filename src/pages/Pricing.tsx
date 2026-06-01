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
            Choose a MicroBuild package, or join as a creator and publish workflows.
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

        {/* ── Section 1: Get a MicroBuild ───────────────────────────── */}
        <section className="pricing-section" id="get-a-microbuild" aria-labelledby="pricing-buyers-heading">
          <div className="pricing-section-header">
            <h2 id="pricing-buyers-heading" className="pricing-section-title">
              Get a MicroBuild
            </h2>
            <p className="pricing-section-lead">
              Pay per MicroBuild — no buyer subscription required.
            </p>
          </div>

          <div className="pricing-grid">
            {buyerPricingPlans.map((tier) => (
              <div
                key={tier.id}
                className={`pricing-card${tier.highlighted ? ' pricing-card--highlighted' : ''}`}
              >
                {tier.highlighted && (
                  <div className="pricing-badge">Recommended</div>
                )}
                <div className="pricing-card-header">
                  <h3 className="tier-name">{tier.name}</h3>
                  <div className="tier-price">
                    {typeof tier.price === 'number' ? (
                      <>
                        <span className="price-dollar">$</span>
                        <span className="price-value">{tier.price}</span>
                      </>
                    ) : (
                      <span className="price-value">{tier.price}</span>
                    )}
                  </div>
                  <p className="tier-description">{tier.description}</p>
                </div>
                <ul className="tier-features">
                  {tier.features.map((f) => (
                    <li key={f}>
                      <span className="tier-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pricing-section-footer">
            <Link to="/request" className="btn btn-lg btn-primary">
              Request a MicroBuild
            </Link>
            <p className="pricing-section-note">{BUYER_PRICING_NOTE}</p>
          </div>
        </section>

        {/* ── Section 2: Build on MicroBuild ────────────────────────── */}
        <section className="pricing-section pricing-section--creators" id="build-on-microbuild" aria-labelledby="pricing-creators-heading">
          <div className="pricing-section-header">
            <h2 id="pricing-creators-heading" className="pricing-section-title">
              Build on MicroBuild
            </h2>
            <p className="pricing-section-lead">
              Creator plans unlock marketplace tools — workflow publishing, applications, and trust signals.
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
              </div>
            ))}
          </div>

          <div className="pricing-section-footer">
            <Link to="/creators/apply" className="btn btn-lg btn-primary">
              Apply as Creator
            </Link>
            <p className="pricing-section-note">{CREATOR_PRICING_NOTE}</p>
            <p className="pricing-section-note pricing-section-note--muted">
              Checkout is not active yet — subscriptions activate after admin approval when Stripe is connected.
            </p>
          </div>
        </section>

        <div className="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>Is there a buyer subscription?</h3>
              <p>No. Buyers pay per MicroBuild. No buyer subscription required.</p>
            </div>
            <div className="faq-item">
              <h3>When is the final price confirmed?</h3>
              <p>{BUYER_PRICING_NOTE}</p>
            </div>
            <div className="faq-item">
              <h3>What do creator plans include?</h3>
              <p>
                Free, Professional, and Verified tiers unlock more applications, published workflows,
                analytics, and buyer trust signals. {CREATOR_PRICING_NOTE}
              </p>
            </div>
            <div className="faq-item">
              <h3>When are creators charged?</h3>
              <p>
                Not on signup. Paid tiers require admin approval first. Checkout is not active yet —
                Stripe will connect in a later phase.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CTASection
        title="Ready to get started?"
        subtitle="Request a MicroBuild for your business, or apply as a creator to publish workflows on the marketplace."
        primaryLabel="Request a MicroBuild"
        primaryTo="/request"
        secondaryLabel="Apply as Creator"
        secondaryTo="/creators/apply"
      />
    </div>
  );
}
