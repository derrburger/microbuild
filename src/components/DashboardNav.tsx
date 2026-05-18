import { NavLink } from 'react-router-dom';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import './DashboardNav.css';

export default function DashboardNav() {
  const { profile, loading } = useUserProfileRow();
  const isCreator = profile?.account_type?.toLowerCase() === 'creator';

  return (
    <nav className="dash-nav" aria-label="Dashboard navigation">
      <NavLink
        to="/dashboard"
        end
        className={({ isActive }) =>
          `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
      >
        Overview
      </NavLink>

      {loading ?
        (
          <span className="dash-nav-link dash-nav-link--muted dash-nav-loading-pill">
            Marketplace…
          </span>
        )
      : isCreator ?
        (
          <>
            <NavLink
              to="/dashboard/applications"
              className={({ isActive }) =>
                `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
            >
              Applications
            </NavLink>
            <NavLink
              to="/dashboard/workflows"
              className={({ isActive }) =>
                `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
            >
              Workflows
            </NavLink>
          </>
        )
      : (
          <NavLink
            to="/browse"
            className={({ isActive }) =>
              `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
          >
            Browse
          </NavLink>
        )}

      <NavLink
        to="/dashboard/profile"
        className={({ isActive }) =>
          `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
      >
        Profile
      </NavLink>
      <NavLink
        to="/dashboard/analytics"
        className={({ isActive }) =>
          `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
      >
        Analytics
      </NavLink>
      <NavLink
        to="/dashboard/settings"
        className={({ isActive }) =>
          `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
      >
        Settings
      </NavLink>
    </nav>
  );
}
