import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="footer-logo">
            Micro<span className="logo-accent">Build</span>
          </Link>
          <p className="footer-tagline">
            Revenue-ready tools for local service businesses.
          </p>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <Link to="/browse">Browse MicroBuilds</Link>
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/case-studies">Case Studies</Link>
          </div>
          <div className="footer-col">
            <h4>For Businesses</h4>
            <Link to="/request">Request a MicroBuild</Link>
            <Link to="/browse?category=Quote+Funnel">Quote Funnels</Link>
            <Link to="/browse?category=Booking+Page">Booking Pages</Link>
            <Link to="/browse?category=Review+Booster">Review Boosters</Link>
          </div>
          <div className="footer-col">
            <h4>Creators</h4>
            <Link to="/creators/apply">Apply as Creator</Link>
            <Link to="/how-it-works#creators">How It Works</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} MicroBuild. All rights reserved.</p>
        <div className="footer-bottom-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
}
