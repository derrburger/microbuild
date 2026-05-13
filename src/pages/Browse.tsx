import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MicroBuildCard from '../components/MicroBuildCard';
import { fetchTemplates } from '../lib/templates';
import type { MicroBuildListing, MicroBuildCategory } from '../types';
import './Browse.css';

const allCategories: MicroBuildCategory[] = [
  'Quote Funnel',
  'Package Selector',
  'Review Booster',
  'Trust Page',
  'Booking Page',
];

export default function Browse() {
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');

  const initialCategory: MicroBuildCategory | 'All' =
    categoryParam && (allCategories as string[]).includes(categoryParam)
      ? (categoryParam as MicroBuildCategory)
      : 'All';

  const [activeCategory, setActiveCategory] =
    useState<MicroBuildCategory | 'All'>(initialCategory);
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState<MicroBuildListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  // Sync category filter with URL params
  useEffect(() => {
    if (categoryParam && (allCategories as string[]).includes(categoryParam)) {
      setActiveCategory(categoryParam as MicroBuildCategory);
    } else {
      setActiveCategory('All');
    }
  }, [categoryParam]);

  // Fetch templates on mount
  useEffect(() => {
    setLoading(true);
    fetchTemplates()
      .then(({ listings: data, fromSupabase }) => {
        setListings(data);
        setUsingMock(!fromSupabase);
      })
      .catch(() => {
        setUsingMock(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = listings.filter((l) => {
    const matchesCategory =
      activeCategory === 'All' || l.category === activeCategory;
    const q = search.toLowerCase();
    const matchesSearch =
      q === '' ||
      l.title.toLowerCase().includes(q) ||
      l.targetIndustry.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="browse-page">
      <div className="browse-hero">
        <div className="container">
          <h1 className="browse-title">Browse MicroBuilds</h1>
          <p className="browse-sub">
            Focused revenue tools for local service businesses. Filter by type or search by trade.
          </p>
        </div>
      </div>

      <div className="container browse-body">
        {usingMock && !loading && (
          <div className="browse-mock-notice">
            Showing sample listings — live data unavailable. Check your Supabase connection and RLS policies.
          </div>
        )}

        <div className="browse-controls">
          <div className="browse-filters">
            <button
              className={`filter-btn${activeCategory === 'All' ? ' active' : ''}`}
              onClick={() => setActiveCategory('All')}
            >
              All Builds
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                className={`filter-btn${activeCategory === cat ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            className="browse-search"
            type="text"
            placeholder="Search by trade or keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="browse-loading">
            <div className="cards-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="card-skeleton" />
              ))}
            </div>
          </div>
        ) : filtered.length > 0 ? (
          <div className="cards-grid">
            {filtered.map((listing) => (
              <MicroBuildCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="browse-empty">
            <p>No MicroBuilds match your search. Try a different keyword or filter.</p>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setActiveCategory('All');
                setSearch('');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
