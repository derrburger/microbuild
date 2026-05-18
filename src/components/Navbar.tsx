import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import './Navbar.css';

export default function Navbar() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [userMenuOpen, setUserMenu] = useState(false);
  const { user, signOut }           = useAuth();
  const navigate                    = useNavigate();
  const { profile: userProfileRow, loading: profileLoading } = useUserProfileRow();

  const isCreator = userProfileRow?.account_type?.toLowerCase() === 'creator';

  const browseLabel =
    profileLoading ? 'Browse' :
    user && isCreator ? 'Buyer Requests'
    : 'Browse';

  const close = () => { setMenuOpen(false); setUserMenu(false); };

  async function handleSignOut() {
    close();
    await signOut();
    navigate('/signin');
  }

  // For email/password users, user_metadata may be empty — fall back to email prefix
  const username =
    (user?.user_metadata?.name as string | undefined)      ??
    (user?.user_metadata?.user_name as string | undefined) ??
    user?.email?.split('@')[0]                              ??
    'Account';

  // Avatar: GitHub OAuth will set this; email users have none
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" onClick={close}>
          Micro<span className="logo-accent">Build</span>
        </Link>

        <button
          className={`navbar-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>

        <div className={`navbar-links${menuOpen ? ' open' : ''}`}>
          <NavLink to="/browse"       onClick={close}>{browseLabel}</NavLink>
          <NavLink to="/how-it-works" onClick={close}>How It Works</NavLink>
          <NavLink to="/pricing"      onClick={close}>Pricing</NavLink>
          <NavLink to="/case-studies" onClick={close}>Case Studies</NavLink>

          {user ? (
            /* ── Signed-in nav ──────────────────────────────────── */
            <>
              <NavLink to="/messages" className="nav-link-secondary mb-nav-msg" onClick={close}>
                💬 Messages
                <span className="navbar-msg-indicator" aria-hidden title="Unread counts coming soon">
                  ·
                </span>
              </NavLink>
              <NavLink to="/dashboard" className="nav-link-secondary" onClick={close}>
                Dashboard
              </NavLink>
              <div className="navbar-user-menu">
                <button
                  className="navbar-avatar-btn"
                  onClick={() => setUserMenu(!userMenuOpen)}
                  aria-label="User menu"
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt={username} className="navbar-avatar-img" />
                    : <span className="navbar-avatar-initials">
                        {username.slice(0, 2).toUpperCase()}
                      </span>
                  }
                  <span className="navbar-username">{username}</span>
                  <span className="navbar-chevron">{userMenuOpen ? '▲' : '▼'}</span>
                </button>
                {userMenuOpen && (
                  <div className="navbar-dropdown">
                    <Link to="/dashboard/profile"   className="navbar-dropdown-item" onClick={close}>Edit Profile</Link>
                    <Link to="/dashboard/settings"  className="navbar-dropdown-item" onClick={close}>Settings</Link>
                    <Link to="/dashboard/analytics" className="navbar-dropdown-item" onClick={close}>Analytics</Link>
                    <div className="navbar-dropdown-divider" />
                    <button className="navbar-dropdown-item navbar-signout-item" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Signed-out nav ─────────────────────────────────── */
            <>
              <NavLink to="/creators/apply" className="nav-link-secondary" onClick={close}>
                Apply as Creator
              </NavLink>
              <Link to="/signin" className="btn btn-ghost btn-sm" onClick={close}>
                Sign In
              </Link>
              <Link to="/request" className="btn btn-primary btn-sm" onClick={close}>
                Request a MicroBuild
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
