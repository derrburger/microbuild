import { Link } from 'react-router-dom';
import CTASection from '../components/CTASection';
import './HowItWorks.css';

const buyerSteps = [
  {
    number: '01',
    title: 'Submit a Request',
    description:
      'Fill out a short form describing your business, your trade, and what you want to accomplish. No tech knowledge required — just describe the problem you want to solve.',
  },
  {
    number: '02',
    title: 'We Scope Your Build',
    description:
      'We review your request and produce a structured build brief: business context, recommended MicroBuild type, suggested copy, form fields, design direction, and creator instructions. We confirm scope and price before moving forward.',
  },
  {
    number: '03',
    title: 'A Creator Gets to Work',
    description:
      'A vetted MicroBuild creator receives your packet and builds your custom tool. Typically delivered in 3–5 business days.',
  },
  {
    number: '04',
    title: 'Review and Approve',
    description:
      "You review the finished MicroBuild. Request one round of revisions if needed. We don't charge until you're satisfied.",
  },
  {
    number: '05',
    title: 'Go Live',
    description:
      'Share your MicroBuild link in your Google Business profile, Instagram bio, text follow-ups, or ads. Start collecting leads, bookings, or reviews immediately.',
  },
];

const creatorSteps = [
  {
    number: '01',
    title: 'Apply to Join',
    description: 'Submit your application with your skills and a portfolio sample. We review and onboard selectively.',
  },
  {
    number: '02',
    title: 'Get Assigned a Build',
    description: 'Receive a fully-structured build brief with everything you need: business context, suggested copy, form fields, design direction, and a quality checklist.',
  },
  {
    number: '03',
    title: 'Build and Submit',
    description: 'Use your preferred stack (no-code, HTML/CSS, React, Webflow). Submit your build through the platform.',
  },
  {
    number: '04',
    title: 'Buyer Reviews',
    description: 'The buyer reviews your work. Revisions are scoped upfront, so expectations are clear on both sides.',
  },
  {
    number: '05',
    title: 'Get Paid',
    description: 'Payment is released once the buyer approves. No chasing invoices.',
  },
];

const buildTypes = [
  {
    icon: '⚡',
    title: 'Quote Funnels',
    who: 'Pool cleaners, painters, landscapers, pressure washers',
    outcome: 'Homeowners get an instant price estimate and submit their contact info.',
  },
  {
    icon: '📅',
    title: 'Booking Pages',
    who: 'Barbers, detailers, mobile mechanics, cleaners',
    outcome: 'Customers select a service and book a time slot — no back-and-forth.',
  },
  {
    icon: '⭐',
    title: 'Review Boosters',
    who: 'Any local service business',
    outcome: 'Happy customers leave Google reviews. Unhappy customers send private feedback.',
  },
  {
    icon: '📸',
    title: 'Before & After Trust Pages',
    who: 'Painters, detailers, landscapers, cleaners, contractors',
    outcome: 'Visual proof of your work drives conversions from ad traffic and social sharing.',
  },
  {
    icon: '🎯',
    title: 'Package Selectors',
    who: 'Detailers, cleaners, landscapers, maintenance businesses',
    outcome: 'Customers self-select their package and proceed to book or request a quote.',
  },
];

export default function HowItWorks() {
  return (
    <div className="hiw-page">
      <div className="hiw-hero">
        <div className="container">
          <h1 className="hiw-title">How MicroBuild Works</h1>
          <p className="hiw-sub">
            From request to live revenue tool in days. Here's exactly how it works — for businesses and creators.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <p className="section-eyebrow">For local businesses</p>
          <h2 className="section-title">Get a revenue tool in 5 steps</h2>
          <div className="hiw-steps">
            {buyerSteps.map((step) => (
              <div key={step.number} className="hiw-step">
                <div className="hiw-step-number">{step.number}</div>
                <div className="hiw-step-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="hiw-section-cta">
            <Link to="/request" className="btn btn-primary btn-lg">
              Request a MicroBuild
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--alt" id="creators">
        <div className="container">
          <p className="section-eyebrow">For creators</p>
          <h2 className="section-title">Build, get paid, repeat</h2>
          <div className="hiw-steps">
            {creatorSteps.map((step) => (
              <div key={step.number} className="hiw-step">
                <div className="hiw-step-number">{step.number}</div>
                <div className="hiw-step-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="hiw-section-cta">
            <Link to="/creators/apply" className="btn btn-ghost btn-lg">
              Apply as a Creator
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <p className="section-eyebrow">The builds</p>
          <h2 className="section-title">What types of MicroBuilds exist?</h2>
          <div className="builds-table">
            {buildTypes.map((bt) => (
              <div key={bt.title} className="builds-row">
                <div className="builds-icon">{bt.icon}</div>
                <div className="builds-info">
                  <strong>{bt.title}</strong>
                  <span>{bt.who}</span>
                </div>
                <div className="builds-outcome">
                  <span className="outcome-label">Outcome</span>
                  <p>{bt.outcome}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
