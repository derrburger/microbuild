import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isAdminEmail } from '../lib/admin';
import {
  getCreatorBillingStatus,
  getCreatorPaymentStatusLabel,
  getCreatorApprovalDisplay,
  getPublicProfileDisplay,
  getVerificationDisplay,
  getStripeStatusLabel,
  isStripeConnected,
  startCreatorCheckout,
  openBillingPortal,
} from '../lib/billing';
import {
  buyerPricingPlans,
  creatorPricingPlans,
  BUYER_PRICING_NOTE,
  CREATOR_TIER_COLORS,
  type CreatorPlanId,
} from '../lib/pricingPlans';
import { analyzeProfileStrength } from '../lib/profileAI';
import type { UserProfileRow, CreatorProfileRow } from '../types/database';
import AppPageHeader from '../components/AppPageHeader';
import PlanComparisonTable from '../components/billing/PlanComparisonTable';
import './DashboardBilling.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export default function DashboardBilling() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [userProfile, setUserProfile] = useState<UserProfileRow | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      const { data: up } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      if (!up) {
        navigate('/onboarding', { replace: true });
        return;
      }

      setUserProfile(up as UserProfileRow);

      if ((up as UserProfileRow).account_type === 'creator') {
        const cpId = (up as { creator_profile_id?: string | null }).creator_profile_id;
        let cpData: Record<string, unknown> | null = null;

        if (cpId) {
          const { data } = await supabase
            .from('creator_profiles')
            .select('id, tier, approval_status, subscription_status, public_profile_status, verification_status, display_name, full_name, bio, tools, niches, portfolio_links, credential_links, github_url, linkedin_url, certifications, available_hours')
            .eq('id', cpId)
            .maybeSingle();
          cpData = data as Record<string, unknown> | null;
        }

        if (!cpData) {
          const { data } = await supabase
            .from('creator_profiles')
            .select('id, tier, approval_status, subscription_status, public_profile_status, verification_status, display_name, full_name, bio, tools, niches, portfolio_links, credential_links, github_url, linkedin_url, certifications, available_hours')
            .eq('auth_user_id', user!.id)
            .maybeSingle();
          cpData = data as Record<string, unknown> | null;
        }

        if (cpData) {
          if (!cpData.tier) cpData.tier = 'free';
          setCreatorProfile(cpData as unknown as CreatorProfileRow);
        }
      }

      setLoading(false);
    }

    void load();
  }, [user, navigate]);

  function handleCheckout(planId: CreatorPlanId) {
    const result = startCreatorCheckout(planId);
    if (!result.ok) {
      setActionNotice(result.message);
      return;
    }
    if (result.redirectUrl) window.location.href = result.redirectUrl;
  }

  function handlePortal() {
    const result = openBillingPortal();
    if (!result.ok) {
      setActionNotice(result.message);
      return;
    }
    if (result.redirectUrl) window.location.href = result.redirectUrl;
  }

  if (authLoading || loading) {
    return (
      <div className="dbill-page">
        <div className="dbill-loading">
          <div className="dbill-spinner" />
          <p>Loading billing…</p>
        </div>
      </div>
    );
  }

  if (!user || !userProfile) return null;

  const isAdmin = Boolean(user.email && isAdminEmail(user.email));
  const isCreator = userProfile.account_type === 'creator';
  const isBuyer = userProfile.account_type === 'buyer';
  const currentTier = safeStr(creatorProfile?.tier, 'free') as CreatorPlanId;
  const billingStatus = isCreator ? getCreatorBillingStatus(creatorProfile) : null;
  const profileStrength = creatorProfile ? analyzeProfileStrength(creatorProfile).score : null;

  return (
    <div className="dbill-page app-workspace">
      <AppPageHeader
        eyebrow="Account"
        title="Billing & Plans"
        subtitle={
          isCreator
            ? 'Creator marketplace plans — upgrade for more workflow publishing and applications.'
            : isBuyer
              ? 'Pay per MicroBuild — no buyer subscription required.'
              : 'View pricing and billing options for your account.'
        }
      />

      <div className="container dbill-body">
        {/* Stripe status banner */}
        <div className={`dbill-stripe-banner${isStripeConnected() ? ' dbill-stripe-banner--connected' : ''}`}>
          <span className="dbill-stripe-icon">{isStripeConnected() ? '✓' : '💳'}</span>
          <div>
            <div className="dbill-stripe-title">{getStripeStatusLabel()}</div>
            <p className="dbill-stripe-desc">
              {isStripeConnected()
                ? 'Subscription checkout and billing portal will be available from this page.'
                : 'Billing is not connected yet. Plans are visible now. Checkout will activate when Stripe is connected.'}
            </p>
          </div>
        </div>

        {actionNotice && (
          <div className="dbill-action-notice" role="status">
            {actionNotice}
            <button type="button" className="dbill-notice-dismiss" onClick={() => setActionNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Admin placeholder */}
        {isAdmin && (
          <section className="dbill-section dbill-admin-placeholder">
            <h2 className="dbill-section-title">Admin billing overview</h2>
            <p className="dbill-section-sub">
              Platform billing analytics and payout oversight will live here after Stripe is connected.
              Use the AI Command Center for creator onboarding in the meantime.
            </p>
            <Link to="/admin" className="btn btn-ghost btn-sm">Open Command Center →</Link>
          </section>
        )}

        {/* Buyer billing */}
        {isBuyer && (
          <>
            <section className="dbill-section">
              <h2 className="dbill-section-title">Buyer accounts are free</h2>
              <p className="dbill-section-sub">
                No buyer subscription required. Project pricing is per MicroBuild — final scope
                confirmed before work begins.
              </p>
              <div className="dbill-buyer-meta">
                <span className="dbill-tag">Pay per MicroBuild</span>
                <span className="dbill-tag">No subscription</span>
                <span className="dbill-tag">Agreement confirms scope</span>
              </div>
              <div className="dbill-buyer-actions">
                <Link to="/request" className="btn btn-primary btn-sm">Request a MicroBuild</Link>
                <Link to="/browse" className="btn btn-ghost btn-sm">Browse Workflows</Link>
                <Link to="/pricing#get-a-microbuild" className="btn btn-ghost btn-sm">
                  View public pricing
                </Link>
              </div>
            </section>

            <section className="dbill-section">
              <h2 className="dbill-section-title">Buyer project pricing</h2>
              <div className="dbill-plan-grid dbill-plan-grid--buyer">
                {buyerPricingPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`dbill-plan-card${plan.highlighted ? ' dbill-plan-card--highlighted' : ''}`}
                  >
                    <div className="dbill-plan-name">{plan.name}</div>
                    <div className="dbill-plan-price">
                      {typeof plan.price === 'number' ? `$${plan.price}` : plan.price}
                    </div>
                    <p className="dbill-plan-desc">{plan.description}</p>
                    <ul className="dbill-plan-features">
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="dbill-note">{BUYER_PRICING_NOTE}</p>
            </section>
          </>
        )}

        {/* Creator billing */}
        {isCreator && (
          <>
            <section className="dbill-section dbill-current-plan">
              <h2 className="dbill-section-title">Current plan</h2>
              {billingStatus && (
                <>
                  <div className="dbill-current-headline">{billingStatus.headline}</div>
                  <p className="dbill-section-sub">{billingStatus.message}</p>
                  <p className="dbill-stripe-inline">
                    {!isStripeConnected()
                      ? 'Checkout not active yet — Stripe is not connected. No charges will occur until checkout is live.'
                      : billingStatus.stripeNotice}
                  </p>
                </>
              )}

              <div className="dbill-status-grid">
                <div className="dbill-status-item">
                  <span className="dbill-status-label">Payment status</span>
                  <span className="dbill-status-value">
                    {getCreatorPaymentStatusLabel(
                      currentTier,
                      creatorProfile?.subscription_status,
                      creatorProfile?.approval_status,
                    )}
                  </span>
                </div>
                <div className="dbill-status-item">
                  <span className="dbill-status-label">Approval status</span>
                  <span className="dbill-status-value">
                    {getCreatorApprovalDisplay(creatorProfile?.approval_status)}
                  </span>
                </div>
                <div className="dbill-status-item">
                  <span className="dbill-status-label">Public profile</span>
                  <span className="dbill-status-value">
                    {getPublicProfileDisplay(creatorProfile?.public_profile_status)}
                  </span>
                </div>
                <div className="dbill-status-item">
                  <span className="dbill-status-label">Verification</span>
                  <span className="dbill-status-value">
                    {getVerificationDisplay(creatorProfile?.verification_status)}
                  </span>
                </div>
                {profileStrength != null && (
                  <div className="dbill-status-item">
                    <span className="dbill-status-label">Profile strength</span>
                    <span className="dbill-status-value">{profileStrength}/100</span>
                  </div>
                )}
              </div>

              <div className="dbill-action-row">
                {billingStatus?.showUpgradeProfessional && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleCheckout('professional')}
                  >
                    {isStripeConnected() ? 'Upgrade to Professional' : 'Upgrade to Professional (coming soon)'}
                  </button>
                )}
                {billingStatus?.showApplyVerified && (
                  <Link to="/creators/apply" className="btn btn-ghost btn-sm">
                    Apply for Verified
                  </Link>
                )}
                {billingStatus?.showManageBilling && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handlePortal}>
                    Manage Billing (coming soon)
                  </button>
                )}
                <Link to="/pricing#build-on-microbuild" className="btn btn-ghost btn-sm">
                  View public pricing →
                </Link>
              </div>
            </section>

            <section className="dbill-section">
              <h2 className="dbill-section-title">Upgrade path</h2>
              <p className="dbill-section-sub">
                Compare Free, Professional, and Verified creator plans. Verified requires admin approval.
              </p>

              <div className="dbill-plan-grid">
                {creatorPricingPlans.map((plan) => {
                  const isCurrent = plan.id === currentTier;
                  const color = CREATOR_TIER_COLORS[plan.id];
                  return (
                    <div
                      key={plan.id}
                      className={`dbill-plan-card${plan.highlighted ? ' dbill-plan-card--highlighted' : ''}${isCurrent ? ' dbill-plan-card--current' : ''}`}
                      style={{ '--plan-color': color } as React.CSSProperties}
                    >
                      {isCurrent && <div className="dbill-plan-current-badge">Current plan</div>}
                      <div className="dbill-plan-name">{plan.name}</div>
                      <div className="dbill-plan-price">{plan.priceLabel}</div>
                      <p className="dbill-plan-desc">{plan.description}</p>
                      <ul className="dbill-plan-features">
                        {plan.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      <div className="dbill-plan-limits">
                        <div>{plan.limits.applicationsPerMonth} applications/month</div>
                        <div>{plan.limits.publishedWorkflows} published workflows</div>
                      </div>
                      <div className="dbill-plan-cta">
                        {isCurrent ? (
                          <span className="dbill-plan-current-label">Your current plan</span>
                        ) : plan.id === 'free' ? (
                          <span className="dbill-plan-muted">Included for all creators</span>
                        ) : plan.id === 'verified' ? (
                          <Link to="/creators/apply" className="btn btn-ghost btn-sm">
                            Apply for Verified
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleCheckout(plan.id)}
                          >
                            {isStripeConnected() ? plan.cta : 'Checkout coming soon'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <PlanComparisonTable currentPlanId={currentTier} />
            </section>
          </>
        )}

        {/* Fallback for unknown account type */}
        {!isBuyer && !isCreator && !isAdmin && (
          <section className="dbill-section">
            <p className="dbill-section-sub">Complete onboarding to view billing for your account type.</p>
            <Link to="/onboarding" className="btn btn-primary btn-sm">Complete onboarding →</Link>
          </section>
        )}
      </div>
    </div>
  );
}
