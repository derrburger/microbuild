import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeCreatorProfile, getCreatorTierLabel, getCreatorBadges } from '../lib/profiles';
import type { CreatorProfileRow } from '../types/database';
import './CreatorDirectory.css';

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function CreatorCard({ profile }: { profile: CreatorProfileRow }) {
  const name    = profile.display_name ?? profile.full_name;
  const initials = name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
  const tierLabel = getCreatorTierLabel(profile.tier);
  const badges    = getCreatorBadges(profile);

  const tierColors: Record<string, string> = {
    free:         '#8a94a6',
    professional: '#63b3ed',
    verified:     '#f9b032',
  };
  const tColor = tierColors[profile.tier] ?? '#8a94a6';

  return (
    <Link
      to={`/creator/${profile.id}`}
      className="creator-dir-card"
      aria-label={`View ${name}'s profile`}
    >
      <div className="cdc-avatar">{initials}</div>

      <div className="cdc-body">
        <div className="cdc-name">{name}</div>

        <div className="cdc-badges">
          <span
            className="cdc-tier"
            style={{ color: tColor, borderColor: tColor + '55', backgroundColor: tColor + '12' }}
          >
            {tierLabel}
          </span>
          {profile.verification_status === 'verified' && (
            <span className="cdc-verified">Verified ✓</span>
          )}
          {badges.slice(1).map((b) => (
            <span key={b} className="cdc-badge">{b}</span>
          ))}
        </div>

        {safeArr<string>(profile.tools).length > 0 && (
          <div className="cdc-chips">
            {safeArr<string>(profile.tools).slice(0, 5).map((t) => (
              <span key={t} className="cdc-chip">{t}</span>
            ))}
            {safeArr<string>(profile.tools).length > 5 && (
              <span className="cdc-chip cdc-chip--more">+{safeArr<string>(profile.tools).length - 5}</span>
            )}
          </div>
        )}

        {safeArr<string>(profile.niches).length > 0 && (
          <div className="cdc-niches">
            {safeArr<string>(profile.niches).slice(0, 3).join(' · ')}
          </div>
        )}

        {profile.completed_builds_count > 0 && (
          <div className="cdc-meta">
            {profile.completed_builds_count} build{profile.completed_builds_count !== 1 ? 's' : ''} completed
            {profile.average_rating != null && profile.average_rating > 0 && (
              <span> · {profile.average_rating.toFixed(1)} ★</span>
            )}
          </div>
        )}
      </div>

      <div className="cdc-arrow">→</div>
    </Link>
  );
}

export default function CreatorDirectory() {
  const [profiles, setProfiles] = useState<CreatorProfileRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    // Explicit column list intentionally excludes admin-only fields:
    // admin_notes, ai_profile_score, ai_profile_summary
    supabase
      .from('creator_profiles')
      .select('id, user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
      .eq('public_profile_status', 'public')
      .order('completed_builds_count', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          console.error('[CreatorDirectory] fetch:', err);
          setError(true);
        } else {
          setProfiles(
            ((data ?? []) as Record<string, unknown>[]).map(normalizeCreatorProfile),
          );
        }
        setLoading(false);
      });
  }, []);

  return (
    <div className="creator-dir-page">
      <div className="creator-dir-hero">
        <div className="container">
          <div className="creator-dir-eyebrow">MicroBuild Creators</div>
          <h1 className="creator-dir-title">Find Your Builder</h1>
          <p className="creator-dir-sub">
            Browse approved MicroBuild creators. Every creator has been reviewed by our team
            and is ready to deliver focused, conversion-optimized builds for local service businesses.
          </p>
        </div>
      </div>

      <div className="container creator-dir-body">
        {loading && (
          <div className="creator-dir-state">
            <div className="creator-dir-spinner" />
            <p>Loading creators…</p>
          </div>
        )}

        {!loading && error && (
          <div className="creator-dir-state creator-dir-error">
            <p>Unable to load creators right now. Please try again later.</p>
          </div>
        )}

        {!loading && !error && profiles.length === 0 && (
          <div className="creator-dir-coming-soon">
            <div className="coming-soon-icon">🛠</div>
            <h2>Creator directory coming soon</h2>
            <p>
              Creators are currently being reviewed and onboarded. Check back soon — the first
              approved creators will appear here once their profiles are activated.
            </p>
            <div className="coming-soon-actions">
              <Link to="/creators/apply" className="btn btn-primary btn-sm">
                Apply as a Creator →
              </Link>
              <Link to="/browse" className="btn btn-ghost btn-sm">
                Browse MicroBuilds
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && profiles.length > 0 && (
          <>
            <div className="creator-dir-count">
              {profiles.length} active creator{profiles.length !== 1 ? 's' : ''}
            </div>
            <div className="creator-dir-grid">
              {profiles.map((p) => (
                <CreatorCard key={p.id} profile={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
