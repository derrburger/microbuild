import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Browse from './pages/Browse';
import BuildDetail from './pages/BuildDetail';
import Request from './pages/Request';
import CreatorsApply from './pages/CreatorsApply';
import HowItWorks from './pages/HowItWorks';
import Pricing from './pages/Pricing';
import CaseStudies from './pages/CaseStudies';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="browse" element={<Browse />} />
          <Route path="builds/:slug" element={<BuildDetail />} />
          <Route path="request" element={<Request />} />
          <Route path="creators/apply" element={<CreatorsApply />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="case-studies" element={<CaseStudies />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
