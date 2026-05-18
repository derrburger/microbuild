import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Browse from './pages/Browse';
import BuildDetail from './pages/BuildDetail';
import Request from './pages/Request';
import CreatorsApply from './pages/CreatorsApply';
import CreatorDirectory from './pages/CreatorDirectory';
import CreatorProfile from './pages/CreatorProfile';
import HowItWorks from './pages/HowItWorks';
import Pricing from './pages/Pricing';
import CaseStudies from './pages/CaseStudies';
import SignIn from './pages/SignIn';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import DashboardProfile from './pages/DashboardProfile';
import DashboardAnalytics from './pages/DashboardAnalytics';
import DashboardSettings from './pages/DashboardSettings';
import DashboardBrowse from './pages/DashboardBrowse';
import DashboardApplications from './pages/DashboardApplications';
import DashboardProjectWorkspace from './pages/DashboardProjectWorkspace';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';

// NOTE: AdminRouteGuard (src/components/AdminRouteGuard.tsx) exists but is
// intentionally not wired. Admin auth is deferred. See admin-auth-notes.sql.

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* ── Public routes ───────────────────────────────────── */}
            <Route index element={<Home />} />
            <Route path="browse" element={<Browse />} />
            <Route path="builds/:slug" element={<BuildDetail />} />
            <Route path="request" element={<Request />} />
            <Route path="creators" element={<CreatorDirectory />} />
            <Route path="creators/apply" element={<CreatorsApply />} />
            <Route path="creator/:id" element={<CreatorProfile />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="case-studies" element={<CaseStudies />} />

            {/* ── Auth routes ─────────────────────────────────────── */}
            <Route path="signin" element={<SignIn />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="messages" element={<Messages />} />

            {/* ── Dashboard (authenticated) ───────────────────────── */}
            <Route path="dashboard">
              <Route index element={<Dashboard />} />
              <Route path="profile" element={<DashboardProfile />} />
              <Route path="analytics" element={<DashboardAnalytics />} />
              <Route path="settings" element={<DashboardSettings />} />
              <Route path="applications" element={<DashboardApplications />} />
              <Route path="browse" element={<DashboardBrowse />} />
              <Route path="projects/:id" element={<DashboardProjectWorkspace />} />
            </Route>

            {/* ── Admin — dev mode, no auth guard ─────────────────── */}
            <Route path="admin">
              <Route index element={<Admin />} />
              <Route path="login" element={<AdminLogin />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
