import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import NotFound from './pages/NotFound';

// NOTE: AdminRouteGuard exists in src/components/ but is intentionally not
// wired here. Admin auth is deferred to a later phase. See:
//   docs/profile-account-system-audit.md — "Next Build Phase Recommendation"
//   supabase/migrations/admin-auth-notes.sql — hardening guide

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
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

          {/* Admin — no auth guard in dev mode; login is a deferred placeholder */}
          <Route path="admin">
            <Route index element={<Admin />} />
            <Route path="login" element={<AdminLogin />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
