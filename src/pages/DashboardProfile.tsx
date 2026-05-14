import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analyzeProfileStrength, getStrengthColor } from '../lib/profileAI';
import type { CreatorProfileRow } from '../types/database';
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

  const strength = analyzeProfileStrength(profile);
  const scoreColor = getStrengthColor(strength.score);

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
        {/* Status bar */}
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
            <span className="dp-status-val">{profile.public_profile_status}</span>
          </div>
          {profile.public_profile_status !== 'public' && (
            <span className="dp-visibility-note">
              Profile is hidden until admin activates it.
            </span>
          )}
        </div>

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
            <p className="dp-visibility-reminder">
              Visibility is controlled by the admin team. Saving here does not automatically make your profile public.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
