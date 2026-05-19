import fs from 'fs';

const p = 'src/pages/Dashboard.tsx';
let s = fs.readFileSync(p, 'utf8');

const fnStart = s.indexOf('function BuyerStatusOverview');
const idx2 = s.indexOf('  return (\n    <div className="buyer-status-row">', fnStart);
const start = idx2;
const end = s.indexOf('  );\n}\n\n// ─── Business profile', start);

if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const neu = `  return (
    <motiondiv className="buyer-status-row" aria-label="My requests at a glance">
      <div className="buyer-sc">
        <div className="buyer-sc-val">{requests.length}</div>
        <div className="buyer-sc-label">My requests</div>
        <div className="buyer-sc-sub">Total submitted</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: waiting > 0 ? '#f9b032' : undefined }}>{waiting}</div>
        <div className="buyer-sc-label">Waiting for creators</motiondiv>
        <div className="buyer-sc-sub">Open to applications</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: review > 0 ? '#63b3ed' : undefined }}>{review}</div>
        <div className="buyer-sc-label">Review applicants</div>
        <div className="buyer-sc-sub">Compare proposals</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: selected > 0 ? '#00d478' : undefined }}>{selected}</div>
        <div className="buyer-sc-label">Creator selected</div>
        <div className="buyer-sc-sub">Assignment confirmed</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: inProgress > 0 ? '#63b3ed' : undefined }}>{inProgress}</div>
        <div className="buyer-sc-label">Project in progress</div>
        <div className="buyer-sc-sub">Active builds</div>
      </div>
      <div className="buyer-sc">
        <div className="buyer-sc-val" style={{ color: completed > 0 ? '#00d478' : undefined }}>{completed}</div>
        <div className="buyer-sc-label">Completed / delivered</div>
        <div className="buyer-sc-sub">Finished MicroBuilds</div>
      </div>
    </div>
  );`.replaceAll('motiondiv', 'motionmotionmotionmotiondiv').replaceAll('motionmotionmotionmotiondiv', 'div');

s = s.slice(0, start) + neu + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok');
