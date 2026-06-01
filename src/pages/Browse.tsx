import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CreatorBuyerRequestsBrowse from '../components/marketplace/CreatorBuyerRequestsBrowse';
import BuyerWorkflowsPublicBrowse from '../components/marketplace/BuyerWorkflowsPublicBrowse';
import { fetchTemplates } from '../lib/templates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  getOpenBuyerRequests,
  getActiveAppliedBuyerRequestIds,
  loadBuyerBrowseMarketplace,
  resolveCreatorProfileForMarketplace,
} from '../lib/marketplace';
import { creatorEligibleForApplying } from '../lib/marketplaceEligibility';
import { resolveCreatorPlanFromProfile } from '../lib/entitlements';
import { fetchCreatorPlanUsage } from '../lib/planUsage';
import type { CreatorPlanId } from '../lib/pricingPlans';
import type { PlanUsageCounts } from '../lib/entitlements';
import type {
  BuyerRequestRow,
  CreatorProfileRow,
  UserProfileRow,
} from '../types/database';
import type { MicroBuildListing } from '../types';
import './Browse.css';
import './Dashboard.css';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export default function Browse() {
  const { user, loading: authLoading } = useAuth();

  const [accountPhase, setAccountPhase] = useState<
    'loading' | 'guest' | 'creator' | 'buyer' | 'admin' | 'incomplete'
  >('loading');
  const [userProfileRow, setUserProfileRow] = useState<UserProfileRow | null>(null);

  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [creatorRequestsLoading, setCreatorRequestsLoading] = useState(false);
  const [openRequests, setOpenRequests] = useState<BuyerRequestRow[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [creatorPlanId, setCreatorPlanId] = useState<CreatorPlanId>('free');
  const [creatorUsage, setCreatorUsage] = useState<PlanUsageCounts>({});

  const [buyerWorkflowsLoading, setBuyerWorkflowsLoading] = useState(false);
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Awaited<ReturnType<typeof loadBuyerBrowseMarketplace>>['workflows']>([]);
  const [workflowCreatorMeta, setWorkflowCreatorMeta] = useState<
    Awaited<ReturnType<typeof loadBuyerBrowseMarketplace>>['creatorMeta']
  >({});

  const [publicListings, setPublicListings] = useState<MicroBuildListing[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicMock, setPublicMock] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAccountPhase('guest');
      setUserProfileRow(null);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      const { data: upRaw, error } = await supabase
        .from('user_profiles')
        .select('id, account_type, email, auth_user_id, creator_profile_id')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      if (cancelled) return;
      const up = (error ? null : (upRaw ?? null)) as UserProfileRow | null;
      setUserProfileRow(up);
      if (!up) setAccountPhase('incomplete');
      else {
        const t = safeStr(up.account_type).toLowerCase();
        if (t === 'creator') setAccountPhase('creator');
        else if (t === 'buyer') setAccountPhase('buyer');
        else if (t === 'admin') setAccountPhase('admin');
        else setAccountPhase('incomplete');
      }
    }

    void fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || accountPhase === 'loading') return;
    if (accountPhase === 'creator') {
      setPublicLoading(false);
      return;
    }

    let cancelled = false;
    setPublicLoading(true);

    fetchTemplates()
      .then(({ listings: data, fromSupabase }) => {
        if (cancelled) return;
        setPublicListings(data);
        setPublicMock(!fromSupabase);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicMock(true);
      })
      .finally(() => {
        if (!cancelled) setPublicLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, accountPhase]);

  useEffect(() => {
    if (!user || accountPhase !== 'creator') return;

    const authUser = user;
    let cancelled = false;

    async function load() {
      setCreatorRequestsLoading(true);
      const profileFromState = userProfileRow;

      const cp =
        profileFromState ?
          await resolveCreatorProfileForMarketplace(authUser.id, profileFromState)
        : null;

      const reqs = await getOpenBuyerRequests();
      let appliedArr: string[] = [];
      if (cp?.id) appliedArr = await getActiveAppliedBuyerRequestIds(cp.id);

      if (!cancelled) {
        setCreatorProfile(cp);
        setCreatorPlanId(resolveCreatorPlanFromProfile(cp, profileFromState));
        setOpenRequests(reqs);
        setAppliedIds(appliedArr);
        if (cp?.id) {
          const usage = await fetchCreatorPlanUsage(cp.id);
          if (!cancelled) setCreatorUsage(usage);
        } else {
          setCreatorUsage({});
        }
        setCreatorRequestsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user, accountPhase, userProfileRow]);

  useEffect(() => {
    if (authLoading || accountPhase === 'loading') return;
    if (accountPhase !== 'guest' && accountPhase !== 'buyer' && accountPhase !== 'admin') return;

    let cancelled = false;

    async function load() {
      setBuyerWorkflowsLoading(true);
      setWorkflowLoadError(null);

      const { workflows: w, creatorMeta, error } = await loadBuyerBrowseMarketplace();

      if (!cancelled) {
        setWorkflows(w);
        setWorkflowCreatorMeta(creatorMeta);
        setWorkflowLoadError(error);
        setBuyerWorkflowsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, accountPhase]);

  const isBuyerSide =
    accountPhase === 'guest' || accountPhase === 'buyer' || accountPhase === 'admin';

  const headline = accountPhase === 'creator' ? 'Browse Buyer Requests' : 'Browse Workflows';

  const subhero =
    accountPhase === 'creator' ? (
      <>
        Open buyer scopes accept voluntary applications until a buyer picks a creator. Track your pitches under{' '}
        <Link to="/dashboard/applications">Dashboard · Applications</Link>.
      </>
    ) : (
      'Find reusable MicroBuild workflows created by approved creators.'
    );

  const eligibility = creatorEligibleForApplying(creatorProfile);

  const identityBusy = authLoading || (user !== null && accountPhase === 'loading');
  const creatorBusy = accountPhase === 'creator' && creatorRequestsLoading;
  const workflowBrowseBusy = isBuyerSide && buyerWorkflowsLoading;
  const templateBusy = isBuyerSide && publicLoading;
  const showSkeleton = identityBusy || creatorBusy || workflowBrowseBusy || templateBusy;

  return (
    <div className="browse-page">
      <div className="browse-hero">
        <div className="container browse-hero-inner">
          <div className="browse-hero-copy">
            <h1 className="browse-title">{headline}</h1>
            <p className="browse-sub">{subhero}</p>
          </div>
          {isBuyerSide && (
            <div className="browse-hero-cta">
              <Link to="/request" className="btn btn-primary">
                Request Custom MicroBuild
              </Link>
              {!user && (
                <Link to="/signin" className="btn btn-ghost btn-sm browse-hero-signin">
                  Sign in
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container browse-body">
        {publicMock && isBuyerSide && !publicLoading && (
          <div className="browse-mock-notice">
            Platform starter examples may be sample data — creator workflows load from Supabase when published.
          </div>
        )}

        {showSkeleton ? (
          <div className="browse-loading">
            <div className="cards-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="card-skeleton" />
              ))}
            </div>
          </div>
        ) : accountPhase === 'incomplete' ? (
          <section className="dash-empty browse-onboarding-prompt">
            <p>Complete onboarding so we know whether you are buying builds or fulfilling them.</p>
            <Link to="/onboarding" className="btn btn-primary btn-sm">
              Continue onboarding →
            </Link>
          </section>
        ) : accountPhase === 'creator' ? (
          <CreatorBuyerRequestsBrowse
            requests={openRequests}
            creatorProfileId={creatorProfile?.id}
            creatorUserProfileId={userProfileRow?.id ?? null}
            eligibility={eligibility}
            initialAppliedRequestIds={appliedIds}
            creatorPlanId={creatorPlanId}
            usageCounts={creatorUsage}
          />
        ) : isBuyerSide ? (
          <BuyerWorkflowsPublicBrowse
            workflows={workflows}
            creatorMeta={workflowCreatorMeta}
            platformTemplates={publicListings}
            platformLoading={publicLoading}
            platformNotice="Illustrative platform templates — not live creator-published storefront listings."
            loadError={workflowLoadError}
            isLoggedIn={Boolean(user)}
          />
        ) : (
          <p className="browse-empty subtle">Browse is unavailable for this account state.</p>
        )}
      </div>
    </div>
  );
}
