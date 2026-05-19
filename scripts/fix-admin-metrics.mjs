import fs from 'fs';
const path = 'src/pages/Admin.tsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');

const i = lines.findIndex((l, idx) => idx > 4700 && l.includes('admin-metrics-wrap'));
if (i < 0) {
  console.error('start not found');
  process.exit(1);
}
let end = i;
while (end < lines.length && !lines[end].trim().startsWith('</>')) end++;
// end is index of </> - remove from i to end-1 (keep </>)

const insert = `            <AdminMetricsStrip
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
            />`;

const newLines = [...lines.slice(0, i), insert, ...lines.slice(end)];
fs.writeFileSync(path, newLines.join('\n'));
console.log('replaced lines', i + 1, 'to', end);
