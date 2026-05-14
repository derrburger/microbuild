import { NavLink } from 'react-router-dom';
import './DashboardNav.css';

const LINKS = [
  { to: '/dashboard',            label: 'Overview',   end: true  },
  { to: '/dashboard/profile',    label: 'Profile',    end: false },
  { to: '/dashboard/analytics',  label: 'Analytics',  end: false },
  { to: '/dashboard/settings',   label: 'Settings',   end: false },
];

export default function DashboardNav() {
  return (
    <nav className="dash-nav" aria-label="Dashboard navigation">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
