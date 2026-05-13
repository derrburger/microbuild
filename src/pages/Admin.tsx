import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchTemplates } from '../lib/templates';
import { generateBuildPacket } from '../lib/buildPacket';
import type { MicroBuildListing } from '../types';
import './Admin.css';

// ─── Row types from Supabase ──────────────────────────────────────────────────

interface BuyerRequestRow {
  id: string;
  full_name: string;
  email: string;
  business_name: string;
  industry: string;
  website_social: string | null;
  build_type: string;
  main_goal: string;
  current_problem: string;
  budget: string | null;
  deadline: string | null;
  style_notes: string | null;
  status: string;
  created_at: string;
}

interface CreatorApplicationRow {
  id: string;
  full_name: string;
  email: string;
  tools: string[];
  niches: string[];
  experience: string;
  available_hours: string;
  status: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  new:              '#f9b032',
  'in-review':      '#63b3ed',
  'proposal-sent':  '#38bd82',
  accepted:         '#38bd82',
  rejected:         '#ef4444',
  reviewing:        '#63b3ed',
  approved:         '#38bd82',
  'in-progress':    '#f9b032',
  delivered:        '#38bd82',
  available:        '#38bd82',
  popular:          '#f9b032',
  'coming-soon':    '#63b3ed',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="admin-status" style={{ color: statusColors[status] ?? 'inherit' }}>
      ● {status}
    </span>
  );
}

function SectionState({
  loading, error, empty, emptyMsg,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyMsg: string;
}) {
  if (loading) return <div className="admin-state-row admin-loading">Loading…</div>;
  if (error)   return <div className="admin-state-row admin-error">Failed to load — check console for details.</div>;
  if (empty)   return <div className="admin-state-row admin-empty">{emptyMsg}</div>;
  return null;
}

// ─── Build Packet Preview ─────────────────────────────────────────────────────

