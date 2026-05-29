import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UserProfileRow } from '../../types/database';
import type { BuyerRequestSnap } from '../../lib/buyerRequestMonitor';
import type { BuyerRequestActivitySummary } from '../../lib/buyerRequestManagement';
import {
  archiveBuyerRequest,
  cancelBuyerRequest,
  deleteBuyerRequestSafe,
  requestLifecycleLabel,
} from '../../lib/buyerRequestManagement';

type ModalKind = 'cancel' | 'archive' | 'delete' | null;

interface Props {
  request: BuyerRequestSnap;
  buyerProfile: UserProfileRow;
  activity: BuyerRequestActivitySummary;
  onRefresh: () => void | Promise<void>;
  onToast: (t: { type: 'ok' | 'err'; msg: string }) => void;
  onExpandDetails: () => void;
}

export default function BuyerRequestManageMenu({
  request,
  buyerProfile,
  activity,
  onRefresh,
  onToast,
  onExpandDetails,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const lifecycle = requestLifecycleLabel(request);
  const isCanceled = lifecycle === 'Canceled';
  const isArchived = lifecycle === 'Archived';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function runAction(kind: ModalKind) {
    if (!kind) return;
    setBusy(true);
    const verify = {
      buyerEmail: buyerProfile.email,
      authUserId: buyerProfile.auth_user_id ?? null,
    };
    let res: { ok: boolean; error?: string };
    if (kind === 'cancel') {
      res = await cancelBuyerRequest({ requestId: request.id, ...verify, reason });
    } else if (kind === 'archive') {
      res = await archiveBuyerRequest({ requestId: request.id, ...verify });
    } else {
      res = await deleteBuyerRequestSafe({ requestId: request.id, ...verify, activity });
    }
    setBusy(false);
    setModal(null);
    setOpen(false);
    setReason('');
    onToast(
      res.ok
        ? { type: 'ok', msg: kind === 'delete' ? 'Request deleted.' : kind === 'cancel' ? 'Request canceled.' : 'Request archived.' }
        : { type: 'err', msg: res.error ?? 'Action failed.' },
    );
    if (res.ok) await onRefresh();
  }

  return (
    <div className="bmr-manage" ref={menuRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm bmr-manage-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        Manage ⋮
      </button>

      {open ?
        <div className="bmr-manage-menu" role="menu">
          <button type="button" className="bmr-manage-item" role="menuitem" onClick={() => { setOpen(false); onExpandDetails(); }}>
            View details
          </button>
          <Link to="/request" className="bmr-manage-item" role="menuitem" onClick={() => setOpen(false)}>
            New request with details
          </Link>
          {!isCanceled && !isArchived && activity.canCancel ?
            <button type="button" className="bmr-manage-item" role="menuitem" onClick={() => { setOpen(false); setModal('cancel'); }}>
              Cancel request
            </button>
          : null}
          {!isArchived ?
            <button type="button" className="bmr-manage-item" role="menuitem" onClick={() => { setOpen(false); setModal('archive'); }}>
              Archive request
            </button>
          : null}
          {activity.canHardDelete ?
            <button
              type="button"
              className="bmr-manage-item bmr-manage-item--danger"
              role="menuitem"
              onClick={() => { setOpen(false); setModal('delete'); }}
            >
              Delete request
            </button>
          : null}
        </div>
      : null}

      {modal ? (
        <div
          className="mb-select-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !busy) setModal(null); }}
        >
          <div className="mb-select-confirm-card bmr-manage-modal">
            {modal === 'cancel' ?
              (
                <>
                  <h4 className="mb-select-confirm-title">Cancel this request?</h4>
                  <p className="mb-select-confirm-copy subtle">
                    This keeps request history but stops new creator activity. Existing applicant records remain for your records.
                  </p>
                  <label className="bmr-manage-reason-label">
                    Reason (optional)
                    <textarea
                      className="bmr-manage-reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are you canceling?"
                    />
                  </label>
                </>
              )
            : modal === 'archive' ?
              (
                <>
                  <h4 className="mb-select-confirm-title">Archive this request?</h4>
                  <p className="mb-select-confirm-copy subtle">
                    Archived requests are hidden from your active view but kept for records. You can find them under the Archived filter.
                  </p>
                </>
              )
            : (
              <>
                <h4 className="mb-select-confirm-title">Delete this request?</h4>
                <p className="mb-select-confirm-copy subtle">
                  Only requests with no applicants, messages, projects, or deliveries can be deleted. This cannot be undone.
                </p>
              </>
            )}
            <div className="mb-select-confirm-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setModal(null)}>
                Back
              </button>
              <button
                type="button"
                className={`btn btn-sm ${modal === 'delete' ? 'btn-primary bmr-manage-confirm-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => void runAction(modal)}
              >
                {busy ? 'Working…' : modal === 'delete' ? 'Delete' : modal === 'cancel' ? 'Cancel request' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
