-- ============================================================
-- RLS LOCKDOWN — round 3
-- Found via a full trace of every table's final effective policy
-- state (not just the tables flagged in rounds 1–2).
--
-- CODE DEPENDENCY: app/api/referrals/route.ts was switched from the
-- anon-key client (getServerSupabase) to the service-role client
-- (getSupabaseAdmin) to go with this migration — it already checks
-- getCurrentUser() and returns 401 before touching the DB, so this is
-- a safe trust boundary, same pattern as the round-2 gift card fixes.
-- Apply that code change together with this migration, or
-- /api/referrals will start failing to read/create the caller's own
-- referral code.
-- ============================================================

-- ---------- settings ----------
-- PROBLEM: every settings key except email_provider/social_publish is
-- writable directly by the anon key (anon_write_settings, FOR ALL,
-- USING/WITH CHECK (key NOT IN (...))). The repo's own prior comment
-- called this "defacement risk, not a secret leak" — true for keys
-- like store_info/shipping/site_banner, but NOT true for
-- loyalty_program / referral_program / gift_card_program: order-
-- confirm.ts (a trusted service-role flow) reads these same rows to
-- compute real loyalty-point/reward credits. Anyone with the public
-- anon key can inflate points_per_100_rupees or
-- referrer_reward_points directly, then place one small order and
-- walk away with real, spendable loyalty balance. This is financial
-- fraud, not defacement, for these three keys specifically.
--
-- FIX: carve the three financial-program keys out of the anon
-- write policy entirely (admin-only from here on, via the existing
-- /api/admin/loyalty and /api/admin/giftcards routes — already
-- confirmed to use the service-role client, so no code change
-- needed). Every other key keeps working exactly as before.
DROP POLICY IF EXISTS "anon_write_settings" ON settings;
CREATE POLICY "anon_write_settings" ON settings FOR ALL
  TO anon, authenticated
  USING (key NOT IN ('email_provider', 'social_publish', 'loyalty_program', 'referral_program', 'gift_card_program'))
  WITH CHECK (key NOT IN ('email_provider', 'social_publish', 'loyalty_program', 'referral_program', 'gift_card_program'));

-- (anon_select_settings is left as-is — reading these values is fine,
-- e.g. checkout needs to display the current redeem rate. Only
-- writing them needed to be closed.)

-- ---------- referrals ----------
-- PROBLEM: open_insert_referrals / open_update_referrals let anyone
-- insert or edit ANY referrals row directly with the anon key. No app
-- code needs this: the real row is created by the handle_new_user()
-- trigger (SECURITY DEFINER, bypasses RLS) at signup, and the only
-- thing that ever completes a referral / assigns reward points is
-- order-confirm.ts, which already runs on the service-role client.
-- Leaving these open lets someone insert a fake "pending" referral
-- for a throwaway account (skipping the real referred-by-code signup
-- step entirely) and farm free loyalty points on every first order —
-- repeatable with unlimited fake accounts.
DROP POLICY IF EXISTS "open_insert_referrals" ON referrals;
DROP POLICY IF EXISTS "open_update_referrals" ON referrals;
DROP POLICY IF EXISTS "open_select_referrals" ON referrals;

CREATE POLICY "customers_select_own_referrals" ON referrals FOR SELECT
  TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

CREATE POLICY "admin_all_referrals" ON referrals FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------- referral_codes ----------
-- SELECT was fully open (any user_id ↔ code mapping readable by
-- anyone) and INSERT had no ownership check at all (WITH CHECK(true)
-- let a caller insert a row for ANY user_id, not just their own,
-- squatting/pre-empting another user's code slot since user_id is
-- UNIQUE). /api/referrals/route.ts is the only legitimate writer and
-- now runs on the service-role client (see code note above), so this
-- can be locked down to owner-only + admin with no functional change.
DROP POLICY IF EXISTS "open_select_referral_codes" ON referral_codes;
DROP POLICY IF EXISTS "open_insert_referral_codes" ON referral_codes;

CREATE POLICY "customers_select_own_referral_code" ON referral_codes FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "admin_all_referral_codes" ON referral_codes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------- stock_notifications ----------
-- INSERT stays open (the public "notify me when back in stock" form
-- needs this). UPDATE was also open with no ownership check at all,
-- letting anyone flip notified=true (silently suppressing someone
-- else's restock email) or rewrite the email column on an existing
-- row. Every real UPDATE already goes through
-- /api/admin/notify-restock and /api/admin/stock-notifications, both
-- on the service-role client — so this is a pure lockdown, no
-- behavior change for the real notify-restock job.
DROP POLICY IF EXISTS "anon_update_stock_notifications" ON stock_notifications;

CREATE POLICY "admin_update_stock_notifications" ON stock_notifications FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);
