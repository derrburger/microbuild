import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          Micro<span className="logo-accent">Build</span>
        </Link>

        <button
          className={`navbar-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`navbar-links${menuOpen ? ' open' : ''}`}>
          <NavLink to="/browse" onClick={() => setMenuOpen(false)}>Browse</NavLink>
          <NavLink to="/how-it-works" onClick={() => setMenuOpen(false)}>How It Works</NavLink>
          <NavLink to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</NavLink>
          <NavLink to="/case-studies" onClick={() => setMenuOpen(false)}>Case Studies</NavLink>
          <NavLink to="/creators/apply" className="nav-link-secondary" onClick={() => setMenuOpen(false)}>
            Apply as Creator
          </NavLink>
          <Link to="/request" className="btn btn-primary btn-sm" onClick={() => setMenuOpen(false)}>
            Request a MicroBuild
          </Link>
        </div>
      </div>
    </nav>
  );
}
