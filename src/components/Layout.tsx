import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import { isAdminEmail } from '../lib/admin';
import { resolveAppShellRole } from '../lib/appNav';
import Navbar from './Navbar';
import Footer from './Footer';
import './Layout.css';

export default function Layout() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfileRow();
  const isAdmin = Boolean(user?.email && isAdminEmail(user.email));
  const shellRole = resolveAppShellRole(Boolean(user), profile?.account_type, isAdmin);
  const isAppShell = Boolean(user) && !loading && shellRole !== 'public';

  return (
    <div className={`layout${isAppShell ? ' layout--app' : ''}`}>
      <Navbar />
      <main className="layout-main">
        <Outlet />
      </main>
      {!isAppShell ?
        <Footer />
      : null}
    </div>
  );
}
