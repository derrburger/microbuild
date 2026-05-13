import { Link } from 'react-router-dom';
import { pricingTiers } from '../data/mockListings';
import CTASection from '../components/CTASection';
import './Pricing.css';

export default function Pricing() {
  return (
    <div className="pricing-page">
      <div className="pricing-hero">
        <div className="container">
          <div className="pricing-access-badge">Early Access Pricing</div>
          <h1 className="pricing-title">Simple, Transparent Pricing</h1>
          <p className="pricing-sub">
            No subscriptions. No surprise fees. Pay per build — final scope and price are confirmed before any work begins.
          </p>
        </div>
      </div>

      <div className="container pricing-body">
        <div className="pricing-grid">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
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
                  to={tier.price === 'Custom' ? '/request' : '/request'}
                  className={`btn btn-lg${tier.highlighted ? ' btn-primary' : ' btn-ghost'}`}
                >
                  {tier.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="pricing-note">
          Prices shown are indicative starting points. Final scope and cost are confirmed via proposal before any work begins or payment is collected. MicroBuild is currently in early access.
        </p>

        <div className="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>Is there a subscription?</h3>
              <p>No. MicroBuild is a pay-per-build marketplace. You pay for what you request, nothing more.</p>
            </div>
            <div className="faq-item">
              <h3>What if I'm not happy with the result?</h3>
              <p>Every build includes one revision round. If you're still not satisfied, we'll make it right or refund you.</p>
            </div>
            <div className="faq-item">
              <h3>How is my build branded?</h3>
              <p>Your MicroBuild uses your business name, logo, and color scheme. It looks like you built it yourself.</p>
            </div>
            <div className="faq-item">
              <h3>Do I need a website?</h3>
              <p>No. Every MicroBuild is a standalone page with its own URL you can share anywhere — no existing website required.</p>
            </div>
            <div className="faq-item">
              <h3>Can I request something not listed?</h3>
              <p>Yes. Submit a custom request and describe what you need. We'll let you know if we can build it.</p>
            </div>
            <div className="faq-item">
              <h3>When do I pay?</h3>
              <p>Payment is collected after you approve the final MicroBuild. You don't pay until you're satisfied.</p>
            </div>
          </div>
        </div>
      </div>

      <CTASection
        title="Still have questions?"
        subtitle="Submit a request and tell us what you're looking for. We'll reach out with a custom proposal."
        primaryLabel="Request a MicroBuild"
        primaryTo="/request"
        secondaryLabel="Browse Builds"
        secondaryTo="/browse"
      />
    </div>
  );
}
