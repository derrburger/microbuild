import fs from 'fs';
const path = 'src/pages/Admin.tsx';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('      {/* Deliverable review */}');
const end = s.indexOf('      {/* Status action buttons */}', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const replacement = `      <motiondiv className="order-deliverable-compact">
        <span className="order-detail-label">Deliverable</span>
        <span className="order-del-tag">
          {deliverable
            ? DELIVERY_STATUS_LABELS[deliverable.delivery_status] ?? deliverable.delivery_status ?? '—'
            : 'None yet'}
        </span>
        <span className="subtle order-deliverable-tab-hint">Full review → Deliverables tab</span>
      </motiondiv>

`;
const fixed = replacement.replace(/motiondiv/g, 'div');
s = s.slice(0, start) + fixed + s.slice(end);
fs.writeFileSync(path, s);
console.log('ok');
