-- ============================================================
-- SECURITY FIX (Part 2 — customer-email leak / mass-delete):
--
-- 1) newsletter_subscribers — anon_select_newsletter / anon_delete_newsletter
--    (USING (true)) let anyone with the public anon key read every
--    subscriber's email, or delete the entire list. Public signup
--    (INSERT via /api/newsletter, server-side) is untouched — that
--    must stay open. Listing/deleting now go through
--    app/api/admin/newsletter/* (admin-token gated, service role) —
--    see lib/marketing-api.ts.
--
-- 2) stock_notifications — anon_select_stock_notifications /
--    anon_delete_stock_notifications (USING (true)) let anyone read
--    every "notify me when back in stock" signup (customer email +
--    product) or mass-delete them so those customers are never
--    notified. Public upsert (a customer requesting their own
--    product+email pair) is untouched. Listing/deleting now go
--    through app/api/admin/stock-notifications/* — see
--    lib/stock-notify-api.ts.
--
-- 3) abandoned_carts — anon_all_abandoned_carts (FOR ALL, USING (true)
--    WITH CHECK (true)) let anyone read/insert/update/delete every
--    row, including customer email + full cart contents. Unlike the
--    two tables above, NO client component ever touched this table
--    directly — every read/write path (app/api/cart-track,
--    app/api/order-confirm, lib/cron-jobs.ts runAbandonedCartsJob,
--    and the admin abandoned-carts routes) is a server-side file, so
--    this one can be locked to service_role entirely with no public
--    policy needed at all. app/api/cart-track/route.ts and
--    runAbandonedCartsJob were switched from the anon client to
--    getSupabaseAdmin() in this same change so they keep working.
-- ============================================================

-- ---------- newsletter_subscribers ----------
DROP POLICY IF EXISTS "anon_select_newsletter" ON newsletter_subscribers;
DROP POLICY IF EXISTS "anon_delete_newsletter" ON newsletter_subscribers;

CREATE POLICY "admin_select_newsletter" ON newsletter_subscribers FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_delete_newsletter" ON newsletter_subscribers FOR DELETE
  TO service_role USING (true);

-- ---------- stock_notifications ----------
DROP POLICY IF EXISTS "anon_select_stock_notifications" ON stock_notifications;
DROP POLICY IF EXISTS "anon_delete_stock_notifications" ON stock_notifications;

CREATE POLICY "admin_select_stock_notifications" ON stock_notifications FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_delete_stock_notifications" ON stock_notifications FOR DELETE
  TO service_role USING (true);

-- ---------- abandoned_carts (fully locked, no anon policy left) ----------
DROP POLICY IF EXISTS "anon_all_abandoned_carts" ON abandoned_carts;

CREATE POLICY "admin_all_abandoned_carts" ON abandoned_carts FOR ALL
  TO service_role USING (true) WITH CHECK (true);
