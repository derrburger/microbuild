import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCreatorApplicationsWithBuyerRequests, resolveCreatorProfileForMarketplace } from '../lib/marketplace';
import ParticipantMessageThread from '../components/ParticipantMessageThread';
import { getBuyerUserProfileIdForBuyerRequest } from '../lib/messages';
import type {
  BuyerRequestRow,
  RequestApplicationRow,
  UserProfileRow,
} from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './Dashboard.css';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb;
}

function normalizeStatus(raw: unknown): string {
  return safeStr(raw).trim().toLowerCase() || 'submitted';
}

function nextStep(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Waiting for buyer review';
    case 'shortlisted':
      return 'Buyer is considering your proposal';
    case 'buyer_selected':
      return 'You were selected — project should appear in your pipeline';
    case 'rejected':
      return 'Buyer chose another creator or request was closed';
    case 'withdrawn':
      return 'You withdrew this application';
    case 'admin_blocked':
      return 'Application blocked by admin review';
    default:
      return 'Awaiting marketplace update';
  }
}

function statusBadgeClasses(status: string): string {
  if (status === 'buyer_selected') return 'mb-status-pill mb-status-pill--ok';
  if (status === 'rejected' || status === 'admin_blocked') return 'mb-status-pill mb-status-pill--err';
  if (status === 'shortlisted') return 'mb-status-pill mb-status-pill--info';
  return 'mb-status-pill';
}

function oneBr(edge: BuyerRequestRow | BuyerRequestRow[] | null | undefined): BuyerRequestRow | null {
  if (!edge) return null;
  return Array.isArray(edge) ? (edge[0] ?? null) : edge;
}

function pickRow(
  r: Partial<RequestApplicationRow> | null,
): BuyerRequestRow | null {
  if (!r) return null;
  const edge = (
    r as RequestApplicationRow & {
      buyer_requests?: BuyerRequestRow | BuyerRequestRow[] | null;
    }
  ).buyer_requests;
  return oneBr(edge ?? null);
}

