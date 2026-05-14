import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserProfileInsert } from '../types/database';
import './Onboarding.css';

type Step = 'role' | 'buyer-info' | 'creator-info' | 'saving';

export default function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep]             = useState<Step>('role');
  const [role, setRole]             = useState<'buyer' | 'creator' | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/signin', { replace: true });
    }
  }, [user, loading, navigate]);

  // Pre-fill display name from GitHub metadata
  useEffect(() => {
    if (user) {
      const name =
        (user.user_metadata?.name as string | undefined) ??
        (user.user_metadata?.user_name as string | undefined) ??
        '';
      setDisplayName(name);
    }
  }, [user]);

  async function handleFinish() {
    if (!user || !role) return;
    setStep('saving');
    setError(null);

    const payload: UserProfileInsert = {
      auth_user_id:     user.id,
      email:            user.email ?? '',
      display_name:     displayName.trim() || null,
      avatar_url:       (user.user_metadata?.avatar_url as string | undefined) ?? null,
      account_type:     role,
      onboarding_status: 'complete',
    };

    const { error: err } = await supabase.from('user_profiles').insert([payload]);
    if (err) {
      console.error('[Onboarding] insert user_profile failed:', err);
      setError('Could not save your profile. Please try again.');
      setStep(role === 'buyer' ? 'buyer-info' : 'creator-info');
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  if (loading || !user) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-spinner-wrap"><div className="onboarding-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          <div className={`onboarding-step-dot${step === 'role' ? ' active' : ' done'}`} />
          <div className="onboarding-step-line" />
          <div className={`onboarding-step-dot${step === 'buyer-info' || step === 'creator-info' ? ' active' : step === 'saving' ? ' done' : ''}`} />
          <div className="onboarding-step-line" />
          <div className={`onboarding-step-dot${step === 'saving' ? ' active' : ''}`} />
        </div>

        {/* ── Step 1: Role ──────────────────────────────────────────── */}
        {step === 'role' && (
          <>
            <h1 className="onboarding-title">Welcome to MicroBuild</h1>
            <p className="onboarding-sub">Tell us how you'll use the platform.</p>

            <div className="onboarding-role-grid">
              <button
                className={`onboarding-role-card${role === 'buyer' ? ' selected' : ''}`}
                onClick={() => setRole('buyer')}
              >
                <div className="onboarding-role-icon">🏢</div>
                <div className="onboarding-role-name">I'm a Buyer</div>
                <p className="onboarding-role-desc">
                  I'm a local service business that wants a quote funnel, booking
                  page, or other MicroBuild delivered.
                </p>
              </button>

              <button
                className={`onboarding-role-card${role === 'creator' ? ' selected' : ''}`}
                onClick={() => setRole('creator')}
              >
                <div className="onboarding-role-icon">🛠</div>
                <div className="onboarding-role-name">I'm a Creator</div>
                <p className="onboarding-role-desc">
                  I build web tools and want to take on MicroBuild projects for
                  local service businesses.
                </p>
              </button>
            </div>

            <button
              className="onboarding-next-btn"
              disabled={!role}
              onClick={() => setStep(role === 'buyer' ? 'buyer-info' : 'creator-info')}
            >
              Continue →
            </button>
          </>
        )}

        {/* ── Step 2a: Buyer info ───────────────────────────────────── */}
        {step === 'buyer-info' && (
          <>
            <h1 className="onboarding-title">Tell us about your business</h1>
            <p className="onboarding-sub">We'll use this to personalize your experience.</p>

            <div className="onboarding-form">
              <div className="onboarding-field">
                <label className="onboarding-label">Your Name</label>
                <input
                  className="onboarding-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="onboarding-field">
                <label className="onboarding-label">Business Name</label>
                <input
                  className="onboarding-input"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Smith's Pool Service"
                />
              </div>
              <div className="onboarding-field">
                <label className="onboarding-label">Industry</label>
                <input
                  className="onboarding-input"
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Pool cleaning, landscaping, etc."
                />
              </div>
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button className="onboarding-back-btn" onClick={() => setStep('role')}>← Back</button>
              <button className="onboarding-next-btn" onClick={handleFinish}>
                Create Account →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2b: Creator info ─────────────────────────────────── */}
        {step === 'creator-info' && (
          <>
            <h1 className="onboarding-title">Set up your creator account</h1>
            <p className="onboarding-sub">
              Your creator profile will be reviewed by the MicroBuild team before
              becoming public.
            </p>

            <div className="onboarding-form">
              <div className="onboarding-field">
                <label className="onboarding-label">Display Name</label>
                <input
                  className="onboarding-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you'll appear on MicroBuild"
                />
              </div>
            </div>

            <div className="onboarding-creator-note">
              <p>
                <strong>Already applied?</strong> If you submitted a creator
                application, your account will be linked once the admin reviews
                your application and sets up your profile. You'll see your profile
                status in the dashboard.
              </p>
              <p>
                <strong>New here?</strong> You can{' '}
                <a href="/creators/apply" className="onboarding-link">apply as a creator</a>{' '}
                from the dashboard.
              </p>
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button className="onboarding-back-btn" onClick={() => setStep('role')}>← Back</button>
              <button className="onboarding-next-btn" onClick={handleFinish}>
                Go to Dashboard →
              </button>
            </div>
          </>
        )}

        {/* ── Saving ──────────────────────────────────────────────────── */}
        {step === 'saving' && (
          <div className="onboarding-saving">
            <div className="onboarding-spinner" />
            <p>Setting up your account…</p>
          </div>
        )}
      </div>
    </div>
  );
}
