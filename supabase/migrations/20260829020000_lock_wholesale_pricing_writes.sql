-- ============================================================
-- SECURITY FIX — wholesale_pricing INSERT/UPDATE/DELETE
-- `anon_write_wholesale_pricing` (FOR ALL, USING (true) WITH CHECK (true))
-- let ANY anon/authenticated caller create/update/delete ANY bulk-pricing
-- tier directly with the public anon key — a financial-manipulation risk
-- (anyone could set a tier's unit_price to ₹1 and, if a checkout flow ever
-- trusts it, order at that price).
--
-- All admin-panel writes to this table have been moved to new server-side
-- routes (app/api/admin/wholesale, app/api/admin/wholesale/[id]) using the
-- service-role client + the existing admin session cookie check — see
-- lib/wholesale-api.ts. Nothing else in the app writes to this table with
-- the anon key, so dropping this policy changes no working behaviour, only
-- closes the hole.
--
-- SELECT is untouched — reading bulk-pricing tiers publicly was never
-- flagged as a leak (no PII, just pricing tiers).
-- ============================================================

DROP POLICY IF EXISTS "anon_write_wholesale_pricing" ON wholesale_pricing;

CREATE POLICY "admin_write_wholesale_pricing" ON wholesale_pricing FOR ALL
  TO service_role USING (true) WITH CHECK (true);
