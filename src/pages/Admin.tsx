import { mockListings } from '../data/mockListings';
import './Admin.css';

const mockRequests = [
  { id: 'r1', name: 'Carlos Medina', business: 'Medina Pool Care', buildType: 'Quote Funnel', status: 'new', submitted: '2026-05-12' },
  { id: 'r2', name: 'Tanya Brooks', business: 'Brooks Auto Detail', buildType: 'Package Selector', status: 'in-review', submitted: '2026-05-11' },
  { id: 'r3', name: 'Mike Patel', business: 'Patel Pressure Wash', buildType: 'Review Booster', status: 'proposal-sent', submitted: '2026-05-10' },
];

const mockApplications = [
  { id: 'a1', name: 'Jordan Kim', email: 'jordan@example.com', skills: 'React, Webflow', status: 'new', submitted: '2026-05-12' },
  { id: 'a2', name: 'Sam Torres', email: 'sam@example.com', skills: 'No-code, Copywriting', status: 'reviewing', submitted: '2026-05-09' },
];

const mockOrders = [
  { id: 'o1', buyer: 'AquaPro Pool Services', build: 'Pool Cleaning Quote Funnel', creator: 'Jordan Kim', status: 'in-progress', price: 149 },
  { id: 'o2', buyer: 'Chrome Kings Detailing', build: 'Auto Detailing Package Selector', creator: 'Sam Torres', status: 'delivered', price: 129 },
];

const statusColors: Record<string, string> = {
  new: '#f9b032',
  'in-review': '#63b3ed',
  'proposal-sent': '#38bd82',
  reviewing: '#63b3ed',
  'in-progress': '#f9b032',
  delivered: '#38bd82',
  approved: '#38bd82',
};

export default function Admin() {
  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="container">
          <div className="admin-title-row">
            <h1>Admin Dashboard</h1>
            <span className="admin-badge">Internal — Not Public</span>
          </div>
          <p className="admin-sub">MicroBuild platform overview. Authentication will be added before launch.</p>
        </div>
      </div>

      <div className="container admin-body">

        {/* Stats Row */}
        <div className="admin-stats">
          <div className="stat-card">
            <span className="stat-value">3</span>
            <span className="stat-label">New Requests</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">2</span>
            <span className="stat-label">Creator Apps</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{mockListings.length}</span>
            <span className="stat-label">Active Listings</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">2</span>
            <span className="stat-label">Open Orders</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">$278</span>
            <span className="stat-label">Pipeline Value</span>
          </div>
        </div>

        {/* Buyer Requests */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Buyer Requests</h2>
            <span className="admin-count">{mockRequests.length}</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Name</span>
              <span>Business</span>
              <span>Build Type</span>
              <span>Submitted</span>
              <span>Status</span>
            </div>
            {mockRequests.map((r) => (
              <div key={r.id} className="admin-table-row">
                <span>{r.name}</span>
                <span>{r.business}</span>
                <span>{r.buildType}</span>
                <span>{r.submitted}</span>
                <span>
                  <span className="admin-status" style={{ color: statusColors[r.status] ?? 'inherit' }}>
                    ● {r.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Creator Applications */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Creator Applications</h2>
            <span className="admin-count">{mockApplications.length}</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Name</span>
              <span>Email</span>
              <span>Skills</span>
              <span>Submitted</span>
              <span>Status</span>
            </div>
            {mockApplications.map((a) => (
              <div key={a.id} className="admin-table-row">
                <span>{a.name}</span>
                <span>{a.email}</span>
                <span>{a.skills}</span>
                <span>{a.submitted}</span>
                <span>
                  <span className="admin-status" style={{ color: statusColors[a.status] ?? 'inherit' }}>
                    ● {a.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* MicroBuild Listings */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>MicroBuild Listings</h2>
            <span className="admin-count">{mockListings.length}</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Title</span>
              <span>Category</span>
              <span>Industry</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {mockListings.map((l) => (
              <div key={l.id} className="admin-table-row">
                <span>{l.title}</span>
                <span>{l.category}</span>
                <span>{l.targetIndustry}</span>
                <span>${l.startingPrice}</span>
                <span>
                  <span className="admin-status" style={{ color: statusColors[l.status] ?? 'inherit' }}>
                    ● {l.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Orders */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Orders</h2>
            <span className="admin-count">{mockOrders.length}</span>
          </div>
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Buyer</span>
              <span>Build</span>
              <span>Creator</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {mockOrders.map((o) => (
              <div key={o.id} className="admin-table-row">
                <span>{o.buyer}</span>
                <span>{o.build}</span>
                <span>{o.creator}</span>
                <span>${o.price}</span>
                <span>
                  <span className="admin-status" style={{ color: statusColors[o.status] ?? 'inherit' }}>
                    ● {o.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Placeholder Sections */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Build Packets</h2>
            <span className="admin-placeholder-tag">Coming Soon</span>
          </div>
          <div className="admin-placeholder">
            AI-generated build packets will appear here once the build packet system is connected.
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Deliverables</h2>
            <span className="admin-placeholder-tag">Coming Soon</span>
          </div>
          <div className="admin-placeholder">
            Completed MicroBuild deliverables, creator submissions, and approval workflow will live here.
          </div>
        </section>

      </div>
    </div>
  );
}
