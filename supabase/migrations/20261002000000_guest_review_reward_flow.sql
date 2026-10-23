-- ============================================================
-- Guest review-reward flow
--
-- Context: the "Rate & Review" / "Review Reminder" emails
-- (lib/email-templates.ts -> reviewRequestEmail / reviewReminderEmail)
-- used to link to /account/orders/[id], which requires the customer to
-- log in. This migration adds the storage needed for a login-free flow:
-- a per-order secret link token the email can point to instead
-- (app/review/[token]/...), and a record of which order+product
-- combinations have already earned a reward, so a >=N-star rating can
-- auto-issue a one-time discount coupon exactly once per product per
-- order, even under retries/races.
--
-- Everything here is read/written exclusively through service-role
-- code (getSupabaseAdmin()) -- app/api/review-link/[token]/route.ts and
-- app/api/admin/review-reward-settings/route.ts -- never directly from
-- a browser client with the anon key. Service-role connections bypass
-- RLS entirely, so the policies below (matching the
-- abandoned_cart_emails convention in 20260928010000) are a defensive
-- backstop, not the actual access control.
-- ============================================================

-- ------------------------------------------------------------
-- 1. review_link_tokens -- one secret, long-lived token per order that
--    grants (without login) read access to that order's items and the
--    ability to submit a rating/review/photo for each one.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_link_tokens_token ON review_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_review_link_tokens_order ON review_link_tokens(order_id);

ALTER TABLE review_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_review_link_tokens" ON review_link_tokens;
CREATE POLICY "service_role_all_review_link_tokens" ON review_link_tokens FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 2. review_rewards -- one row per (order, product) that has already
--    earned a discount for a high-star review. The UNIQUE constraint is
--    what actually prevents double-issuing a coupon for the same item
--    (relied on with an INSERT ... ON CONFLICT DO NOTHING / catch in
--    lib/review-rewards-server.ts), not application-level checking
--    alone -- so it stays correct even under concurrent submits.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  review_id uuid REFERENCES reviews(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_review_rewards_order ON review_rewards(order_id);

ALTER TABLE review_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_review_rewards" ON review_rewards;
CREATE POLICY "service_role_all_review_rewards" ON review_rewards FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. reviews -- link a review back to the order it came from (so a
--    guest's second visit to the same review link can show "already
--    reviewed" without needing a user_id), and keep the email address
--    a guest typed in, for support/lookup purposes only.
-- ------------------------------------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS guest_email text;

CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);

-- Guest reviews are inserted exclusively by
-- app/api/review-link/[token]/route.ts via getSupabaseAdmin() (service
-- role bypasses RLS), so the existing "auth_insert_reviews" policy
-- (which requires auth.uid() = user_id) is intentionally left
-- untouched -- it keeps governing direct browser inserts from
-- logged-in customers exactly as before.

-- ------------------------------------------------------------
-- 4. Lock the new 'review_reward_settings' settings key the same way
--    'cart_recovery_sequence_settings' was locked in 20260928010000 --
--    read/write only via app/api/admin/review-reward-settings
--    (verifyAdminToken + service role), never from the anon/browser
--    client. Recreates the policy from scratch, extending the existing
--    exclusion list, so this is safe to run regardless of which of the
--    earlier settings-lock migrations have already applied.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_write_settings" ON settings;

CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings'));

CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings'))
  WITH CHECK (key NOT IN ('email_provider', 'social_publish', 'cart_recovery_sequence_settings', 'review_reward_settings'));

DROP POLICY IF EXISTS "admin_all_settings" ON settings;
CREATE POLICY "admin_all_settings" ON settings FOR ALL
  TO service_role USING (true) WITH CHECK (true);
