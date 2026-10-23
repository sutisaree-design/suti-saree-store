-- ============================================================
-- Cart recovery email SEQUENCE + per-email tracking
--
-- Context: abandoned_carts previously supported exactly ONE recovery
-- email per cart (recovery_email_sent boolean, flipped true forever
-- after the first send — see runAbandonedCartsJob in lib/cron-jobs.ts
-- before this migration). This adds:
--
--   1. abandoned_carts.recovery_stage — how many recovery emails have
--      gone out so far (0, 1, 2 or 3), so the cron job can send up to
--      3 emails per cart instead of just 1. recovery_email_sent /
--      recovery_email_sent_at are KEPT (still updated) for backward
--      compatibility with any code/reporting that reads them —
--      recovery_email_sent is just (recovery_stage > 0) now.
--
--   2. abandoned_cart_emails — one row per individual send (stage 1,
--      2 or 3), so the admin can see exactly which template/coupon
--      went out and when, plus open/click/conversion tracking via
--      /api/track/open/[token] and /api/track/click/[token].
--
-- Settings for the sequence itself (enabled per-step, delay hours,
-- optional custom subject/html, optional coupon code) live in the
-- existing `settings` table under key 'cart_recovery_sequence_settings'
-- (service-role only, same as email_provider — see
-- app/api/admin/cart-recovery-settings/route.ts), not in this schema.
-- ============================================================

ALTER TABLE abandoned_carts
  ADD COLUMN IF NOT EXISTS recovery_stage integer NOT NULL DEFAULT 0;

-- Backfill: any cart that already had exactly one recovery email sent
-- under the old single-email behavior is now "at stage 1".
UPDATE abandoned_carts
  SET recovery_stage = 1
  WHERE recovery_email_sent = true AND recovery_stage = 0;

CREATE TABLE IF NOT EXISTS abandoned_cart_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES abandoned_carts(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL DEFAULT 1,
  subject text NOT NULL,
  coupon_code text,
  tracking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  converted boolean NOT NULL DEFAULT false,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Same PII posture as abandoned_carts itself (see
-- 20260826020000_lock_newsletter_abandoned_stock_pii.sql): this table
-- links a customer's email/cart contents to open+click behaviour, so
-- it's service-role only. Every read/write goes through admin API
-- routes (verifyAdminToken) or the cron job / pixel+redirect routes,
-- all of which use getSupabaseAdmin().
ALTER TABLE abandoned_cart_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_abandoned_cart_emails" ON abandoned_cart_emails;
CREATE POLICY "service_role_all_abandoned_cart_emails" ON abandoned_cart_emails FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_cart_emails_token ON abandoned_cart_emails(tracking_token);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_emails_cart ON abandoned_cart_emails(cart_id, sequence_number);

-- ------------------------------------------------------------
-- Lock the new settings key the same way email_provider / social_publish
-- were locked in 20260828000000_lock_settings_secrets.sql. This key
-- holds the admin's own custom email copy + coupon codes for the
-- sequence -- not a live API credential, but there's no reason for the
-- public anon key to be able to read or overwrite it either, so it's
-- served exclusively through app/api/admin/cart-recovery-settings
-- (verifyAdminToken + service role). Safe to run whether or not
-- 20260828000000 has been applied yet -- it only ever narrows an
-- existing anon policy by adding one more excluded key, and recreates
-- the policy from scratch either way.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_write_settings" ON settings;

CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings'));

CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings'))
  WITH CHECK (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings'));

DROP POLICY IF EXISTS "admin_all_settings" ON settings;
CREATE POLICY "admin_all_settings" ON settings FOR ALL
  TO service_role USING (true) WITH CHECK (true);
