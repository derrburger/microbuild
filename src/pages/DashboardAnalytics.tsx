import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAdminEmail } from '../lib/admin';
import {
  loadAnalyticsContext,
  getCreatorAnalyticsOverview,
  getBuyerAnalyticsOverview,
  getAdminPlatformAnalytics,
  type AnalyticsDateRange,
  type CreatorAnalyticsOverview,
  type BuyerAnalyticsOverview,
  type AdminPlatformAnalytics,
  type AnalyticsSectionMeta,
} from '../lib/analytics';
import {
  generateCreatorInsightsAsync,
  generateBuyerInsights,
  generateAdminInsights,
  getNextBestActions,
  type AnalyticsInsight,
  type InsightSeverity,
} from '../lib/analyticsAI';
import { analyzeProfileStrength, getStrengthColor } from '../lib/profileAI';
import UpgradePrompt from '../components/UpgradePrompt';
import {
  canUseFeature,
  getRequiredPlanForFeature,
  resolveBuyerPlanFromProfile,
  resolveCreatorPlanFromProfile,
} from '../lib/entitlements';
import { supabase } from '../lib/supabase';
import type { UserProfileRow } from '../types/database';
import './DashboardAnalytics.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: number | null | undefined, fallback = '—'): string {
  if (v == null || Number.isNaN(v)) return fallback;
  return String(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return 'Not enough data yet';
  return `${v}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function severityClass(s: InsightSeverity): string {
  return `da-ai-item da-ai-item--${s}`;
}

interface MetricProps {
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
}

function Metric({ label, value, note, highlight }: MetricProps) {
  return (
    <div className={`da-metric-card${highlight ? ' da-metric-card--live' : ''}`}>
      <div className={`da-metric-val${highlight ? '' : ''}`}>{value}</div>
      <div className="da-metric-label">{label}</div>
      {note && <div className="da-metric-note">{note}</div>}
    </div>
  );
}

interface BreakdownProps {
  breakdown: Record<string, number>;
  colors?: Record<string, string>;
  emptyLabel?: string;
}

function StatusBreakdown({ breakdown, colors, emptyLabel = 'Not enough data yet' }: BreakdownProps) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    return <p className="da-empty-note">{emptyLabel}</p>;
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="da-breakdown">
      {entries.map(([key, count]) => (
        <div key={key} className="da-breakdown-row">
          <span className="da-breakdown-label">{key.replace(/_/g, ' ')}</span>
          <div className="da-breakdown-track">
            <div
              className="da-breakdown-fill"
              style={{
                width: `${(count / max) * 100}%`,
                background: colors?.[key] ?? 'var(--accent)',
              }}
            />
          </div>
          <span className="da-breakdown-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function SectionEmpty({ meta }: { meta: AnalyticsSectionMeta }) {
  if (meta.hasEnoughData) return null;
  return <p className="da-empty-note">{meta.notEnoughLabel}</p>;
}

interface BarProps { label: string; value: number; max?: number; color?: string; }

function Bar({ label, value, max = 100, color = '#00d478' }: BarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="da-bar-row">
      <span className="da-bar-label">{label}</span>
      <div className="da-bar-track">
        <div className="da-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="da-bar-val">{value}%</span>
    </div>
  );
}

function AIMonitorPanel({ insights, loading }: { insights: AnalyticsInsight[]; loading: boolean }) {
  const nextActions = getNextBestActions(insights);

  if (loading) {
    return (
      <div className="da-section da-ai-panel">
        <h2 className="da-section-title">AI Monitor</h2>
        <p className="da-empty-note">Analyzing your data…</p>
      </div>
    );
  }

  return (
    <div className="da-section da-ai-panel">
      <div className="da-section-head">
        <h2 className="da-section-title">AI Monitor</h2>
        <span className="da-ai-badge">Rules-based · no external AI</span>
      </div>
      <p className="da-ai-intro">
        Practical insights from your real MicroBuild activity — profile, applications, projects, workflows, and messages.
      </p>

      {nextActions.length === 0 ? (
        <p className="da-empty-note">Not enough data yet for personalized insights. Check back after your first application or project.</p>
      ) : (
        <>
          <h3 className="da-subsection-title">Next best actions</h3>
          <div className="da-ai-list">
            {nextActions.map((ins) => (
              <div key={ins.id} className={severityClass(ins.severity)}>
                <div className="da-ai-item-head">
                  <span className="da-ai-severity">{ins.severity}</span>
                  <strong>{ins.title}</strong>
                </div>
                <p className="da-ai-explanation">{ins.explanation}</p>
                <p className="da-ai-action">{ins.recommendedAction}</p>
                {ins.relatedLink && (
                  <Link to={ins.relatedLink} className="da-link da-ai-link">
                    Go →
                  </Link>
                )}
              </div>
            ))}
          </div>

          {insights.length > nextActions.length && (
            <>
              <h3 className="da-subsection-title">All insights</h3>
              <div className="da-ai-list da-ai-list--compact">
                {insights.filter((i) => !nextActions.some((n) => n.id === i.id)).map((ins) => (
                  <div key={ins.id} className={severityClass(ins.severity)}>
                    <strong>{ins.title}</strong>
                    <span className="da-ai-compact-text"> — {ins.explanation}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Creator view ─────────────────────────────────────────────────────────────

function CreatorAnalyticsBody({
  data,
  insights,
  insightsLoading,
  planId,
  analyticsFull,
  aiMonitorFull,
}: {
  data: CreatorAnalyticsOverview;
  insights: AnalyticsInsight[];
  insightsLoading: boolean;
  planId: string;
  analyticsFull: boolean;
  aiMonitorFull: boolean;
}) {
  const { applications: apps, projects, workflows: wf, messaging, deliverables: del, agreements: agr, profile } = data;
  const strength = profile.strengthScore;

  return (
    <>
      <div className="da-metrics-grid da-metrics-grid--4">
        <Metric label="Applications" value={fmtNum(apps.totalSubmitted)} highlight={apps.hasEnoughData} />
        <Metric label="Active projects" value={fmtNum(projects.inProgress + projects.needingAction)} highlight={projects.hasEnoughData} />
        <Metric label="Published workflows" value={fmtNum(wf.published)} highlight={wf.hasEnoughData} />
        <Metric label="Profile strength" value={strength != null ? `${strength}/100` : '—'} highlight={profile.hasEnoughData} />
      </div>

      <div className="da-future-row">
        <div className="da-future-card">
          <span className="da-future-label">Earnings</span>
          <span className="da-future-val">Payment integration not active yet</span>
        </div>
        <div className="da-future-card">
          <span className="da-future-label">Profile views</span>
          <span className="da-future-val">View tracking not active yet</span>
        </div>
        <div className="da-future-card">
          <span className="da-future-label">Conversion rate</span>
          <span className="da-future-val">Available after request/view tracking</span>
        </div>
      </div>

      {aiMonitorFull ?
        <AIMonitorPanel insights={insights} loading={insightsLoading} />
      : (
        <div className="upgrade-prompt-preview">
          <div className="upgrade-prompt-preview-content">
            <AIMonitorPanel insights={[]} loading={false} />
          </div>
          <UpgradePrompt
            featureKey="creator_ai_monitor_full"
            featureLabel="AI Monitor"
            currentPlan={planId}
            requiredPlan={getRequiredPlanForFeature('creator', 'creator_ai_monitor_full') ?? 'professional'}
            role="creator"
            unlockSummary="Personalized next-best actions from your applications, projects, and workflows."
            compact
          />
        </div>
      )}

      <div className="da-section">
        <h2 className="da-section-title">Applications</h2>
        <SectionEmpty meta={apps} />
        {apps.hasEnoughData && analyticsFull && (
          <>
            <div className="da-metrics-grid da-metrics-grid--6">
              <Metric label="Submitted" value={fmtNum(apps.totalSubmitted)} highlight />
              <Metric label="Selected" value={fmtNum(apps.selected)} highlight />
              <Metric label="Shortlisted" value={fmtNum(apps.shortlisted)} />
              <Metric label="Not selected" value={fmtNum(apps.rejected)} />
              <Metric label="Selection rate" value={fmtPct(apps.selectionRate)} />
              <Metric label="Avg proposed price" value={apps.avgProposedPrice != null ? `$${apps.avgProposedPrice}` : 'Not enough data yet'} />
            </div>
            {apps.avgProposedTimelineLabel && (
              <p className="da-section-note">Sample timelines: {apps.avgProposedTimelineLabel}</p>
            )}
            <StatusBreakdown breakdown={apps.statusBreakdown} />
          </>
        )}
        {apps.hasEnoughData && !analyticsFull && (
          <p className="da-empty-note">
            Basic counts only on Free Creator.{' '}
            <Link to="/dashboard/billing" className="da-link">Upgrade to Professional</Link> for full application analytics.
          </p>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Projects</h2>
        <SectionEmpty meta={projects} />
        {projects.hasEnoughData && analyticsFull && (
          <>
            <div className="da-pipeline-grid">
              {[
                { label: 'Assigned', count: projects.totalAssigned },
                { label: 'In progress', count: projects.inProgress },
                { label: 'Delivered', count: projects.delivered },
                { label: 'Completed', count: projects.completed },
                { label: 'Need action', count: projects.needingAction },
                { label: 'Stalled (7d+)', count: projects.stalled },
              ].map((s) => (
                <div key={s.label} className={`da-pipeline-stage${s.count > 0 ? ' da-pipeline-stage--active' : ''}`}>
                  <div className="da-pipeline-count" style={{ color: s.count > 0 ? '#00d478' : undefined }}>
                    {s.count > 0 ? s.count : '—'}
                  </div>
                  <div className="da-pipeline-label">{s.label}</div>
                </div>
              ))}
            </div>
            <StatusBreakdown breakdown={projects.statusBreakdown} />
          </>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Workflows</h2>
        <SectionEmpty meta={wf} />
        {wf.hasEnoughData && analyticsFull && (
          <>
            <div className="da-metrics-grid da-metrics-grid--6">
              <Metric label="Created" value={fmtNum(wf.totalCreated)} highlight />
              <Metric label="Published" value={fmtNum(wf.published)} highlight />
              <Metric label="Drafts" value={fmtNum(wf.draft)} />
              <Metric label="Needs improvement" value={fmtNum(wf.needsImprovement)} />
              <Metric label="Avg AI score" value={wf.avgAiQualityScore != null ? `${wf.avgAiQualityScore}` : 'Not enough data yet'} />
              <Metric label="Requests generated" value={fmtNum(wf.requestsFromWorkflows)} highlight />
            </div>
            <StatusBreakdown breakdown={wf.statusBreakdown} />
          </>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Agreements</h2>
        <SectionEmpty meta={agr} />
        {agr.hasEnoughData && analyticsFull && (
          <>
            <div className="da-metrics-grid da-metrics-grid--5">
              <Metric label="Drafted" value={fmtNum(agr.drafted)} />
              <Metric label="Buyer confirmed" value={fmtNum(agr.buyerConfirmed)} />
              <Metric label="Creator confirmed" value={fmtNum(agr.creatorConfirmed)} />
              <Metric label="Fully confirmed" value={fmtNum(agr.fullyConfirmed)} highlight />
              <Metric label="Changes requested" value={fmtNum(agr.changesRequested)} />
            </div>
            <StatusBreakdown breakdown={agr.statusBreakdown} />
          </>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Deliverables</h2>
        <SectionEmpty meta={del} />
        {del.hasEnoughData && analyticsFull && (
          <>
            <div className="da-metrics-grid da-metrics-grid--4">
              <Metric label="Submitted" value={fmtNum(del.submitted)} highlight />
              <Metric label="Approved" value={fmtNum(del.approved)} highlight />
              <Metric label="Needs revision" value={fmtNum(del.needingRevision)} />
              <Metric label="Completion rate" value={fmtPct(del.completionRate)} />
            </div>
            <StatusBreakdown breakdown={del.statusBreakdown} />
          </>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Messages</h2>
        <SectionEmpty meta={messaging} />
        {messaging.hasEnoughData && analyticsFull && (
          <div className="da-metrics-grid da-metrics-grid--4">
            <Metric label="Threads" value={fmtNum(messaging.totalThreads)} highlight />
            <Metric label="Recent (7d)" value={fmtNum(messaging.recentMessageCount)} />
            <Metric label="Need reply" value={fmtNum(messaging.conversationsNeedingReply)} />
            <Metric label="Last message" value={fmtDate(messaging.lastMessageDate)} />
          </div>
        )}
      </div>

      {profile.hasEnoughData && strength != null && data.context.creatorProfile && analyticsFull && (
        <div className="da-section">
          <h2 className="da-section-title">Profile</h2>
          <div className="da-metrics-grid da-metrics-grid--4">
            <Metric label="Strength" value={`${strength}/100`} highlight />
            <Metric label="Visibility" value={profile.visibility} />
            <Metric label="Verification" value={profile.verificationStatus} />
            <Metric label="Missing items" value={fmtNum(profile.missingItems.length)} />
          </div>
          <div className="da-bars">
            {(() => {
              const s = analyzeProfileStrength(data.context.creatorProfile!);
              return (
                <>
                  <Bar label="Identity" value={s.sections.identity} max={100} color={getStrengthColor(s.sections.identity)} />
                  <Bar label="Expertise" value={s.sections.expertise} max={100} color={getStrengthColor(s.sections.expertise)} />
                  <Bar label="Portfolio" value={s.sections.portfolio} max={100} color={getStrengthColor(s.sections.portfolio)} />
                  <Bar label="Credentials" value={s.sections.credentials} max={100} color={getStrengthColor(s.sections.credentials)} />
                  <Bar label="Availability" value={s.sections.availability} max={100} color={getStrengthColor(s.sections.availability)} />
                </>
              );
            })()}
          </div>
          {profile.missingItems.length > 0 && (
            <Link to="/dashboard/profile" className="da-link">Fix missing profile fields →</Link>
          )}
        </div>
      )}
    </>
  );
}

// ─── Buyer view ───────────────────────────────────────────────────────────────

function BuyerAnalyticsBody({
  data,
  insights,
  insightsLoading,
  planId,
  aiMonitorFull,
}: {
  data: BuyerAnalyticsOverview;
  insights: AnalyticsInsight[];
  insightsLoading: boolean;
  planId: string;
  aiMonitorFull: boolean;
}) {
  const { requests: req, projects, deliverables: del, messaging } = data;

  return (
    <>
      <div className="da-metrics-grid da-metrics-grid--4">
        <Metric label="Requests" value={fmtNum(req.totalRequests)} highlight={req.hasEnoughData} />
        <Metric label="With applicants" value={fmtNum(req.withApplicants)} highlight={req.hasEnoughData} />
        <Metric label="Active projects" value={fmtNum(projects.activeProjects)} highlight={projects.hasEnoughData} />
        <Metric label="Deliverables to review" value={fmtNum(del.waitingForReview)} highlight={del.hasEnoughData} />
      </div>

      <div className="da-future-row">
        <div className="da-future-card">
          <span className="da-future-label">Earnings / spend</span>
          <span className="da-future-val">Payment integration not active yet</span>
        </div>
        <div className="da-future-card">
          <span className="da-future-label">Lead / booking metrics</span>
          <span className="da-future-val">Available after your MicroBuild goes live</span>
        </div>
      </div>

      {aiMonitorFull ?
        <AIMonitorPanel insights={insights} loading={insightsLoading} />
      : (
        <UpgradePrompt
          featureKey="buyer_ai_request_monitor_advanced"
          featureLabel="Advanced AI monitoring"
          currentPlan={planId}
          requiredPlan={getRequiredPlanForFeature('buyer', 'buyer_ai_request_monitor_advanced') ?? 'growth'}
          role="buyer"
          unlockSummary="Cross-request insights and recommended actions from your MicroBuild activity."
        />
      )}

      <div className="da-section">
        <h2 className="da-section-title">Requests</h2>
        <SectionEmpty meta={req} />
        {req.hasEnoughData && (
          <>
            <div className="da-metrics-grid da-metrics-grid--6">
              <Metric label="Total submitted" value={fmtNum(req.totalRequests)} highlight />
              <Metric label="With applicants" value={fmtNum(req.withApplicants)} />
              <Metric label="Creator selected" value={fmtNum(req.selectedCreators)} />
              <Metric label="Workflow-based" value={fmtNum(req.workflowBased)} />
              <Metric label="Custom requests" value={fmtNum(req.customRequests)} />
              <Metric
                label="Avg applicants / request"
                value={req.avgApplicantsPerRequest != null ? String(req.avgApplicantsPerRequest) : 'Not enough data yet'}
              />
            </div>
            <StatusBreakdown breakdown={req.statusBreakdown} />
          </>
        )}
        {!req.hasEnoughData && (
          <p className="da-section-note">
            <Link to="/request" className="da-link">Submit your first request →</Link>
          </p>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Projects</h2>
        <SectionEmpty meta={projects} />
        {projects.hasEnoughData && (
          <>
            <div className="da-metrics-grid da-metrics-grid--2">
              <Metric label="Active" value={fmtNum(projects.activeProjects)} highlight />
              <Metric label="Completed" value={fmtNum(projects.completedProjects)} highlight />
            </div>
            <StatusBreakdown breakdown={projects.statusBreakdown} />
          </>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Deliverables</h2>
        <SectionEmpty meta={del} />
        {del.hasEnoughData && (
          <div className="da-metrics-grid da-metrics-grid--3">
            <Metric label="Waiting for review" value={fmtNum(del.waitingForReview)} highlight />
            <Metric label="Approved" value={fmtNum(del.approved)} />
            <Metric label="Needs revision" value={fmtNum(del.needingRevision)} />
          </div>
        )}
      </div>

      <div className="da-section">
        <h2 className="da-section-title">Messages</h2>
        <SectionEmpty meta={messaging} />
        {messaging.hasEnoughData && (
          <div className="da-metrics-grid da-metrics-grid--4">
            <Metric label="Open conversations" value={fmtNum(messaging.openConversations)} highlight />
            <Metric label="Recent (7d)" value={fmtNum(messaging.recentMessageCount)} />
            <Metric label="Need reply" value={fmtNum(messaging.conversationsNeedingReply)} />
            <Metric label="Last message" value={fmtDate(messaging.lastMessageDate)} />
          </div>
        )}
      </div>
    </>
  );
}

// ─── Admin snippet ────────────────────────────────────────────────────────────

function AdminAnalyticsSnippet({
  platform,
  insights,
}: {
  platform: AdminPlatformAnalytics;
  insights: AnalyticsInsight[];
}) {
  return (
    <>
      <div className="da-header-notice">
        <span className="da-notice-icon">ℹ</span>
        <span>
          Full platform analytics live in the{' '}
          <Link to="/admin" className="da-link">AI Command Center</Link>.
          Summary metrics below use live Supabase counts when your admin session can read them.
        </span>
      </div>
      <div className="da-metrics-grid da-metrics-grid--4">
        <Metric label="Open requests" value={fmtNum(platform.openBuyerRequests)} />
        <Metric label="Pending creators" value={fmtNum(platform.pendingCreatorApplications)} />
        <Metric label="Open projects" value={fmtNum(platform.openProjects)} />
        <Metric label="Deliverables to review" value={fmtNum(platform.deliverablesNeedingReview)} />
      </div>
      <AIMonitorPanel insights={insights} loading={false} />
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState<AnalyticsDateRange>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatorData, setCreatorData] = useState<CreatorAnalyticsOverview | null>(null);
  const [buyerData, setBuyerData] = useState<BuyerAnalyticsOverview | null>(null);
  const [adminPlatform, setAdminPlatform] = useState<AdminPlatformAnalytics | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [accountType, setAccountType] = useState<string>('');
  const [planId, setPlanId] = useState<string>('free');

  const isAdmin = Boolean(user?.email && isAdminEmail(user.email));

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    setCreatorData(null);
    setBuyerData(null);
    setInsights([]);

    try {
      const ctx = await loadAnalyticsContext(user.id, user.email ?? '', dateRange);
      setAccountType(ctx.accountType);

      const { data: upRaw } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      const up = (upRaw ?? null) as UserProfileRow | null;
      if (ctx.accountType === 'creator' && ctx.creatorProfile) {
        setPlanId(resolveCreatorPlanFromProfile(ctx.creatorProfile, up));
      } else if (ctx.accountType === 'buyer') {
        setPlanId(resolveBuyerPlanFromProfile(up));
      } else {
        setPlanId('free');
      }

      if (isAdmin) {
        const platform = await getAdminPlatformAnalytics();
        setAdminPlatform(platform);
        setInsights(generateAdminInsights(platform));
        setLoading(false);
        return;
      }

      if (ctx.accountType === 'creator') {
        const overview = await getCreatorAnalyticsOverview(ctx);
        setCreatorData(overview);
        if (overview.errors.length > 0) {
          setLoadError(overview.errors[0] ?? 'Some metrics could not be loaded.');
        }
        setInsightsLoading(true);
        const ins = await generateCreatorInsightsAsync(overview);
        setInsights(ins);
        setInsightsLoading(false);
      } else {
        const overview = await getBuyerAnalyticsOverview(ctx);
        setBuyerData(overview);
        if (overview.errors.length > 0) {
          setLoadError(overview.errors[0] ?? 'Some metrics could not be loaded.');
        }
        setInsightsLoading(true);
        const ins = await generateBuyerInsights(overview);
        setInsights(ins);
        setInsightsLoading(false);
      }
    } catch (err) {
      console.error('[DashboardAnalytics] load failed:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [user, dateRange, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCreator = accountType === 'creator' && !isAdmin;

  const subtitle = isAdmin
    ? 'Platform overview — use the Command Center for full admin queues.'
    : isCreator
      ? 'Creator performance from applications, projects, workflows, and messages.'
      : 'Buyer activity from your requests, projects, deliverables, and messages.';

  if (authLoading || loading) {
    return (
      <div className="da-page">
        <div className="da-loading"><div className="da-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="da-page">
      <div className="da-header">
        <div className="container">
          <Link to="/dashboard" className="da-back">← Dashboard</Link>
          <h1 className="da-title">Analytics</h1>
          <p className="da-sub">{subtitle}</p>
          <div className="da-range-row">
            <span className="da-range-label">Date range</span>
            <div className="da-range-toggle">
              <button
                type="button"
                className={`da-range-btn${dateRange === '30d' ? ' da-range-btn--active' : ''}`}
                onClick={() => setDateRange('30d')}
              >
                Last 30 days
              </button>
              <button
                type="button"
                className={`da-range-btn${dateRange === 'all' ? ' da-range-btn--active' : ''}`}
                onClick={() => setDateRange('all')}
              >
                All time
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container da-body">
        {loadError && (
          <div className="da-header-notice da-header-notice--warn">
            <span className="da-notice-icon">⚠</span>
            <span>{loadError} Other sections may still show available data.</span>
          </div>
        )}

        {isAdmin && adminPlatform && (
          <AdminAnalyticsSnippet platform={adminPlatform} insights={insights} />
        )}

        {isCreator && creatorData && (
          <CreatorAnalyticsBody
            data={creatorData}
            insights={insights}
            insightsLoading={insightsLoading}
            planId={planId}
            analyticsFull={canUseFeature('creator', planId, 'creator_analytics_full')}
            aiMonitorFull={canUseFeature('creator', planId, 'creator_ai_monitor_full')}
          />
        )}

        {!isAdmin && !isCreator && buyerData && (
          <BuyerAnalyticsBody
            data={buyerData}
            insights={insights}
            insightsLoading={insightsLoading}
            planId={planId}
            aiMonitorFull={canUseFeature('buyer', planId, 'buyer_ai_request_monitor_advanced')}
          />
        )}
      </div>
    </div>
  );
}
