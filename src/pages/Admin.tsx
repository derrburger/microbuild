import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchTemplates } from '../lib/templates';
import { generateBuildPacket } from '../lib/buildPacket';
import type { GeneratedBuildPacket } from '../lib/buildPacket';
import type { MicroBuildListing } from '../types';
import './Admin.css';

// ─── Row types ────────────────────────────────────────────────────────────────

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

interface EnrichedRequest {
  row: BuyerRequestRow;
  packet: GeneratedBuildPacket;
}

type RequestFilter = 'all' | 'new' | 'high-priority' | 'needs-followup' | 'ready-to-quote';

// ─── Color maps ───────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  new:             '#f9b032',
  'in-review':     '#63b3ed',
  'proposal-sent': '#00d478',
  accepted:        '#00d478',
  rejected:        '#ef4444',
  reviewing:       '#63b3ed',
  approved:        '#00d478',
  'in-progress':   '#f9b032',
  delivered:       '#00d478',
  available:       '#00d478',
  popular:         '#f9b032',
  'coming-soon':   '#63b3ed',
};

const priorityColors: Record<string, string> = {
  High:   '#ef4444',
  Medium: '#f9b032',
  Low:    '#505870',
};

const qualityColors: Record<string, string> = {
  Strong:         '#00d478',
  Good:           '#63b3ed',
  Fair:           '#f9b032',
  'Needs Detail': '#ef4444',
};

const urgencyColors: Record<string, string> = {
  High:            '#ef4444',
  Medium:          '#f9b032',
  Low:             '#00d478',
  'Not specified': '#505870',
};

