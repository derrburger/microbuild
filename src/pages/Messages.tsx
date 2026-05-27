import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import type { ProjectMessageRow, UserProfileRow } from '../types/database';
import { fetchDeliverableByOrderId, DELIVERY_STATUS_LABELS } from '../lib/orders';
import { fetchProposalByOrderId } from '../lib/proposals';
import { getAgreementViewState, type AgreementPanelPhase } from '../lib/projectAgreement';
import { agreementStatusBadgeLabel } from '../lib/workspaceStatus';
import { formatOrderStatus, formatRequestApplicationStatus } from '../lib/statusLabels';
import {
  conversationMatchesFilter,
  fetchMessagePool,
  getConversationHelperHint,
  getConversationStatusLabel,
  getConversationTitle,
  getConversationTypeLabel,
  getOtherParticipantLabel,
  getOtherParticipantRole,
  getUserConversations,
  mergeMessagesForConversation,
  normalizeMessageText,
  searchConversation,
  sendConversationMessage,
  type ConversationFilterChip,
  type ConversationListItem,
  type MessagingAccountSide,
} from '../lib/messages';
import './Messages.css';

function fmtWhen(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function fmtListTime(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function inboxSide(profile: UserProfileRow | null): MessagingAccountSide {
  const a = normalizeMessageText(profile?.account_type, '').toLowerCase();
  return a === 'creator' ? 'creator' : 'buyer';
}

const FILTER_CHIPS: { id: ConversationFilterChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'projects', label: 'Projects' },
  { id: 'selected', label: 'Selected Creators' },
  { id: 'unread', label: 'Unread' },
];

export function pickConversationFromQueryParams(
  list: ConversationListItem[],
  params: URLSearchParams,
): ConversationListItem | null {
  const oid = normalizeMessageText(params.get('orderId'), '').trim();
  if (oid) {
    const byOrder = list.find((c) => c.orderId?.trim() === oid);
    if (byOrder) return byOrder;
  }

  const brid = normalizeMessageText(params.get('buyerRequestId'), '').trim();
  const cpid = normalizeMessageText(params.get('creatorProfileId'), '').trim();
  if (brid && cpid) {
    const byPair = list.find(
      (c) => c.buyerRequestId.trim() === brid && c.creatorProfileId.trim() === cpid,
    );
    if (byPair) return byPair;
  }

  if (brid) return list.find((c) => c.buyerRequestId.trim() === brid) ?? null;
  return null;
}

function contextLabelForConv(conv: ConversationListItem): string {
  return conv.anchor === 'order' ? 'Project' : 'Request';
}

function messageBubbleMeta(
  row: ProjectMessageRow,
  viewerId: string,
  conv: ConversationListItem,
  side: MessagingAccountSide,
): { primary: string; roleBadge: string | null; isYou: boolean; isSystem: boolean } {
  const mt = normalizeMessageText(row.message_type, '').toLowerCase();
  const isSystem = mt === 'system_update';
  const sid = normalizeMessageText(row.sender_user_profile_id, '').trim();
  const isYou = !!(viewerId && sid && sid === viewerId);

  if (isSystem) {
    return { primary: 'System update', roleBadge: null, isYou: false, isSystem: true };
  }

  if (isYou) {
    return { primary: 'You', roleBadge: side === 'buyer' ? 'Buyer' : 'Creator', isYou: true, isSystem: false };
  }

  const sr = normalizeMessageText(row.sender_role, '').toLowerCase();
  const otherName = getOtherParticipantLabel(conv, side);
  const roleBadge =
    sr === 'buyer' ? 'Buyer'
    : sr === 'creator' ? 'Creator'
    : sr === 'admin' || sr === 'microbuild_admin' ? 'Admin'
    : getOtherParticipantRole(side);

  return { primary: otherName, roleBadge, isYou: false, isSystem: false };
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile: userProfile, loading: profileLoading } = useUserProfileRow();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [pool, setPool] = useState<ProjectMessageRow[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxErr, setInboxErr] = useState<string | null>(null);

  const [selectedStableId, setSelectedStableId] = useState<string | null>(null);
  const [filterChip, setFilterChip] = useState<ConversationFilterChip>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const [agreementLabel, setAgreementLabel] = useState<string | null>(null);
  const [agreementPhase, setAgreementPhase] = useState<AgreementPanelPhase | null>(null);
  const [deliverableLabel, setDeliverableLabel] = useState<string | null>(null);
  const [deliveryStatusRaw, setDeliveryStatusRaw] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const side = useMemo(() => inboxSide(userProfile ?? null), [userProfile]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) return;
    if (userProfile === null) navigate('/onboarding', { replace: true });
  }, [authLoading, profileLoading, user, userProfile, navigate]);

  const refreshInbox = useCallback(async () => {
    if (!userProfile?.id?.trim()) {
      setConversations([]);
      setPool([]);
      setLoadingInbox(false);
      return;
    }
    setLoadingInbox(true);
    setInboxErr(null);
    try {
      const convs = await getUserConversations(userProfile, side);
      setConversations(convs);
      const orderIds = uniq(convs.map((c) => c.orderId).filter(Boolean) as string[]);
      const bridIds = uniq(convs.map((c) => c.buyerRequestId.trim()));
      const p = await fetchMessagePool(bridIds, orderIds);
      setPool(p);
    } catch (e) {
      console.error('[Messages]', e);
      setInboxErr(e instanceof Error ? e.message : 'Could not load messages.');
      setConversations([]);
      setPool([]);
    } finally {
      setLoadingInbox(false);
    }
  }, [userProfile, side]);

  useEffect(() => {
    if (!profileLoading && userProfile?.id.trim()) void refreshInbox();
  }, [profileLoading, userProfile, refreshInbox]);

  useEffect(() => {
    if (loadingInbox || conversations.length === 0) return;

    setSelectedStableId((prev) => {
      const fromQuery = pickConversationFromQueryParams(conversations, searchParams);
      const qChoice = fromQuery?.stableId ?? null;
      const stillValidPrev = !!(prev && conversations.some((c) => c.stableId === prev));

      if (!stillValidPrev) return qChoice ?? conversations[0]?.stableId ?? null;
      if (qChoice && qChoice !== prev) return qChoice;
      return prev;
    });
  }, [loadingInbox, conversations, searchParams]);

  const selected = useMemo(
    () =>
      conversations.find((c) => c.stableId === selectedStableId)
      ?? conversations[0]
      ?? null,
    [conversations, selectedStableId],
  );

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (!conversationMatchesFilter(c, filterChip, side)) return false;
      return searchConversation(c, searchQuery, side);
    });
  }, [conversations, filterChip, searchQuery, side]);

  const mergedThread = useMemo(() => {
    if (!selected || !userProfile?.id.trim()) return [];
    return mergeMessagesForConversation(pool, selected, userProfile.id.trim());
  }, [pool, selected, userProfile?.id]);

  useEffect(() => {
    if (!selected?.orderId?.trim()) {
      setAgreementLabel(null);
      setAgreementPhase(null);
      setDeliverableLabel(null);
      setDeliveryStatusRaw(null);
      setContextLoading(false);
      return;
    }

    let cancelled = false;
    setContextLoading(true);

    void (async () => {
      try {
        const oid = selected.orderId!.trim();
        const [proposal, deliverable] = await Promise.all([
          fetchProposalByOrderId(oid),
          fetchDeliverableByOrderId(oid),
        ]);
        if (cancelled) return;
        const view = getAgreementViewState(proposal);
        setAgreementPhase(view.phase);
        setAgreementLabel(agreementStatusBadgeLabel(proposal));
        const ds = normalizeMessageText(deliverable?.delivery_status, '').trim();
        setDeliveryStatusRaw(ds || null);
        setDeliverableLabel(
          ds ? DELIVERY_STATUS_LABELS[ds] ?? ds.replace(/_/g, ' ') : 'Not submitted',
        );
      } catch {
        if (!cancelled) {
          setAgreementLabel(null);
          setAgreementPhase(null);
          setDeliverableLabel(null);
          setDeliveryStatusRaw(null);
        }
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.orderId, selected?.stableId]);

  const helperHint = useMemo(() => {
    if (!selected) return null;
    return getConversationHelperHint(selected, {
      agreementPhase: agreementPhase,
      deliveryStatus: deliveryStatusRaw,
    });
  }, [selected, agreementPhase, deliveryStatusRaw]);

  async function handleSend() {
    const body = composer.trim();
    if (!selected || !userProfile?.id.trim() || !body.length || sending) return;

    setSending(true);
    setSendErr(null);

    try {
      const res = await sendConversationMessage(selected, userProfile, body);
      if (!res.ok) {
        setSendErr(res.error ?? 'Could not save message.');
        return;
      }
      setComposer('');
      await refreshInbox();
    } finally {
      setSending(false);
    }
  }

  function selectConversation(c: ConversationListItem) {
    setSelectedStableId(c.stableId);
    const p = new URLSearchParams(searchParams);
    if (c.orderId?.trim()) {
      p.set('orderId', c.orderId.trim());
      p.set('buyerRequestId', c.buyerRequestId.trim());
      p.set('creatorProfileId', c.creatorProfileId.trim());
    } else {
      p.delete('orderId');
      p.set('buyerRequestId', c.buyerRequestId.trim());
      p.set('creatorProfileId', c.creatorProfileId.trim());
    }
    setSearchParams(p, { replace: true });
    setSendErr(null);
  }

  if (
    authLoading
    || profileLoading
    || (user !== null && userProfile === undefined && !profileLoading)
  ) {
    return (
      <div className="mb-msg-page mb-msg-loading">
        <div className="container">Loading inbox…</div>
      </div>
    );
  }

  const hasAgreement = !!(selected?.orderId && agreementPhase && agreementPhase !== 'none');

  return (
    <div className="mb-msg-page">
      <header className="mb-msg-header">
        <div className="container mb-msg-header-inner">
          <div>
            <p className="mb-msg-eyebrow">Communication hub · refresh-based</p>
            <h1 className="mb-msg-title">Messages</h1>
            <p className="mb-msg-sub muted">
              {side === 'creator'
                ? 'Conversations tied to your applications and assigned projects.'
                : 'Conversations with applicants and your selected creators.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm mb-msg-refresh-btn"
            onClick={() => void refreshInbox()}
            disabled={loadingInbox}
          >
            {loadingInbox ? 'Refreshing…' : 'Refresh inbox'}
          </button>
        </div>
      </header>

      <div className="container mb-msg-shell">
        {inboxErr ? <div className="mb-form-alert mb-form-alert--error">{inboxErr}</div> : null}

        {!loadingInbox && conversations.length === 0 ?
          (
            <div className="mb-msg-empty">
              <h2 className="mb-msg-empty-title">No conversations yet</h2>
              <p className="subtle">
                {side === 'creator'
                  ? 'Messages will appear after you apply to requests or get selected for projects.'
                  : 'Messages will appear after creators apply to your requests.'}
              </p>
              <p className="mb-msg-empty-actions">
                {side === 'creator' ?
                  (
                    <>
                      <Link className="btn btn-primary btn-sm" to="/browse">
                        Browse buyer requests
                      </Link>
                      <Link className="btn btn-ghost btn-sm" to="/dashboard/applications">
                        My applications
                      </Link>
                    </>
                  )
                : (
                    <>
                      <Link className="btn btn-primary btn-sm" to="/request">
                        Request a MicroBuild
                      </Link>
                      <Link className="btn btn-ghost btn-sm" to="/dashboard/requests">
                        My requests
                      </Link>
                    </>
                  )}
              </p>
            </div>
          )
        : null}

        {!loadingInbox && conversations.length > 0 ?
          (
            <div className="mb-msg-layout">
              <aside className="mb-msg-sidebar" aria-label="Conversations">
                <div className="mb-msg-sidebar-tools">
                  <input
                    type="search"
                    className="mb-msg-search"
                    placeholder="Search conversations…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search conversations"
                  />
                  <div className="mb-msg-filters" role="tablist" aria-label="Filter conversations">
                    {FILTER_CHIPS.filter((chip) => chip.id !== 'selected' || side === 'buyer').map((chip) => {
                      const disabled = chip.id === 'unread';
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          role="tab"
                          aria-selected={filterChip === chip.id}
                          disabled={disabled}
                          title={disabled ? 'Unread tracking comes later' : undefined}
                          className={`mb-msg-filter-chip${filterChip === chip.id ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                          onClick={() => {
                            if (!disabled) setFilterChip(chip.id);
                          }}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredConversations.length === 0 ?
                  (
                    <p className="mb-msg-sidebar-empty muted-sm">
                      No conversations match this filter. Try All or clear your search.
                    </p>
                  )
                : (
                    <ul className="mb-msg-list">
                      {filteredConversations.map((c) => {
                        const isActive = selected?.stableId === c.stableId;
                        const preview = normalizeMessageText(c.preview).trim();
                        const listTime = fmtListTime(c.lastActivityAt);
                        return (
                          <li key={c.stableId}>
                            <button
                              type="button"
                              className={`mb-msg-list-item${isActive ? ' is-active' : ''}`}
                              onClick={() => selectConversation(c)}
                            >
                              <div className="mb-msg-card-top">
                                <span className="mb-msg-other-party">{getOtherParticipantLabel(c, side)}</span>
                                {listTime ? <span className="mb-msg-card-time muted-xs">{listTime}</span> : null}
                              </div>
                              <div className="mb-msg-card-badges">
                                <span className="mb-msg-role-badge">{getOtherParticipantRole(side)}</span>
                                <span className="mb-msg-context-badge">{contextLabelForConv(c)}</span>
                                <span className="mb-msg-status-badge">{getConversationStatusLabel(c)}</span>
                              </div>
                              <div className="mb-msg-thread-title muted-sm">{getConversationTitle(c)}</div>
                              <div className="mb-msg-preview muted-sm">
                                {preview || 'No messages yet'}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
              </aside>

              <main className="mb-msg-thread-panel">
                {!selected ?
                  (
                    <div className="mb-msg-pane-empty">
                      <p className="muted">Select a conversation to view messages.</p>
                    </div>
                  )
                : !userProfile?.id.trim() ?
                  (
                    <div className="mb-msg-pane-empty">
                      <p className="muted">Sign in to view messages.</p>
                    </div>
                  )
                : (
                    <>
                      <header className="mb-msg-thread-head">
                        <div className="mb-msg-thread-head-main">
                          <div className="mb-msg-thread-head-row">
                            <h2 className="mb-msg-thread-title">{getOtherParticipantLabel(selected, side)}</h2>
                            <span className="mb-msg-role-badge">{getOtherParticipantRole(side)}</span>
                            <span className="mb-msg-status-badge">{getConversationStatusLabel(selected)}</span>
                          </div>
                          <p className="mb-msg-thread-sub muted-sm">{getConversationTitle(selected)}</p>
                          <p className="mb-msg-thread-kind muted-xs">{getConversationTypeLabel(selected)}</p>
                        </div>
                        <div className="mb-msg-jump-links">
                          {selected.orderId ?
                            <Link className="btn btn-ghost btn-sm" to={`/dashboard/projects/${selected.orderId}`}>
                              Open project
                            </Link>
                          : null}
                          <Link
                            className="btn btn-ghost btn-sm"
                            to={
                              side === 'buyer'
                                ? `/dashboard#mb-buyer-applicants-${selected.buyerRequestId}`
                                : '/dashboard/applications'
                            }
                          >
                            {side === 'buyer' ? 'View request' : 'View application'}
                          </Link>
                          {hasAgreement && selected.orderId ?
                            <Link
                              className="btn btn-ghost btn-sm"
                              to={`/dashboard/projects/${selected.orderId}#project-agreement`}
                            >
                              View agreement
                            </Link>
                          : null}
                        </div>
                      </header>

                      <div className="mb-msg-context-row">
                        <aside className="mb-msg-context-card" aria-label="Request or project context">
                          <h3 className="mb-msg-context-card-title">
                            {selected.anchor === 'order' ? 'Project context' : 'Request context'}
                          </h3>
                          <dl className="mb-msg-context-dl">
                            <div>
                              <dt>{side === 'buyer' ? 'Creator' : 'Buyer / business'}</dt>
                              <dd>{getOtherParticipantLabel(selected, side)}</dd>
                            </div>
                            <div>
                              <dt>MicroBuild</dt>
                              <dd>{normalizeMessageText(selected.microbuildLabel) || '—'}</dd>
                            </div>
                            {selected.budgetLabel ?
                              (
                                <div>
                                  <dt>Budget</dt>
                                  <dd>{selected.budgetLabel}</dd>
                                </div>
                              )
                            : null}
                            {selected.deadlineLabel ?
                              (
                                <div>
                                  <dt>Deadline</dt>
                                  <dd>{selected.deadlineLabel}</dd>
                                </div>
                              )
                            : null}
                            {selected.applicationStatus ?
                              (
                                <div>
                                  <dt>Application status</dt>
                                  <dd>{formatRequestApplicationStatus(selected.applicationStatus).label}</dd>
                                </div>
                              )
                            : null}
                            {selected.anchor === 'order' ?
                              (
                                <>
                                  <div>
                                    <dt>Project status</dt>
                                    <dd>
                                      {selected.orderPipelineStatus
                                        ? formatOrderStatus(selected.orderPipelineStatus).label
                                        : 'In progress'}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Agreement</dt>
                                    <dd>{contextLoading ? 'Loading…' : agreementLabel ?? 'No agreement yet'}</dd>
                                  </div>
                                  <div>
                                    <dt>Deliverable</dt>
                                    <dd>{contextLoading ? 'Loading…' : deliverableLabel ?? 'Not submitted'}</dd>
                                  </div>
                                </>
                              )
                            : null}
                          </dl>
                          <div className="mb-msg-context-actions">
                            {selected.orderId ?
                              <Link className="btn btn-primary btn-sm" to={`/dashboard/projects/${selected.orderId}`}>
                                Open project workspace
                              </Link>
                            : (
                              <Link
                                className="btn btn-primary btn-sm"
                                to={
                                  side === 'buyer'
                                    ? `/dashboard#mb-buyer-applicants-${selected.buyerRequestId}`
                                    : '/dashboard/applications'
                                }
                              >
                                {side === 'buyer' ? 'View applicant' : 'View application'}
                              </Link>
                            )}
                          </div>
                        </aside>

                        {helperHint ?
                          (
                            <div className="mb-msg-helper" role="note">
                              <strong>Conversation helper</strong>
                              <p>{helperHint}</p>
                            </div>
                          )
                        : null}
                      </div>

                      <div className="mb-msg-messages-scroll">
                        {mergedThread.map((row) => {
                          const vid = normalizeMessageText(userProfile.id).trim();
                          const meta = messageBubbleMeta(row, vid, selected, side);
                          const body = normalizeMessageText(row.message_body).trim();
                          if (!body.length) return null;

                          return (
                            <article
                              key={row.id}
                              className={`mb-msg-bubble-card${meta.isYou ? ' is-you' : ''}${meta.isSystem ? ' is-system' : ''}`}
                            >
                              <div className="mb-msg-meta">
                                <span className="mb-msg-author">{meta.primary}</span>
                                {meta.roleBadge ?
                                  <span className="mb-msg-role-badge mb-msg-role-badge--inline">{meta.roleBadge}</span>
                                : null}
                                {fmtWhen(row.created_at) ?
                                  <span className="muted-xs mb-msg-time">{fmtWhen(row.created_at)}</span>
                                : null}
                              </div>
                              <p className="mb-msg-body">{body}</p>
                            </article>
                          );
                        })}
                        {mergedThread.length === 0 ?
                          (
                            <p className="muted mb-msg-thread-empty-hint">
                              No messages yet. Start with a scope, timeline, or delivery question.
                            </p>
                          )
                        : null}
                      </div>

                      <footer className="mb-msg-composer">
                        {sendErr ?
                          (
                            <div className="mb-form-alert mb-form-alert--error mb-msg-send-error" role="alert">
                              {sendErr}
                            </div>
                          )
                        : null}
                        <textarea
                          className="mb-msg-input"
                          rows={3}
                          value={composer}
                          disabled={sending || !user}
                          placeholder="Write your message…"
                          onChange={(e) => setComposer(e.target.value)}
                          aria-label="Message body"
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void handleSend();
                          }}
                        />
                        <div className="mb-msg-composer-foot">
                          <p className="mb-msg-composer-hint muted-xs">
                            Keep messages tied to scope, timeline, assets, or delivery.
                          </p>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm mb-msg-send-btn"
                            disabled={!composer.trim().length || sending || !user}
                            onClick={() => void handleSend()}
                          >
                            {sending ? 'Sending…' : 'Send'}
                          </button>
                        </div>
                      </footer>
                    </>
                  )}
              </main>
            </div>
          )
        : null}

        {loadingInbox && conversations.length === 0 ?
          <div className="mb-msg-loading-banner">Loading conversations…</div>
        : null}
      </div>
    </div>
  );
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
}
