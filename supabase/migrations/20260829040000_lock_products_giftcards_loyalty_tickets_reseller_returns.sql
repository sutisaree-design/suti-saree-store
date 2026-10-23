-- ============================================================
-- CRITICAL RLS LOCKDOWN — round 2
-- Every policy below was traced to its FINAL effective state (not
-- just the migration that "looked like" a fix). In every case a
-- Day-1 "anon_*"/"open_*" policy with USING(true) was left active
-- alongside a later, correctly-scoped policy. Postgres RLS combines
-- multiple permissive policies with OR, so the old wide-open policy
-- silently defeated the new restricted one.
--
-- READ BEFORE APPLYING:
-- Some of these tables (gift_cards, loyalty_points_ledger,
-- support_tickets, reseller_profiles, returns) may currently be read
-- via the anon-key client somewhere in the app (dashboards, receipts,
-- confirmation pages). Exactly like the orders/order_items fix, any
-- such anon-key read must be moved to a server route using the
-- service-role client BEFORE this migration is applied in production,
-- or those pages will start returning empty results. Vendor/admin
-- dashboards already on service_role are unaffected (service_role
-- bypasses RLS entirely; the "admin_*"/"service_role" policies below
-- are added only for documentation/consistency, matching the existing
-- pattern in this repo).
-- ============================================================

-- ---------- products ----------
-- Public catalog browsing is intentional, so SELECT stays open.
-- The problem was INSERT/UPDATE/DELETE: a scoped vendor-ownership
-- policy already exists (own_insert/update_vendor_products from
-- phase2_vendor_products.sql) but the Day-1 anon_* policies below
-- were never dropped, so anyone with the public anon key could still
-- edit or delete ANY product (price, stock, images, or delete it
-- outright) regardless of vendor_id.
DROP POLICY IF EXISTS "anon_insert_products" ON products;
DROP POLICY IF EXISTS "anon_update_products" ON products;
DROP POLICY IF EXISTS "anon_delete_products" ON products;

-- No anon_delete_vendor_products / admin delete policy existed at all
-- for products — only admins (service_role) should ever hard-delete
-- a product.
CREATE POLICY "admin_delete_products" ON products FOR DELETE
  TO service_role USING (true);

CREATE POLICY "admin_write_products" ON products FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "admin_update_products" ON products FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- ---------- gift_cards ----------
DROP POLICY IF EXISTS "open_select_gift_cards" ON gift_cards;

CREATE POLICY "customers_select_own_gift_cards" ON gift_cards FOR SELECT
  TO authenticated
  USING (
    purchased_by_user_id = auth.uid()
    OR purchaser_email = (auth.jwt() ->> 'email')
    OR recipient_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "admin_select_gift_cards" ON gift_cards FOR SELECT
  TO service_role USING (true);

-- (open_insert_gift_cards / open_update_gift_cards were already
-- dropped in lock_coupon_giftcard_writes.sql — writes go through
-- service_role only, which is correct: balances must never be
-- client-writable.)

-- ---------- gift_card_transactions ----------
DROP POLICY IF EXISTS "open_select_gift_card_transactions" ON gift_card_transactions;

CREATE POLICY "customers_select_own_gift_card_transactions" ON gift_card_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM gift_cards gc
      WHERE gc.id = gift_card_transactions.gift_card_id
        AND (
          gc.purchased_by_user_id = auth.uid()
          OR gc.purchaser_email = (auth.jwt() ->> 'email')
          OR gc.recipient_email = (auth.jwt() ->> 'email')
        )
    )
  );

CREATE POLICY "admin_select_gift_card_transactions" ON gift_card_transactions FOR SELECT
  TO service_role USING (true);

-- (open_insert_gift_card_transactions was already dropped in
-- lock_coupon_giftcard_writes.sql.)

-- ---------- loyalty_points_ledger ----------
DROP POLICY IF EXISTS "own_select_loyalty_ledger" ON loyalty_points_ledger;
DROP POLICY IF EXISTS "own_insert_loyalty_ledger" ON loyalty_points_ledger;

CREATE POLICY "customers_select_own_loyalty_ledger" ON loyalty_points_ledger FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Points are earned/redeemed by server-side logic tied to real orders
-- — a client should never be able to insert its own "earn" row, that
-- is a direct free-reward/discount fraud vector. Inserts are
-- service_role only from here on.
CREATE POLICY "admin_select_loyalty_ledger" ON loyalty_points_ledger FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_insert_loyalty_ledger" ON loyalty_points_ledger FOR INSERT
  TO service_role WITH CHECK (true);

-- ---------- support_tickets ----------
-- Ticket creation stays open (guests file tickets before having an
-- account, matching the original design comment) — only SELECT/UPDATE
-- were the leak.
DROP POLICY IF EXISTS "own_select_support_tickets" ON support_tickets;
DROP POLICY IF EXISTS "anon_update_support_tickets" ON support_tickets;

CREATE POLICY "customers_select_own_support_tickets" ON support_tickets FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR customer_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "admin_select_support_tickets" ON support_tickets FOR SELECT
  TO service_role USING (true);

-- Status changes (resolving/closing tickets, adding admin_notes) are
-- an admin/support-agent action only — not something a customer or
-- anonymous caller should ever be able to do directly.
CREATE POLICY "admin_update_support_tickets" ON support_tickets FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- ---------- reseller_profiles ----------
DROP POLICY IF EXISTS "anon_select_reseller_profiles" ON reseller_profiles;
DROP POLICY IF EXISTS "anon_insert_reseller_profiles" ON reseller_profiles;
DROP POLICY IF EXISTS "anon_update_reseller_profiles" ON reseller_profiles;
DROP POLICY IF EXISTS "anon_delete_reseller_profiles" ON reseller_profiles;

CREATE POLICY "resellers_select_own_profile" ON reseller_profiles FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "resellers_insert_own_profile" ON reseller_profiles FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "resellers_update_own_profile" ON reseller_profiles FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- No self-serve delete — closing/suspending a reseller account is an
-- admin action (status column exists for exactly this reason).
CREATE POLICY "admin_all_reseller_profiles" ON reseller_profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------- returns ----------
DROP POLICY IF EXISTS "own_select_returns" ON returns;
DROP POLICY IF EXISTS "own_insert_returns" ON returns;

CREATE POLICY "customers_select_own_returns" ON returns FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = returns.order_id
        AND (o.user_id = auth.uid() OR o.customer_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "customers_insert_own_returns" ON returns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = returns.order_id
        AND (o.user_id = auth.uid() OR o.customer_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "admin_select_returns" ON returns FOR SELECT
  TO service_role USING (true);

CREATE POLICY "admin_insert_returns" ON returns FOR INSERT
  TO service_role WITH CHECK (true);

-- (anon_update_returns was already fixed to admin_update_returns in
-- lock_dead_and_admin_only_tables.sql.)

-- ---------- categories ----------
-- Public read is intentional (storefront navigation). Only the writes
-- were the vulnerability (defacement risk) — lock them to admin.
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;

CREATE POLICY "admin_write_categories" ON categories FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "admin_update_categories" ON categories FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_delete_categories" ON categories FOR DELETE
  TO service_role USING (true);

-- ---------- coupons ----------
-- Writes were already locked in lock_coupon_giftcard_writes.sql.
-- SELECT is intentionally left open here: coupon codes are meant to
-- be discoverable/checkable by the storefront (users type a code to
-- validate it), and no PII is exposed. Flagged as low severity per
-- the audit — no change needed unless you want coupons hidden until
-- applied, which would be a product decision, not a security fix.
