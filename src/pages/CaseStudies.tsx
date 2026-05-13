import { Link } from 'react-router-dom';
import { mockCaseStudies } from '../data/mockListings';
import CTASection from '../components/CTASection';
import './CaseStudies.css';

const categoryIcons: Record<string, string> = {
  'Quote Funnel': '⚡',
  'Booking Page': '📅',
  'Review Booster': '⭐',
  'Trust Page': '📸',
  'Package Selector': '🎯',
};

export default function CaseStudies() {
  return (
    <div className="cases-page">
      <div className="cases-hero">
        <div className="container">
          <div className="cases-demo-banner">
            Demo Examples — Not Real Customer Data
          </div>
          <h1 className="cases-title">How MicroBuilds Get Used</h1>
          <p className="cases-sub">
            These are illustrative scenarios showing how local service businesses could use MicroBuilds to solve real revenue problems. MicroBuild is in early access — these examples are demos, not documented client results.
          </p>
        </div>
      </div>

      <div className="container cases-body">
        <div className="cases-list">
          {mockCaseStudies.map((cs) => (
            <div key={cs.id} className="case-card">
              <div className="case-card-left">
                <div className="case-icon">{categoryIcons[cs.buildType] ?? '🔧'}</div>
                <div className="case-meta">
                  <span className="case-industry">{cs.industry}</span>
                  <span className="case-type">{cs.buildType}</span>
                </div>
              </div>
              <div className="case-card-body">
                <div className="case-demo-tag">Demo Scenario</div>
                <h2 className="case-title">{cs.title}</h2>
                <div className="case-sections">
                  <div className="case-section">
                    <span className="case-section-label">The Problem</span>
                    <p>{cs.problem}</p>
                  </div>
                  <div className="case-section">
                    <span className="case-section-label">The Solution</span>
                    <p>{cs.solution}</p>
                  </div>
                  <div className="case-section">
                    <span className="case-section-label">Expected Outcome</span>
                    <p>{cs.result}</p>
                  </div>
                </div>
              </div>
              <div className="case-card-right">
                <div className="case-metric">{cs.resultMetric}</div>
                <Link
                  to={`/browse?category=${encodeURIComponent(cs.buildType)}`}
                  className="btn btn-ghost btn-sm"
                >
                  See this build →
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="cases-note">
          <p>
            These scenarios are illustrative examples of how MicroBuilds can be applied. Actual results will vary based on business type, market, traffic, and implementation. MicroBuild is currently in early access.
          </p>
        </div>
      </div>

      <CTASection
        title="Ready to build something like this for your business?"
        subtitle="Submit a request and we'll scope the right MicroBuild for your trade."
        primaryLabel="Request a MicroBuild"
        primaryTo="/request"
        secondaryLabel="Browse All Builds"
        secondaryTo="/browse"
      />
    </div>
  );
}
