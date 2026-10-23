-- ============================================================
-- Phase 10B -- Referral Program
-- ============================================================
-- Overview
-- Every customer gets a personal referral code. New signups can enter
-- someone's code (or land via ?ref=CODE link) to link themselves to
-- that referrer. When the referred customer's FIRST order completes,
-- both the referrer and the referred customer are credited reward
-- points through the existing Phase 10A loyalty ledger -- no separate
-- coupon/discount logic is introduced here.
--
-- This migration is additive only -- it does not touch any existing
-- table's existing columns, only adds new tables and extends the
-- existing handle_new_user() trigger function.
--
-- New tables
--   1. referral_codes -- one personal code per customer
--   2. referrals      -- one row per successful signup-with-code,
--                        tracks pending -> completed lifecycle
--
-- Changed behavior
--   handle_new_user(): now also reads raw_user_meta_data->>'referred_by_code'
--   (set by the signup API route) and, if it matches a real code
--   belonging to someone else, creates a 'pending' referrals row.
--
-- Settings
-- Seeds a referral_program row in the existing settings key/value table
-- with sensible defaults (editable from Admin > Referrals):
--   { enabled, referrer_reward_points, referred_reward_points }
--
-- Security
-- Same convention as loyalty_points_ledger: fully open at the RLS
-- layer, scoped by query in application code. Admin writes go through
-- /api/admin/referrals (checked against the admin session cookie);
-- customer reads/writes go through /api/referrals (checked against
-- the logged-in Supabase auth session).
-- ============================================================

-- ============================================================
-- 1. REFERRAL CODES -- one per customer
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_select_referral_codes" ON referral_codes;
CREATE POLICY "open_select_referral_codes" ON referral_codes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "open_insert_referral_codes" ON referral_codes;
CREATE POLICY "open_insert_referral_codes" ON referral_codes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- ============================================================
-- 2. REFERRALS -- signup-with-code -> reward lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  first_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  referrer_reward_points integer NOT NULL DEFAULT 0,
  referred_reward_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_select_referrals" ON referrals;
CREATE POLICY "open_select_referrals" ON referrals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "open_insert_referrals" ON referrals;
CREATE POLICY "open_insert_referrals" ON referrals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "open_update_referrals" ON referrals;
CREATE POLICY "open_update_referrals" ON referrals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ============================================================
-- 3. EXTEND handle_new_user() -- link referred signups automatically
-- ============================================================
-- Re-created from the Phase 1 definition (full_feature_schema.sql) with
-- one addition: if the new user signed up with a referral code (passed
-- as user_metadata.referred_by_code from the signup API route), and
-- that code belongs to a DIFFERENT existing user, record a pending
-- referrals row. Silently does nothing if the code is missing, unknown,
-- or belongs to the same user (self-referral guard).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_code text;
  v_referrer_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  v_code := new.raw_user_meta_data->>'referred_by_code';
  IF v_code IS NOT NULL AND v_code <> '' THEN
    SELECT user_id INTO v_referrer_id
    FROM public.referral_codes
    WHERE code = upper(v_code)
    LIMIT 1;

    IF v_referrer_id IS NOT NULL AND v_referrer_id <> new.id THEN
      INSERT INTO public.referrals (referrer_user_id, referred_user_id, code, status)
      VALUES (v_referrer_id, new.id, upper(v_code), 'pending')
      ON CONFLICT (referred_user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from Phase 1 (on_auth_user_created) and points
-- at this same function name, so no DROP/CREATE TRIGGER needed here --
-- CREATE OR REPLACE FUNCTION above is enough to pick up the new logic.

-- ============================================================
-- 4. DEFAULT SETTINGS ROW (editable from Admin > Referrals)
-- ============================================================
INSERT INTO settings (key, value)
VALUES (
  'referral_program',
  jsonb_build_object(
    'enabled', true,
    'referrer_reward_points', 100,
    'referred_reward_points', 50
  )
)
ON CONFLICT (key) DO NOTHING;
