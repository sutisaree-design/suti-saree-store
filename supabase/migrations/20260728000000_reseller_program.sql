-- ---------- reseller_profiles ----------
-- Any logged-in customer can "become a reseller" using their SAME account
-- (same email/login) — this table just marks that user_id as a reseller
-- and stores their margin preference. No separate signup/login needed.
CREATE TABLE IF NOT EXISTS reseller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active', -- active | suspended
  default_margin_percent numeric NOT NULL DEFAULT 20,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reseller_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reseller_profiles" ON reseller_profiles;
CREATE POLICY "anon_select_reseller_profiles" ON reseller_profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reseller_profiles" ON reseller_profiles;
CREATE POLICY "anon_insert_reseller_profiles" ON reseller_profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reseller_profiles" ON reseller_profiles;
CREATE POLICY "anon_update_reseller_profiles" ON reseller_profiles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reseller_profiles" ON reseller_profiles;
CREATE POLICY "anon_delete_reseller_profiles" ON reseller_profiles FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_reseller_profiles_user_id ON reseller_profiles(user_id);

-- ---------- orders: reseller columns ----------
-- An order placed by a reseller on behalf of their own end-customer.
-- reseller_base_cost  = what the store charges the reseller (product base price x qty)
-- total_amount        = what the reseller's own customer pays (base cost + margin)
-- reseller_profit     = total_amount - reseller_base_cost (the reseller's earning)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_reseller_order boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES reseller_profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_margin_percent numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_base_cost integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_profit integer;

CREATE INDEX IF NOT EXISTS idx_orders_reseller_id ON orders(reseller_id);
