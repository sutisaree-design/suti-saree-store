-- ============================================================
-- Phase 10C -- Gift Cards / Store Credit
-- ============================================================
-- Overview
-- Customers buy a gift card online (Razorpay), and can redeem it as
-- store credit at checkout using its code -- similar UI to a coupon,
-- but backed by a real balance rather than a discount rule. Every
-- credit/debit against a card is an immutable row in
-- gift_card_transactions; gift_cards.balance is kept in sync via
-- trigger, same pattern as Phase 10A's loyalty ledger.
--
-- This migration is additive only -- it does not touch any existing
-- table's existing columns, only adds new tables and new columns with
-- safe defaults.
--
-- New tables
--   1. gift_cards             -- one row per issued card (code, balance, recipient)
--   2. gift_card_transactions -- one row per issue/redeem/refund/adjust/deactivate event
--
-- Changed tables
--   orders: + gift_card_code (text), gift_card_discount (int, default 0)
--
-- Settings
-- Seeds a gift_card_program row in the existing settings key/value table
-- with sensible defaults (editable from Admin > Gift Cards):
--   { enabled, denominations, expiry_months }
--
-- Security
-- Same convention as loyalty_points_ledger / referrals: fully open at
-- the RLS layer, scoped by query in application code. Admin writes go
-- through /api/admin/giftcards (checked against the admin session
-- cookie); customer purchase/redeem goes through /api/giftcards and
-- /api/giftcards/confirm (server-side Razorpay signature re-check).
-- ============================================================

-- ============================================================
-- 1. GIFT CARDS -- one row per issued card
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  initial_value integer NOT NULL CHECK (initial_value > 0),
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'redeemed', 'expired', 'deactivated')),
  purchased_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purchaser_name text,
  purchaser_email text,
  recipient_name text,
  recipient_email text,
  message text,
  razorpay_order_id text,
  razorpay_payment_id text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_select_gift_cards" ON gift_cards;
CREATE POLICY "open_select_gift_cards" ON gift_cards FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "open_insert_gift_cards" ON gift_cards;
CREATE POLICY "open_insert_gift_cards" ON gift_cards FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "open_update_gift_cards" ON gift_cards;
CREATE POLICY "open_update_gift_cards" ON gift_cards FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_purchased_by ON gift_cards(purchased_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);

-- ============================================================
-- 2. GIFT CARD TRANSACTIONS -- immutable ledger per card
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  amount integer NOT NULL, -- positive = issue/refund/adjust-credit, negative = redeem/adjust-debit/deactivate
  type text NOT NULL CHECK (type IN ('issue', 'redeem', 'refund', 'adjust', 'deactivate')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_select_gift_card_transactions" ON gift_card_transactions;
CREATE POLICY "open_select_gift_card_transactions" ON gift_card_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "open_insert_gift_card_transactions" ON gift_card_transactions;
CREATE POLICY "open_insert_gift_card_transactions" ON gift_card_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gift_card_txns_card_id ON gift_card_transactions(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_txns_order_id ON gift_card_transactions(order_id);

-- ============================================================
-- 3. BALANCE SYNC -- keep gift_cards.balance/status in step with the
--    ledger, same technique as Phase 10A's apply_loyalty_ledger_entry.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_gift_card_transaction()
RETURNS trigger AS $$
DECLARE
  v_current_balance integer;
  v_current_status text;
  v_new_balance integer;
BEGIN
  SELECT balance, status INTO v_current_balance, v_current_status
  FROM gift_cards WHERE id = NEW.gift_card_id
  FOR UPDATE;

  v_new_balance := GREATEST(0, COALESCE(v_current_balance, 0) + NEW.amount);

  UPDATE gift_cards
  SET balance = v_new_balance,
      status = CASE
        WHEN NEW.type = 'deactivate' THEN 'deactivated'
        WHEN v_current_status = 'deactivated' THEN 'deactivated'
        WHEN v_new_balance = 0 THEN 'redeemed'
        ELSE 'active'
      END
  WHERE id = NEW.gift_card_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_gift_card_transaction_apply ON gift_card_transactions;
CREATE TRIGGER trg_gift_card_transaction_apply
  AFTER INSERT ON gift_card_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_gift_card_transaction();

-- ============================================================
-- 4. ORDERS -- gift card redemption snapshot per order
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_discount integer NOT NULL DEFAULT 0;

-- ============================================================
-- 5. DEFAULT SETTINGS ROW (editable from Admin > Gift Cards)
-- ============================================================
INSERT INTO settings (key, value)
VALUES (
  'gift_card_program',
  jsonb_build_object(
    'enabled', true,
    'denominations', jsonb_build_array(500, 1000, 2000, 5000),
    'expiry_months', 12
  )
)
ON CONFLICT (key) DO NOTHING;
