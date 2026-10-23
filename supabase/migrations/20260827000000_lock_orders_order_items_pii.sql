-- ============================================================
-- PII LEAK FIX — Part 2, Step 3
-- APPLY THIS ONLY AFTER "part2-step2-code-before-lock" has been
-- deployed. It converts every anon-key read of orders/order_items to
-- the service-role client, so this lock does not break: reseller
-- dashboard, order-confirmation emails, chat order lookup, "bought
-- together" bundles, or the social-proof toast.
--
-- What stays working automatically, with no code change:
--   - Logged-in customers' "My Orders" / order detail pages
--     (app/account/orders/*) — they use the cookie-aware client, so
--     auth.uid() resolves correctly under the policy below.
--   - lib/reviews-api.ts hasPurchasedProduct() — same cookie-aware
--     client, same policy.
--   - Every admin/vendor dashboard route — already on the service
--     role, which bypasses RLS entirely.
-- ============================================================

-- ---------- orders ----------
DROP POLICY IF EXISTS "anon_select_orders" ON orders;

-- Logged-in customers can see their own orders — matched by user_id
-- (orders placed while logged in) OR by their account email (orders
-- placed as a guest with the same email before they had an account,
-- exactly what account/orders/page.tsx already assumes).
CREATE POLICY "customers_select_own_orders" ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR customer_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "admin_select_orders" ON orders FOR SELECT
  TO service_role USING (true);

-- ---------- order_items ----------
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;

CREATE POLICY "customers_select_own_order_items" ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id = auth.uid() OR o.customer_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "admin_select_order_items" ON order_items FOR SELECT
  TO service_role USING (true);
