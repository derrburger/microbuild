import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchTemplateBySlug } from '../lib/templates';
import templateDetails from '../data/templateDetails';
import StatusBadge from '../components/StatusBadge';
import CTASection from '../components/CTASection';
import type { MicroBuildListing } from '../types';
import './BuildDetail.css';

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? ' faq-item--open' : ''}`}>
      <button className="faq-question" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className="faq-toggle">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="faq-answer"><p>{a}</p></div>}
    </div>
  );
}

const categoryIcons: Record<string, string> = {
  'Quote Funnel': '⚡',
  'Booking Page': '📅',
  'Review Booster': '⭐',
  'Trust Page': '📸',
  'Package Selector': '🎯',
};

// Three-state pattern: undefined = loading, null = not found, object = loaded
type LoadState = MicroBuildListing | null | undefined;

export default function BuildDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [listing, setListing] = useState<LoadState>(undefined);

  useEffect(() => {
    if (!slug) {
      setListing(null);
      return;
    }
    setListing(undefined); // reset to loading on slug change
    fetchTemplateBySlug(slug).then(({ listing: data }) => setListing(data));
  }, [slug]);

  // Loading state
  if (listing === undefined) {
    return (
      <div className="detail-loading">
        <div className="container detail-loading-inner">
          <div className="detail-skeleton-header" />
          <div className="detail-skeleton-body" />
        </div>
      </div>
    );
  }

  // Not found state
  if (listing === null) {
    return (
      <div className="detail-not-found">
        <div className="container detail-not-found-inner">
          <h2>MicroBuild not found</h2>
          <p>
            No build matches <code>{slug}</code>. It may have been removed or the URL is incorrect.
          </p>
          <div className="detail-not-found-actions">
            <Link to="/browse" className="btn btn-primary btn-sm">Browse All Builds</Link>
            <Link to="/request" className="btn btn-ghost btn-sm">Submit a Custom Request</Link>
          </div>
        </div>
      </div>
    );
  }

  // Loaded state
  return (
    <div className="detail-page">
      <div className="detail-hero">
        <div className="container">
          <div className="detail-breadcrumb">
            <Link to="/browse">Browse</Link>
            <span>→</span>
            <span>{listing.title}</span>
          </div>
          <div className="detail-header">
            <div className="detail-icon">{categoryIcons[listing.category] ?? '🔧'}</div>
            <div className="detail-meta">
              <div className="detail-meta-top">
                <span className="detail-category">{listing.category}</span>
                <StatusBadge status={listing.status} />
              </div>
              <h1 className="detail-title">{listing.title}</h1>
              <p className="detail-industry">For {listing.targetIndustry} businesses</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body">
        <div className="detail-grid">
          <div className="detail-main">
            <section className="detail-section">
              <h2>About This MicroBuild</h2>
              <p>{listing.description}</p>
            </section>

            <section className="detail-section">
              <h2>What's Included</h2>
              <ul className="feature-list">
                {listing.features.map((f) => (
                  <li key={f}>
                    <span className="feature-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </section>

            <section className="detail-section">
              <h2>Setup Requirements</h2>
              <p className="setup-intro">To get started, you'll need to provide:</p>
              <ul className="setup-list">
                {listing.setupRequirements.map((req) => (
                  <li key={req}>
                    <span className="setup-bullet">→</span>
                    {req}
                  </li>
                ))}
              </ul>
            </section>

            {/* Extended sections from static detail data */}
            {templateDetails[listing.slug] && (() => {
              const detail = templateDetails[listing.slug];
              return (
                <>
                  <section className="detail-section">
                    <h2>Customer Flow</h2>
                    <p className="setup-intro">Here's exactly what your customers experience:</p>
                    <ol className="detail-flow-list">
                      {detail.customerFlow.map((step, i) => (
                        <li key={i} className="detail-flow-item">
                          <span className="detail-flow-num">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="detail-section">
                    <h2>What the Business Receives</h2>
                    <ul className="feature-list">
                      {detail.businessReceives.map((item) => (
                        <li key={item}>
                          <span className="feature-check">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="detail-section">
                    <h2>Best Fit Industries</h2>
                    <div className="detail-industries">
                      {detail.bestFitIndustries.map((ind) => (
                        <span key={ind} className="detail-industry-tag">{ind}</span>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section detail-faq">
                    <h2>Frequently Asked Questions</h2>
                    <div className="faq-list">
                      {detail.faq.map((item, i) => (
                        <FaqItem key={i} q={item.q} a={item.a} />
                      ))}
                    </div>
                  </section>
                </>
              );
            })()}
          </div>

          <aside className="detail-sidebar">
            <div className="sidebar-card">
              <div className="sidebar-price">
                <span className="price-from">Starting from</span>
                <span className="price-amount">${listing.startingPrice}</span>
              </div>
              <div className="sidebar-detail-row">
                <span>Turnaround</span>
                <strong>{listing.estimatedTurnaround}</strong>
              </div>
              <div className="sidebar-detail-row">
                <span>Main Goal</span>
                <strong>{listing.mainGoal}</strong>
              </div>
              <div className="sidebar-detail-row">
                <span>Target Industry</span>
                <strong>{listing.targetIndustry}</strong>
              </div>
              <Link
                to={`/request?build=${listing.slug}`}
                className="btn btn-primary btn-lg sidebar-cta"
              >
                Request This MicroBuild
              </Link>
              <Link to="/how-it-works" className="sidebar-how-link">
                How does this work? →
              </Link>
            </div>

            <div className="sidebar-note">
              <strong>Not exactly what you need?</strong>
              <p>
                Submit a custom request and describe what you're looking for. We'll match you with
                the right builder.
              </p>
              <Link to="/request" className="btn btn-ghost btn-sm">
                Submit Custom Request
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <CTASection
        title="Ready to get this built for your business?"
        subtitle="Request this MicroBuild today and start generating revenue in days."
        primaryLabel="Request This Build"
        primaryTo={`/request?build=${listing.slug}`}
        secondaryLabel="View All Builds"
        secondaryTo="/browse"
      />
    </div>
  );
}
