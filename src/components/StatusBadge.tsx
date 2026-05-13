import type { BuildStatus } from '../types';
import './StatusBadge.css';

const labels: Record<BuildStatus, string> = {
  available: 'Available',
  popular: 'Popular',
  new: 'New',
  'coming-soon': 'Coming Soon',
};

interface Props {
  status: BuildStatus;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {labels[status]}
    </span>
  );
}
