import { Link } from 'react-router-dom';
import './CTASection.css';

interface Props {
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  variant?: 'dark' | 'accent';
}

export default function CTASection({
  title = 'Ready to grow your local service business?',
  subtitle = 'Request a MicroBuild today and get a revenue-ready tool delivered in days — not months.',
  primaryLabel = 'Request a MicroBuild',
  primaryTo = '/request',
  secondaryLabel = 'Browse MicroBuilds',
  secondaryTo = '/browse',
  variant = 'dark',
}: Props) {
  return (
    <section className={`cta-section cta-section--${variant}`}>
      <div className="cta-inner">
        <h2 className="cta-title">{title}</h2>
        <p className="cta-subtitle">{subtitle}</p>
        <div className="cta-buttons">
          <Link to={primaryTo} className="btn btn-primary btn-lg">
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryTo && (
            <Link to={secondaryTo} className="btn btn-ghost btn-lg">
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
