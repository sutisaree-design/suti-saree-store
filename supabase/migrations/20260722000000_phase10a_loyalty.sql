-- ============================================================
-- Phase 10A -- Loyalty / Reward Points
-- ============================================================
-- Overview
-- Adds a points-ledger based loyalty program. Every credit/debit is an
-- immutable row in loyalty_points_ledger (earn on order, redeem at
-- checkout, manual admin adjust). profiles.loyalty_balance is kept in
-- sync via trigger so reads stay O(1) instead of summing the ledger.
--
-- This migration is additive only -- it does not touch any existing
-- table's existing columns, only adds new ones with safe defaults.
--
-- New tables
--   1. loyalty_points_ledger -- one row per earn/redeem/adjust/expire event
--
-- Changed tables
--   profiles: + loyalty_balance (int, default 0)
--   orders:   + loyalty_points_redeemed, loyalty_discount, loyalty_points_earned
--
-- Settings
-- Seeds a loyalty_program row in the existing settings key/value table
-- with sensible defaults (editable from Admin > Loyalty):
--   { enabled, points_per_100_rupees, redeem_value_per_point, min_redeem_points }
--
-- Security
-- Follows the same RLS convention already used across this project for
-- admin-managed-but-customer-owned tables (see returns, coupons):
-- fully open at the RLS layer, scoped by query in application code.
-- Admin writes go through the admin API routes (checked against the
-- custom admin session cookie), customer reads are scoped to their own
-- user_id by the client query.
-- ============================================================

-- ============================================================
-- 1. LOYALTY POINTS LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  points integer NOT NULL, -- positive = earn/adjust-credit, negative = redeem/expire/adjust-debit
  type text NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_loyalty_ledger" ON loyalty_points_ledger;
CREATE POLICY "own_select_loyalty_ledger" ON loyalty_points_ledger FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "own_insert_loyalty_ledger" ON loyalty_points_ledger;
CREATE POLICY "own_insert_loyalty_ledger" ON loyalty_points_ledger FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_id ON loyalty_points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order_id ON loyalty_points_ledger(order_id);

-- ============================================================
-- 2. PROFILES — running balance (denormalized for fast reads)
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loyalty_balance integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION apply_loyalty_ledger_entry()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles
  SET loyalty_balance = loyalty_balance + NEW.points,
      updated_at = now()
  WHERE id = NEW.user_id;

  -- Ledger can arrive before the profile row exists in rare edge cases
  -- (e.g. auth trigger race) — make sure the balance is never lost.
  IF NOT FOUND THEN
    INSERT INTO profiles (id, loyalty_balance)
    VALUES (NEW.user_id, NEW.points)
    ON CONFLICT (id) DO UPDATE SET loyalty_balance = profiles.loyalty_balance + NEW.points;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_loyalty_ledger_apply ON loyalty_points_ledger;
CREATE TRIGGER trg_loyalty_ledger_apply
  AFTER INSERT ON loyalty_points_ledger
  FOR EACH ROW EXECUTE FUNCTION apply_loyalty_ledger_entry();

-- ============================================================
-- 3. ORDERS — points redeemed / earned snapshot per order
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_redeemed integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_earned integer NOT NULL DEFAULT 0;

-- ============================================================
-- 4. DEFAULT SETTINGS ROW (editable from Admin > Loyalty)
-- ============================================================
INSERT INTO settings (key, value)
VALUES (
  'loyalty_program',
  jsonb_build_object(
    'enabled', true,
    'points_per_100_rupees', 5,
    'redeem_value_per_point', 0.5,
    'min_redeem_points', 100
  )
)
ON CONFLICT (key) DO NOTHING;
