-- ============================================================
-- SECURITY FIX (Part 1 — price/stock manipulation):
-- product_variants / product_variant_sizes had `anon_write_variants`
-- and `anon_write_variant_sizes` policies (FOR ALL, USING (true) WITH
-- CHECK (true)) from 20260717000000_full_feature_schema.sql — meaning
-- any visitor holding the public anon key could insert/update/delete
-- any colour variant or size row directly, including price_override
-- and stock_quantity. A ₹1 price_override on any variant/size would
-- then be trusted at checkout (place_order_with_items looks the price
-- up from `products`/variant data, so this is a real, not
-- theoretical, financial-fraud path).
--
-- All admin-panel writes to these two tables have been moved to new
-- server-side routes (app/api/admin/variants, app/api/admin/variant-
-- sizes) using the service-role client + the existing admin session
-- cookie check — see lib/variants-api.ts. Nothing else in the app
-- writes to these tables with the anon key, so dropping these
-- policies changes no working behaviour, only closes the hole.
--
-- SELECT stays open to anon/authenticated: variant colour/size/stock
-- data is meant to be publicly visible on the storefront (PDP swatches,
-- size picker), so this is not a privacy issue.
-- ============================================================

DROP POLICY IF EXISTS "anon_write_variants" ON product_variants;
DROP POLICY IF EXISTS "anon_write_variant_sizes" ON product_variant_sizes;

CREATE POLICY "admin_write_variants" ON product_variants FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_write_variant_sizes" ON product_variant_sizes FOR ALL
  TO service_role USING (true) WITH CHECK (true);
