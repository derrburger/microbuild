import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import { isAdminEmail } from '../lib/admin';
import {
  isNavItemActive,
  navItemsForRole,
  resolveAppShellRole,
  type AppNavItem,
} from '../lib/appNav';
import './Navbar.css';

function AppNavLink({
  item,
  pathname,
  hash,
  onNavigate,
}: {
  item: AppNavItem;
  pathname: string;
  hash: string;
  onNavigate: () => void;
}) {
  const active = isNavItemActive(pathname, hash, item);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={`navbar-link app-nav-link${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {item.label}
    </NavLink>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile: userProfileRow, loading: profileLoading } = useUserProfileRow();

  const isAdmin = Boolean(user?.email && isAdminEmail(user.email));
  const accountType = userProfileRow?.account_type;
  const shellRole = resolveAppShellRole(Boolean(user), accountType, isAdmin);
  const navItems = user && !profileLoading ? navItemsForRole(shellRole) : navItemsForRole('public');

  const isCreator = shellRole === 'creator';
  const isBuyer = shellRole === 'buyer';
  const isAppShell = shellRole !== 'public';

  const close = () => {
    setMenuOpen(false);
    setUserMenu(false);
  };

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setUserMenu(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userMenuOpen]);

  async function handleSignOut() {
    close();
    await signOut();
    navigate('/signin');
  }

  const username =
    (user?.user_metadata?.name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Account';

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <nav className={`navbar${isAppShell ? ' navbar--app' : ' navbar--public'}`}>
      <div className="navbar-inner">
        <Link to={user ? (isAdmin ? '/admin' : '/dashboard') : '/'} className="navbar-logo" onClick={close}>
          Micro<span className="logo-accent">Build</span>
        </Link>

        <button
          type="button"
          className={`navbar-hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`navbar-links${menuOpen ? ' open' : ''}`}>
          {navItems.map((item) => (
            <AppNavLink
              key={`${item.to}-${item.label}`}
              item={item}
              pathname={location.pathname}
              hash={location.hash}
              onNavigate={close}
            />
          ))}

          <div className="navbar-links-actions">
            {user ?
              (
                <>
                  {isBuyer && (
                    <Link to="/request" className="btn btn-primary btn-sm navbar-cta" onClick={close}>
                      New Request
                    </Link>
                  )}
                  <div className="navbar-user-menu" ref={ref}>
                    <button
                      type="button"
                      className="navbar-avatar-btn"
                      onClick={() => setUserMenu(!userMenuOpen)}
                      aria-expanded={userMenuOpen}
                      aria-haspopup="true"
                      aria-label="Account menu"
                    >
                      {avatarUrl ?
                        <img src={avatarUrl} alt="" className="navbar-avatar-img" />
                      : (
                        <span className="navbar-avatar-initials">{username.slice(0, 2).toUpperCase()}</span>
                      )}
                      <span className="navbar-username">{username}</span>
                      <span className="navbar-chevron">{userMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {userMenuOpen && (
                      <div className="navbar-dropdown">
                        {!isAdmin && (
                          <Link to="/dashboard/profile" className="navbar-dropdown-item" onClick={close}>
                            Profile
                          </Link>
                        )}
                        {isCreator && (
                          <Link to="/dashboard/analytics" className="navbar-dropdown-item" onClick={close}>
                            Analytics
                          </Link>
                        )}
                        <Link to="/dashboard/settings" className="navbar-dropdown-item" onClick={close}>
                          Settings
                        </Link>
                        <div className="navbar-dropdown-divider" />
                        <button type="button" className="navbar-dropdown-item navbar-signout-item" onClick={handleSignOut}>
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )
            : (
              <>
                <NavLink to="/creators/apply" className="navbar-link nav-link-secondary" onClick={close}>
                  Apply as Creator
                </NavLink>
                <Link to="/signin" className="btn btn-ghost btn-sm navbar-cta-secondary" onClick={close}>
                  Sign In
                </Link>
                <Link to="/request" className="btn btn-primary btn-sm navbar-cta" onClick={close}>
                  Request a MicroBuild
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
