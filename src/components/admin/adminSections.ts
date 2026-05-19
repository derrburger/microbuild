/** Top-level admin dashboard sections (one visible at a time). */
export type AdminSectionId =
  | 'command'
  | 'buyers'
  | 'creators'
  | 'marketplace'
  | 'pipeline'
  | 'deliverables'
  | 'workflows'
  | 'messages'
  | 'health'
  | 'deferred';

export const ADMIN_SECTIONS: { id: AdminSectionId; label: string; hint: string }[] = [
  { id: 'command', label: 'AI Command Center', hint: 'Rules-based ops overview' },
  { id: 'buyers', label: 'Buyer Requests', hint: 'Request queue & review' },
  { id: 'creators', label: 'Creator Applications', hint: 'Account approval queue' },
  { id: 'marketplace', label: 'Marketplace Applications', hint: 'Creators applying to requests' },
  { id: 'pipeline', label: 'Projects / Pipeline', hint: 'Orders & workspace' },
  { id: 'deliverables', label: 'Deliverables', hint: 'Delivery review' },
  { id: 'workflows', label: 'Published Workflows', hint: 'AI oversight & overrides' },
  { id: 'messages', label: 'Messages', hint: 'Conversations (placeholder)' },
  { id: 'health', label: 'Platform Health', hint: 'Counts & warnings' },
  { id: 'deferred', label: 'Later: Proposals', hint: 'Deferred pricing workflow' },
];
