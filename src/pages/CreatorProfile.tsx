import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeCreatorProfile, getCreatorTierLabel, getCreatorBadges } from '../lib/profiles';
import type { CreatorProfileRow } from '../types/database';
import './CreatorProfile.css';

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const TIER_COLORS: Record<string, string> = {
  free:         '#8a94a6',
  professional: '#63b3ed',
  verified:     '#f9b032',
};

export default function CreatorProfile() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<CreatorProfileRow | null>(null);
  const [loading, setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    // Explicit column list intentionally excludes admin-only fields:
    // admin_notes, ai_profile_score, ai_profile_summary
    supabase
      .from('creator_profiles')
      .select('id, user_id, creator_application_id, display_name, full_name, profile_photo_url, slug, bio, tier, verification_status, approval_status, subscription_status, public_profile_status, badges, tools, niches, portfolio_links, credential_links, certifications, proof_links, education_or_coursework, github_url, linkedin_url, case_studies, portfolio_url, skills, available_hours, is_active, completed_builds_count, average_rating, rating, builds_completed, created_at, updated_at')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('[CreatorProfile] fetch:', error);
          setNotFound(true);
        } else {
          const p = normalizeCreatorProfile(data as Record<string, unknown>);
          // Only show publicly visible profiles
          if (p.public_profile_status !== 'public') {
            setNotFound(true);
          } else {
            setProfile(p);
          }
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="cp-page">
        <div className="container cp-loading">
          <div className="cp-spinner" />
          <p>Loading profile…</p>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="cp-page">
        <div className="container cp-notfound">
          <div className="cp-nf-icon">🔒</div>
          <h2>Profile Not Available</h2>
          <p>
            This creator profile is either hidden, pending review, or does not exist.
            Public profiles are only visible after admin approval and activation.
          </p>
          <div className="cp-nf-actions">
            <Link to="/creators" className="btn btn-ghost btn-sm">Creator Directory</Link>
            <Link to="/browse" className="btn btn-ghost btn-sm">Browse MicroBuilds</Link>
          </div>
        </div>
      </div>
    );
  }

  const name       = profile.display_name ?? profile.full_name;
  const initials   = name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
  const tierLabel  = getCreatorTierLabel(profile.tier);
  const tierColor  = TIER_COLORS[profile.tier] ?? '#8a94a6';
  const badges     = getCreatorBadges(profile);
  const tools      = safeArr<string>(profile.tools);
  const niches     = safeArr<string>(profile.niches);
  const portfolios = safeArr<string>(profile.portfolio_links);

  return (
    <div className="cp-page">
      {/* Hero */}
      <div className="cp-hero">
        <div className="container">
          <Link to="/creators" className="cp-back">← Creator Directory</Link>
          <div className="cp-header">
            <div className="cp-avatar">{initials}</div>
            <div className="cp-header-info">
              <h1 className="cp-name">{name}</h1>
              <div className="cp-badges">
                <span
                  className="cp-tier-badge"
                  style={{ color: tierColor, borderColor: tierColor + '55', backgroundColor: tierColor + '12' }}
                >
                  {tierLabel}
                </span>
                {profile.verification_status === 'verified' && (
                  <span className="cp-verified-badge">Verified ✓</span>
                )}
                {badges.slice(1).map((b) => (
                  <span key={b} className="cp-badge">{b}</span>
                ))}
              </div>
              {profile.completed_builds_count > 0 && (
                <div className="cp-stats">
                  <span>{profile.completed_builds_count} build{profile.completed_builds_count !== 1 ? 's' : ''} completed</span>
                  {profile.average_rating != null && profile.average_rating > 0 && (
                    <span>· {profile.average_rating.toFixed(1)} ★ avg rating</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="container cp-body">
        <div className="cp-grid">

          {/* Main content */}
          <div className="cp-main">
            {profile.bio && (
              <section className="cp-section">
                <h2 className="cp-section-title">About</h2>
                <p className="cp-bio">{profile.bio}</p>
              </section>
            )}

            {tools.length > 0 && (
              <section className="cp-section">
                <h2 className="cp-section-title">Tools & Platforms</h2>
                <div className="cp-chips">
                  {tools.map((t) => <span key={t} className="cp-chip">{t}</span>)}
                </div>
              </section>
            )}

            {niches.length > 0 && (
              <section className="cp-section">
                <h2 className="cp-section-title">Industry Specializations</h2>
                <div className="cp-chips">
                  {niches.map((n) => <span key={n} className="cp-chip cp-chip--niche">{n}</span>)}
                </div>
              </section>
            )}

            {safeArr<string>(profile.certifications).length > 0 && (
              <section className="cp-section">
                <h2 className="cp-section-title">Certifications</h2>
                <ul className="cp-cert-list">
                  {safeArr<string>(profile.certifications).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            {profile.education_or_coursework && (
              <section className="cp-section">
                <h2 className="cp-section-title">Education & Coursework</h2>
                <p className="cp-text">{profile.education_or_coursework}</p>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="cp-sidebar">
            {/* Quick facts */}
            <div className="cp-sidebar-card">
              <h3 className="cp-sidebar-title">Quick Info</h3>
              {profile.available_hours && (
                <div className="cp-fact">
                  <span className="cp-fact-label">Availability</span>
                  <span>{profile.available_hours}</span>
                </div>
              )}
              <div className="cp-fact">
                <span className="cp-fact-label">Tier</span>
                <span style={{ color: tierColor }}>{tierLabel}</span>
              </div>
              {profile.verification_status === 'verified' && (
                <div className="cp-fact">
                  <span className="cp-fact-label">Verification</span>
                  <span style={{ color: '#f9b032' }}>Verified ✓</span>
                </div>
              )}
            </div>

            {/* Portfolio links */}
            {portfolios.length > 0 && (
              <div className="cp-sidebar-card">
                <h3 className="cp-sidebar-title">Portfolio</h3>
                <div className="cp-link-list">
                  {portfolios.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      className="cp-ext-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Portfolio Example {i + 1} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Professional links */}
            {(profile.github_url || profile.linkedin_url) && (
              <div className="cp-sidebar-card">
                <h3 className="cp-sidebar-title">Profiles</h3>
                <div className="cp-link-list">
                  {profile.github_url && (
                    <a href={profile.github_url} className="cp-ext-link" target="_blank" rel="noopener noreferrer">
                      GitHub ↗
                    </a>
                  )}
                  {profile.linkedin_url && (
                    <a href={profile.linkedin_url} className="cp-ext-link" target="_blank" rel="noopener noreferrer">
                      LinkedIn ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="cp-sidebar-card cp-cta-card">
              <p className="cp-cta-text">
                Want to work with {name.split(' ')[0]}? Submit a buyer request and we'll match you.
              </p>
              <Link to="/request" className="btn btn-primary btn-sm cp-cta-btn">
                Request a Build →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
