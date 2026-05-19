import fs from 'fs';

const path = 'src/pages/Admin.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('AdminMetricsStrip')) {
  s = s.replace(
    "import AdminDeferredProposals from '../components/admin/AdminDeferredProposals';",
    "import AdminDeferredProposals from '../components/admin/AdminDeferredProposals';\nimport AdminMetricsStrip from '../components/admin/AdminMetricsStrip';",
  );
}

const metricsBlockRe =
  /            <div className="admin-metrics-wrap">[\s\S]*?            <\/motiondiv>\n          <\/>/;
if (metricsBlockRe.test(s)) {
  s = s.replace(
    metricsBlockRe,
    `            <AdminMetricsStrip
              reqLoading={reqLoading}
              requestsLen={requests.length}
              newReqCount={newReqCount}
              highPriorityCount={highPriorityCount}
              readyToQuoteCount={readyToQuoteCount}
              needsFollowupCount={needsFollowupCount}
              appLoading={appLoading}
              pendingReviewCount={pendingReviewCount}
              needsMoreInfoCount={needsMoreInfoCount}
              approvedPendingCount={approvedPendingCount}
              activeCreatorCount={activeCreatorCount}
              rejectedSuspendedCount={rejectedSuspendedCount}
            />
          </>`,
  );
  console.log('fixed command metrics');
} else {
  console.log('metrics block not found, trying alternate');
  s = s.replace(
    /<motionLabel>Buyer Requests<\/motionLabel>[\s\S]*?rejectedSuspendedCount={rejectedSuspendedCount}\s*\/>\s*<\/motionmotionmotionmotiondiv>/,
    'REMOVED_BROKEN_METRICS',
  );
}

s = s.replace(
  '<motionNotice msg={workflowAdminNotice} />',
  `{workflowAdminNotice ? (
            <div className="admin-auth-warning">
              <strong>Workflow action error:</strong> {workflowAdminNotice}
            </div>
          ) : null}`,
);

const wfFiltersRe =
  /<motionWorkflowFilters[\s\S]*?workflowsHidden={workflowsHidden}\s*\/>/;
if (wfFiltersRe.test(s)) {
  s = s.replace(
    wfFiltersRe,
    `<div className="req-filter-bar" style={{ marginBottom: '1rem' }}>
            {(
              [
                ['all', 'All workflows', publishedWorkflowRows.length],
                ['published', 'Published (live)', workflowsPublishedLive.length],
                ['ai_ok', 'AI approved queue', workflowsAiApprovedQueue.length],
                ['needs', 'Needs improvement', workflowsNeedsImprovement.length],
                ['risk', 'Risk flagged', workflowsRiskFlagged.length],
                ['hidden', 'Hidden / delisted', workflowsHidden.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={\`req-filter-tab\${workflowAdminTab === key ? ' active' : ''}\`}
                onClick={() => setWorkflowAdminTab(key)}
              >
                {label}
                <span className="req-filter-count">{count}</span>
              </button>
            ))}
          </div>`,
  );
  console.log('fixed workflow filters');
}

const dupMarker =
  "{showAdminSection(activeSection, 'buyers') && (\n        <section className=\"admin-marketplace-summary";
const aiMarker = "        {/* ── Today's AI Focus";
const i0 = s.indexOf(dupMarker);
const i1 = s.indexOf(aiMarker);
if (i0 >= 0 && i1 > i0) {
  s = s.slice(0, i0) + "        {showAdminSection(activeSection, 'buyers') && (\n        <>\n" + s.slice(i1);
  console.log('trimmed dup marketplace/workflow', i1 - i0);
}

const aiMarker2 = "        {/* ── Today's AI Focus";
const buyerMarker = "        {/* ── Buyer Requests";
const j0 = s.indexOf(aiMarker2);
const j1 = s.indexOf(buyerMarker);
if (j0 >= 0 && j1 > j0) {
  s = s.slice(0, j0) + s.slice(j1);
  console.log('removed AiOps duplicate block');
}

// Close buyers section wrapper - add )} before pipeline if missing
if (!s.includes("onNavigateToMarketplace")) {
  // wrap pipeline
  s = s.replace(
    '        {/* ── Project Pipeline',
    "        </>)}\n\n        {showAdminSection(activeSection, 'pipeline') && (\n        <>\n        {/* ── Project Pipeline",
  );
  s = s.replace(
    '        </SectionErrorBoundary>\n\n        {/* ── Creator Applications',
    "        </SectionErrorBoundary>\n        </>)}\n\n        {showAdminSection(activeSection, 'creators') && (\n        <>\n        {/* ── Creator Applications",
  );
  const creatorsEnd = s.indexOf('        {/* ── MicroBuild Listings');
  if (creatorsEnd > 0) {
    s = s.slice(0, creatorsEnd) + '        </>)}\n\n' + s.slice(creatorsEnd);
  }
}

// Hide listings/templates in health only - wrap health and add deliverables/messages/deferred
s = s.replace(
  '        {/* ── Platform Health Snapshot',
  `        {showAdminSection(activeSection, 'deliverables') && (
          <AdminDeliverablesSection
            orders={orders}
            bizByOrderId={bizByOrderId}
            creatorNameById={creatorNameById}
            onOrderUpdate={handleOrderUpdate}
          />
        )}

        {showAdminSection(activeSection, 'messages') && (
          <AdminMessagesPlaceholder conversationHintCount={requestApplications.length} />
        )}

        {showAdminSection(activeSection, 'health') && (
        <>
        {/* ── Platform Health Snapshot`,
);

s = s.replace(
  '        </SectionErrorBoundary>\n\n        {/* ── Phase 3+ placeholders',
  `        </SectionErrorBoundary>
        </>)}

        {showAdminSection(activeSection, 'deferred') && (
          <AdminDeferredProposals buyerRequests={buyerRequestsForDeferred} />
        )}

        {/* ── Phase 3+ placeholders`,
);

// Hide listings behind health or remove from main flow
s = s.replace(
  '        {/* ── MicroBuild Listings ───────────────────────────────────────────── */}\n        <section className="admin-section">',
  '        <section className="admin-section admin-section--dim" style={{ display: activeSection === "health" ? undefined : "none" }}>',
);

fs.writeFileSync(path, s);
console.log('wrote', path);
