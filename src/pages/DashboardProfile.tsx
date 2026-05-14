import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analyzeProfileStrength, getStrengthColor } from '../lib/profileAI';
import type { CreatorProfileRow } from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './DashboardProfile.css';

function safeArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

function tagsToArr(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean);
}
function arrToTags(a: string[]): string {
  return safeArr<string>(a).join(', ');
}

// Context from user_profiles for better "not found" messaging
interface UserProfileContext {
  accountType: string;
  applicationStatus: string | null;
}

const PROFILE_SELECT = [
  'id, user_id, auth_user_id, user_profile_id, creator_application_id',
  'display_name, full_name, profile_photo_url, slug, bio',
  'tier, verification_status, approval_status, subscription_status, public_profile_status',
  'badges, tools, niches, portfolio_links, credential_links, certifications, proof_links',
  'education_or_coursework, github_url, linkedin_url, case_studies',
  'portfolio_url, skills, available_hours, is_active',
  'completed_builds_count, average_rating, rating, builds_completed',
  'created_at, updated_at',
].join(', ');

function normalizeArrayFields(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };
  ['tools','niches','badges','portfolio_links','credential_links','certifications','proof_links','skills']
    .forEach(k => { if (!Array.isArray(result[k])) result[k] = []; });
  return result;
}

