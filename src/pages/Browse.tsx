import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MicroBuildCard from '../components/MicroBuildCard';
import { mockListings } from '../data/mockListings';
import type { MicroBuildCategory } from '../types';
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

  const [activeCategory, setActiveCategory] = useState<MicroBuildCategory | 'All'>(initialCategory);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (categoryParam && (allCategories as string[]).includes(categoryParam)) {
      setActiveCategory(categoryParam as MicroBuildCategory);
    } else {
      setActiveCategory('All');
    }
  }, [categoryParam]);

  const filtered = mockListings.filter((l) => {
    const matchesCategory = activeCategory === 'All' || l.category === activeCategory;
    const matchesSearch =
      search === '' ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.targetIndustry.toLowerCase().includes(search.toLowerCase()) ||
      l.description.toLowerCase().includes(search.toLowerCase());
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

        {filtered.length > 0 ? (
          <div className="cards-grid">
            {filtered.map((listing) => (
              <MicroBuildCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="browse-empty">
            <p>No MicroBuilds match your search. Try a different keyword or filter.</p>
            <button className="btn btn-ghost btn-sm" onClick={() => { setActiveCategory('All'); setSearch(''); }}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
