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

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
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

        {/* ── Account details ─────────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Account</h2>
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

            {saveError && <p className="ds-error">{saveError}</p>}
            {saved && <p className="ds-saved">✓ Saved</p>}
            <button type="submit" className="ds-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Display Name'}
            </button>
          </form>

          {profile?.account_type === 'creator' && (
            <p className="ds-creator-tip">
              Creator profile fields (bio, tools, niches, portfolio, LinkedIn, etc.) are in the{' '}
              <Link to="/dashboard/profile" className="ds-link">Profile Editor →</Link>
            </p>
          )}
        </div>

        {/* ── Profile & Privacy ──────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Profile &amp; Privacy</h2>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Profile visibility</span>
            <span className="ds-placeholder-note">
              {profile?.account_type === 'creator'
                ? 'Public visibility is controlled by the MicroBuild admin team and cannot be self-toggled. Update your profile content and the admin will review it.'
                : 'Buyer profiles are private by default.'
              }
            </span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Email notifications</span>
            <span className="ds-placeholder-note">Coming soon — requires notification infrastructure</span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Privacy preferences</span>
            <span className="ds-placeholder-note">Coming soon</span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Data export</span>
            <span className="ds-placeholder-note">Coming soon</span>
          </div>
        </div>

        {/* ── Connected accounts ─────────────────────────────────── */}
        <div className="ds-section">
          <h2 className="ds-section-title">Connected Accounts</h2>
          <div className="ds-field">
            <label className="ds-label" htmlFor="ds-github2">GitHub Profile URL</label>
            <input
              id="ds-github2"
              className="ds-input"
              type="url"
              value={githubUrl}
              onChange={e => { setGithubUrl(e.target.value); setSaved(false); }}
              placeholder="https://github.com/yourname"
            />
            <span className="ds-field-note">
              Plain link — displayed on your creator profile.
              GitHub OAuth is deferred until domain setup is complete.
            </span>
          </div>
          <div className="ds-placeholder-row ds-placeholder-row--mt">
            <span className="ds-placeholder-label">LinkedIn</span>
            <span className="ds-placeholder-note">
              Edit your LinkedIn URL in the{' '}
              <Link to="/dashboard/profile" className="ds-link">Profile Editor</Link>.
            </span>
          </div>
          <div className="ds-placeholder-row">
            <span className="ds-placeholder-label">Google</span>
            <span className="ds-placeholder-note">OAuth integration deferred — email/password only for now</span>
          </div>
          {(saved || saveError) && (
            <div style={{ marginTop: '0.75rem' }}>
              {saveError && <p className="ds-error">{saveError}</p>}
              {saved && <p className="ds-saved">✓ Saved</p>}
            </div>
          )}
          <button type="button" className="ds-save-btn ds-save-btn--sm" onClick={() => handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save Connected Accounts'}
          </button>
        </div>

        {/* ── Billing ────────────────────────────────────────────── */}
        <div className="ds-section ds-billing-section">
          <h2 className="ds-section-title">Billing</h2>
          <div className="ds-billing-notice">
            <span className="ds-billing-icon">💳</span>
            <div>
              {profile?.account_type === 'buyer' ? (
                <>
                  <div className="ds-billing-title">No subscription required</div>
                  <p className="ds-billing-desc">
                    Buyers pay per approved MicroBuild. Final scope is confirmed in the Project Agreement
                    before work begins — no buyer subscription required.
                  </p>
                  <div className="ds-billing-meta">
                    <span className="ds-billing-tag">Pay per MicroBuild</span>
                    <span className="ds-billing-tag">No subscription</span>
                    <span className="ds-billing-tag">Stripe not connected yet</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="ds-billing-title">Creator marketplace plans</div>
                  <p className="ds-billing-desc">
                    Billing is not connected yet. Plans are visible now. Checkout will activate when
                    Stripe is connected. Professional ($15/mo) and Verified ($25/mo) require admin approval.
                  </p>
                  <div className="ds-billing-meta">
                    <span className="ds-billing-tag">Free: $0/mo</span>
                    <span className="ds-billing-tag">Professional: $15/mo</span>
                    <span className="ds-billing-tag">Verified: $25/mo</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="ds-billing-actions">
            <Link to="/dashboard/billing" className="ds-billing-action-btn ds-billing-action-btn--primary">
              View Plans
            </Link>
            {profile?.account_type === 'creator' && (
              <>
                <button type="button" className="ds-billing-action-btn" disabled title="Stripe not connected yet">
                  Manage Billing (coming soon)
                </button>
                <Link to="/dashboard/billing" className="ds-billing-action-btn">
                  Upgrade to Professional
                </Link>
                <Link to="/creators/apply" className="ds-billing-action-btn">
                  Apply for Verified
                </Link>
              </>
            )}
            {profile?.account_type === 'buyer' && (
              <>
                <Link to="/pricing" className="ds-billing-action-btn">
                  View buyer pricing
                </Link>
                <Link to="/request" className="ds-billing-action-btn">
                  Request a MicroBuild
                </Link>
              </>
            )}
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
              <div className="ds-danger-sub">Account deletion will be added after auth policies are finalized. Contact support if needed.</div>
            </div>
            <button className="ds-delete-btn" disabled title="Not yet available — contact support">Delete Account</button>
          </div>
        </div>

      </div>
    </div>
  );
}