export default function DashboardProfile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]             = useState<CreatorProfileRow | null>(null);
  const [upContext, setUpContext]          = useState<UserProfileContext | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

  // Form fields
  const [displayName, setDisplayName]       = useState('');
  const [bio, setBio]                       = useState('');
  const [photoUrl, setPhotoUrl]             = useState('');
  const [tools, setTools]                   = useState('');
  const [niches, setNiches]                 = useState('');
  const [portfolioLinks, setPortfolioLinks] = useState('');
  const [githubUrl, setGithubUrl]           = useState('');
  const [linkedinUrl, setLinkedinUrl]       = useState('');
  const [availableHours, setAvailableHours] = useState('');
  const [certifications, setCertifications] = useState('');
  const [caseStudies, setCaseStudies]       = useState('');
  const [education, setEducation]           = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin', { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      // ── Step 1: Get user_profiles row for context + creator_profile_id ─────
      const { data: up } = await supabase
        .from('user_profiles')
        .select('account_type, creator_profile_id, creator_application_status')
        .eq('auth_user_id', user!.id)
        .maybeSingle();

      setUpContext({
        accountType:       (up as { account_type: string } | null)?.account_type ?? 'buyer',
        applicationStatus: (up as { creator_application_status: string | null } | null)?.creator_application_status ?? null,
      });

      let cpData: Record<string, unknown> | null = null;
      const cpId = (up as { creator_profile_id: string | null } | null)?.creator_profile_id;

      // ── Step 2a: Look up by creator_profile_id on user_profiles (most direct) ─
      if (cpId) {
        const { data } = await supabase
          .from('creator_profiles')
          .select(PROFILE_SELECT)
          .eq('id', cpId)
          .maybeSingle();
        cpData = data as Record<string, unknown> | null;
      }

      // ── Step 2b: Fall back — by auth_user_id on creator_profiles ────────────
      if (!cpData) {
        const { data } = await supabase
          .from('creator_profiles')
          .select(PROFILE_SELECT)
          .eq('auth_user_id', user!.id)
          .maybeSingle();
        cpData = data as Record<string, unknown> | null;
      }

      // ── Step 2c: Fall back — by legacy user_id on creator_profiles ──────────
      if (!cpData) {
        const { data } = await supabase
          .from('creator_profiles')
          .select(PROFILE_SELECT)
          .eq('user_id', user!.id)
          .maybeSingle();
        cpData = data as Record<string, unknown> | null;
      }

      if (cpData) {
        const normalized = normalizeArrayFields(cpData);
        const cp = normalized as unknown as CreatorProfileRow;
        setProfile(cp);
        setDisplayName(cp.display_name ?? cp.full_name ?? '');
        setBio(cp.bio ?? '');
        setPhotoUrl(cp.profile_photo_url ?? '');
        setTools(arrToTags(cp.tools));
        setNiches(arrToTags(cp.niches));
        setPortfolioLinks(arrToTags(cp.portfolio_links));
        setGithubUrl(cp.github_url ?? '');
        setLinkedinUrl(cp.linkedin_url ?? '');
        setAvailableHours(cp.available_hours ?? '');
        setCertifications(arrToTags(cp.certifications));
        setCaseStudies(cp.case_studies ?? '');
        setEducation(cp.education_or_coursework ?? '');
      }

      setLoading(false);
    }

    loadProfile();
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !user) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const updates = {
      display_name:             displayName.trim() || null,
      bio:                      bio.trim() || null,
      profile_photo_url:        photoUrl.trim() || null,
      tools:                    tagsToArr(tools),
      niches:                   tagsToArr(niches),
      portfolio_links:          tagsToArr(portfolioLinks),
      github_url:               githubUrl.trim() || null,
      linkedin_url:             linkedinUrl.trim() || null,
      available_hours:          availableHours.trim(),
      certifications:           tagsToArr(certifications),
      case_studies:             caseStudies.trim() || null,
      education_or_coursework:  education.trim() || null,
      updated_at:               new Date().toISOString(),
    };

    // Save by profile.id only — user_id may be null on admin-created profiles;
    // auth is enforced at the RLS policy level.
    const { error } = await supabase
      .from('creator_profiles')
      .update(updates)
      .eq('id', profile.id);

    if (error) {
      console.error('[DashboardProfile] save error:', error);
      setSaveError('Save failed: ' + (error.message ?? 'Unknown error'));
    } else {
      setSaved(true);
      // Update local state
      setProfile(prev => prev ? { ...prev, ...updates } as CreatorProfileRow : prev);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (authLoading || loading) {
    return (
      <div className="dp-page">
        <div className="dp-loading"><div className="dp-spinner" /><p>Loading profile…</p></div>
      </div>
    );
  }

  if (!profile) {
    const appStatus = upContext?.applicationStatus;
    const accountType = upContext?.accountType ?? 'buyer';

    // Determine the most helpful message based on real account state
    type NoProfileInfo = { icon: string; title: string; message: string; action: React.ReactNode };
    function getNoProfileInfo(): NoProfileInfo {
      if (accountType !== 'creator') {
        return {
          icon: '🏗️',
          title: 'Creator account not set up',
          message: 'Your account is not registered as a creator. Start by submitting a creator application.',
          action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Apply as a Creator →</Link>,
        };
      }
      if (!appStatus || appStatus === 'new' || appStatus === 'reviewing' || appStatus === 'needs_portfolio_review') {
        return {
          icon: '⏳',
          title: 'Application under review',
          message: 'Your creator application is in the review queue. Once approved, your editable profile will appear here.',
          action: <Link to="/dashboard" className="btn btn-primary btn-sm">View Application Status →</Link>,
        };
      }
      if (appStatus === 'needs_more_info') {
        return {
          icon: '💬',
          title: 'Admin requested more information',
          message: 'The MicroBuild team needs more details before creating your profile. Check your dashboard for specifics.',
          action: <Link to="/dashboard" className="btn btn-primary btn-sm">View Dashboard →</Link>,
        };
      }
      if (appStatus === 'approved_pending_payment') {
        return {
          icon: '✅',
          title: 'Approved — profile setup in progress',
          message: 'Your application was approved. Your creator profile is being set up. Check back shortly.',
          action: <Link to="/dashboard" className="btn btn-primary btn-sm">View Dashboard →</Link>,
        };
      }
      if (appStatus === 'active') {
        return {
          icon: '🔧',
          title: 'Profile needs to be created by admin',
          message: 'Your account is active but your creator profile hasn\'t been linked yet. Contact the MicroBuild team or ask your admin to create your profile from the admin panel.',
          action: <Link to="/dashboard" className="btn btn-ghost btn-sm">Back to Dashboard</Link>,
        };
      }
      if (appStatus === 'rejected') {
        return {
          icon: '❌',
          title: 'Application not approved',
          message: 'Your creator application was not approved. You are welcome to reapply as your portfolio grows.',
          action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Reapply →</Link>,
        };
      }
      if (appStatus === 'suspended') {
        return {
          icon: '⊘',
          title: 'Account suspended',
          message: 'Your creator account is suspended. Contact MicroBuild support for assistance.',
          action: <Link to="/dashboard" className="btn btn-ghost btn-sm">Back to Dashboard</Link>,
        };
      }
      return {
        icon: '⏳',
        title: 'Profile not available yet',
        message: 'Your creator profile will be set up by the MicroBuild team after your application is approved.',
        action: <Link to="/creators/apply" className="btn btn-primary btn-sm">Submit / Check Application →</Link>,
      };
    }

    const info = getNoProfileInfo();
    return (
      <div className="dp-page">
        <div className="container dp-no-profile">
          <div className="dp-no-profile-icon">{info.icon}</div>
          <h2>{info.title}</h2>
          <p>{info.message}</p>
          {info.action}
          <Link to="/dashboard" className="dp-back-link">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const strength    = analyzeProfileStrength(profile);
  const scoreColor  = getStrengthColor(strength.score);
  const safeArrInner = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : [];
  const safeStrInner = (v: unknown) => typeof v === 'string' ? v : '';

  // Public readiness label
  const readinessLabel =
    strength.score >= 80 ? 'Public-ready'         :
    strength.score >= 65 ? 'Ready for public review' :
    strength.score >= 45 ? 'Almost ready'          :
    strength.score >= 25 ? 'Needs work'            :
                           'Not ready';
  const readinessColor =
    strength.score >= 80 ? '#00d478' :
    strength.score >= 65 ? '#63b3ed' :
    strength.score >= 45 ? '#f9b032' : '#ef4444';

  // Missing profile fields checklist
  const profileFields = [
    { label: 'Display name',               done: !!safeStrInner(profile.display_name) },
    { label: 'Bio (80+ characters)',        done: safeStrInner(profile.bio).length >= 80 },
    { label: 'Tools & platforms',           done: safeArrInner(profile.tools).length > 0 },
    { label: 'Industry niches',             done: safeArrInner(profile.niches).length > 0 },
    { label: 'Portfolio links',             done: safeArrInner(profile.portfolio_links).length > 0 },
    { label: 'GitHub or LinkedIn',          done: !!safeStrInner(profile.github_url) || !!safeStrInner(profile.linkedin_url) },
    { label: 'Proof / certifications',      done: safeArrInner(profile.certifications).length > 0 },
    { label: 'Weekly availability',         done: !!safeStrInner(profile.available_hours) },
  ];
  const completeFields = profileFields.filter((f) => f.done).length;

  return (
    <div className="dp-page">
      <div className="dp-header">
        <div className="container">
          <Link to="/dashboard" className="dp-back-link">← Dashboard</Link>
          <div className="dp-header-row">
            <div>
              <h1 className="dp-title">Edit Profile</h1>
              <p className="dp-sub">Changes save to your creator profile on MicroBuild.</p>
            </div>
            <div className="dp-header-score" style={{ color: scoreColor }}>
              <span className="dp-score-num">{strength.score}</span>
              <span className="dp-score-label">Profile Strength</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container dp-body">
        <DashboardNav />

        {/* ── Admin visibility notice ────────────────────────────── */}
        <div className="dp-admin-notice">
          <span className="dp-admin-notice-icon">ℹ</span>
          <span>
            Your profile content can be edited here, but <strong>public visibility and verification
            are controlled by the MicroBuild admin team.</strong> Saving does not automatically
            make your profile public.
          </span>
        </div>

        {/* ── Status bar ────────────────────────────────────────── */}
        <div className="dp-status-bar">
          <div className="dp-status-item">
            <span className="dp-status-key">Tier</span>
            <span className="dp-status-val">
              {profile.tier ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1) : 'Free'}
            </span>
          </div>
          <div className="dp-status-item">
            <span className="dp-status-key">Approval</span>
            <span className="dp-status-val">
              {(profile.approval_status ?? 'draft').replace(/_/g, ' ')}
            </span>
          </div>
          <div className="dp-status-item">
            <span className="dp-status-key">Visibility</span>
            <span className="dp-status-val" style={{ color: profile.public_profile_status === 'public' ? '#00d478' : '#8a94a6' }}>
              {profile.public_profile_status === 'public' ? '🟢 Public' : '🔴 ' + (profile.public_profile_status ?? 'hidden')}
            </span>
          </div>
          <div className="dp-status-item">
            <span className="dp-status-key">Public Readiness</span>
            <span className="dp-status-val" style={{ color: readinessColor }}>{readinessLabel}</span>
          </div>
        </div>

        {/* ── Two-column profile layout: strength + preview + form ─ */}
        <div className="dp-profile-layout">

          {/* Left: form */}
          <div className="dp-profile-main">

            {/* ── Missing info checklist ──────────────────────────── */}
            {completeFields < profileFields.length && (
              <div className="dp-missing-checklist">
                <div className="dp-missing-header">
                  <h3 className="dp-missing-title">Profile Completeness</h3>
                  <span className="dp-missing-progress" style={{ color: scoreColor }}>
                    {completeFields}/{profileFields.length} complete
                  </span>
                </div>
                <div className="dp-missing-items">
                  {profileFields.map((f) => (
                    <div key={f.label} className={`dp-missing-item${f.done ? ' dp-missing-item--done' : ''}`}>
                      <span className="dp-missing-check">{f.done ? '✓' : '○'}</span>
                      {f.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

        <form className="dp-form" onSubmit={handleSave}>
          {/* Identity */}
          <div className="dp-section">
            <h2 className="dp-section-title">Identity</h2>
            <div className="dp-field-grid">
              <div className="dp-field">
                <label className="dp-label">Display Name</label>
                <input className="dp-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your public name" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Profile Photo URL</label>
                <input className="dp-input" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://…" type="url" />
              </div>
            </div>
            <div className="dp-field">
              <label className="dp-label">Bio <span className="dp-label-hint">(shown on your public profile)</span></label>
              <textarea className="dp-textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Describe your experience and what you build…" rows={4} />
              <span className="dp-char-count">{bio.length} chars — aim for 80+</span>
            </div>
          </div>

          {/* Expertise */}
          <div className="dp-section">
            <h2 className="dp-section-title">Expertise</h2>
            <div className="dp-field">
              <label className="dp-label">Tools & Platforms <span className="dp-label-hint">(comma-separated)</span></label>
              <input className="dp-input" value={tools} onChange={e => setTools(e.target.value)} placeholder="GoHighLevel, Webflow, Make.com, Zapier…" />
            </div>
            <div className="dp-field">
              <label className="dp-label">Industry Niches <span className="dp-label-hint">(comma-separated)</span></label>
              <input className="dp-input" value={niches} onChange={e => setNiches(e.target.value)} placeholder="Pool cleaning, HVAC, Landscaping, Auto detailing…" />
            </div>
            <div className="dp-field">
              <label className="dp-label">Certifications <span className="dp-label-hint">(comma-separated)</span></label>
              <input className="dp-input" value={certifications} onChange={e => setCertifications(e.target.value)} placeholder="Google Analytics Certified, HubSpot…" />
            </div>
          </div>

          {/* Portfolio */}
          <div className="dp-section">
            <h2 className="dp-section-title">Portfolio & Proof</h2>
            <div className="dp-field">
              <label className="dp-label">Portfolio Links <span className="dp-label-hint">(comma-separated URLs)</span></label>
              <input className="dp-input" value={portfolioLinks} onChange={e => setPortfolioLinks(e.target.value)} placeholder="https://example.com, https://…" />
            </div>
            <div className="dp-field">
              <label className="dp-label">GitHub URL</label>
              <input className="dp-input" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/yourname" type="url" />
            </div>
            <div className="dp-field">
              <label className="dp-label">LinkedIn URL</label>
              <input className="dp-input" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" type="url" />
            </div>
            <div className="dp-field">
              <label className="dp-label">Case Studies <span className="dp-label-hint">(describe specific projects with results)</span></label>
              <textarea className="dp-textarea" value={caseStudies} onChange={e => setCaseStudies(e.target.value)} placeholder="Built a quote funnel for XYZ Pool Service — 3× more leads in first month…" rows={3} />
            </div>
            <div className="dp-field">
              <label className="dp-label">Education & Coursework</label>
              <input className="dp-input" value={education} onChange={e => setEducation(e.target.value)} placeholder="B.S. Computer Science, Udemy Web Dev Bootcamp…" />
            </div>
          </div>

          {/* Availability */}
          <div className="dp-section">
            <h2 className="dp-section-title">Availability</h2>
            <div className="dp-field">
              <label className="dp-label">Weekly Availability</label>
              <input className="dp-input" value={availableHours} onChange={e => setAvailableHours(e.target.value)} placeholder="e.g. 10–20 hrs/week, weekdays only…" />
            </div>
          </div>

          {/* Save */}
          {saveError && <p className="dp-error">{saveError}</p>}
          {saved && <p className="dp-saved">✓ Profile saved successfully</p>}

          <div className="dp-form-footer">
            <button type="submit" className="dp-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>

          </div>{/* /dp-profile-main */}

          {/* Right: strength breakdown + public preview */}
          <div className="dp-profile-sidebar">

            {/* Profile Strength Breakdown */}
            <div className="dp-strength-breakdown">
              <h3 className="dp-sidebar-title">Profile Strength Breakdown</h3>
              <div className="dp-breakdown-score" style={{ color: scoreColor }}>
                <span className="dp-breakdown-num">{strength.score}</span>
                <span className="dp-breakdown-label">/ 100 — {strength.label}</span>
              </div>
              <div className="dp-breakdown-bar-track">
                <div className="dp-breakdown-bar-fill" style={{ width: `${strength.score}%`, background: scoreColor }} />
              </div>
              <div className="dp-breakdown-categories">
                {Object.entries(strength.sections).map(([cat, val]) => (
                  <div key={cat} className="dp-breakdown-cat-row">
                    <span className="dp-breakdown-cat-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    <div className="dp-breakdown-cat-bar">
                      <div className="dp-breakdown-cat-fill" style={{ width: `${val}%`, background: getStrengthColor(val) }} />
                    </div>
                    <span className="dp-breakdown-cat-pct" style={{ color: getStrengthColor(val) }}>{val}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Public Profile Preview */}
            <div className="dp-profile-preview">
              <h3 className="dp-sidebar-title">Public Profile Preview</h3>
              <p className="dp-preview-notice">How you'll appear in the creator directory</p>
              <div className="dp-preview-card">
                <div className="dp-preview-avatar">
                  {profile.profile_photo_url
                    ? <img src={profile.profile_photo_url} alt="" className="dp-preview-avatar-img" />
                    : <span className="dp-preview-avatar-initials">
                        {safeStrInner(profile.display_name || profile.full_name || '?').slice(0, 2).toUpperCase()}
                      </span>
                  }
                </div>
                <div className="dp-preview-info">
                  <div className="dp-preview-name">
                    {safeStrInner(profile.display_name || profile.full_name) || 'Display Name Not Set'}
                  </div>
                  <div className="dp-preview-badges">
                    {profile.tier && (
                      <span className="dp-preview-tier-badge">{profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)}</span>
                    )}
                    {profile.verification_status === 'verified' && (
                      <span className="dp-preview-verified-badge">✓ Verified</span>
                    )}
                  </div>
                </div>
                {profile.bio && (
                  <p className="dp-preview-bio">
                    {safeStrInner(profile.bio).slice(0, 120)}{safeStrInner(profile.bio).length > 120 ? '…' : ''}
                  </p>
                )}
                {!profile.bio && (
                  <p className="dp-preview-bio dp-preview-bio--empty">No bio yet — add one to strengthen your profile.</p>
                )}
                {safeArrInner<string>(profile.tools).length > 0 && (
                  <div className="dp-preview-chips">
                    {safeArrInner<string>(profile.tools).slice(0, 4).map((t) => (
                      <span key={t} className="dp-preview-chip">{t}</span>
                    ))}
                  </div>
                )}
                {safeArrInner<string>(profile.niches).length > 0 && (
                  <div className="dp-preview-chips dp-preview-chips--niches">
                    {safeArrInner<string>(profile.niches).slice(0, 3).map((n) => (
                      <span key={n} className="dp-preview-chip dp-preview-chip--niche">{n}</span>
                    ))}
                  </div>
                )}
                {safeArrInner<string>(profile.portfolio_links).length > 0 && (
                  <div className="dp-preview-links">
                    {safeArrInner<string>(profile.portfolio_links).slice(0, 2).map((link) => (
                      <a key={link} href={link} className="dp-preview-link" target="_blank" rel="noopener noreferrer">
                        Portfolio ↗
                      </a>
                    ))}
                  </div>
                )}
                <div className="dp-preview-readiness" style={{ color: readinessColor }}>
                  {readinessLabel}
                </div>
              </div>
            </div>

          </div>{/* /dp-profile-sidebar */}

        </div>{/* /dp-profile-layout */}

      </div>
    </div>
  );
}
