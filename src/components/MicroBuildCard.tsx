import { Link } from 'react-router-dom';
import type { MicroBuildListing } from '../types';
import StatusBadge from './StatusBadge';
import './MicroBuildCard.css';

interface Props {
  listing: MicroBuildListing;
}

const categoryIcons: Record<string, string> = {
  'Quote Funnel': '⚡',
  'Booking Page': '📅',
  'Review Booster': '⭐',
  'Trust Page': '📸',
  'Package Selector': '🎯',
};

export default function MicroBuildCard({ listing }: Props) {
  return (
    <Link to={`/builds/${listing.slug}`} className="microbuild-card">
      <div className="card-header">
        <div className="card-icon">{categoryIcons[listing.category] ?? '🔧'}</div>
        <StatusBadge status={listing.status} />
      </div>

      <div className="card-body">
        <span className="card-category">{listing.category}</span>
        <h3 className="card-title">{listing.title}</h3>
        <p className="card-description">{listing.description.slice(0, 120)}…</p>

        <div className="card-meta">
          <span className="card-industry">🏷 {listing.targetIndustry}</span>
          <span className="card-turnaround">⏱ {listing.estimatedTurnaround}</span>
        </div>
      </div>

      <div className="card-footer">
        <span className="card-price">
          From <strong>${listing.startingPrice}</strong>
        </span>
        <span className="card-cta">View Details →</span>
      </div>
    </Link>
  );
}
