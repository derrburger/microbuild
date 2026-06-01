import { Link } from 'react-router-dom';
import type { FeatureKey } from '../lib/entitlements';
import { getPlanDisplayName, getUpgradeMessage } from '../lib/entitlements';
import './UpgradePrompt.css';

export interface UpgradePromptProps {
  featureKey: FeatureKey;
  featureLabel: string;
  currentPlan: string;
  requiredPlan: string;
  role: 'buyer' | 'creator';
  unlockSummary?: string;
  onDismiss?: () => void;
  compact?: boolean;
}

export default function UpgradePrompt({
  featureKey,
  featureLabel,
  currentPlan,
  requiredPlan,
  role,
  unlockSummary,
  onDismiss,
  compact = false,
}: UpgradePromptProps) {
  const currentLabel = getPlanDisplayName(role, currentPlan);
  const requiredLabel = getPlanDisplayName(role, requiredPlan);
  const message = getUpgradeMessage(featureKey, requiredPlan);

  return (
    <div className={`upgrade-prompt${compact ? ' upgrade-prompt--compact' : ''}`} role="region" aria-label="Upgrade required">
      <div className="upgrade-prompt-icon" aria-hidden>
        🔒
      </div>
      <div className="upgrade-prompt-body">
        <div className="upgrade-prompt-eyebrow">Plan upgrade</div>
        <h3 className="upgrade-prompt-title">{featureLabel}</h3>
        <p className="upgrade-prompt-message">{message}</p>
        <div className="upgrade-prompt-meta">
          <span className="upgrade-prompt-badge upgrade-prompt-badge--current">
            Current: {currentLabel}
          </span>
          <span className="upgrade-prompt-badge upgrade-prompt-badge--required">
            Requires: {requiredLabel}
          </span>
        </div>
        {unlockSummary ?
          <p className="upgrade-prompt-unlock">{unlockSummary}</p>
        : null}
        <p className="upgrade-prompt-stripe-note">
          Stripe checkout is not active yet — view plans to compare benefits. No payment will be charged.
        </p>
        <div className="upgrade-prompt-actions">
          <Link to="/dashboard/billing" className="btn btn-primary btn-sm">
            View Plans
          </Link>
          {onDismiss ?
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
              Keep using free / basic tools
            </button>
          : (
            <Link to="/dashboard" className="btn btn-ghost btn-sm">
              Back to dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
