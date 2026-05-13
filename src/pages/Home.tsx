import { Link } from 'react-router-dom';
import MicroBuildCard from '../components/MicroBuildCard';
import CTASection from '../components/CTASection';
import { mockListings } from '../data/mockListings';
import './Home.css';

const industries = [
  { icon: '🏊', name: 'Pool Cleaning' },
  { icon: '🚗', name: 'Auto Detailing' },
  { icon: '🎨', name: 'Painting' },
  { icon: '🌿', name: 'Landscaping' },
  { icon: '✂️', name: 'Barbershops' },
  { icon: '🔧', name: 'Mobile Mechanics' },
  { icon: '🏗️', name: 'Contractors' },
  { icon: '💧', name: 'Pressure Washing' },
  { icon: '🧹', name: 'Cleaning Companies' },
  { icon: '⚡', name: 'Electricians' },
];

const buildTypes = [
  {
    icon: '⚡',
    title: 'Quote Funnels',
    description: 'Turn website visitors into quote requests with a guided, multi-step form that delivers instant estimates.',
  },
  {
    icon: '📅',
    title: 'Booking Pages',
    description: 'Let customers book appointments directly. No back-and-forth, no phone tag.',
  },
  {
    icon: '⭐',
    title: 'Review Boosters',
    description: 'Route happy customers to Google reviews, unhappy ones to private feedback. Grow your rating fast.',
  },
  {
    icon: '📸',
    title: 'Before & After Trust Pages',
    description: 'Visual proof that converts. Showcase your real work and turn skeptics into booked clients.',
  },
  {
    icon: '🎯',
    title: 'Package Selectors',
    description: 'Help customers choose the right service tier. Reduces questions, increases average order value.',
  },
];

export default function Home() {
  const featured = mockListings.slice(0, 3);

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">Revenue tools for local pros</div>
          <h1 className="hero-headline">
            Small digital tools that bring in<br />
            <span className="hero-accent">more leads, bookings, and reviews.</span>
          </h1>
          <p className="hero-sub">
            MicroBuild delivers custom quote funnels, booking pages, review boosters, and trust pages — built specifically for your trade, in days, not months.
          </p>
          <div className="hero-ctas">
            <Link to="/request" className="btn btn-primary btn-lg">
              Request a MicroBuild
            </Link>
            <Link to="/browse" className="btn btn-ghost btn-lg">
              Browse All Builds →
            </Link>
          </div>
          <div className="hero-proof">
            <span className="proof-text">Now in early access — built for local service pros</span>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="section industries-section">
        <div className="container">
          <p className="section-eyebrow">Built for your trade</p>
          <h2 className="section-title">Tools built for the trades that run on reputation</h2>
          <div className="industries-grid">
            {industries.map((ind) => (
              <div key={ind.name} className="industry-chip">
                <span className="industry-icon">{ind.icon}</span>
                <span>{ind.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build Types */}
      <section className="section build-types-section">
        <div className="container">
          <p className="section-eyebrow">What we build</p>
          <h2 className="section-title">Five tools that generate real revenue</h2>
          <div className="build-types-grid">
            {buildTypes.map((bt) => (
              <div key={bt.title} className="build-type-card">
                <div className="build-type-icon">{bt.icon}</div>
                <h3>{bt.title}</h3>
                <p>{bt.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="section featured-section">
        <div className="container">
          <div className="section-header">
            <div>
              <p className="section-eyebrow">Featured MicroBuilds</p>
              <h2 className="section-title">Browse available builds</h2>
            </div>
            <Link to="/browse" className="btn btn-ghost btn-sm">
              View all builds →
            </Link>
          </div>
          <div className="cards-grid">
            {featured.map((listing) => (
              <MicroBuildCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Preview */}
      <section className="section how-section">
        <div className="container">
          <p className="section-eyebrow">The process</p>
          <h2 className="section-title">From request to revenue in 3 steps</h2>
          <div className="steps-grid">
            <div className="step">
              <div className="step-number">01</div>
              <h3>Submit a Request</h3>
              <p>Tell us about your business, what you need, and your goal. Takes 3 minutes.</p>
            </div>
            <div className="step">
              <div className="step-number">02</div>
              <h3>We Build It</h3>
              <p>A vetted creator builds your MicroBuild — branded, optimized, and ready to generate revenue.</p>
            </div>
            <div className="step">
              <div className="step-number">03</div>
              <h3>Go Live & Get Results</h3>
              <p>Share your link. Start collecting leads, bookings, and reviews immediately.</p>
            </div>
          </div>
          <div className="how-cta">
            <Link to="/how-it-works" className="btn btn-ghost btn-sm">
              Learn more about the process →
            </Link>
          </div>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
