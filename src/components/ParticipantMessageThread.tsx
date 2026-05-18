import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectMessageRow, UserProfileRow } from '../types/database';
import {
  filterApplicantPairThread,
  formatMessageSender,
  getMessageThreadPreview,
  getMessageVisibilityLabel,
  getProjectMessages,
  getRequestMessages,
  sendProjectMessage,
  sendRequestMessage,
} from '../lib/messages';

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

function safeBody(text: unknown): string {
  return typeof text === 'string' && text.trim().length > 0 ? text : '';
}

export type ParticipantMessageThreadMode =
  /** buyer_request-scoped applicant ↔ buyer pair */
  | 'request_applicant_pair'
  /** project order-scoped (post-selection) */
  | 'project_order';

export interface ParticipantMessageThreadProps {
  mode: ParticipantMessageThreadMode;
  viewerProfile: UserProfileRow | null;
  viewerRole: 'buyer' | 'creator';
  buyerRequestId: string | null;
  orderId?: string | null;
  /** Participant user_profile id on the other side */
  counterpartUserProfileId?: string | null;
  /** When counterpart id is initially unknown (e.g. buyer email lookup), resolves after expanding */
  loadCounterpartUserProfileId?: () => Promise<string | null>;
  counterpartLabel: string;
  /** Button label, e.g. "Message buyer" */
  toggleLabel: string;
  emptyHint: string;
  /** Omit rows tied to `order_id` (split request-phase vs order-phase workspace panels) */
  omitOrderScoped?: boolean;
  className?: string;
  previewClassName?: string;
}

