import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchTemplates } from '../lib/templates';
import { generateBuildPacket, generateCreatorReview } from '../lib/buildPacket';
import type { GeneratedBuildPacket, CreatorApplicationReview } from '../lib/buildPacket';
import type { MicroBuildListing } from '../types';
import './Admin.css';

// ─── Defensive helpers ────────────────────────────────────────────────────────

function safeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function safeText(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}

function safeNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function safeDate(v: unknown): string {
  if (!v) return 'Unknown date';
  try {
    const d = new Date(v as string);
    if (isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

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
  portfolio_url: string | null;
  portfolio_url_2: string | null;
  message: string | null;
  status: string;
  created_at: string;
  // Tier fields (from migration: add_creator_tiers.sql)
  tier: string;
  requested_plan_price: number;
  top_projects: string | null;
  service_capabilities: string[];
  fulfillment_speed: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  certifications: string | null;
  credential_links: string[];
  case_studies: string | null;
}

interface EnrichedRequest {
  row: BuyerRequestRow;
  packet: GeneratedBuildPacket;
}

type RequestFilter = 'all' | 'new' | 'high-priority' | 'needs-followup' | 'ready-to-quote';

// ─── Row normalizers (guard against null fields from Supabase) ─────────────────

function normalizeBuyerRequest(raw: Record<string, unknown>): BuyerRequestRow {
  return {
    id:              safeText(raw.id, 'unknown'),
    full_name:       safeText(raw.full_name, 'Unknown'),
    email:           safeText(raw.email, ''),
    business_name:   safeText(raw.business_name, 'Unknown Business'),
    industry:        safeText(raw.industry, 'Unknown'),
    website_social:  raw.website_social != null ? safeText(raw.website_social) : null,
    build_type:      safeText(raw.build_type, 'Quote Funnel'),
    main_goal:       safeText(raw.main_goal, ''),
    current_problem: safeText(raw.current_problem, ''),
    budget:          raw.budget != null ? safeText(raw.budget) : null,
    deadline:        raw.deadline != null ? safeText(raw.deadline) : null,
    style_notes:     raw.style_notes != null ? safeText(raw.style_notes) : null,
    status:          safeText(raw.status, 'new'),
    created_at:      safeText(raw.created_at, new Date().toISOString()),
  };
}

function normalizeCreatorApp(raw: Record<string, unknown>): CreatorApplicationRow {
  return {
    id:                   safeText(raw.id, 'unknown'),
    full_name:            safeText(raw.full_name, 'Unknown Applicant'),
    email:                safeText(raw.email, ''),
    tools:                safeArray<string>(raw.tools),
    niches:               safeArray<string>(raw.niches),
    experience:           safeText(raw.experience, ''),
    available_hours:      safeText(raw.available_hours, '0'),
    portfolio_url:        raw.portfolio_url != null ? safeText(raw.portfolio_url) : null,
    portfolio_url_2:      raw.portfolio_url_2 != null ? safeText(raw.portfolio_url_2) : null,
    message:              raw.message != null ? safeText(raw.message) : null,
    status:               safeText(raw.status, 'new'),
    created_at:           safeText(raw.created_at, new Date().toISOString()),
    tier:                 safeText(raw.tier, 'free'),
    requested_plan_price: safeNumber(raw.requested_plan_price, 0),
    top_projects:         raw.top_projects != null ? safeText(raw.top_projects) : null,
    service_capabilities: safeArray<string>(raw.service_capabilities),
    fulfillment_speed:    raw.fulfillment_speed != null ? safeText(raw.fulfillment_speed) : null,
    github_url:           raw.github_url != null ? safeText(raw.github_url) : null,
    linkedin_url:         raw.linkedin_url != null ? safeText(raw.linkedin_url) : null,
    certifications:       raw.certifications != null ? safeText(raw.certifications) : null,
    credential_links:     safeArray<string>(raw.credential_links),
    case_studies:         raw.case_studies != null ? safeText(raw.case_studies) : null,
  };
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  new:                        '#f9b032',
  'in-review':                '#63b3ed',
  'proposal-sent':            '#00d478',
  accepted:                   '#00d478',
  rejected:                   '#ef4444',
  reviewing:                  '#63b3ed',
  needs_portfolio_review:     '#f9b032',
  needs_more_info:            '#f9b032',
  approved_pending_payment:   '#63b3ed',
  active:                     '#00d478',
  approved:                   '#00d478',
  suspended:                  '#ef4444',
  'in-progress':              '#f9b032',
  delivered:                  '#00d478',
  available:                  '#00d478',
  popular:                    '#f9b032',
  'coming-soon':              '#63b3ed',
};

const tierColors: Record<string, string> = {
  free:         '#8a94a6',
  professional: '#63b3ed',
  verified:     '#f9b032',
};

const tierLabels: Record<string, string> = {
  free:         'Free',
  professional: 'Pro',
  verified:     'Verified ✓',
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

const quoteReadinessColors: Record<string, string> = {
  'Ready to quote':                   '#00d478',
  'Nearly ready — confirm budget':    '#00d478',
  'Nearly ready — minor clarifications needed': '#63b3ed',
  'Needs 1–2 more details before quoting': '#f9b032',
  'Not ready — too many unknowns':    '#ef4444',
  'Not ready — build type unknown':   '#ef4444',
};

// ─── Supabase action helpers ──────────────────────────────────────────────────

async function updateRequestStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('buyer_requests')
    .update({ status })
    .eq('id', id);
  if (error) { console.error('[Admin] update buyer_request status:', error); return false; }
  return true;
}

async function updateApplicationStatus(id: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('creator_applications')
    .update({ status })
    .eq('id', id);
  if (error) { console.error('[Admin] update application status:', error); return false; }
  return true;
}

async function saveBuiltPacket(
  requestId: string,
  packet: GeneratedBuildPacket
): Promise<{ id: string } | null> {
  const { data, error } = await (supabase
    .from('build_packets')
    .insert({
      request_id:           requestId,
      order_id:             null,
      business_summary:     packet.businessSummary,
      recommended_build:    packet.recommendedBuild,
      customer_problem:     packet.problem,
      suggested_copy:       { direction: packet.suggestedCopyDirection, cta: packet.ctaStrategy },
      form_fields:          packet.formFields.map((f) => ({ field: f })),
      design_direction:     packet.designDirection,
      automation_needs:     packet.automationNeeds,
      creator_instructions: packet.creatorInstructions,
      quality_checklist:    packet.qualityChecklist,
      generated_by:         'manual',
    })
    .select('id')
    .single() as unknown as Promise<{ data: { id: string } | null; error: unknown }>);
  if (error) { console.error('[Admin] save build_packet:', error); return null; }
  return data;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: unknown): string {
  return safeDate(iso);
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

function buildCreatorSummary(app: CreatorApplicationRow, review: CreatorApplicationReview): string {
  return [
    `Creator: ${safeText(app.full_name, 'Unknown')} (${safeText(app.email)})`,
    `Tools: ${safeArray<string>(app.tools).join(', ') || 'None listed'}`,
    `Niches: ${safeArray<string>(app.niches).join(', ') || 'None listed'}`,
    `Experience: ${app.experience}`,
    `Availability: ${app.available_hours} hours/week`,
    `Portfolio: ${app.portfolio_url ?? 'Not provided'}`,
    `Status: ${app.status}`,
    `Applied: ${fmtDate(app.created_at)}`,
    ``,
    `AI REVIEW`,
    `Fit Score: ${review.candidateFitScore}/100 (${review.fitLabel})`,
    `Decision: ${review.recommendedDecision}`,
    `Strengths: ${review.strengths.join('; ')}`,
    `Concerns: ${review.concerns.length > 0 ? review.concerns.join('; ') : 'None'}`,
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
    `Priority: ${packet.priorityLabel}  |  Fit: ${packet.fitRating}  |  Urgency: ${packet.urgencyRating}`,
    `Complexity: ${packet.complexityRating}  |  Revenue Potential: ${packet.revenuePotentialRating}`,
    `Quote Readiness: ${packet.quoteReadiness}`,
    `Price Range: ${packet.suggestedPriceRange}`,
    `Fulfillment: ${packet.estimatedFulfillmentDifficulty}`,
    ``,
    `RECOMMENDED NEXT ACTION`,
    packet.adminNextAction,
    ``,
    `MISSING INFO`,
    packet.missingInfoFlags.length > 0 ? packet.missingInfoFlags.map(f => `• ${f}`).join('\n') : 'None',
    ``,
    `RISK FLAGS`,
    packet.riskFlags.length > 0 ? packet.riskFlags.map(f => `• ${f}`).join('\n') : 'None',
  ].join('\n');
}

// ─── Shared components ────────────────────────────────────────────────────────

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

// ─── Status Dropdown (buyer requests) ────────────────────────────────────────

const REQ_STATUS_OPTIONS = [
  { value: 'new',           label: '● New'           },
  { value: 'in-review',     label: '● In Review'     },
  { value: 'proposal-sent', label: '● Proposal Sent' },
  { value: 'accepted',      label: '● Accepted'      },
  { value: 'rejected',      label: '● Rejected'      },
];

function StatusDropdown({
  id, initialStatus, onStatusChange,
}: {
  id: string;
  initialStatus: string;
  onStatusChange?: (id: string, newStatus: string) => void;
}) {
  const [current, setCurrent] = useState(initialStatus);
  const [saving, setSaving]   = useState(false);
  const [failed, setFailed]   = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    setFailed(false);
    const ok = await updateRequestStatus(id, next);
    setSaving(false);
    if (!ok) {
      setCurrent(prev);
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } else {
      onStatusChange?.(id, next);
    }
  }

  return (
    <div className={`status-dropdown-wrap${failed ? ' status-dropdown--error' : ''}`}>
      <select
        className="status-dropdown"
        value={current}
        onChange={handleChange}
        disabled={saving}
        style={{ color: statusColors[current] ?? '#8a94a6' }}
      >
        {REQ_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {saving && <span className="status-saving">Saving…</span>}
      {failed && <span className="status-error-label">Failed — retry</span>}
    </div>
  );
}

// ─── Save Build Packet button ─────────────────────────────────────────────────

function SavePacketButton({ requestId, packet }: { requestId: string; packet: GeneratedBuildPacket }) {
  const [state, setState]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleSave() {
    setState('saving');
    const result = await saveBuiltPacket(requestId, packet);
    if (result) {
      setState('saved');
      setSavedId(result.id);
    } else {
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    }
  }

  if (state === 'saved') {
    return (
      <div className="save-packet-success">
        ✓ Packet saved{savedId ? ` · ID: ${savedId.slice(0, 8)}…` : ''}
      </div>
    );
  }
  return (
    <button
      className={`save-packet-btn${state === 'error' ? ' save-packet-btn--error' : ''}`}
      onClick={handleSave}
      disabled={state === 'saving'}
    >
      {state === 'saving' ? 'Saving…' : state === 'error' ? 'Failed — retry' : '⬇ Save to Supabase'}
    </button>
  );
}

// ─── AI Operations Panel ──────────────────────────────────────────────────────

type AiTab = 'summary' | 'missing' | 'followup' | 'brief' | 'proposal' | 'checklists' | 'automation';

const AI_TABS: { id: AiTab; label: string }[] = [
  { id: 'summary',    label: 'AI Summary'    },
  { id: 'missing',    label: 'Missing Info'  },
  { id: 'followup',   label: 'Follow-up Qs' },
  { id: 'brief',      label: 'Creator Brief' },
  { id: 'proposal',   label: 'Proposal'      },
  { id: 'checklists', label: 'Checklists'    },
  { id: 'automation', label: 'Automation'    },
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
                <span className="ops-score-label">Quote Readiness</span>
                <span className="ops-score-value" style={{ color: quoteReadinessColors[packet.quoteReadiness] ?? '#8a94a6' }}>
                  {packet.quoteReadiness}
                </span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Price Range</span>
                <span className="ops-score-value">{packet.suggestedPriceRange}</span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Complexity</span>
                <span className="ops-score-value">{packet.complexityRating}</span>
              </div>
              <div className="ops-score-cell">
                <span className="ops-score-label">Fulfillment</span>
                <span className="ops-score-value">{packet.estimatedFulfillmentDifficulty}</span>
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
              <div className="ops-field-label">Creator Fit Recommendation</div>
              <p>{packet.creatorFitRecommendation}</p>
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
              <CopyBtn text={packet.buyerOutreachMessage} label="Copy Buyer Outreach Message" />
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
                  ...packet.suggestedPageSections.map((s) => `• ${s}`),
                  '',
                  'Design Direction:',
                  packet.designDirection,
                  '',
                  'Suggested Form Fields:',
                  ...packet.formFields.map((f) => `• ${f}`),
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
              <SavePacketButton requestId={row.id} packet={packet} />
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
            <div className="ops-field">
              <div className="ops-field-label">Target Audience</div>
              <p>{packet.targetAudience}</p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  enriched,
  onStatusChange,
}: {
  enriched: EnrichedRequest;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { row, packet } = enriched;

  return (
    <div className={`req-card${expanded ? ' req-card--open' : ''}`}>

      {/* Header */}
      <div className="req-card-header">
        <div className="req-card-badges">
          <span
            className="req-priority-pill"
            style={{
              backgroundColor: priorityColors[packet.priorityLabel] + '22',
              color:            priorityColors[packet.priorityLabel],
              borderColor:      priorityColors[packet.priorityLabel] + '55',
            }}
          >
            {packet.priorityLabel} Priority
          </span>
          <span
            className="req-fit-pill"
            style={{
              backgroundColor: fitColors[packet.fitRating] + '22',
              color:            fitColors[packet.fitRating],
              borderColor:      fitColors[packet.fitRating] + '55',
            }}
          >
            {packet.fitRating} Fit
          </span>
          <span
            className="req-quote-pill"
            style={{ color: quoteReadinessColors[packet.quoteReadiness] ?? '#8a94a6' }}
          >
            {packet.quoteReadiness}
          </span>
        </div>
        <div className="req-card-meta-right">
          <span
            className="req-quality-score"
            style={{ color: qualityColors[packet.leadQualityLabel] }}
          >
            {packet.leadQualityScore}/100
          </span>
          <span className="req-date">{fmtDate(row.created_at)}</span>
          <StatusDropdown
            id={row.id}
            initialStatus={row.status}
            onStatusChange={onStatusChange}
          />
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
            <span className="req-detail-value" style={{ color: urgencyColors[packet.urgencyRating] }}>
              {row.deadline || '—'}
            </span>
          </div>
          <div className="req-detail-item">
            <span className="req-detail-label">Price est.</span>
            <span className="req-detail-value">{packet.suggestedPriceRange}</span>
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

      {/* Goal/problem summary */}
      <div className="req-card-summary">
        <span className="req-summary-label">Goal:</span> {row.main_goal}
        {row.current_problem && (
          <>
            <br />
            <span className="req-summary-label">Problem:</span>{' '}
            {row.current_problem.slice(0, 180)}{row.current_problem.length > 180 ? '…' : ''}
          </>
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
  { id: 'all',            label: 'All',            getCount: (e) => e.length },
  { id: 'new',            label: 'New',            getCount: (e) => e.filter((r) => r.row.status === 'new').length },
  { id: 'high-priority',  label: 'High Priority',  getCount: (e) => e.filter((r) => r.packet.priorityLabel === 'High').length },
  { id: 'needs-followup', label: 'Needs Follow-up',getCount: (e) => e.filter((r) => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail').length },
  { id: 'ready-to-quote', label: 'Ready to Quote', getCount: (e) => e.filter((r) => r.packet.quoteReadiness.startsWith('Ready') || r.packet.quoteReadiness.startsWith('Nearly')).length },
];

function applyFilter(enriched: EnrichedRequest[], filter: RequestFilter): EnrichedRequest[] {
  switch (filter) {
    case 'new':            return enriched.filter((r) => r.row.status === 'new');
    case 'high-priority':  return enriched.filter((r) => r.packet.priorityLabel === 'High');
    case 'needs-followup': return enriched.filter((r) => r.packet.missingInfoFlags.length > 2 || r.packet.leadQualityLabel === 'Needs Detail');
    case 'ready-to-quote': return enriched.filter((r) => r.packet.quoteReadiness.startsWith('Ready') || r.packet.quoteReadiness.startsWith('Nearly'));
    default:               return enriched;
  }
}

// ─── AI Ops Assistant panel ───────────────────────────────────────────────────

function AiOpsAssistant({
  enriched,
  newApps,
}: {
  enriched: EnrichedRequest[];
  newApps: number;
}) {
  const highPriority  = enriched.filter((e) => e.packet.priorityLabel === 'High');
  const readyToQuote  = enriched.filter((e) => e.packet.quoteReadiness.startsWith('Ready') || e.packet.quoteReadiness.startsWith('Nearly'));
  const needsFollowup = enriched.filter((e) => e.packet.missingInfoFlags.length > 2 || e.packet.leadQualityLabel === 'Needs Detail');

  let focus: string;
  if (highPriority.length > 0 && readyToQuote.length > 0) {
    focus = `Review ${highPriority.length} high-priority request${highPriority.length > 1 ? 's' : ''} — ${readyToQuote.length} ${readyToQuote.length === 1 ? 'is' : 'are'} ready to quote`;
  } else if (highPriority.length > 0) {
    focus = `Review and respond to ${highPriority.length} high-priority request${highPriority.length > 1 ? 's' : ''} today`;
  } else if (readyToQuote.length > 0) {
    focus = `Send quote proposals for ${readyToQuote.length} request${readyToQuote.length > 1 ? 's' : ''} that are ready to scope`;
  } else if (needsFollowup.length > 0) {
    focus = `Follow up on ${needsFollowup.length} request${needsFollowup.length > 1 ? 's' : ''} — clarify details before scoping`;
  } else if (newApps > 0) {
    focus = `Review ${newApps} new creator application${newApps > 1 ? 's' : ''}`;
  } else if (enriched.length === 0) {
    focus = 'No requests yet — share the buyer request URL to start receiving submissions';
  } else {
    focus = 'All clear — no urgent items. Good time to review open requests and update statuses';
  }

  return (
    <div className="ops-assistant">
      <div className="ops-assistant-header">
        <span className="ops-assistant-title">⚡ AI Ops Brief</span>
        <span className="ops-assistant-note">Rules-based · live data · no AI API</span>
      </div>
      <div className="ops-assistant-focus">{focus}</div>
      <div className="ops-assistant-signals">
        <span
          className="ops-signal"
          style={{ color: highPriority.length > 0 ? '#ef4444' : undefined }}
        >
          {highPriority.length} High Priority
        </span>
        <span
          className="ops-signal"
          style={{ color: readyToQuote.length > 0 ? '#00d478' : undefined }}
        >
          {readyToQuote.length} Ready to Quote
        </span>
        <span
          className="ops-signal"
          style={{ color: needsFollowup.length > 0 ? '#f9b032' : undefined }}
        >
          {needsFollowup.length} Needs Follow-up
        </span>
        <span
          className="ops-signal"
          style={{ color: newApps > 0 ? '#63b3ed' : undefined }}
        >
          {newApps} New Applications
        </span>
      </div>
      {highPriority.length > 0 && (
        <div className="ops-assistant-toplist">
          <span className="ops-tl-label">High Priority:</span>
          {highPriority.slice(0, 3).map((e) => (
            <span key={e.row.id} className="ops-tl-item">
              {e.row.business_name} ({e.row.build_type})
            </span>
          ))}
          {highPriority.length > 3 && <span className="ops-tl-more">+{highPriority.length - 3} more</span>}
        </div>
      )}
    </div>
  );
}

// ─── Creator Application Card ─────────────────────────────────────────────────

const APP_STATUS_OPTIONS: { status: string; label: string }[] = [
  { status: 'new',                      label: 'New'                      },
  { status: 'reviewing',                label: 'In Review'                },
  { status: 'needs_portfolio_review',   label: 'Needs Portfolio'          },
  { status: 'needs_more_info',          label: 'Needs More Info'          },
  { status: 'approved_pending_payment', label: 'Approved — Pending Payment'},
  { status: 'active',                   label: 'Active'                   },
  { status: 'rejected',                 label: 'Rejected'                 },
  { status: 'suspended',                label: 'Suspended'                },
];

// ─── Profile Preview ──────────────────────────────────────────────────────────

function ProfilePreview({ app, review }: { app: CreatorApplicationRow; review: CreatorApplicationReview }) {
  const name     = safeText(app.full_name, 'Unknown');
  const initials = name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
  const tColor   = tierColors[app.tier] ?? '#8a94a6';
  const tLabel   = tierLabels[app.tier] ?? app.tier;
  const fitColor = fitColors[review.fitLabel] ?? '#8a94a6';

  return (
    <div className="profile-preview">
      <div className="pp-label">Profile Preview — how this creator would appear if approved</div>
      <div className="pp-card">
        <div className="pp-header">
          <div className="pp-avatar">{initials}</div>
          <div className="pp-name-block">
            <div className="pp-name">{name}</div>
            <div className="pp-badges">
              <span className="pp-tier-badge" style={{ color: tColor, borderColor: tColor + '55', backgroundColor: tColor + '15' }}>
                {tLabel}
              </span>
              <span className="pp-score-badge" style={{ color: fitColor, borderColor: fitColor + '55', backgroundColor: fitColor + '12' }}>
                {review.candidateFitScore}/100 · {review.fitLabel}
              </span>
              {review.suggestedBadge !== 'Free Creator' && (
                <span className="pp-suggested">{review.suggestedBadge}</span>
              )}
            </div>
          </div>
        </div>

        {app.tier !== 'free' && app.requested_plan_price > 0 && (
          <div className="pp-plan-note">
            Subscription: ${app.requested_plan_price}/month — pending payment after approval
          </div>
        )}

        <div className="pp-section">
          {safeArray<string>(app.tools).slice(0, 6).map((t) => <span key={t} className="pp-chip">{t}</span>)}
          {safeArray<string>(app.tools).length > 6 && <span className="pp-chip pp-chip--more">+{safeArray<string>(app.tools).length - 6}</span>}
        </div>

        <div className="pp-section">
          {safeArray<string>(app.niches).slice(0, 4).map((n) => <span key={n} className="pp-chip pp-chip--niche">{n}</span>)}
          {safeArray<string>(app.niches).length > 4 && <span className="pp-chip pp-chip--more">+{safeArray<string>(app.niches).length - 4}</span>}
        </div>

        <div className="pp-meta">
          <span>{app.available_hours} hrs/week</span>
          {app.fulfillment_speed && <span>· {app.fulfillment_speed}</span>}
          {app.portfolio_url && (
            <a className="pp-link" href={app.portfolio_url} target="_blank" rel="noopener noreferrer">
              Portfolio ↗
            </a>
          )}
        </div>

        {(app.github_url || app.linkedin_url) && (
          <div className="pp-proof-links">
            {app.github_url && <a href={app.github_url} target="_blank" rel="noopener noreferrer" className="pp-proof-link">GitHub ↗</a>}
            {app.linkedin_url && <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" className="pp-proof-link">LinkedIn ↗</a>}
          </div>
        )}

        <div className="pp-tier-assessment">{review.tierFitAssessment}</div>
      </div>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function CreatorCard({
  app,
  onStatusChange,
}: {
  app: CreatorApplicationRow;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [status, setStatus]           = useState(app.status);
  const [updating, setUpdating]       = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [reviewOpen, setReviewOpen]   = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeReviewTab, setActiveReviewTab] = useState<'review' | 'messages'>('review');

  const review = useMemo<CreatorApplicationReview>(() => {
    try {
      return generateCreatorReview({
        full_name:            safeText(app.full_name, 'Unknown'),
        email:                safeText(app.email),
        tools:                safeArray<string>(app.tools),
        niches:               safeArray<string>(app.niches),
        experience:           safeText(app.experience),
        available_hours:      safeText(app.available_hours, '0'),
        portfolio_url:        app.portfolio_url,
        portfolio_url_2:      app.portfolio_url_2,
        message:              app.message,
        tier:                 (safeText(app.tier, 'free')) as 'free' | 'professional' | 'verified',
        top_projects:         app.top_projects,
        service_capabilities: safeArray<string>(app.service_capabilities),
        fulfillment_speed:    app.fulfillment_speed,
        github_url:           app.github_url,
        linkedin_url:         app.linkedin_url,
        certifications:       app.certifications,
        credential_links:     safeArray<string>(app.credential_links),
        case_studies:         app.case_studies,
      });
    } catch (err) {
      console.error('[Admin] generateCreatorReview failed for', app.id, err);
      return {
        candidateFitScore: 0,
        fitLabel: 'Weak' as const,
        strengths: ['Review data is incomplete or malformed'],
        concerns: ['Could not generate review — check console'],
        missingPortfolioInfo: [],
        bestFitNiches: [],
        recommendedDecision: '⚠ Review skipped — data error',
        tierFitAssessment: 'Unable to assess — data missing',
        suggestedBadge: 'Free Creator',
        creatorFollowUpMessage: '',
        approvalMessage: '',
        rejectionMessage: '',
      };
    }
  }, [app]);

  const reviewFitColor = fitColors[review.fitLabel] ?? '#8a94a6';
  const tColor         = tierColors[app.tier] ?? '#8a94a6';

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setUpdating(true);
    setUpdateError(false);
    const ok = await updateApplicationStatus(app.id, next);
    setUpdating(false);
    if (!ok) {
      setStatus(prev);
      setUpdateError(true);
      setTimeout(() => setUpdateError(false), 3000);
    } else {
      onStatusChange(app.id, next);
    }
  }

  return (
    <div className={`creator-card${updateError ? ' creator-card--error' : ''}`}>

      <div className="creator-card-header">
        <div className="creator-header-left">
          <div className="creator-name">{app.full_name}</div>
          <div className="creator-email">{app.email}</div>
          <div className="creator-tier-row">
            <span className="creator-tier-badge" style={{ color: tColor, borderColor: tColor + '55', backgroundColor: tColor + '15' }}>
              {tierLabels[app.tier] ?? app.tier}
            </span>
            {(app.requested_plan_price ?? 0) > 0 && (
              <span className="creator-plan-price">${app.requested_plan_price}/mo after approval</span>
            )}
          </div>
        </div>
        <div className="creator-card-right">
          <span
            className="creator-fit-badge"
            style={{ color: reviewFitColor, borderColor: reviewFitColor + '55', backgroundColor: reviewFitColor + '15' }}
          >
            {review.fitLabel} · {review.candidateFitScore}/100
          </span>
          <div className={`status-dropdown-wrap${updateError ? ' status-dropdown--error' : ''}`}>
            <select
              className="status-dropdown"
              value={status}
              onChange={handleStatusChange}
              disabled={updating}
              style={{ color: statusColors[status] ?? '#8a94a6' }}
            >
              {APP_STATUS_OPTIONS.map((o) => (
                <option key={o.status} value={o.status}>{o.label}</option>
              ))}
            </select>
            {updating && <span className="status-saving">Saving…</span>}
            {updateError && <span className="status-error-label">Failed</span>}
          </div>
        </div>
      </div>

      <div className="creator-card-body">
        <div className="creator-detail">
          <span className="creator-detail-label">Tools</span>
          <div className="creator-chips">
            {safeArray<string>(app.tools).map((t) => <span key={t} className="creator-chip">{t}</span>)}
            {safeArray<string>(app.tools).length === 0 && <span className="creator-chip creator-chip--empty">None listed</span>}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Niches</span>
          <div className="creator-chips">
            {safeArray<string>(app.niches).map((n) => <span key={n} className="creator-chip">{n}</span>)}
            {safeArray<string>(app.niches).length === 0 && <span className="creator-chip creator-chip--empty">None listed</span>}
          </div>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Availability</span>
          <span className="creator-detail-value">{app.available_hours} hrs/week
            {app.fulfillment_speed && <span className="creator-speed"> · {app.fulfillment_speed}</span>}
          </span>
        </div>
        <div className="creator-detail">
          <span className="creator-detail-label">Applied</span>
          <span className="creator-detail-value">{fmtDate(app.created_at)}</span>
        </div>
        {app.service_capabilities && app.service_capabilities.length > 0 && (
          <div className="creator-detail" style={{ gridColumn: '1 / -1' }}>
            <span className="creator-detail-label">Capabilities</span>
            <div className="creator-chips">
              {app.service_capabilities.map((c) => <span key={c} className="creator-chip creator-chip--capability">{c}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Decision */}
      <div className="creator-decision">{review.recommendedDecision}</div>

      {/* Expandable toggles */}
      <div className="creator-toggle-row">
        <button
          className="creator-review-toggle"
          onClick={() => { setReviewOpen((v) => !v); setPreviewOpen(false); }}
          aria-expanded={reviewOpen}
        >
          {reviewOpen ? '▲ Hide AI Review' : '▼ AI Review'}
        </button>
        <button
          className="creator-review-toggle"
          onClick={() => { setPreviewOpen((v) => !v); setReviewOpen(false); }}
          aria-expanded={previewOpen}
        >
          {previewOpen ? '▲ Hide Preview' : '▼ Profile Preview'}
        </button>
      </div>

      {/* Profile preview */}
      {previewOpen && <ProfilePreview app={app} review={review} />}

      {/* AI Review panel */}
      {reviewOpen && (
        <div className="creator-review-panel">
          <div className="ai-ops-label">
            ⚡ AI-style candidate review — rules-based MVP version. No AI API called.
          </div>

          {/* Review sub-tabs */}
          <div className="creator-review-tabs">
            <button
              className={`creator-review-tab${activeReviewTab === 'review' ? ' active' : ''}`}
              onClick={() => setActiveReviewTab('review')}
            >Analysis</button>
            <button
              className={`creator-review-tab${activeReviewTab === 'messages' ? ' active' : ''}`}
              onClick={() => setActiveReviewTab('messages')}
            >Messages</button>
          </div>

          {activeReviewTab === 'review' && (
            <>
              <div className="ops-field">
                <div className="ops-field-label">Tier Fit Assessment</div>
                <p>{review.tierFitAssessment}</p>
              </div>

              {review.strengths.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Strengths ({review.strengths.length})</div>
                  <ul className="ops-flag-list">
                    {review.strengths.map((s) => <li key={s} className="creator-strength-item">{s}</li>)}
                  </ul>
                </div>
              )}

              {review.concerns.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Concerns ({review.concerns.length})</div>
                  <ul className="ops-flag-list ops-flags-warn">
                    {review.concerns.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}

              {review.missingPortfolioInfo.length > 0 && (
                <div className="ops-field">
                  <div className="ops-field-label">Missing Info</div>
                  <ul className="ops-flag-list ops-flags-risk">
                    {review.missingPortfolioInfo.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}

              <div className="ops-field">
                <div className="ops-field-label">Best Fit Niches</div>
                <div className="creator-chips" style={{ marginTop: '0.25rem' }}>
                  {review.bestFitNiches.map((n) => <span key={n} className="creator-chip creator-chip--accent">{n}</span>)}
                </div>
              </div>

              {app.case_studies && (
                <div className="ops-field">
                  <div className="ops-field-label">Case Studies (submitted)</div>
                  <p className="creator-case-studies">{app.case_studies.slice(0, 300)}{app.case_studies.length > 300 ? '…' : ''}</p>
                </div>
              )}

              <div className="ops-copy-row">
                <CopyBtn text={review.creatorFollowUpMessage} label="Copy Follow-up Message" />
                <CopyBtn text={buildCreatorSummary(app, review)} label="Copy Candidate Summary" />
              </div>
            </>
          )}

          {activeReviewTab === 'messages' && (
            <>
              <div className="ops-field">
                <div className="ops-field-label">Approval Message</div>
                <pre className="ops-proposal-draft">{review.approvalMessage}</pre>
                <div className="ops-copy-row" style={{ marginTop: '0.5rem' }}>
                  <CopyBtn text={review.approvalMessage} label="Copy Approval Message" />
                </div>
              </div>
              <div className="ops-field">
                <div className="ops-field-label">Rejection Message</div>
                <pre className="ops-proposal-draft">{review.rejectionMessage}</pre>
                <div className="ops-copy-row" style={{ marginTop: '0.5rem' }}>
                  <CopyBtn text={review.rejectionMessage} label="Copy Rejection Message" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

interface EBState { error: Error | null }
class SectionErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, EBState> {
  constructor(props: { name: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Admin] ${this.props.name} crashed:`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="admin-section-crash">
          <strong>⚠ Section error ({this.props.name})</strong>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
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
        else setRequests(((data ?? []) as Record<string, unknown>[]).map(normalizeBuyerRequest));
        setReqLoading(false);
      });

    supabase
      .from('creator_applications')
      .select('id,full_name,email,tools,niches,experience,available_hours,portfolio_url,portfolio_url_2,message,status,created_at,tier,requested_plan_price,top_projects,service_capabilities,fulfillment_speed,github_url,linkedin_url,certifications,credential_links,case_studies')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Admin] creator_applications:', error); setAppError(true); }
        else setApplications(((data ?? []) as Record<string, unknown>[]).map(normalizeCreatorApp));
        setAppLoading(false);
      });

    fetchTemplates().then(({ listings }) => {
      setTemplates(listings);
      setTplLoading(false);
    });
  }, []);

  // Enriched requests with AI packets — per-row isolation so one bad row can't crash
  const enriched = useMemo<EnrichedRequest[]>(() => {
    return requests.flatMap((row) => {
      try {
        return [{ row, packet: generateBuildPacket(rowToRequest(row)) }];
      } catch (err) {
        console.error('[Admin] generateBuildPacket failed for row', row.id, err);
        return [];
      }
    });
  }, [requests]);

  const filtered = useMemo(() => applyFilter(enriched, reqFilter), [enriched, reqFilter]);

  // Optimistic status update helpers
  function handleRequestStatusChange(id: string, newStatus: string) {
    setRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: newStatus } : r)
    );
  }
  function handleAppStatusChange(id: string, newStatus: string) {
    setApplications((prev) =>
      prev.map((a) => a.id === id ? { ...a, status: newStatus } : a)
    );
  }

  // Metrics
  const highPriorityCount  = enriched.filter((e) => e.packet.priorityLabel === 'High').length;
  const needsFollowupCount = enriched.filter((e) => e.packet.missingInfoFlags.length > 2 || e.packet.leadQualityLabel === 'Needs Detail').length;
  const readyToQuoteCount  = enriched.filter((e) => e.packet.quoteReadiness.startsWith('Ready') || e.packet.quoteReadiness.startsWith('Nearly')).length;
  const newReqCount        = requests.filter((r) => r.status === 'new').length;
  const newAppCount        = applications.filter((a) => a.status === 'new').length;

  return (
    <div className="admin-page">

      {/* ── Command center header ────────────────────────────────────────── */}
      <div className="admin-command-header">
        <div className="container">
          <div className="admin-header-top">
            <div>
              <div className="admin-eyebrow">MicroBuild Operations</div>
              <h1 className="admin-title">Admin Dashboard</h1>
              <p className="admin-sub">
                Live Supabase data · Rule-based AI analysis · Status updates write to database
              </p>
            </div>
            <span className="admin-badge-internal">Internal Only</span>
          </div>
        </div>
      </div>

      {/* ── Auth warning ─────────────────────────────────────────────────── */}
      <div className="admin-auth-warning">
        <div className="container">
          <strong>⚠️ No authentication required.</strong>{' '}
          Dev policies active — status writes use anon key. See <code>supabase/policies.sql</code>.
          Replace with Supabase Auth + admin role checks before going public.
        </div>
      </div>

      <div className="container admin-body">

        {/* ── AI Ops Brief ─────────────────────────────────────────────────── */}
        {!reqLoading && (
          <AiOpsAssistant enriched={enriched} newApps={newAppCount} />
        )}

        {/* ── Metrics ──────────────────────────────────────────────────────── */}
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
            <span className="metric-value" style={{ color: readyToQuoteCount > 0 ? '#00d478' : undefined }}>
              {reqLoading ? '…' : readyToQuoteCount}
            </span>
            <span className="metric-label">Ready to Quote</span>
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
            <SectionErrorBoundary name="Buyer Requests">
            <>
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
                  <SectionErrorBoundary key={e.row.id} name={`Request ${e.row.id}`}>
                    <RequestCard
                      enriched={e}
                      onStatusChange={handleRequestStatusChange}
                    />
                  </SectionErrorBoundary>
                ))}
              </div>
            </>
            </SectionErrorBoundary>
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
            <SectionErrorBoundary name="Creator Applications">
              <div className="creator-card-list">
                {applications.map((a) => (
                  <SectionErrorBoundary key={a.id} name={`Creator ${a.id}`}>
                    <CreatorCard
                      app={a}
                      onStatusChange={handleAppStatusChange}
                    />
                  </SectionErrorBoundary>
                ))}
              </div>
            </SectionErrorBoundary>
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
              Orders are created when admin accepts a request and assigns a creator.
              Built in Phase 2 alongside Supabase Auth and admin role checks.
            </div>
          </section>

          <section className="admin-section admin-section--dim">
            <div className="admin-section-header">
              <h2>AI Build Packets</h2>
              <span className="admin-placeholder-tag">Phase 3</span>
            </div>
            <div className="admin-placeholder">
              Real GPT-4o packets via Supabase Edge Function (server-side, no frontend API keys) in Phase 3.
              Use "Save to Supabase" in the Proposal tab of each request to store the rules-based packet now.
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
