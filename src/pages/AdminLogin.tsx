import { Link } from 'react-router-dom';
import './AdminLogin.css';

/**
 * AdminLogin — deferred placeholder.
 *
 * Admin authentication was intentionally deferred to a later build phase.
 * /admin currently loads directly without a login requirement.
 *
 * When auth is ready:
 *  - Wire AdminRouteGuard (src/components/AdminRouteGuard.tsx) back into App.tsx
 *  - Create a Supabase Auth user and add their email to VITE_ADMIN_EMAILS
 *  - Replace dev RLS policies per supabase/migrations/admin-auth-notes.sql
 */
export default function AdminLogin() {
  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-icon">🔒</div>
        <h1 className="admin-login-title">Admin Login</h1>
        <p className="admin-login-sub">MicroBuild Operations Dashboard</p>

        <div className="admin-login-deferred">
          <p>
            Admin authentication is deferred for a later phase.
            The dashboard is currently accessible directly at{' '}
            <Link to="/admin" className="admin-login-deferred-link">/admin</Link>.
          </p>
          <p>
            Before public deployment, this page will require Supabase Auth sign-in
            and an admin role policy. See{' '}
            <code>supabase/migrations/admin-auth-notes.sql</code> for the plan.
          </p>
        </div>

        <Link to="/admin" className="admin-login-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Go to Admin Dashboard →
        </Link>
      </div>
    </div>
  );
}
