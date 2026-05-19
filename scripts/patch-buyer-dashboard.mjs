import fs from 'fs';

const p = 'src/pages/Dashboard.tsx';
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf('  return (\n    <motionmotionmotionmotiondiv className="dash-buyer">');
const start2 = s.indexOf('  return (\n    <div className="dash-buyer">');
const idx = start >= 0 ? start : start2;
const end = s.indexOf('\n// ─── Creator Application Status', idx);

if (idx < 0 || end < 0) {
  console.error('markers not found', idx, end);
  process.exit(1);
}

const block = `  return (
    <motionmotionmotionmotiondiv className="dash-buyer">
      {mode === 'overview' ? (
        <>
          <div className="dash-buyer-header">
            <div>
              <h2 className="dash-buyer-title">Welcome back, {displayName}</h2>
              <p className="dash-buyer-sub">
                Your marketplace overview — open My Requests to review applicants and track delivery.
              </p>
            </div>
            <div className="dash-buyer-actions">
              <Link to="/request" className="btn btn-primary btn-sm">New Request</Link>
              <Link to="/dashboard/requests" className="btn btn-ghost btn-sm">My Requests</Link>
            </div>
          </div>
          <BuyerStatusOverview
            requests={requests}
            loadingReqs={loadingReqs}
            orderByRequestId={orderByRequestId}
            deliverables={deliverables}
          />
          {!loadingReqs && dashAnalysis ? (
            <div className="buyer-rec-section">
              <div className="buyer-rec-card">
                <span className="buyer-rec-icon">💡</span>
                <div className="buyer-rec-body">
                  <div className="buyer-rec-eyebrow">Recommended Next MicroBuild</div>
                  <div className="buyer-rec-build">{dashAnalysis.recommendedBuild}</motionmotionmotionmotiondiv>
                  <p className="buyer-rec-reason">{dashAnalysis.recommendedReason}</p>
                </div>
                <Link
                  to={\`/request?build=\${dashAnalysis.recommendedBuild.toLowerCase().replace(/\\s+/g, '-')}\`}
                  className="buyer-rec-btn"
                >
                  Request This Build →
                </Link>
              </div>
            </div>
          ) : null}
          {!loadingReqs ? <BusinessProfilePanel requests={requests} /> : null}
          <div className="buyer-section buyer-section--dim">
            <h3 className="buyer-section-title">Quick Actions</h3>
            <div className="buyer-quick-actions">
              <Link to="/request" className="buyer-qa-card"><span>📋</span><span>New Request</span></Link>
              <Link to="/dashboard/requests" className="buyer-qa-card"><span>📋</span><span>My Requests</span></Link>
              <Link to="/browse" className="buyer-qa-card"><span>🔍</span><span>Browse Workflows</span></Link>
            </div>
          </div>
        </>
      ) : null}

      {mode === 'requests' && !loadingReqs ? (
        <>
          <MarketplaceApplicantsPanel
            buyerProfile={userProfile}
            requests={requests}
            ordersByRequestId={orderByRequestId}
            deliverablesByOrderId={deliverables}
            onMarketplaceEvent={loadBuyerRequests}
          />
          <BuyerProposalSection
            userProfile={userProfile}
            requests={requests}
            ordersByRequestId={orderByRequestId}
            creatorProfileLabels={creatorProfileLabels}
          />
        </>
      ) : null}

      {mode === 'requests' ? (
        <>
          <div className="buyer-section" id="buyer-active-projects">
            <motionmotionmotionmotiondiv className="buyer-section-header">
              <h3 className="buyer-section-title">Active Requests</h3>
              <Link to="/request" className="buyer-section-action">+ New Request</Link>
            </div>
            {loadingReqs ? (
              <div className="dash-loading">Loading requests…</div>
            ) : activeRequests.length === 0 ? (
              <div className="buyer-empty-state">
                <span className="buyer-empty-icon">📋</span>
                <p>No active requests yet.</p>
                <Link to="/request" className="btn btn-primary btn-sm">Submit Your First MicroBuild Request →</Link>
              </div>
            ) : (
              <div className="buyer-active-list">
                {activeRequests.map((r) => (
                  <ActiveRequestCard
                    key={r.id}
                    request={r}
                    linkedOrder={orderByRequestId[r.id] ?? null}
                    deliverable={
                      orderByRequestId[r.id]
                        ? deliverables[orderByRequestId[r.id]!.id] ?? null
                        : null
                    }
                    sourceCreatorDisplayName={
                      r.source_creator_profile_id ? creatorProfileLabels[r.source_creator_profile_id] : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
          {!loadingReqs && requests.length > 0 ? (
            <div className="buyer-section">
              <h3 className="buyer-section-title">All Requests</h3>
              <div className="buyer-requests-table">
                {requests.map((r) => (
                  <div key={r.id} className="buyer-req-row">
                    <div className="buyer-req-row-info">
                      <span className="buyer-req-row-biz">{r.business_name}</span>
                      <span className="buyer-req-row-type">{r.build_type}</span>
                    </div>
                    <div className="buyer-req-row-meta">
                      {r.budget && <span className="buyer-req-meta-tag">{r.budget}</span>}
                      {r.deadline && <span className="buyer-req-meta-tag">{r.deadline}</span>}
                      <span className="buyer-req-meta-date">{fmtDate(r.created_at)}</span>
                    </div>
                    <span className="buyer-req-row-status" style={{ color: STATUS_COLORS[r.status] ?? '#8a94a6' }}>
                      {r.status.replace(/[-_]/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
`;

const clean = block
  .replace(/<\/?motion[a-z]+>/gi, (m) => (m.startsWith('</') ? '</div>' : '<motionmotionmotionmotiondiv'))
  .replace(/<motionmotionmotionmotiondiv/g, '<div');

s = s.slice(0, idx) + clean + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok');