export default function DashboardApplications() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<
    ((RequestApplicationRow & { buyer_requests?: BuyerRequestRow | BuyerRequestRow[] | null }) | null)[]
  >([]);
  const [creatorUserProfile, setCreatorUserProfile] = useState<UserProfileRow | null>(null);
  const [busy, setBusy] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const authUid = user.id;

    let cancelled = false;

    async function load() {
      setBusy(true);
      setFetchError(null);

      try {
        const { data: up, error: upErr } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('auth_user_id', authUid)
          .maybeSingle();

        if (upErr) {
          console.error('[DashboardApplications] user_profiles:', upErr);
          if (!cancelled) setFetchError(upErr.message ?? 'Could not load your profile.');
          return;
        }

        if (!up || cancelled) {
          if (!cancelled && !up) navigate('/onboarding', { replace: true });
          return;
        }

        const prof = up as UserProfileRow;
        if (!cancelled) setCreatorUserProfile(prof);

        const t = safeStr(prof.account_type).toLowerCase();
        if (t !== 'creator') {
          if (!cancelled) navigate('/dashboard', { replace: true });
          return;
        }

        const row = await resolveCreatorProfileForMarketplace(authUid, prof);

        const { data: appsMerged, errorMessage } = await getCreatorApplicationsWithBuyerRequests(
          row?.id ?? null,
          prof.id,
        );

        if (!cancelled) {
          setApplications(appsMerged);
          setFetchError(errorMessage);
        }
      } catch (e) {
        console.error('[DashboardApplications] load:', e);
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : 'Something went wrong loading applications.');
          setApplications([]);
          setCreatorUserProfile(null);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  const summary = useMemo(() => {
    const base = {
      submitted: 0,
      shortlisted: 0,
      selected: 0,
      rejected: 0,
      withdrawn: 0,
    };

    for (const a of applications) {
      if (!a) continue;
      const st = normalizeStatus(a.application_status);
      if (st === 'buyer_selected') base.selected++;
      else if (st === 'shortlisted') base.shortlisted++;
      else if (st === 'withdrawn') base.withdrawn++;
      else if (st === 'rejected' || st === 'admin_blocked') base.rejected++;
      else base.submitted++;
    }

    return base;
  }, [applications]);

  if (authLoading || busy || !user) {
    return (
      <div className="dashboard-page">
        <div className="container dashboard-body">
          <DashboardNav />
          <div className="dash-loading">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="container">
          <div className="dashboard-eyebrow">Marketplace · Applications</div>
          <h1 className="dashboard-title">My Request Applications</h1>
          <p className="dashboard-sub mb-browse-intro">
            Every row ties back to your <code>request_applications</code> footprint — shortlisted or selected updates land
            here before you see richer pipeline tooling.
          </p>
        </div>
      </div>

      <div className="container dashboard-body">
        <DashboardNav />

        <div className="mb-application-summary-grid">
          {(
            [
              ['submitted', 'Submitted', summary.submitted],
              ['shortlisted', 'Shortlisted', summary.shortlisted],
              ['selected', 'Selected', summary.selected],
              ['rejected', 'Rejected', summary.rejected],
              ['withdrawn', 'Withdrawn', summary.withdrawn],
            ] as const
          ).map(([key, label, val]) => (
            <div key={key} className={`mb-application-summary-card mb-application-summary-card--${key}`}>
              <span className="mb-application-summary-value">{val}</span>
              <span className="mb-application-summary-label">{label}</span>
            </div>
          ))}
        </div>

        {fetchError ?
          (
            <div
              className={`mb-form-alert${fetchError.includes('could not') || fetchError.includes('permissions') ? ' mb-form-alert--muted' : ' mb-form-alert--error'}`}
              role="status"
            >
              {fetchError}
            </div>
          )
        : null}

        {applications.length === 0 ?
          (
            <section className="dash-empty mb-my-apps-empty">
              <p>You have not applied to any buyer requests yet.</p>
              <Link className="btn btn-primary btn-sm" to="/browse">
                Browse Buyer Requests
              </Link>
            </section>
          )
        : (
          <div className="mb-browse-grid">
            {applications.map((a) => {
              if (!a) return null;
              const st = normalizeStatus(a.application_status);
              const req = pickRow(a);

              const bizLabel =
                [req?.business_name, req?.industry].filter((x): x is string => typeof x === 'string' && !!x.trim())[0] ??
                'Buyer request';

              const buildLabel =
                req?.build_type?.trim()
                || safeStr((a as { microbuild_requested?: unknown }).microbuild_requested, '')
                || 'MicroBuild';

              const goal =
                req?.main_goal?.trim()
                || safeStr((a as { buyer_goal?: unknown }).buyer_goal, '—');

              const fitReason = safeStr(a.fit_reason, '').trim();
              const questions = safeStr(a.creator_questions, '').trim();
              const problem = req?.current_problem?.trim() || '—';
              const orderId = typeof a.order_id === 'string' && a.order_id.trim() ? a.order_id.trim() : null;

              const price =
                a.proposed_price != null && isFinite(Number(a.proposed_price)) ?
                  `$${Number(a.proposed_price)}`
                : '—';

              return (
                <article key={a.id} className="mb-card mb-card--application">
                  <header className="mb-card-header">
                    <div>
                      <h3 className="mb-card-title">{bizLabel.slice(0, 120)}</h3>
                      <p className="muted-sm mb-meta-line">
                        Applied {fmtDate(a.created_at)} · {safeStr(req?.industry, '') || 'Industry n/a'}
                      </p>
                    </div>
                    <span className={statusBadgeClasses(st)}>{st.replace(/_/g, ' ')}</span>
                  </header>

                  <p className="mb-card-goal">
                    <span className="mb-card-strong">Requested MicroBuild: </span>
                    {buildLabel}
                  </p>
                  <p className="mb-card-goal">
                    <span className="mb-card-strong">Goal: </span>
                    {goal}
                  </p>
                  <p className="mb-card-goal">
                    <span className="mb-card-strong">Challenge: </span>
                    {problem}
                  </p>
                  <p className="mb-card-goal">
                    <span className="mb-card-strong">Proposal: </span>
                    {safeStr(a.proposal_message, '—').slice(0, 560)}
                  </p>
                  {fitReason ?
                    (
                      <p className="mb-card-goal">
                        <span className="mb-card-strong">Fit reason: </span>
                        {fitReason}
                      </p>
                    )
                  : null}
                  {questions ?
                    (
                      <p className="mb-card-goal">
                        <span className="mb-card-strong">Your questions (to buyer): </span>
                        {questions}
                      </p>
                    )
                  : null}

                  <div className="mb-card-row mb-card-grid-2">
                    <span className="mb-card-row-label">Timeline</span>
                    <span className="mb-card-row-val">{safeStr(a.estimated_timeline, '—')}</span>
                    <span className="mb-card-row-label">Proposed price</span>
                    <span className="mb-card-row-val">{price}</span>
                  </div>

                  <footer className="mb-application-footer">
                    <span className="mb-next-step-chip">{nextStep(st)}</span>
                    {st === 'buyer_selected' && orderId ?
                      (
                        <Link className="btn btn-primary btn-sm mb-open-workspace-btn" to={`/dashboard/projects/${orderId}`}>
                          Open Project Workspace
                        </Link>
                      )
                    : null}
                    {req?.id ?
                      (
                        <ParticipantMessageThread
                          mode="request_applicant_pair"
                          viewerProfile={creatorUserProfile}
                          viewerRole="creator"
                          buyerRequestId={req.id}
                          orderId={orderId}
                          loadCounterpartUserProfileId={async () =>
                            (await getBuyerUserProfileIdForBuyerRequest(req.id)).id
                          }
                          counterpartLabel={`${bizLabel.slice(0, 60)}`}
                          toggleLabel="Message buyer"
                          emptyHint="No messages yet. Ask a clear question about the build scope, timeline, or buyer goal."
                          className="mb-application-msg-thread"
                        />
                      )
                    : (
                      <p className="subtle muted-sm">Messaging unlocks once this row links to the buyer request record.</p>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
