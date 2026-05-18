import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfileRow } from '../hooks/useUserProfileRow';
import type { ProjectMessageRow, UserProfileRow } from '../types/database';
import {
  fetchMessagePool,
  formatMessageSender,
  getConversationContext,
  getConversationStatusLabel,
  getConversationTitle,
  getMessageVisibilityLabel,
  getOtherParticipantLabel,
  getUserConversations,
  mergeMessagesForConversation,
  normalizeMessageText,
  sendConversationMessage,
  type ConversationListItem,
  type MessagingAccountSide,
} from '../lib/messages';
import './Messages.css';

function fmtWhen(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function inboxSide(profile: UserProfileRow | null): MessagingAccountSide {
  const a = normalizeMessageText(profile?.account_type, '').toLowerCase();
  return a === 'creator' ? 'creator' : 'buyer';
}

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
    const appOnly = list.find(
      (c) =>
        !c.orderId?.trim()
        && c.buyerRequestId.trim() === brid
        && c.creatorProfileId.trim() === cpid,
    );
    if (appOnly) return appOnly;
  }

  if (brid) return list.find((c) => c.buyerRequestId.trim() === brid) ?? null;
  return null;
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

  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendOkFlash, setSendOkFlash] = useState(false);

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

  /** Prefer URL matches, preserve manual selection while list is stable */
  useEffect(() => {
    if (loadingInbox || conversations.length === 0) return;

    setSelectedStableId((prev) => {
      const fromQuery = pickConversationFromQueryParams(conversations, searchParams);
      const qChoice = fromQuery?.stableId ?? null;
      const stillValidPrev = !!(prev && conversations.some((c) => c.stableId === prev));
      const nextDefault = conversations[0]?.stableId ?? null;

      /** First paint or invalid selection → hydrate from URL or first row */
      if (!stillValidPrev) return qChoice ?? nextDefault ?? null;

      /** When URL changes to point at another thread, obey it */
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

  const mergedThread = useMemo(() => {
    if (!selected || !userProfile?.id.trim()) return [];
    return mergeMessagesForConversation(pool, selected, userProfile.id.trim());
  }, [pool, selected, userProfile?.id]);

  async function handleSend() {
    const body = composer.trim();
    if (!selected || !userProfile?.id.trim() || !body.length || sending) return;

    setSending(true);
    setSendErr(null);
    setSendOkFlash(false);

    try {
      const res = await sendConversationMessage(selected, userProfile, body);
      if (!res.ok) {
        setSendErr(res.error ?? 'Could not save message.');
        return;
      }
      setComposer('');
      setSendOkFlash(true);
      window.setTimeout(() => setSendOkFlash(false), 2200);
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

  const emptyState =
    !loadingInbox && conversations.length === 0 ?
      (
        <div className="mb-msg-empty">
          <h2 className="mb-msg-empty-title">No conversations yet.</h2>
          {side === 'creator'
            ?
              (<p>Apply to buyer requests to start conversations.</p>)
            :
              (
                <p>
                  Creator conversations appear after someone applies to your request or after you select a creator.
                </p>
              )}
        </div>
      )
    : null;

  return (
    <div className="mb-msg-page">
      <header className="mb-msg-header">
        <div className="container mb-msg-header-inner">
          <div>
            <p className="mb-msg-eyebrow">Inbox · refresh-based · no realtime</p>
            <h1 className="mb-msg-title">Messages</h1>
            <p className="mb-msg-sub muted">
              {side === 'creator'
                ? 'Chats tied to your applications and assigned projects.'
                : 'Chats with applicants and your selected creators.'}{' '}
              <Link to="/dashboard">Dashboard</Link>
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm mb-msg-refresh-btn" onClick={() => void refreshInbox()}>
            Refresh inbox
          </button>
        </div>
      </header>

      <div className="container mb-msg-shell">
        {inboxErr ? <div className="mb-form-alert mb-form-alert--error">{inboxErr}</div> : null}

        {loadingInbox ? <div className="mb-msg-loading-banner">Updating conversations…</div> : null}

        {!loadingInbox ? emptyState : null}

        {!loadingInbox && conversations.length > 0 ?
          (
            <div className="mb-msg-layout">
              <aside className="mb-msg-sidebar" aria-label="Conversations">
                <ul className="mb-msg-list">
                  {conversations.map((c) => (
                    <li key={c.stableId}>
                      <button
                        type="button"
                        className={`mb-msg-list-item${selected?.stableId === c.stableId ? ' is-active' : ''}`}
                        onClick={() => selectConversation(c)}
                      >
                        <div className="mb-msg-row-top">
                          <span className="mb-msg-chip">{normalizeMessageText(c.inboxRibbonLabel) || '—'}</span>
                          <span className="mb-msg-unread-muted" aria-hidden title="Unread tracking comes later">
                            ·
                          </span>
                        </div>
                        <div className="mb-msg-other-party">{getOtherParticipantLabel(c, side)}</div>
                        <div className="mb-msg-thread-title muted-sm">{getConversationTitle(c)}</div>
                        <div className="mb-msg-status-pill muted-sm">{getConversationStatusLabel(c)}</div>
                        <div className="mb-msg-preview muted-sm">{normalizeMessageText(c.preview) || '—'}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>

              <main className="mb-msg-thread-panel">
                {selected && userProfile?.id.trim() ?
                  (
                    <>
                      <header className="mb-msg-thread-head">
                        <div>
                          <h2 className="mb-msg-thread-title">{getConversationTitle(selected)}</h2>
                          <p className="muted-sm mb-msg-context">{getConversationContext(selected, side)}</p>
                          <p className="muted-sm mb-msg-participants">
                            <strong>{getOtherParticipantLabel(selected, side)}</strong>
                            {' · '}
                            {getConversationStatusLabel(selected)}
                          </p>
                        </div>
                        <div className="mb-msg-jump-links">
                          {selected.orderId ?
                            <Link className="btn btn-ghost btn-sm" to={`/dashboard/projects/${selected.orderId}`}>
                              Project workspace →
                            </Link>
                          : null}
                          {side === 'buyer' ?
                            (
                              <Link
                                className="btn btn-ghost btn-sm"
                                to={`/dashboard#mb-buyer-applicants-${selected.buyerRequestId}`}
                              >
                                Applicant review →
                              </Link>
                            )
                          : null}
                          {side === 'creator' ?
                            <Link className="btn btn-ghost btn-sm" to="/dashboard/applications">
                              Applications →
                            </Link>
                          : null}
                        </div>
                      </header>

                      <div className="mb-msg-messages-scroll">
                        {mergedThread.map((row) => {
                          const vid = normalizeMessageText(userProfile.id).trim();
                          const mt = normalizeMessageText(row.message_type).toLowerCase();
                          const isSys = mt === 'system_update';
                          return (
                            <article key={row.id} className="mb-msg-bubble-card">
                              <div className="mb-msg-meta">
                                <span className="mb-msg-author">{isSys ? 'System update' : formatMessageSender(row, vid)}</span>
                                <span className="muted-xs">{fmtWhen(row.created_at)}</span>
                                <span className="muted-xs mb-msg-vis" title={getMessageVisibilityLabel(row.visibility)}>
                                  {getMessageVisibilityLabel(row.visibility)}
                                </span>
                              </div>
                              <p className="mb-msg-body">{normalizeMessageText(row.message_body)}</p>
                            </article>
                          );
                        })}
                        {mergedThread.length === 0 ?
                          <p className="muted mb-msg-thread-empty-hint">
                            No participant-visible rows yet — say hello below.
                          </p>
                        : null}
                      </div>

                      <footer className="mb-msg-composer">
                        {sendOkFlash ? <p className="muted-sm mb-msg-send-flash">Sent.</p> : null}
                        {sendErr ? (
                          <div className="mb-form-alert mb-form-alert--error mb-msg-send-error" role="status">
                            {sendErr}
                          </div>
                        ) : null}
                        <textarea
                          className="mb-msg-input"
                          rows={3}
                          value={composer}
                          disabled={sending}
                          placeholder="Write a short note…"
                          onChange={(e) => setComposer(e.target.value)}
                          aria-label="Message body"
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void handleSend();
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm mb-msg-send-btn"
                          disabled={!composer.trim().length || sending}
                          onClick={() => void handleSend()}
                        >
                          {sending ? 'Sending…' : 'Send'}
                        </button>
                      </footer>
                    </>
                  )
                :
                  (<p className="muted">Select a conversation.</p>)}
              </main>
            </div>
          )
        : null}
      </div>
    </div>
  );
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
}
