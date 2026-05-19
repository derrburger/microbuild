import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { createOrUpdateOrderFromSelectedApplication } from '../../lib/marketplace';
import type { BuyerRequestRow } from '../../types/database';

export type MarketplaceAppAdminRow = {
  id: string;
  buyer_request_id: string;
  creator_profile_id: string;
  application_status: string | null;
  proposal_message: string | null;
  fit_reason: string | null;
  estimated_timeline: string | null;
  proposed_price: number | null;
  created_at: string | null;
};

function safeText(v: unknown, fb = '—'): string {
  if (typeof v === 'string' && v.trim()) return v;
  if (v == null) return fb;
  return String(v);
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function AdminMarketplaceApplications({
  applications,
  requests,
  creatorNameById,
  onRefresh,
}: {
  applications: MarketplaceAppAdminRow[];
  requests: BuyerRequestRow[];
  creatorNameById: Record<string, string>;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'selected' | 'rejected'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reqById = useMemo(() => {
    const m = new Map<string, BuyerRequestRow>();
    for (const r of requests) m.set(r.id, r);
    return m;
  }, [requests]);

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      const st = safeText(a.application_status, '').toLowerCase();
      if (filter === 'selected') return st === 'buyer_selected' || st === 'shortlisted';
      if (filter === 'rejected') return st === 'rejected' || st === 'withdrawn';
      if (filter === 'active') return ['submitted', 'shortlisted', 'buyer_selected'].includes(st);
      return true;
    });
  }, [applications, filter]);

  async function adminOverrideSelect(app: MarketplaceAppAdminRow) {
    const req = reqById.get(app.buyer_request_id);
    if (!req) {
      setNotice('Buyer request not found.');
      return;
    }
    if (!window.confirm('Admin override: select this creator for the request? Buyer selection remains the normal path.')) {
      return;
    }
    setBusyId(app.id);
    setNotice(null);
    const ts = new Date().toISOString();

    await supabase
      .from('request_applications')
      .update({ application_status: 'rejected', updated_at: ts })
      .eq('buyer_request_id', app.buyer_request_id)
      .neq('id', app.id)
      .in('application_status', ['submitted', 'shortlisted']);

    await supabase
      .from('request_applications')
      .update({ application_status: 'buyer_selected', updated_at: ts })
      .eq('id', app.id);

    await supabase
      .from('buyer_requests')
      .update({
        selected_creator_profile_id: app.creator_profile_id,
        selected_request_application_id: app.id,
        application_status: 'creator_selected',
        visibility_status: 'creator_selected',
        updated_at: ts,
      })
      .eq('id', app.buyer_request_id);

    const orderRes = await createOrUpdateOrderFromSelectedApplication({
      buyerRequest: req,
      creatorProfileId: app.creator_profile_id,
      requestApplicationId: app.id,
      buyerDbUserId: req.user_id ?? null,
    });

    setBusyId(null);
    if (!orderRes.ok) {
      setNotice(orderRes.error ?? 'Could not sync order.');
      return;
    }
    setNotice('Creator selected (admin override).');
    onRefresh();
  }

  async function blockApplication(appId: string) {
    if (!window.confirm('Mark this application as rejected?')) return;
    setBusyId(appId);
    const { error } = await supabase
      .from('request_applications')
      .update({ application_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', appId);
    setBusyId(null);
    if (error) setNotice(error.message);
    else {
      setNotice('Application blocked.');
      onRefresh();
    }
  }

  const tabs = [
    {
      id: 'active' as const,
      label: 'Active',
      count: applications.filter((a) =>
        ['submitted', 'shortlisted', 'buyer_selected'].includes(safeText(a.application_status).toLowerCase()),
      ).length,
    },
    { id: 'all' as const, label: 'All', count: applications.length },
    {
      id: 'selected' as const,
      label: 'Shortlisted / Selected',
      count: applications.filter((a) =>
        ['buyer_selected', 'shortlisted'].includes(safeText(a.application_status).toLowerCase()),
      ).length,
    },
    {
      id: 'rejected' as const,
      label: 'Rejected',
      count: applications.filter((a) =>
        ['rejected', 'withdrawn'].includes(safeText(a.application_status).toLowerCase()),
      ).length,
    },
  ];

  return (
    <section className="admin-section" id="section-marketplace">
      <div className="admin-section-header">
        <h2>Marketplace Applications</h2>
        <span className="admin-count">{applications.length}</span>
      </div>
      <p className="admin-section-intro">
        Creators applying to buyer requests. <strong>Buyer selection is the default path</strong> — use admin override
        only when operational support is required.
      </p>
      {notice ? <div className="admin-inline-notice">{notice}</div> : null}

      <div className="req-filter-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`req-filter-tab${filter === t.id ? ' active' : ''}`}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
            <span className="req-filter-count">{t.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ?
        <div className="admin-state-row admin-empty">No marketplace applications in this filter.</div>
      : (
        <div className="mp-app-card-list">
          {filtered.map((app) => (
            <MarketplaceAppCard
              key={app.id}
              app={app}
              req={reqById.get(app.buyer_request_id)}
              creatorName={creatorNameById[app.creator_profile_id] ?? `${app.creator_profile_id.slice(0, 8)}…`}
              busyId={busyId}
              onOverride={adminOverrideSelect}
              onBlock={blockApplication}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketplaceAppCard({
  app,
  req,
  creatorName,
  busyId,
  onOverride,
  onBlock,
}: {
  app: MarketplaceAppAdminRow;
  req: BuyerRequestRow | undefined;
  creatorName: string;
  busyId: string | null;
  onOverride: (app: MarketplaceAppAdminRow) => void;
  onBlock: (appId: string) => void;
}) {
  const isOrig =
    req?.source_creator_profile_id && req.source_creator_profile_id === app.creator_profile_id;

  return (
    <article className="mp-app-card">
      <div className="mp-app-card-head">
        <div>
          <h3 className="mp-app-request-title">{req?.business_name ?? 'Unknown request'}</h3>
          <p className="subtle mp-app-creator-line">
            {creatorName}
            {isOrig ? <span className="mp-app-badge-orig">Original workflow creator</span> : null}
          </p>
        </div>
        <span className="mp-app-status">{safeText(app.application_status).replace(/_/g, ' ')}</span>
      </div>
      <dl className="mp-app-dl">
        <div>
          <dt>Fit</dt>
          <dd>{safeText(app.fit_reason)}</dd>
        </div>
        <div>
          <dt>Timeline</dt>
          <dd>{safeText(app.estimated_timeline)}</dd>
        </div>
        <div>
          <dt>Proposed price</dt>
          <dd>{app.proposed_price != null && Number.isFinite(app.proposed_price) ? `$${app.proposed_price}` : '—'}</dd>
        </div>
        <div>
          <dt>Buyer marketplace</dt>
          <dd>{safeText(req?.application_status).replace(/_/g, ' ') || '—'}</dd>
        </div>
        <div>
          <dt>Applied</dt>
          <dd>{fmtDate(app.created_at)}</dd>
        </div>
      </dl>
      {app.proposal_message?.trim() ?
        (
          <details className="mp-app-proposal-details">
            <summary>Proposal message</summary>
            <p>
              {app.proposal_message.trim().slice(0, 600)}
              {app.proposal_message.length > 600 ? '…' : ''}
            </p>
          </details>
        )
      : null}
      <div className="mp-app-actions">
        <button type="button" className="wf-action-btn" disabled title="Details shown on this card">
          View application
        </button>
        <Link
          className="wf-action-btn"
          to={`/messages?buyerRequestId=${encodeURIComponent(app.buyer_request_id)}&creatorProfileId=${encodeURIComponent(app.creator_profile_id)}`}
        >
          Message
        </Link>
        <button
          type="button"
          className="wf-action-btn wf-action-btn--accent"
          disabled={busyId === app.id}
          onClick={() => void onOverride(app)}
        >
          {busyId === app.id ? '…' : 'Admin override select'}
        </button>
        <button
          type="button"
          className="wf-action-btn wf-action-btn--danger"
          disabled={busyId === app.id}
          onClick={() => void onBlock(app.id)}
        >
          Block application
        </button>
      </div>
    </article>
  );
}
