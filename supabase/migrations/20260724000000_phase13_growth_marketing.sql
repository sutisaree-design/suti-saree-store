-- ---------------------------------------------------------------------
-- Phase 13: Growth Marketing System
--   1. Growth toggles (exit-intent, urgency banner, social proof, sale
--      countdown) live in the existing `settings` table (key = 'growth_settings')
--      -- no schema change needed for that part, seeded below.
--   2. product_bundles -- admin-curated "Frequently Bought Together" /
--      "Complete the Look" pairs per product.
--   3. email_automation_log -- tracks which lifecycle emails (welcome,
--      win-back) have already gone out so the cron job never double-sends.
-- ---------------------------------------------------------------------

-- ---------- product_bundles ----------
CREATE TABLE IF NOT EXISTS product_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bundle_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, bundle_product_id),
  CHECK (product_id <> bundle_product_id)
);

ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_product_bundles" ON product_bundles;
CREATE POLICY "anon_select_product_bundles" ON product_bundles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_write_product_bundles" ON product_bundles;
CREATE POLICY "anon_write_product_bundles" ON product_bundles FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_product_bundles_product_id ON product_bundles(product_id);

-- ---------- email_automation_log ----------
CREATE TABLE IF NOT EXISTS email_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  automation_type text NOT NULL CHECK (automation_type IN ('welcome', 'winback')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, automation_type)
);

ALTER TABLE email_automation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_email_automation_log" ON email_automation_log;
CREATE POLICY "anon_select_email_automation_log" ON email_automation_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_write_email_automation_log" ON email_automation_log;
CREATE POLICY "anon_write_email_automation_log" ON email_automation_log FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- seed default growth + email automation settings ----------
INSERT INTO settings (key, value) VALUES
  ('growth_settings', '{
    "urgency_banner_enabled": false,
    "urgency_banner_text": "Free shipping on orders above ₹1999 — today only!",
    "low_stock_enabled": true,
    "low_stock_threshold": 5,
    "exit_intent_enabled": false,
    "exit_intent_headline": "Wait! Don''t leave empty-handed",
    "exit_intent_message": "Here''s 10% off your first order, just for you.",
    "exit_intent_coupon_code": "WELCOME10",
    "social_proof_enabled": false,
    "bundles_enabled": true,
    "sale_countdown_enabled": false,
    "sale_countdown_text": "Festive Sale ends in",
    "sale_countdown_end_at": null
  }'::jsonb),
  ('email_automation_settings', '{
    "welcome_enabled": false,
    "welcome_delay_hours": 1,
    "welcome_coupon_code": "WELCOME10",
    "winback_enabled": false,
    "winback_days_inactive": 45,
    "winback_coupon_code": "COMEBACK15"
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;
