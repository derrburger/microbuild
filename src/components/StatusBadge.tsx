import type { BuildStatus } from '../types';
import type { StatusDisplay } from '../lib/statusLabels';
import { statusPillClassName } from '../lib/statusLabels';

const CATALOG_STATUS: Record<BuildStatus, StatusDisplay> = {
  available: { label: 'Available', tone: 'success', color: '#00d478' },
  popular: { label: 'Popular', tone: 'info', color: '#63b3ed' },
  new: { label: 'New', tone: 'info', color: '#a78bfa' },
  'coming-soon': { label: 'Coming soon', tone: 'warning', color: '#f9b032' },
};

export default function StatusBadge({
  display,
  status,
  className = '',
  title,
}: {
  display?: StatusDisplay;
  status?: BuildStatus;
  className?: string;
  title?: string;
}) {
  const resolved =
    display ??
    (status ? CATALOG_STATUS[status] : { label: '—', tone: 'neutral' as const, color: '#8a94a6' });

  return (
    <span
      className={`${statusPillClassName(resolved.tone)} ${className}`.trim()}
      style={{ color: resolved.color, borderColor: `${resolved.color}55` }}
      title={title ?? resolved.label}
    >
      {resolved.label}
    </span>
  );
}
