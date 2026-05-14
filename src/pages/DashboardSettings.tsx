import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserProfileRow } from '../types/database';
import DashboardNav from '../components/DashboardNav';
import './DashboardSettings.css';

export default function DashboardSettings() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]         = useState<UserProfileRow | null>(null);
  const [loading, setLoading]         = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [githubUrl, setGithubUrl]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/signin', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data as UserProfileRow);
          const raw = data as unknown as Record<string, unknown>;
          setDisplayName(typeof raw.display_name === 'string' ? raw.display_name : '');
          setGithubUrl(typeof raw.github_url === 'string' ? raw.github_url : '');
        }
        setLoading(false);
      });
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const updates: Record<string, unknown> = {
      display_name: displayName.trim() || null,
      github_url:   githubUrl.trim()   || null,
      updated_at:   new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('auth_user_id', user.id);

    if (error) {
      setSaveError('Save failed: ' + (error.message ?? 'Unknown'));
    } else {
      setSaved(true);
      setProfile(prev => prev ? { ...prev, display_name: displayName.trim() || null } : prev);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/signin');
  }

  if (authLoading || loading) {
    return (
      <div className="ds-page">
        <div className="ds-loading"><div className="ds-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="ds-page">
      <div className="ds-header">
        <div className="container">
          <Link to="/dashboard" className="ds-back">← Dashboard</Link>
          <h1 className="ds-title">Settings</h1>
        </div>
      </div>

      <div className="container ds-body">
        <DashboardNav />

        {/* ── Account info ──────────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Account</h2>
          <div className="ds-account-row">
            <div className="ds-account-avatar">
              {(user?.email ?? 'A').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="ds-email">{user?.email ?? '—'}</div>
              <div className="ds-email-note">Email is read-only. Contact support to change it.</div>
              {profile?.account_type && (
                <div className="ds-role-badge">{profile.account_type}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Profile settings ───────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Profile</h2>
          <form className="ds-form" onSubmit={handleSave}>
            <div className="ds-field">
              <label className="ds-label" htmlFor="ds-displayname">Display Name</label>
              <input
                id="ds-displayname"
                className="ds-input"
                type="text"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setSaved(false); }}
                placeholder="How you appear on MicroBuild"
              />
            </div>

            <div className="ds-field">
              <label className="ds-label" htmlFor="ds-github">
                GitHub Profile URL{' '}
                <span className="ds-label-hint">(optional — shown on your public creator profile)</span>
              </label>
              <input
                id="ds-github"
                className="ds-input"
                type="url"
                value={githubUrl}
                onChange={e => { setGithubUrl(e.target.value); setSaved(false); }}
                placeholder="https://github.com/yourname"
              />
              <span className="ds-field-note">
                This is a plain link, not OAuth. GitHub sign-in is coming after domain setup.
              </span>
            </div>

            {saveError && <p className="ds-error">{saveError}</p>}
            {saved && <p className="ds-saved">✓ Saved</p>}
            <button type="submit" className="ds-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>

          {profile?.account_type === 'creator' && (
            <p className="ds-creator-tip">
              Creator profile fields (bio, tools, niches, portfolio, LinkedIn, etc.) are in the{' '}
              <Link to="/dashboard/profile" className="ds-link">Profile Editor →</Link>
            </p>
          )}
        </div>

        {/* ── Privacy ────────────────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Privacy</h2>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Profile visibility</span>
            <span className="ds-placeholder-note">
              {profile?.account_type === 'creator'
                ? 'Creator profile visibility is controlled by the admin team. Edit your profile to request changes.'
                : 'Buyer profiles are private by default.'
              }
            </span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Email notifications</span>
            <span className="ds-placeholder-note">Coming soon — requires notification system</span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Data export</span>
            <span className="ds-placeholder-note">Coming soon</span>
          </div>
        </div>

        {/* ── GitHub connection (coming soon) ─────────────────────── */}
        <div className="ds-section ds-github-section">
          <h2 className="ds-section-title">GitHub Connection</h2>
          <div className="ds-github-deferred-box">
            <div className="ds-github-deferred-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="ds-github-deferred-title">GitHub sign-in coming soon</div>
              <p className="ds-github-deferred-desc">
                GitHub OAuth will be added after MicroBuild's production domain is
                configured. For now, add your GitHub URL above to display it on your
                creator profile.
              </p>
            </div>
          </div>
        </div>

        {/* ── Danger zone ────────────────────────────────────────── */}
        <div className="ds-section ds-danger-section">
          <h2 className="ds-section-title ds-danger-title">Danger Zone</h2>
          <div className="ds-danger-row">
            <div>
              <div className="ds-danger-label">Sign Out</div>
              <div className="ds-danger-sub">Sign out of your MicroBuild account on this device.</div>
            </div>
            <button className="ds-signout-btn" onClick={handleSignOut}>Sign Out</button>
          </div>
          <div className="ds-danger-row">
            <div>
              <div className="ds-danger-label">Delete Account</div>
              <div className="ds-danger-sub">Permanently remove your account. Coming soon — contact support.</div>
            </div>
            <button className="ds-delete-btn" disabled title="Not yet available">Delete Account</button>
          </div>
        </div>

      </div>
    </div>
  );
}
