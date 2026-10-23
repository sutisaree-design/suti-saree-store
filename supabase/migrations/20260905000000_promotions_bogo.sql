-- ============================================================
-- PROMOTIONS (BOGO) — new table, Admin > Promotions
-- ============================================================
-- Auto-apply "Buy X Get Y" promotions (e.g. Buy 1 Get 1 Free, Buy 2 Get 1
-- Free) — no coupon code entry needed, the storefront cart applies these
-- automatically when a shopper's cart qualifies.
--
-- Unlike the older `coupons`/`gift_cards` tables (which originally shipped
-- with a wide-open `anon_write_*` policy that was locked down later, see
-- 20260726150100_lock_coupon_giftcard_writes.sql), this table ships
-- correctly from day one: writes are service-role only from the start
-- (all admin writes go through app/api/admin/promotions, which is gated
-- by the same requireAdmin()/ADMIN_SESSION_COOKIE check every other
-- /api/admin/* route uses — see lib/promotions-api.ts).
--
-- SELECT is public but restricted to is_active = true rows only, since the
-- storefront cart (Part 2) needs to read which promotions are currently
-- live without being logged in — inactive/draft promotions stay admin-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  offer_type text NOT NULL DEFAULT 'buy_x_get_y',
  buy_qty integer NOT NULL DEFAULT 1,
  get_qty integer NOT NULL DEFAULT 1,
  free_item_discount_percent integer NOT NULL DEFAULT 100,
  scope text NOT NULL DEFAULT 'all',
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_offer_type_check CHECK (offer_type IN ('buy_x_get_y')),
  CONSTRAINT promotions_scope_check CHECK (scope IN ('all', 'collection')),
  CONSTRAINT promotions_buy_qty_check CHECK (buy_qty >= 1),
  CONSTRAINT promotions_get_qty_check CHECK (get_qty >= 1),
  CONSTRAINT promotions_discount_pct_check
    CHECK (free_item_discount_percent >= 1 AND free_item_discount_percent <= 100),
  CONSTRAINT promotions_scope_collection_check
    CHECK (scope <> 'collection' OR collection_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS promotions_active_idx ON promotions (is_active, starts_at, ends_at);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- Public can only ever see live promotions (the exact fields needed to
-- compute a BOGO discount client-side) — never drafts/paused/expired ones.
DROP POLICY IF EXISTS "public_select_active_promotions" ON promotions;
CREATE POLICY "public_select_active_promotions" ON promotions FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- No anon/authenticated INSERT/UPDATE/DELETE policy is created — the
-- service role (used exclusively by app/api/admin/promotions/*) bypasses
-- RLS automatically, so this is enough to make writes admin-only.
DROP POLICY IF EXISTS "admin_write_promotions" ON promotions;
CREATE POLICY "admin_write_promotions" ON promotions FOR ALL
  TO service_role USING (true) WITH CHECK (true);
