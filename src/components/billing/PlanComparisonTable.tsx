import {
  creatorPricingPlans,
  type CreatorPlanId,
} from '../../lib/pricingPlans';
import './PlanComparisonTable.css';

function boolLabel(v: boolean): string {
  return v ? 'Included' : '—';
}

type PlanComparisonTableProps = {
  currentPlanId?: CreatorPlanId;
};

export default function PlanComparisonTable({ currentPlanId }: PlanComparisonTableProps) {
  const rows: { label: string; values: string[] }[] = [
    {
      label: 'Applications / month',
      values: creatorPricingPlans.map((p) => String(p.limits.applicationsPerMonth)),
    },
    {
      label: 'Published workflows',
      values: creatorPricingPlans.map((p) => String(p.limits.publishedWorkflows)),
    },
    {
      label: 'Analytics access',
      values: creatorPricingPlans.map((p) => boolLabel(p.limits.analyticsAccess)),
    },
    {
      label: 'AI monitor',
      values: creatorPricingPlans.map((p) => boolLabel(p.limits.aiMonitor)),
    },
    {
      label: 'Verified badge',
      values: creatorPricingPlans.map((p) => (p.limits.verifiedBadge ? 'After admin approval' : '—')),
    },
    {
      label: 'Buyer trust signals',
      values: creatorPricingPlans.map((p) => p.limits.buyerTrustSignals),
    },
  ];

  return (
    <div className="plan-comparison-wrap">
      <h3 className="plan-comparison-title">Creator plan comparison</h3>
      <p className="plan-comparison-sub">
        Limits shown as UI labels only — enforcement comes in a later phase.
      </p>
      <div className="plan-comparison-scroll">
        <table className="plan-comparison-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {creatorPricingPlans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={currentPlanId === plan.id ? 'plan-comparison-col--current' : undefined}
                >
                  {plan.shortName}
                  {currentPlanId === plan.id && (
                    <span className="plan-comparison-current-tag">Current</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price</th>
              {creatorPricingPlans.map((plan) => (
                <td key={plan.id}>{plan.priceLabel}</td>
              ))}
            </tr>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((val, i) => (
                  <td key={creatorPricingPlans[i].id}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
