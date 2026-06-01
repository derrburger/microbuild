-- Additive subscription / plan fields on user_profiles (non-destructive).
-- Keeps creator_profiles.tier as the canonical creator plan for existing flows.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS buyer_plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS creator_plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false;

COMMENT ON COLUMN user_profiles.buyer_plan IS 'Buyer subscription tier: free, starter, growth, pro';
COMMENT ON COLUMN user_profiles.creator_plan IS 'Optional mirror of creator tier; creator_profiles.tier remains canonical';
COMMENT ON COLUMN user_profiles.subscription_status IS 'Stripe-synced lifecycle: inactive, active, past_due, canceled, etc.';
