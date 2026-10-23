-- ============================================================
-- SECURITY FIX — product_bundles INSERT/UPDATE/DELETE
-- `anon_write_product_bundles` (FOR ALL, USING (true) WITH CHECK (true))
-- let ANY anon/authenticated caller create/update/delete ANY "frequently
-- bought together" bundle link directly with the public anon key.
--
-- All admin-panel writes to this table have been moved to new server-side
-- routes (app/api/admin/bundles, app/api/admin/bundles/[id]) using the
-- service-role client + the existing admin session cookie check — see
-- lib/bundles-api.ts. Nothing else in the app writes to this table with
-- the anon key, so dropping this policy changes no working behaviour, only
-- closes the hole.
--
-- SELECT is untouched — both the admin panel and the public "frequently
-- bought together" widget (components/product/frequently-bought-together)
-- read this table directly with the anon key, and it's not sensitive data.
-- ============================================================

DROP POLICY IF EXISTS "anon_write_product_bundles" ON product_bundles;

CREATE POLICY "admin_write_product_bundles" ON product_bundles FOR ALL
  TO service_role USING (true) WITH CHECK (true);
