-- ============================================================
-- SECURITY FIX: coupons & gift cards were fully writable by anyone
-- ============================================================
-- PROBLEM:
--   anon_write_coupons            ON coupons                FOR ALL    USING(true) WITH CHECK(true)
--   open_insert_gift_cards        ON gift_cards              FOR INSERT WITH CHECK(true)
--   open_update_gift_cards        ON gift_cards              FOR UPDATE USING(true) WITH CHECK(true)
--   open_insert_gift_card_transactions ON gift_card_transactions FOR INSERT WITH CHECK(true)
--
-- Any visitor with the public anon key (which is public in every
-- site's JS bundle) could open the browser console and directly:
--   - create their own coupon, e.g. 100% off, unlimited uses
--   - edit an existing coupon's discount/expiry/usage limit
--   - create or top-up a gift card balance
--   - insert a fake "redeem"/"issue" gift_card_transaction row
-- This is direct financial fraud, independent of anything the
-- Next.js app itself does right or wrong.
--
-- FIX: writes are now restricted to the service_role only (Supabase's
-- service role always bypasses RLS, so no explicit policy is needed
-- for it — removing the anon/authenticated write policies is enough).
-- All coupon writes now go through the new admin-gated
-- /api/admin/coupons routes. All gift card writes already went
-- through /api/giftcards, /api/giftcards/confirm and (as of this same
-- change set) /api/admin/giftcards — all three already use the
-- service-role client, so removing these policies does not change
-- any working behavior.
--
-- READ access (anon_select_coupons / open_select_gift_cards /
-- open_select_gift_card_transactions) is intentionally left AS-IS in
-- this migration, because the storefront needs to look up a coupon or
-- gift card code without being logged in (checkout apply-coupon /
-- apply-gift-card). That still means the *entire* coupons/gift_cards
-- tables can be listed by anyone with the anon key (not just looked
-- up by code) — flagging this as a follow-up, same as the codebase's
-- own existing "known gap" comments for order_items. Recommended
-- next step: move validateCoupon()/validateGiftCard() to a server
-- route and lock SELECT down too, the same way this migration locked
-- down the writes.
-- ============================================================

DROP POLICY IF EXISTS "anon_write_coupons" ON coupons;

DROP POLICY IF EXISTS "open_insert_gift_cards" ON gift_cards;
DROP POLICY IF EXISTS "open_update_gift_cards" ON gift_cards;

DROP POLICY IF EXISTS "open_insert_gift_card_transactions" ON gift_card_transactions;