export default function ParticipantMessageThread({
  mode,
  viewerProfile,
  viewerRole,
  buyerRequestId,
  orderId = null,
  counterpartUserProfileId = null,
  loadCounterpartUserProfileId,
  counterpartLabel,
  toggleLabel,
  emptyHint,
  className,
  previewClassName,
  omitOrderScoped = false,
}: ParticipantMessageThreadProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ProjectMessageRow[]>([]);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [resolvedCounterpart, setResolvedCounterpart] = useState<string | null>(counterpartUserProfileId ?? null);
  const [resolvingCp, setResolvingCp] = useState(false);

  const counterpartEffective = (counterpartUserProfileId?.trim() || resolvedCounterpart?.trim() || '').trim()
    ? (counterpartUserProfileId?.trim() || resolvedCounterpart?.trim() || null)
    : null;

  useEffect(() => {
    setResolvedCounterpart(counterpartUserProfileId ?? null);
  }, [counterpartUserProfileId]);

  useEffect(() => {
    if (!open || counterpartUserProfileId || !loadCounterpartUserProfileId) return;
    let cancelled = false;
    setResolvingCp(true);
    void (async () => {
      try {
        const id = await loadCounterpartUserProfileId();
        if (!cancelled) setResolvedCounterpart(id?.trim() || null);
      } catch {
        if (!cancelled) setResolvedCounterpart(null);
      } finally {
        if (!cancelled) setResolvingCp(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, counterpartUserProfileId, loadCounterpartUserProfileId]);

  const canSend =
    !!(viewerProfile?.id && viewerProfile.id.trim())
    && (mode !== 'project_order' || !!(orderId && orderId.trim()))
    && (mode !== 'request_applicant_pair' || !!(buyerRequestId && buyerRequestId.trim()));

  const viewerId = viewerProfile?.id?.trim() ?? '';

  const refresh = useCallback(async () => {
    if (mode === 'project_order') {
      if (!orderId?.trim()) {
        setRows([]);
        return;
      }
      const list = await getProjectMessages(orderId.trim());
      setRows(list);
      return;
    }

    const rid = buyerRequestId?.trim();
    if (!rid) {
      setRows([]);
      return;
    }
    const raw = await getRequestMessages(rid);
    let scoped = filterApplicantPairThread(raw, viewerId, counterpartEffective ?? null);
    if (omitOrderScoped) scoped = scoped.filter((m) => !m.order_id);
    setRows(scoped);
  }, [buyerRequestId, counterpartEffective, mode, omitOrderScoped, orderId, viewerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview = useMemo(() => getMessageThreadPreview(rows), [rows]);

  async function handleSend() {
    const body = text.trim();
    if (!canSend || !body.length || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      if (mode === 'project_order') {
        const oid = orderId?.trim();
        if (!oid) {
          setSendErr("Order not available.");
          setSending(false);
          return;
        }
        const res = await sendProjectMessage({
          order_id: oid,
          buyer_request_id: buyerRequestId?.trim() || null,
          sender_user_profile_id: viewerProfile?.id ?? null,
          recipient_user_profile_id: counterpartEffective?.trim() || null,
          sender_role: viewerRole,
          message_body: body,
          message_type: 'general',
          visibility: 'buyer_creator',
        });
        if (!res.ok) setSendErr(res.error ?? 'Could not send message.');
        else setText('');
      } else {
        const brid = buyerRequestId?.trim();
        if (!brid) {
          setSendErr('Request not available.');
          setSending(false);
          return;
        }
        const res = await sendRequestMessage({
          buyer_request_id: brid,
          sender_user_profile_id: viewerProfile?.id ?? null,
          recipient_user_profile_id: counterpartEffective?.trim() || null,
          sender_role: viewerRole,
          message_body: body,
          message_type: 'general',
          visibility: 'buyer_creator',
        });
        if (!res.ok) setSendErr(res.error ?? 'Could not send message.');
        else setText('');
      }
      await refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={className ? `mb-participant-msg ${className}` : 'mb-participant-msg'}>
      <button
        type="button"
        className="btn btn-ghost btn-sm mb-participant-msg-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {toggleLabel}
        <span className="subtle">{open ? 'Hide' : 'Show'}</span>
      </button>

      {!open ? (
        <p className={`subtle mb-msg-thread-preview-inline${previewClassName ? ` ${previewClassName}` : ''}`}>{preview}</p>
      ) : null}

      {open && resolvingCp && loadCounterpartUserProfileId && mode === 'request_applicant_pair' ?
        (
          <p className="subtle mb-msg-resolving-participant">Connecting participant profile…</p>
        )
      : null}

      {open && counterpartLabel.trim().length ?
        (
          <p className="subtle mb-msg-recipient-context">Participant: {counterpartLabel.trim()}</p>
        )
      : null}

      {open ?
        (
          <>
            {sendErr ?
              (
                <div className="mb-form-alert mb-form-alert--error" role="alert">
                  {sendErr}
                </div>
              )
            : null}

            <div className="mb-msg-thread-list">
              {rows.length === 0 ?
                <p className="subtle mb-msg-thread-empty">{emptyHint}</p>
              : rows.map((m) => {
                  const senderLabel = formatMessageSender(m, viewerProfile?.id ?? null);
                  const mt = typeof m.message_type === 'string' && m.message_type.trim().length ? m.message_type : null;
                  return (
                    <div key={m.id} className="mb-msg-bubble-line">
                      <div className="mb-msg-meta">
                        <span className="mb-msg-from">{senderLabel}</span>
                        <span className="mb-msg-meta-sep subtle"> · </span>
                        <span className="subtle">{fmtWhen(m.created_at)}</span>
                        {mt ?
                          (
                            <>
                              <span className="mb-msg-meta-sep subtle"> · </span>
                              <span className="subtle">{mt}</span>
                            </>
                          )
                        : null}
                        <span className="mb-msg-meta-sep subtle"> · </span>
                        <span className="subtle">{getMessageVisibilityLabel(m.visibility)}</span>
                      </div>
                      <div className="mb-msg-body-text">{safeBody(m.message_body)}</div>
                    </div>
                  );
                })
              }
            </div>

            <div className="mb-msg-compose-block">
              <textarea
                className="mb-form-input mb-form-textarea mb-msg-body-input"
                rows={3}
                value={text}
                disabled={!canSend || sending}
                placeholder={
                  !viewerProfile?.id ?
                    'Sign in required to send messages.'
                  : !canSend ? 'Messaging unavailable for this card.'
                  : counterpartEffective ? 'Write a message — clarify scope, timeline, or goals.'
                  : 'Write a message. Recipient profile will attach when resolved (still sent on this request).'
                }
                onChange={(e) => setText(e.target.value)}
                aria-label="Message body"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canSend || sending || text.trim().length === 0}
                onClick={() => void handleSend()}
              >
                {sending ? 'Sending…' : 'Send & refresh'}
              </button>
              <p className="subtle mb-msg-sync-hint">Refresh-based inbox — reopen this thread to reload.</p>
            </div>
          </>
        )
      : null}
    </div>
  );
}
