import { buyerPricingPlans, type BuyerPlanId } from '../../lib/pricingPlans';
import './PlanComparisonTable.css';

type BuyerPlanComparisonTableProps = {
  currentPlanId?: BuyerPlanId;
};

export default function BuyerPlanComparisonTable({ currentPlanId }: BuyerPlanComparisonTableProps) {
  const rows: { label: string; values: string[] }[] = [
    {
      label: 'Browse workflows',
      values: buyerPricingPlans.map(() => 'Included'),
    },
    {
      label: 'Submit requests',
      values: ['Limited', 'More active', 'Higher limits', 'Custom volume'],
    },
    {
      label: 'AI Request Overview',
      values: ['—', 'Included', 'Included', 'Included'],
    },
    {
      label: 'Applicant review',
      values: ['Basic', 'Full tools', 'Full tools', 'Priority support'],
    },
    {
      label: 'Project agreements',
      values: ['Basic workspace', 'Included', 'Included', 'Included'],
    },
  ];

  return (
    <div className="plan-comparison-wrap">
      <h3 className="plan-comparison-title">Buyer plan comparison</h3>
      <p className="plan-comparison-sub">
        Limits shown as UI labels only — enforcement comes in a later phase.
      </p>
      <div className="plan-comparison-scroll">
        <table className="plan-comparison-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {buyerPricingPlans.map((plan) => (
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
              {buyerPricingPlans.map((plan) => (
                <td key={plan.id}>{plan.priceLabel}</td>
              ))}
            </tr>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((val, i) => (
                  <td key={buyerPricingPlans[i].id}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
