import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  buyerPricingPlans,
  creatorPricingPlans,
  BUYER_PRICING_NOTE,
} from '../lib/pricingPlans';
import CTASection from '../components/CTASection';
import './Pricing.css';

type PricingTab = 'buyers' | 'creators';

export default function Pricing() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: PricingTab =
    tabParam === 'creators' ? 'creators' : 'buyers';
  const [activeTab, setActiveTab] = useState<PricingTab>(initialTab);

  useEffect(() => {
    if (tabParam === 'creators' || tabParam === 'buyers') {
      setActiveTab(tabParam);
      return;
    }
    if (window.location.hash === '#creators') {
      setActiveTab('creators');
    }
  }, [tabParam]);

  function selectTab(tab: PricingTab) {
    setActiveTab(tab);
    setSearchParams(tab === 'buyers' ? {} : { tab }, { replace: true });
  }

  return (
    <div className="pricing-page">
      <div className="pricing-hero">
        <div className="container">
          <div className="pricing-access-badge">Early Access Pricing</div>
          <h1 className="pricing-title">Simple, Transparent Pricing</h1>
          <p className="pricing-sub">
            {activeTab === 'buyers'
              ? 'Pay per MicroBuild — no buyer subscription required. Final scope confirmed before work begins.'
              : 'Creator marketplace plans — upgrade for more workflow publishing and applications.'}
          </p>

          <div className="pricing-tabs" role="tablist" aria-label="Pricing type">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'buyers'}
              className={`pricing-tab${activeTab === 'buyers' ? ' pricing-tab--active' : ''}`}
              onClick={() => selectTab('buyers')}
            >
              For Buyers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'creators'}
              className={`pricing-tab${activeTab === 'creators' ? ' pricing-tab--active' : ''}`}
              onClick={() => selectTab('creators')}
            >
              For Creators
            </button>
          </div>
        </div>
      </div>

      <div className="container pricing-body">
        {activeTab === 'buyers' && (
          <>
            <p className="pricing-audience-note">Pay per MicroBuild — project pricing for buyers.</p>
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
                    <h2 className="tier-name">{tier.name}</h2>
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
                  <div className="tier-cta">
                    <Link
                      to="/request"
                      className={`btn btn-lg${tier.highlighted ? ' btn-primary' : ' btn-ghost'}`}
                    >
                      {tier.cta}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <p className="pricing-note">{BUYER_PRICING_NOTE}</p>
          </>
        )}

        {activeTab === 'creators' && (
          <div id="creators">
            <p className="pricing-audience-note">
              Creator subscription pricing — Verified requires admin approval. Billing checkout is not active yet.
            </p>
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
                    <h2 className="tier-name">{plan.shortName}</h2>
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
                    {user ? (
                      <Link to="/dashboard/billing" className="btn btn-lg btn-primary">
                        View Plans
                      </Link>
                    ) : plan.id === 'free' ? (
                      <Link to="/creators/apply" className="btn btn-lg btn-primary">
                        Apply as Creator
                      </Link>
                    ) : (
                      <Link to="/signin?redirect=/dashboard/billing" className="btn btn-lg btn-primary">
                        Sign in to upgrade
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="pricing-note">
              Creator subscriptions activate after admin approval, when Stripe is connected.
              No payment is collected on this page.
            </p>
          </div>
        )}

        <div className="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            {activeTab === 'buyers' ? (
              <>
                <div className="faq-item">
                  <h3>Is there a buyer subscription?</h3>
                  <p>No. Buyers pay per MicroBuild. No buyer subscription required.</p>
                </div>
                <div className="faq-item">
                  <h3>When is the final price confirmed?</h3>
                  <p>Project scope and final price are confirmed in the Project Agreement before work begins.</p>
                </div>
                <div className="faq-item">
                  <h3>What if I'm not happy with the result?</h3>
                  <p>Every build includes a revision round agreed in your project scope. Details are confirmed before work starts.</p>
                </div>
                <div className="faq-item">
                  <h3>When do I pay?</h3>
                  <p>Payment collection will activate when Stripe is connected. Scope is approved first — no surprise charges.</p>
                </div>
              </>
            ) : (
              <>
                <div className="faq-item">
                  <h3>Do creators pay to join?</h3>
                  <p>Free Creator is $0/month. Professional ($15/mo) and Verified ($25/mo) unlock more marketplace access after approval.</p>
                </div>
                <div className="faq-item">
                  <h3>When am I charged?</h3>
                  <p>Not on signup. Paid tiers require admin approval first. Checkout activates when Stripe is connected — not yet live.</p>
                </div>
                <div className="faq-item">
                  <h3>How do I get Verified?</h3>
                  <p>Apply for Verified Creator. Admin reviews credentials and portfolio before the verified badge is granted.</p>
                </div>
                <div className="faq-item">
                  <h3>Are plan limits enforced now?</h3>
                  <p>Limits are displayed for transparency. Hard gating may come in a later phase.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <CTASection
        title={activeTab === 'buyers' ? 'Ready to get started?' : 'Ready to build on MicroBuild?'}
        subtitle={
          activeTab === 'buyers'
            ? 'Submit a request and tell us what you need. Final scope is confirmed before work begins.'
            : 'Apply as a creator or sign in to view upgrade options on your dashboard.'
        }
        primaryLabel={activeTab === 'buyers' ? 'Request a MicroBuild' : user ? 'Billing & Plans' : 'Apply as Creator'}
        primaryTo={activeTab === 'buyers' ? '/request' : user ? '/dashboard/billing' : '/creators/apply'}
        secondaryLabel={activeTab === 'buyers' ? 'Browse Builds' : 'View buyer pricing'}
        secondaryTo={activeTab === 'buyers' ? '/browse' : '/pricing'}
      />
    </div>
  );
}
