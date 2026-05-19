type Props = {
  reqLoading: boolean;
  requestsLen: number;
  newReqCount: number;
  highPriorityCount: number;
  readyToQuoteCount: number;
  needsFollowupCount: number;
  appLoading: boolean;
  pendingReviewCount: number;
  needsMoreInfoCount: number;
  approvedPendingCount: number;
  activeCreatorCount: number;
  rejectedSuspendedCount: number;
};

export default function AdminMetricsStrip(p: Props) {
  return (
    <div className="admin-metrics-wrap">
      <div className="admin-metrics-group">
        <div className="admin-metrics-group-label">Buyer Requests</div>
        <div className="admin-metrics">
          <MetricCard value={p.reqLoading ? '…' : p.requestsLen} label="Total" />
          <MetricCard value={p.reqLoading ? '…' : p.newReqCount} label="New" color={p.newReqCount > 0 ? '#f9b032' : undefined} />
          <MetricCard value={p.reqLoading ? '…' : p.highPriorityCount} label="High Priority" color={p.highPriorityCount > 0 ? '#ef4444' : undefined} />
          <MetricCard value={p.reqLoading ? '…' : p.readyToQuoteCount} label="Ready to Scope" color={p.readyToQuoteCount > 0 ? '#00d478' : undefined} />
          <MetricCard value={p.reqLoading ? '…' : p.needsFollowupCount} label="Needs Follow-up" color={p.needsFollowupCount > 0 ? '#f9b032' : undefined} />
        </div>
      </div>
      <div className="admin-metrics-group">
        <div className="admin-metrics-group-label">Creator Applications</div>
        <div className="admin-metrics">
          <MetricCard value={p.appLoading ? '…' : p.pendingReviewCount} label="Pending Review" color={p.pendingReviewCount > 0 ? '#63b3ed' : undefined} />
          <MetricCard value={p.appLoading ? '…' : p.needsMoreInfoCount} label="Needs Info" color={p.needsMoreInfoCount > 0 ? '#f9b032' : undefined} />
          <MetricCard value={p.appLoading ? '…' : p.approvedPendingCount} label="Pending Payment" color={p.approvedPendingCount > 0 ? '#63b3ed' : undefined} />
          <MetricCard value={p.appLoading ? '…' : p.activeCreatorCount} label="Active Creators" color={p.activeCreatorCount > 0 ? '#00d478' : undefined} />
          <MetricCard value={p.appLoading ? '…' : p.rejectedSuspendedCount} label="Rejected/Suspended" color={p.rejectedSuspendedCount > 0 ? '#ef4444' : undefined} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="metric-card">
      <span className="metric-value" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="metric-label">{label}</span>
    </div>
  );
}
