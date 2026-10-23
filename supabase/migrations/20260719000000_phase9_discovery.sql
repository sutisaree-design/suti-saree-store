-- Phase 9: Product Discovery & Engagement
-- 1. Adds an `occasion` tag array to products (used for the new shop filter
--    and for smarter "You may also like" recommendations).
-- 2. Adds a `stock_notifications` table backing the "Notify me" button shown
--    on out-of-stock products, plus an admin panel to view/trigger restock
--    emails (Admin -> Restock Alerts).
--
-- Recently-viewed products are intentionally NOT stored server-side --
-- they're tracked per-browser in localStorage (lib/recently-viewed.ts) so
-- it works instantly for guests too, with zero extra reads/writes.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS occasion text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS stock_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email text NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, email)
);

CREATE INDEX IF NOT EXISTS idx_stock_notifications_product_pending
  ON stock_notifications (product_id) WHERE notified = false;

ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;

-- Any storefront visitor can sign up to be notified (insert only).
DROP POLICY IF EXISTS "anon_insert_stock_notifications" ON stock_notifications;
CREATE POLICY "anon_insert_stock_notifications" ON stock_notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Admin dashboard (protected by the admin_session cookie in middleware.ts,
-- same trust model as newsletter/abandoned-carts) needs to list, update
-- (mark notified) and delete using the anon key from the browser.
DROP POLICY IF EXISTS "anon_select_stock_notifications" ON stock_notifications;
CREATE POLICY "anon_select_stock_notifications" ON stock_notifications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_stock_notifications" ON stock_notifications;
CREATE POLICY "anon_update_stock_notifications" ON stock_notifications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stock_notifications" ON stock_notifications;
CREATE POLICY "anon_delete_stock_notifications" ON stock_notifications FOR DELETE
  TO anon, authenticated USING (true);
