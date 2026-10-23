-- Store Credit program: a per-customer running balance (₹) that can be
-- issued by admin (refunds, comp/goodwill credit, return-to-credit) and
-- redeemed at checkout, same shape as gift_cards / loyalty_ledger.
--
-- store_credits        — one row per user, holds the current balance.
-- store_credit_ledger  — append-only history of every change, so the
--                         balance on store_credits is always derivable
--                         (sum of ledger.amount) and auditable.
--
-- Read by: lib/store-credit-api.ts -> fetchMyStoreCredit() (storefront,
--   header balance pill + account page) and app/api/admin/store-credit
--   (admin issue/adjust panel).

CREATE TABLE IF NOT EXISTS store_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL, -- positive = credited, negative = redeemed
  type TEXT NOT NULL CHECK (type IN ('issue', 'refund', 'redeem', 'adjust', 'expire')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_credit_ledger_user_id ON store_credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_ledger_created_at ON store_credit_ledger(created_at DESC);

ALTER TABLE store_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Customers can only ever read their own balance / history. All writes
-- (issue, redeem, refund) go through the service-role key in the
-- /api/store-credit* and /api/admin/store-credit routes, never straight
-- from the browser, so there are no INSERT/UPDATE policies here.
DROP POLICY IF EXISTS "Users read own store credit balance" ON store_credits;
CREATE POLICY "Users read own store credit balance"
  ON store_credits FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own store credit ledger" ON store_credit_ledger;
CREATE POLICY "Users read own store credit ledger"
  ON store_credit_ledger FOR SELECT
  USING (auth.uid() = user_id);