const fitColors: Record<string, string> = {
  Strong: '#00d478',
  Good:   '#63b3ed',
  Okay:   '#f9b032',
  Weak:   '#ef4444',
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fixEncoding(s: string): string {
  return s
    .replace(/â€"/g, '–')
    .replace(/â€"/g, '—')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"');
}

function rowToRequest(row: BuyerRequestRow) {
  return {
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
  };
}

function deriveCreatorFit(app: CreatorApplicationRow): { label: string; color: string } {
  const tools = app.tools.length;
  const niches = app.niches.length;
  const hours = parseInt(app.available_hours) || 0;
  if (tools >= 3 && niches >= 2 && hours >= 10)
    return { label: 'Strong candidate', color: '#00d478' };
  if (tools >= 2 && niches >= 1)
    return { label: 'Needs portfolio review', color: '#f9b032' };
  return { label: 'Limited fit', color: '#ef4444' };
}

function buildCreatorSummary(app: CreatorApplicationRow): string {
  return [
    `Creator: ${app.full_name} (${app.email})`,
    `Tools: ${app.tools.join(', ')}`,
    `Niches: ${app.niches.join(', ')}`,
    `Experience: ${app.experience}`,
    `Availability: ${app.available_hours} hours/week`,
    `Status: ${app.status}`,
    `Applied: ${fmtDate(app.created_at)}`,
  ].join('\n');
}

function buildPacketSummaryText(row: BuyerRequestRow, packet: GeneratedBuildPacket): string {
  return [
    `=== MicroBuild AI Operations Summary ===`,
    `Request: ${row.business_name} — ${row.build_type}`,
    `Submitted: ${fmtDate(row.created_at)}`,
    ``,
    `OVERVIEW`,
    packet.aiSummary,
    ``,
    `SCORES`,
    `Lead Quality: ${packet.leadQualityLabel} (${packet.leadQualityScore}/100)`,
    `Priority: ${packet.priorityLabel}`,
    `Fit Rating: ${packet.fitRating}`,
    `Urgency: ${packet.urgencyRating}`,
    `Complexity: ${packet.complexityRating}`,
    `Revenue Potential: ${packet.revenuePotentialRating}`,
    ``,
    `RECOMMENDED NEXT ACTION`,
    packet.adminNextAction,
    ``,
    `MISSING INFO FLAGS`,
    packet.missingInfoFlags.length > 0 ? packet.missingInfoFlags.map(f => `• ${f}`).join('\n') : 'None',
    ``,
    `RISK FLAGS`,
    packet.riskFlags.length > 0 ? packet.riskFlags.map(f => `• ${f}`).join('\n') : 'None',
  ].join('\n');
}

// ─── Small shared components ──────────────────────────────────────────────────

function SectionState({
  loading, error, empty, emptyMsg,
}: { loading: boolean; error: boolean; empty: boolean; emptyMsg: string }) {
  if (loading) return <div className="admin-state-row admin-loading">Loading…</div>;
  if (error)   return <div className="admin-state-row admin-error">Failed to load — check console for details.</div>;
  if (empty)   return <div className="admin-state-row admin-empty">{emptyMsg}</div>;
  return null;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ─── AI Operations Panel ──────────────────────────────────────────────────────

type AiTab = 'summary' | 'missing' | 'followup' | 'brief' | 'proposal' | 'checklists' | 'automation';

const AI_TABS: { id: AiTab; label: string }[] = [
  { id: 'summary',    label: 'AI Summary'     },
  { id: 'missing',    label: 'Missing Info'   },
  { id: 'followup',   label: 'Follow-up Qs'  },
  { id: 'brief',      label: 'Creator Brief'  },
  { id: 'proposal',   label: 'Proposal'       },
  { id: 'checklists', label: 'Checklists'     },
  { id: 'automation', label: 'Automation'     },
];

function AiOpsPanel({ row, packet }: { row: BuyerRequestRow; packet: GeneratedBuildPacket }) {
  const [tab, setTab] = useState<AiTab>('summary');

  return (
    <div className="ai-ops-panel">
      <div className="ai-ops-label">
        ⚡ AI-style operations preview — rules-based MVP version. No AI API called.
      </div>

      <div className="ai-ops-tabs" role="tablist">
        {AI_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`ai-ops-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ai-ops-content">
        {tab === 'summary' && (
          <>
            <div className="ops-scores-grid">
              <div className="ops-score-cell">
                <span className="ops-score-label">Lead Quality</span>
                <span className="ops-score-value" style={{ color: qualityColors[packet.leadQualityLabel] }}>
                  {packet.leadQualityLabel} · {packet.leadQualityScore}/100
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Priority</span>
                <span className="ops-score-value" style={{ color: priorityColors[packet.priorityLabel] }}>
                  {packet.priorityLabel}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Fit Rating</span>
                <span className="ops-score-value" style={{ color: fitColors[packet.fitRating] }}>
                  {packet.fitRating}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Urgency</span>
                <span className="ops-score-value" style={{ color: urgencyColors[packet.urgencyRating] }}>
                  {packet.urgencyRating}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Complexity</span>
                <span className="ops-score-value">{packet.complexityRating}</span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Revenue Potential</span>
                <span className="ops-score-value">{packet.revenuePotentialRating}</span>
              </div>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">AI Overview</div>
              <p>{packet.aiSummary}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Why This Build Fits</div>
              <p>{packet.whyThisBuildFits}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Target Audience</div>
              <p>{packet.targetAudience}</p>
            </div>
            <div className="ops-copy-row">
              <CopyBtn text={buildPacketSummaryText(row, packet)} label="Copy Packet Summary" />
            </div>
          </>
        )}

        {tab === 'missing' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Missing Information ({packet.missingInfoFlags.length})</div>
              {packet.missingInfoFlags.length === 0
                ? <p className="ops-all-good">✓ No missing information flags — request is complete.</p>
                : <ul className="ops-flag-list ops-flags-warn">
                    {packet.missingInfoFlags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
              }
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Risk Flags ({packet.riskFlags.length})</div>
              {packet.riskFlags.length === 0
                ? <p className="ops-all-good">✓ No risk flags detected.</p>
                : <ul className="ops-flag-list ops-flags-risk">
                    {packet.riskFlags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
              }
            </div>
          </>
        )}

        {tab === 'followup' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Follow-up Questions</div>
              <ul className="ops-list">
                {packet.followUpQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
            <div className="ops-copy-row">
              <CopyBtn
                text={`Follow-up questions for ${row.business_name}:\n\n` + packet.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
                label="Copy Follow-up Questions"
              />
            </div>
          </>
        )}

        {tab === 'brief' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Creator Instructions</div>
              <p>{packet.creatorInstructions}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Page Sections</div>
              <ul className="ops-list">
                {packet.suggestedPageSections.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Design Direction</div>
              <p>{packet.designDirection}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Suggested Form Fields</div>
              <ul className="ops-list">
                {packet.formFields.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div className="ops-copy-row">
              <CopyBtn
                text={[
                  `Creator Brief — ${row.business_name}`,
                  '',
                  packet.creatorInstructions,
                  '',
                  'Page Sections:',
                  ...packet.suggestedPageSections.map(s => `• ${s}`),
                  '',
                  'Design Direction:',
                  packet.designDirection,
                  '',
                  'Suggested Form Fields:',
                  ...packet.formFields.map(f => `• ${f}`),
                ].join('\n')}
                label="Copy Creator Brief"
              />
            </div>
          </>
        )}

        {tab === 'proposal' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Proposal Angle</div>
              <p>{packet.suggestedProposalAngle}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Copy Direction</div>
              <p>{packet.suggestedCopyDirection}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Draft Proposal</div>
              <pre className="ops-proposal-draft">{packet.proposalDraft}</pre>
            </div>
            <div className="ops-copy-row">
              <CopyBtn text={packet.proposalDraft} label="Copy Proposal Draft" />
            </div>
          </>
        )}

        {tab === 'checklists' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Quality Checklist</div>
              <ul className="ops-list">
                {packet.qualityChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">Launch Checklist</div>
              <ul className="ops-list">
                {packet.launchChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </>
        )}

        {tab === 'automation' && (
          <>
            <div className="ops-field">
              <div className="ops-field-label">Automation Needs</div>
              <p>{packet.automationNeeds}</p>
            </div>
            <div className="ops-field">
              <div className="ops-field-label">CTA Strategy</div>
              <p>{packet.ctaStrategy}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({ enriched }: { enriched: EnrichedRequest }) {
  const [expanded, setExpanded] = useState(false);
  const { row, packet } = enriched;

  return (
    <div className={`req-card${expanded ? ' req-card--open' : ''}`}>
      {/* Header row */}
      <div className="req-card-header">
        <div className="req-card-badges">
          <span
            className="req-priority-pill"
            style={{ backgroundColor: priorityColors[packet.priorityLabel] + '22',
                     color: priorityColors[packet.priorityLabel],
                     borderColor: priorityColors[packet.priorityLabel] + '55' }}
          >
            {packet.priorityLabel} Priority
          </span>
          <span
            className="req-fit-pill"
            style={{ backgroundColor: fitColors[packet.fitRating] + '22',
                     color: fitColors[packet.fitRating],
                     borderColor: fitColors[packet.fitRating] + '55' }}
          >
            {packet.fitRating} Fit
          </span>
          <span
            className="req-status-pill"
            style={{ color: statusColors[row.status] ?? '#8a94a6' }}
          >
            ● {row.status}
          </span>
        </div>
        <div className="req-card-meta-right">
          <span
            className="req-quality-score"
            style={{ color: qualityColors[packet.leadQualityLabel] }}
            title={`Lead quality: ${packet.leadQualityLabel}`}
          >
            {packet.leadQualityScore}/100
          </span>
          <span className="req-date">{fmtDate(row.created_at)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="req-card-body">
        <div className="req-card-contact">
          <div className="req-business-name">{row.business_name}</div>
          <div className="req-industry">{row.industry}</div>
          <div className="req-contact-name">{row.full_name}</div>
          <div className="req-email">{row.email}</div>
        </div>

        <div className="req-card-details">
          <div className="req-detail-item">
            <span className="req-detail-label">Build</span>
            <span className="req-detail-value req-build-type">{row.build_type}</span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Budget</span>
            <span className="req-detail-value">{row.budget || '—'}</span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Deadline</span>
            <span
              className="req-detail-value"
              style={{ color: urgencyColors[packet.urgencyRating] }}
            >
              {row.deadline || '—'}
            </span>
          </div>
        </div>

        <div className="req-card-action-col">
          <div className="req-next-action">{packet.adminNextAction}</div>
          {packet.missingInfoFlags.length > 0 && (
            <div className="req-missing-count" title={packet.missingInfoFlags.join('\n')}>
              ⚠ {packet.missingInfoFlags.length} missing field{packet.missingInfoFlags.length > 1 ? 's' : ''}
            </div>
          )}
          {packet.riskFlags.length > 0 && (
            <div className="req-risk-count" title={packet.riskFlags.join('\n')}>
              🔴 {packet.riskFlags.length} risk flag{packet.riskFlags.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Goal/Problem summary */}
      <div className="req-card-summary">
        <span className="req-summary-label">Goal:</span> {row.main_goal}
        {row.current_problem && (
          <><br /><span className="req-summary-label">Problem:</span> {row.current_problem.slice(0, 160)}{row.current_problem.length > 160 ? '…' : ''}</>
        )}
      </div>

      {/* AI Ops toggle */}
      <button
        className="req-ops-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? '▲ Hide AI Operations' : '▼ View AI Operations Panel'}
      </button>

      {expanded && <AiOpsPanel row={row} packet={packet} />}
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { id: RequestFilter; label: string; getCount: (e: EnrichedRequest[]) => number }[] = [
  { id: 'all',           label: 'All',           getCount: (e) => e.length },
  { id: 'new',           label: 'New',           getCount: (e) => e.filter(r => r.row.status === 'new').length },
  { id: 'high-priority', label: 'High Priority', getCount: (e) => e.filter(r => r.packet.priorityLabel === 'High').length },
  { id: 'needs-followup',label: 'Needs Follow-up',getCount: (e) => e.filter(r => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail').length },
  { id: 'ready-to-quote',label: 'Ready to Quote',getCount: (e) => e.filter(r => (r.packet.leadQualityLabel === 'Strong' || r.packet.leadQualityLabel === 'Good') && r.packet.missingInfoFlags.length <= 2).length },
];

function applyFilter(enriched: EnrichedRequest[], filter: RequestFilter): EnrichedRequest[] {
  switch (filter) {
    case 'new':           return enriched.filter((r) => r.row.status === 'new');
    case 'high-priority': return enriched.filter((r) => r.packet.priorityLabel === 'High');
    case 'needs-followup':return enriched.filter((r) => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail');
    case 'ready-to-quote':return enriched.filter((r) => (r.packet.leadQualityLabel === 'Strong' || r.packet.leadQualityLabel === 'Good') && r.packet.missingInfoFlags.length <= 2);
    default:              return enriched;
  }
}

// ─── Creator Application Card ─────────────────────────────────────────────────

function CreatorCard({ app }: { app: CreatorApplicationRow }) {
  const fit = deriveCreatorFit(app);
  return (
    <div className="creator-card">
      <div className="creator-card-header">
        <div>
          <div className="creator-name">{app.full_name}</div>
          <div className="creator-email">{app.email}</div>
        </div>
        <div className="creator-card-right">
          <span
            className="creator-fit-badge"
            style={{ color: fit.color, borderColor: fit.color + '55', backgroundColor: fit.color + '15' }}
          >
            {fit.label}
          </span>
          <span className="creator-status" style={{ color: statusColors[app.status] ?? '#8a94a6' }}>
            ● {app.status}
          </span>
        </div>
      </div>

      <div className="creator-card-body">
        <div className="creator-detail">
          <span className="creator-detail-label">Tools</span>
          <div className="creator-chips">
            {app.tools.map((t) => <span key={t} className="creator-chip">{t}</span>)}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Niches</span>
          <div className="creator-chips">
            {app.niches.map((n) => <span key={n} className="creator-chip">{n}</span>)}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Availability</span>
          <span className="creator-detail-value">{app.available_hours} hrs/week</span>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Applied</span>
          <span className="creator-detail-value">{fmtDate(app.created_at)}</span>
        </div>
      </div>

      <div className="creator-card-footer">
        <CopyBtn text={buildCreatorSummary(app)} label="Copy Candidate Summary" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [requests, setRequests]         = useState<BuyerRequestRow[]>([]);
  const [applications, setApplications] = useState<CreatorApplicationRow[]>([]);
  const [templates, setTemplates]       = useState<MicroBuildListing[]>([]);
  const [reqLoading, setReqLoading]     = useState(true);
  const [appLoading, setAppLoading]     = useState(true);
  const [tplLoading, setTplLoading]     = useState(true);
  const [reqError, setReqError]         = useState(false);
  const [appError, setAppError]         = useState(false);
  const [reqFilter, setReqFilter]       = useState<RequestFilter>('all');

  useEffect(() => {
    supabase
      .from('buyer_requests')
      .select('id,full_name,email,business_name,industry,website_social,build_type,main_goal,current_problem,budget,deadline,style_notes,status,created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Admin] buyer_requests:', error); setReqError(true); }
        else setRequests((data as BuyerRequestRow[]) ?? []);
        setReqLoading(false);
      });

    supabase
      .from('creator_applications')
      .select('id,full_name,email,tools,niches,experience,available_hours,status,created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Admin] creator_applications:', error); setAppError(true); }
        else setApplications((data as CreatorApplicationRow[]) ?? []);
        setAppLoading(false);
      });

    fetchTemplates().then(({ listings }) => {
      setTemplates(listings);
      setTplLoading(false);
    });
  }, []);

  // Enrich requests with packets (memoized — only recomputes when requests change)
  const enriched = useMemo<EnrichedRequest[]>(
    () => requests.map((row) => ({ row, packet: generateBuildPacket(rowToRequest(row)) })),
    [requests]
  );

  const filtered = useMemo(() => applyFilter(enriched, reqFilter), [enriched, reqFilter]);

  // Metric counts
  const highPriorityCount = enriched.filter((e) => e.packet.priorityLabel === 'High').length;
  const needsFollowupCount = enriched.filter((e) => e.packet.missingInfoFlags.length > 2 || e.packet.leadQualityLabel === 'Needs Detail').length;
  const newReqCount  = requests.filter((r) => r.status === 'new').length;
  const newAppCount  = applications.filter((a) => a.status === 'new').length;

  return (
    <div className="admin-page">

      {/* ── Command center header ──────────────────────────────────────────── */}
      <div className="admin-command-header">
        <div className="container">
          <div className="admin-header-top">
            <div>
              <div className="admin-eyebrow">MicroBuild Operations</div>
              <h1 className="admin-title">Admin Dashboard</h1>
              <p className="admin-sub">
                Live data from Supabase. AI-style analysis is rules-based (no external API).
              </p>
            </div>
            <span className="admin-badge-internal">Internal Only</span>
          </div>
        </div>
      </div>

      {/* ── Security warning ───────────────────────────────────────────────── */}
      <div className="admin-auth-warning">
        <div className="container">
          <strong>⚠️ No authentication required to view this page.</strong>{' '}
          Add Supabase Auth and admin role checks before this URL is made public.
          Dev read policies are active — see <code>supabase/policies.sql</code>.
        </div>
      </div>

      <div className="container admin-body">

        {/* ── Metric cards ──────────────────────────────────────────────────── */}
        <div className="admin-metrics">
          <div className="metric-card">
            <span className="metric-value">{reqLoading ? '…' : requests.length}</span>
            <span className="metric-label">Total Requests</span>
          </div>
          <div className="metric-card metric-card--alert">
            <span className="metric-value" style={{ color: newReqCount > 0 ? '#f9b032' : undefined }}>
              {reqLoading ? '…' : newReqCount}
            </span>
            <span className="metric-label">New Requests</span>
          </div>
          <div className="metric-card metric-card--alert">
            <span className="metric-value" style={{ color: highPriorityCount > 0 ? '#ef4444' : undefined }}>
              {reqLoading ? '…' : highPriorityCount}
            </span>
            <span className="metric-label">High Priority</span>
          </div>
          <div className="metric-card">
            <span className="metric-value" style={{ color: needsFollowupCount > 0 ? '#f9b032' : undefined }}>
              {reqLoading ? '…' : needsFollowupCount}
            </span>
            <span className="metric-label">Needs Follow-up</span>
          </div>
          <div className="metric-card">
            <span className="metric-value" style={{ color: newAppCount > 0 ? '#63b3ed' : undefined }}>
              {appLoading ? '…' : newAppCount}
            </span>
            <span className="metric-label">New Applications</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{tplLoading ? '…' : templates.length}</span>
            <span className="metric-label">Active Listings</span>
          </div>
        </div>

        {/* ── Buyer Requests ────────────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Buyer Requests</h2>
            {!reqLoading && <span className="admin-count">{requests.length}</span>}
          </div>

          <SectionState
            loading={reqLoading}
            error={reqError}
            empty={!reqLoading && !reqError && requests.length === 0}
            emptyMsg="No buyer requests yet. Apply the dev admin read policy from supabase/policies.sql, then refresh."
          />

          {!reqLoading && !reqError && requests.length > 0 && (
            <>
              {/* Filter tabs */}
              <div className="req-filter-bar">
                {FILTER_TABS.map((t) => {
                  const count = t.getCount(enriched);
                  return (
                    <button
                      key={t.id}
                      className={`req-filter-tab${reqFilter === t.id ? ' active' : ''}`}
                      onClick={() => setReqFilter(t.id)}
                    >
                      {t.label}
                      <span className="req-filter-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="admin-state-row admin-empty">No requests match this filter.</div>
              )}

              <div className="req-card-list">
                {filtered.map((e) => (
                  <RequestCard key={e.row.id} enriched={e} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Creator Applications ──────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>Creator Applications</h2>
            {!appLoading && <span className="admin-count">{applications.length}</span>}
          </div>

          <SectionState
            loading={appLoading}
            error={appError}
            empty={!appLoading && !appError && applications.length === 0}
            emptyMsg="No creator applications yet. Apply the dev admin read policy from supabase/policies.sql."
          />

          {!appLoading && !appError && applications.length > 0 && (
            <div className="creator-card-list">
              {applications.map((a) => <CreatorCard key={a.id} app={a} />)}
            </div>
          )}
        </section>

        {/* ── MicroBuild Listings ───────────────────────────────────────────── */}
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
            <div className="tpl-table">
              <div className="tpl-table-head">
                <span>Title</span>
                <span>Category</span>
                <span>Industry</span>
                <span>Price</span>
                <span>Turnaround</span>
                <span>Status</span>
              </div>
              {templates.map((l) => (
                <div key={l.id} className="tpl-table-row">
                  <span className="tpl-title">{l.title}</span>
                  <span>{l.category}</span>
                  <span>{l.targetIndustry}</span>
                  <span>${l.startingPrice}</span>
                  <span>{fixEncoding(l.estimatedTurnaround)}</span>
                  <span style={{ color: statusColors[l.status] ?? 'inherit' }}>● {l.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Phase 2+ placeholders ─────────────────────────────────────────── */}
        <div className="admin-placeholders">
          <section className="admin-section admin-section--dim">
            <div className="admin-section-header">
              <h2>Orders</h2>
              <span className="admin-placeholder-tag">Phase 2</span>
            </div>
            <div className="admin-placeholder">
              Orders are created when an admin accepts a buyer request and assigns a creator.
              This section will be built in Phase 2 alongside Supabase Auth and admin role checks.
            </div>
          </section>

          <section className="admin-section admin-section--dim">
            <div className="admin-section-header">
              <h2>AI Build Packets</h2>
              <span className="admin-placeholder-tag">Phase 3</span>
            </div>
            <div className="admin-placeholder">
              Real AI-generated build packets (GPT-4o via Supabase Edge Function, server-side only — no API keys in frontend)
              will appear here in Phase 3. The AI Operations panels above use deterministic rules as a placeholder.
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
