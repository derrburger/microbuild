import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MicroBuildCard from '../components/MicroBuildCard';
import CreatorBuyerRequestsBrowse from '../components/marketplace/CreatorBuyerRequestsBrowse';
import BuyerWorkflowsPublicBrowse from '../components/marketplace/BuyerWorkflowsPublicBrowse';
import { fetchTemplates } from '../lib/templates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  getOpenBuyerRequests,
  getPublishedWorkflowsForBuyers,
  getActiveAppliedBuyerRequestIds,
  resolveCreatorProfileForMarketplace,
} from '../lib/marketplace';
import { creatorEligibleForApplying } from '../lib/marketplaceEligibility';
import type {
  BuyerRequestRow,
  CreatorProfileRow,
  PublishedWorkflowRow,
  UserProfileRow,
} from '../types/database';
import type { MicroBuildListing, MicroBuildCategory } from '../types';
import './Browse.css';
import './Dashboard.css';

const allCategories: MicroBuildCategory[] = [
  'Quote Funnel',
  'Package Selector',
  'Review Booster',
  'Trust Page',
  'Booking Page',
];

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

export default function Browse() {
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const { user, loading: authLoading } = useAuth();

  const initialCategory: MicroBuildCategory | 'All' =
    categoryParam && (allCategories as string[]).includes(categoryParam)
      ? (categoryParam as MicroBuildCategory)
      : 'All';

  const [activeCategory, setActiveCategory] =
    useState<MicroBuildCategory | 'All'>(initialCategory);
  const [search, setSearch] = useState('');
  const [publicListings, setPublicListings] = useState<MicroBuildListing[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicMock, setPublicMock] = useState(false);

  const [accountPhase, setAccountPhase] = useState<
    'loading' | 'guest' | 'creator' | 'buyer' | 'admin' | 'incomplete'
  >('loading');
  const [userProfileRow, setUserProfileRow] = useState<UserProfileRow | null>(null);

  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileRow | null>(null);
  const [creatorRequestsLoading, setCreatorRequestsLoading] = useState(false);
  const [openRequests, setOpenRequests] = useState<BuyerRequestRow[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const [buyerWorkflowsLoading, setBuyerWorkflowsLoading] = useState(false);
  const [workflows, setWorkflows] = useState<PublishedWorkflowRow[]>([]);
  const [workflowCreators, setWorkflowCreators] = useState<Record<string, string>>({});

  // Sync category filter with URL params (public browse only uses this prominently)
  useEffect(() => {
    if (categoryParam && (allCategories as string[]).includes(categoryParam)) {
      setActiveCategory(categoryParam as MicroBuildCategory);
    } else {
      setActiveCategory('All');
    }
  }, [categoryParam]);

  // Resolve account type once auth is stable
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
        .select('*')
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

  // MicroBuild starter templates — guest/browse + buyer-role lower section (skipped for creators)
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

  // Creator: open requests + eligibility context
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
        setOpenRequests(reqs);
        setAppliedIds(appliedArr);
        setCreatorRequestsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user, accountPhase, userProfileRow]);

  // Buyer / Admin: storefront workflows (+ optional starter templates reuse same fetchTemplates effect)
  useEffect(() => {
    if (!user || (accountPhase !== 'buyer' && accountPhase !== 'admin')) return;

    let cancelled = false;

    async function load() {
      setBuyerWorkflowsLoading(true);

      const w = await getPublishedWorkflowsForBuyers();
      if (cancelled) return;

      setWorkflows(w);
      const ids = [...new Set(w.map((x) => x.creator_profile_id))];
      let map: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: cps } = await supabase
          .from('creator_profiles')
          .select('id, display_name, full_name')
          .in('id', ids);
        map = {};
        for (const c of (cps ?? []) as {
          id?: string;
          display_name?: string | null;
          full_name?: string | null;
        }[]) {
          const id = safeStr(c.id);
          const label = `${safeStr(c.display_name)}`.trim() || safeStr(c.full_name, 'Creator').trim();
          map[id] = label || 'Creator';
        }
      }
      if (!cancelled) {
        setWorkflowCreators(map);
        setBuyerWorkflowsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user, accountPhase]);

  const filteredPublic = useMemo(() => {
    return publicListings.filter((l) => {
      const matchesCategory = activeCategory === 'All' || l.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch =
        q === '' ||
        l.title.toLowerCase().includes(q) ||
        l.targetIndustry.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [publicListings, activeCategory, search]);

  const headline = useMemo(() => {
    if (accountPhase === 'creator') return 'Browse Buyer Requests';
    if (accountPhase === 'buyer' || accountPhase === 'admin') return 'Browse Workflows';
    return 'Browse MicroBuilds';
  }, [accountPhase]);

  const subhero = useMemo(() => {
    if (accountPhase === 'creator') {
      return (
        <>
          Open buyer scopes listed here accept voluntary applications until a buyer picks a creator. Admin assignment
          remains available as fallback.
          <span className="browse-sub-dash-link">
            {' '}
            Track your pitches under{' '}
            <Link to="/dashboard/applications">Dashboard · Applications</Link>.
          </span>
        </>
      );
    }
    if (accountPhase === 'buyer' || accountPhase === 'admin') {
      return (
        <>
          Reusable workflows published by creators, plus curated platform starter listings for inspiration — your live
          request intake still lives under the dashboard.
        </>
      );
    }
    return <>Focused revenue tools for local service businesses. Filter by type or search by trade.</>;
  }, [accountPhase]);

  const eligibility = useMemo(
    () => creatorEligibleForApplying(creatorProfile),
    [creatorProfile],
  );

  const identityBusy = authLoading || (user !== null && accountPhase === 'loading');
  const creatorBusy = accountPhase === 'creator' && creatorRequestsLoading;
  const buyerBusy = (accountPhase === 'buyer' || accountPhase === 'admin') && buyerWorkflowsLoading;
  const templateBusy =
    accountPhase === 'guest' || accountPhase === 'incomplete' || accountPhase === 'buyer' || accountPhase === 'admin'
      ? publicLoading
      : false;

  const showSkeleton = identityBusy || creatorBusy || buyerBusy || templateBusy;

  return (
    <div className="browse-page">
      <div className="browse-hero">
        <div className="container">
          <h1 className="browse-title">{headline}</h1>
          <p className="browse-sub">{subhero}</p>
        </div>
      </div>

      <div className="container browse-body">
        {showSkeleton ?
          (
            <div className="browse-loading">
              <div className="cards-grid">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="card-skeleton" />
                ))}
              </div>
            </div>
          )
        : accountPhase === 'incomplete' ?
          (
            <section className="dash-empty browse-onboarding-prompt">
              <p>Complete onboarding so we know whether you are buying builds or fulfilling them.</p>
              <Link to="/onboarding" className="btn btn-primary btn-sm">
                Continue onboarding →
              </Link>
            </section>
          )
        : accountPhase === 'creator' ?
          (
            <CreatorBuyerRequestsBrowse
              requests={openRequests}
              creatorProfileId={creatorProfile?.id}
              creatorUserProfileId={userProfileRow?.id ?? null}
              eligibility={eligibility}
              initialAppliedRequestIds={appliedIds}
            />
          )
        : accountPhase === 'buyer' || accountPhase === 'admin' ?
          (
            <BuyerWorkflowsPublicBrowse
              workflows={workflows}
              creatorLabels={workflowCreators}
              platformTemplates={publicListings}
              platformLoading={publicLoading}
              platformNotice="Sample storefront templates — illustrative until more creators publish `published_workflows`."
            />
          )
        :
          (
            <>
              {publicMock && !publicLoading && (
                <div className="browse-mock-notice">
                  Showing sample listings — live data unavailable. Check your Supabase connection and RLS policies.
                </div>
              )}

              <div className="browse-controls">
                <div className="browse-filters">
                  <button
                    className={`filter-btn${activeCategory === 'All' ? ' active' : ''}`}
                    onClick={() => setActiveCategory('All')}
                  >
                    All Builds
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      className={`filter-btn${activeCategory === cat ? ' active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input
                  className="browse-search"
                  type="text"
                  placeholder="Search by trade or keyword…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {publicLoading ?
                (
                  <div className="browse-loading">
                    <div className="cards-grid">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="card-skeleton" />
                      ))}
                    </div>
                  </div>
                )
              : filteredPublic.length > 0 ?
                (
                  <div className="cards-grid">
                    {filteredPublic.map((listing) => (
                      <MicroBuildCard key={listing.id} listing={listing} />
                    ))}
                  </div>
                )
              : (
                  <div className="browse-empty">
                    <p>No MicroBuilds match your search. Try a different keyword or filter.</p>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setActiveCategory('All');
                        setSearch('');
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
            </>
          )}
      </div>
    </div>
  );
}
