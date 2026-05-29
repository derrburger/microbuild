/**
 * @deprecated Use BuyerMyRequestsPanel — kept for script/import compatibility.
 */
import BuyerMyRequestsPanel from './buyer/BuyerMyRequestsPanel';
import type { BuyerRequestSnap } from './buyer/BuyerMyRequestsPanel';
import type { UserProfileRow } from '../types/database';
import type { OrderPipelineRow, DeliverablePlaceholder } from '../lib/orders';

export type { BuyerRequestSnap as BuyerRequestMarketplaceBrief };

interface Props {
  buyerProfile: UserProfileRow;
  requests: BuyerRequestSnap[];
  ordersByRequestId: Record<string, OrderPipelineRow>;
  deliverablesByOrderId?: Record<string, DeliverablePlaceholder | null | undefined>;
  onMarketplaceEvent?: () => void | Promise<void>;
}

export default function MarketplaceApplicantsPanel({
  buyerProfile,
  requests,
  ordersByRequestId,
  deliverablesByOrderId = {},
  onMarketplaceEvent,
}: Props) {
  return (
    <BuyerMyRequestsPanel
      buyerProfile={buyerProfile}
      requests={requests}
      ordersByRequestId={ordersByRequestId}
      deliverablesByOrderId={deliverablesByOrderId}
      onRefresh={onMarketplaceEvent}
    />
  );
}