function PacketPreview({ row }: { row: BuyerRequestRow }) {
  const [open, setOpen] = useState(false);

  // Map DB row → BuyerRequest interface for the generator
  const packet = generateBuildPacket({
    fullName:       row.full_name,
    email:          row.email,
    phone:          '',
    businessName:   row.business_name,
    industry:       row.industry,
    websiteSocial:  row.website_social ?? '',
    buildType:      row.build_type as never,
    mainGoal:       row.main_goal,
    currentProblem: row.current_problem,
    budget:         row.budget ?? '',
    deadline:       row.deadline ?? '',
    styleNotes:     row.style_notes ?? '',
  });

  return (
    <div className="packet-preview">
      <button
        className="packet-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▲ Hide Build Packet Preview' : '▼ View Build Packet Preview'}
      </button>

      {open && (
        <div className="packet-body">
          <div className="packet-disclaimer">
            ⚡ This packet is auto-generated from form data — no AI API called.
            Phase 3 will replace this with a real GPT-generated packet.
          </div>

          <div className="packet-section">
            <div className="packet-label">Business Summary</div>
            <p>{packet.businessSummary}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Problem</div>
            <p>{packet.problem}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Recommended Build</div>
            <p>{packet.recommendedBuild}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Target Audience</div>
            <p>{packet.targetAudience}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Suggested Copy Direction</div>
            <p>{packet.suggestedCopyDirection}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Design Direction</div>
            <p>{packet.designDirection}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Suggested Form Fields</div>
            <ul className="packet-list">
              {packet.formFields.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
          <div className="packet-section">
            <div className="packet-label">Automation Needs</div>
            <p>{packet.automationNeeds}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Creator Instructions</div>
            <p>{packet.creatorInstructions}</p>
          </div>
          <div className="packet-section">
            <div className="packet-label">Quality Checklist</div>
            <ul className="packet-list">
              {packet.qualityChecklist.map((item) => <li key={item}>☐ {item}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [requests, setRequests]             = useState<BuyerRequestRow[]>([]);
  const [applications, setApplications]     = useState<CreatorApplicationRow[]>([]);
  const [templates, setTemplates]           = useState<MicroBuildListing[]>([]);

  const [reqLoading,  setReqLoading]        = useState(true);
  const [appLoading,  setAppLoading]        = useState(true);
  const [tplLoading,  setTplLoading]        = useState(true);

  const [reqError,    setReqError]          = useState(false);
  const [appError,    setAppError]          = useState(false);

  useEffect(() => {
    // buyer_requests — requires the dev admin read policy to be applied
    supabase
      .from('buyer_requests')
      .select('id,full_name,email,business_name,industry,website_social,build_type,main_goal,current_problem,budget,deadline,style_notes,status,created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Admin] buyer_requests fetch failed', error);
          setReqError(true);
        } else {
          setRequests((data as BuyerRequestRow[]) ?? []);
        }
        setReqLoading(false);
      });

    // creator_applications — same policy requirement
    supabase
      .from('creator_applications')
      .select('id,full_name,email,tools,niches,experience,available_hours,status,created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Admin] creator_applications fetch failed', error);
          setAppError(true);
        } else {
          setApplications((data as CreatorApplicationRow[]) ?? []);
        }
        setAppLoading(false);
      });

    // microbuild_templates — uses the existing public SELECT policy
    fetchTemplates().then(({ listings }) => {
      setTemplates(listings);
      setTplLoading(false);
    });
  }, []);

  const newReqCount = requests.filter((r) => r.status === 'new').length;
  const newAppCount = applications.filter((a) => a.status === 'new').length;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="container">
          <div className="admin-title-row">
            <h1>Admin Dashboard</h1>
            <span className="admin-badge">Internal — Not Public</span>
          </div>
          <p className="admin-sub">MicroBuild platform overview. Live data from Supabase.</p>
        </div>
      </div>

      {/* Security warning */}
      <div className="admin-auth-warning">
        <div className="container">
          <strong>⚠️ No authentication is required to view this page.</strong>{' '}
          Add Supabase Auth and admin role checks before this URL is made public.
          See <code>supabase/policies.sql</code> for the dev read policy notes.
        </div>
      </div>

      <div className="container admin-body">

        {/* Stats */}
        <div className="admin-stats">
          <div className="stat-card">
            <span className="stat-value">{reqLoading ? '…' : newReqCount}</span>
            <span className="stat-label">New Requests</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{reqLoading ? '…' : requests.length}</span>
            <span className="stat-label">Total Requests</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{appLoading ? '…' : newAppCount}</span>
            <span className="stat-label">New Applications</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{appLoading ? '…' : applications.length}</span>
            <span className="stat-label">Total Applications</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{tplLoading ? '…' : templates.length}</span>
            <span className="stat-label">Active Listings</span>
          </div>
        </div>

        {/* Buyer Requests */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Buyer Requests</h2>
            {!reqLoading && <span className="admin-count">{requests.length}</span>}
          </div>

          <SectionState
            loading={reqLoading}
            error={reqError}
            empty={!reqLoading && !reqError && requests.length === 0}
            emptyMsg="No buyer requests yet. Once you apply the dev admin read policy from policies.sql, submissions will appear here."
          />

          {!reqLoading && !reqError && requests.length > 0 && (
            <>
              <div className="admin-table">
                <div className="admin-table-head admin-req-cols">
                  <span>Name</span>
                  <span>Business</span>
                  <span>Build Type</span>
                  <span>Budget</span>
                  <span>Submitted</span>
                  <span>Status</span>
                </div>
                {requests.map((r) => (
                  <div key={r.id} className="admin-table-row-wrap">
                    <div className="admin-table-row admin-req-cols">
                      <span>{r.full_name}</span>
                      <span>{r.business_name}<br /><span className="admin-meta">{r.industry}</span></span>
                      <span>{r.build_type}</span>
                      <span>{r.budget ?? '—'}</span>
                      <span>{fmtDate(r.created_at)}</span>
                      <span><StatusDot status={r.status} /></span>
                    </div>
                    <div className="admin-row-detail">
                      <div className="admin-row-goals">
                        <span className="admin-meta-label">Goal:</span> {r.main_goal}
                        <br />
                        <span className="admin-meta-label">Problem:</span> {r.current_problem}
                        {r.style_notes && <><br /><span className="admin-meta-label">Style notes:</span> {r.style_notes}</>}
                      </div>
                      <PacketPreview row={r} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Creator Applications */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Creator Applications</h2>
            {!appLoading && <span className="admin-count">{applications.length}</span>}
          </div>

          <SectionState
            loading={appLoading}
            error={appError}
            empty={!appLoading && !appError && applications.length === 0}
            emptyMsg="No creator applications yet. Apply the dev admin read policy from policies.sql to see submissions."
          />

          {!appLoading && !appError && applications.length > 0 && (
            <div className="admin-table">
              <div className="admin-table-head admin-app-cols">
                <span>Name</span>
                <span>Email</span>
                <span>Tools</span>
                <span>Niches</span>
                <span>Submitted</span>
                <span>Status</span>
              </div>
              {applications.map((a) => (
                <div key={a.id} className="admin-table-row admin-app-cols">
                  <span>{a.full_name}</span>
                  <span>{a.email}</span>
                  <span className="admin-chips">{a.tools.map((t) => <span key={t} className="admin-chip">{t}</span>)}</span>
                  <span className="admin-chips">{a.niches.map((n) => <span key={n} className="admin-chip">{n}</span>)}</span>
                  <span>{fmtDate(a.created_at)}</span>
                  <span><StatusDot status={a.status} /></span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MicroBuild Listings */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>MicroBuild Listings</h2>
            {!tplLoading && <span className="admin-count">{templates.length}</span>}
          </div>

          <SectionState
            loading={tplLoading}
            error={false}
            empty={!tplLoading && templates.length === 0}
            emptyMsg="No templates found."
          />

          {!tplLoading && templates.length > 0 && (
            <div className="admin-table">
              <div className="admin-table-head admin-tpl-cols">
                <span>Title</span>
                <span>Category</span>
                <span>Industry</span>
                <span>Price</span>
                <span>Turnaround</span>
                <span>Status</span>
              </div>
              {templates.map((l) => (
                <div key={l.id} className="admin-table-row admin-tpl-cols">
                  <span>{l.title}</span>
                  <span>{l.category}</span>
                  <span>{l.targetIndustry}</span>
                  <span>${l.startingPrice}</span>
                  <span>{l.estimatedTurnaround}</span>
                  <span><StatusDot status={l.status} /></span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Coming Soon */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Orders</h2>
            <span className="admin-placeholder-tag">Phase 2</span>
          </div>
          <div className="admin-placeholder">
            Orders are created when admin accepts a buyer request and assigns a creator.
            This section will be built in Phase 2 alongside Supabase Auth.
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Build Packets</h2>
            <span className="admin-placeholder-tag">Phase 3</span>
          </div>
          <div className="admin-placeholder">
            AI-generated build packets (GPT-4o via Supabase Edge Function) will appear here in Phase 3.
            The build packet preview on each request above uses deterministic template logic as a placeholder.
          </div>
        </section>

      </div>
    </div>
  );
}
