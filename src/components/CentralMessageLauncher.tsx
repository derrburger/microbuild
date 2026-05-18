import { Link } from 'react-router-dom';
import { buildMessagesHref } from '../lib/messages';

export interface CentralMessageLauncherProps {
  buyerRequestId: string | null;
  creatorProfileId: string | null;
  /** When project exists prefer order-scoped inbox */
  orderId?: string | null;
  /** Button / link label */
  label?: string;
  className?: string;
  variant?: 'button' | 'inline';
}

/**
 * Deep-link into central inbox — replaces expandable inline threads on application cards for v2.
 */
export default function CentralMessageLauncher({
  buyerRequestId,
  creatorProfileId,
  orderId = null,
  label,
  className,
  variant = 'button',
}: CentralMessageLauncherProps) {
  if (!buyerRequestId?.trim()) {
    return (
      <p className="subtle muted-sm mb-msg-launcher-fallback">
        Messaging unlocks once this row links to the buyer request.
      </p>
    );
  }
  const href = buildMessagesHref({
    buyerRequestId: buyerRequestId.trim(),
    creatorProfileId: creatorProfileId?.trim() ?? null,
    orderId: orderId?.trim() ?? null,
  });

  const cls =
    variant === 'button'
      ? `btn btn-primary btn-sm mb-central-msg-launcher-btn${className ? ` ${className}` : ''}`
      : `mb-central-msg-launcher-inline${className ? ` ${className}` : ''}`;

  return (
    <Link className={cls} to={href}>
      {label ?? 'Open Messages inbox →'}
    </Link>
  );
}
