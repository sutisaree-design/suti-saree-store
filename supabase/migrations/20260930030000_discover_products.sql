-- ============================================================
-- DISCOVER PRODUCTS — new table, Admin > Discover Products
-- ============================================================
-- Powers the "Discover Products For You" homepage section
-- (components/home/discover-products-section.tsx), rendered right after
-- the existing Homepage Tiles ("Today's Picks") grid.
--
-- The section can run in two modes (see the `discover_section_settings`
-- key in the generic `settings` table, written by
-- lib/discover-products-api.ts the same way `price_range_filters` already
-- is — no extra table needed for that part):
--   - 'auto'   -> pulls live products directly from `products`, no rows
--                 in this table are read.
--   - 'manual' -> pulls exactly the products curated here, in `position`
--                 order.
--
-- Same RLS pattern as `homepage_tiles`
-- (20260906000000_homepage_tiles.sql): writes are service-role only (via
-- app/api/admin/discover-products/*, gated by the same
-- requireAdmin()/ADMIN_SESSION_COOKIE check every other /api/admin/*
-- route uses), public SELECT is restricted to is_active = true rows only.
-- ============================================================

CREATE TABLE IF NOT EXISTS discover_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS discover_picks_active_position_idx
  ON discover_picks (is_active, position);

ALTER TABLE discover_picks ENABLE ROW LEVEL SECURITY;

-- Public can only ever see live picks — never draft/inactive ones.
DROP POLICY IF EXISTS "public_select_active_discover_picks" ON discover_picks;
CREATE POLICY "public_select_active_discover_picks" ON discover_picks FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- No anon/authenticated INSERT/UPDATE/DELETE policy is created — the
-- service role (used exclusively by app/api/admin/discover-products/*)
-- bypasses RLS automatically, so this is enough to make writes admin-only.
DROP POLICY IF EXISTS "admin_write_discover_picks" ON discover_picks;
CREATE POLICY "admin_write_discover_picks" ON discover_picks FOR ALL
  TO service_role USING (true) WITH CHECK (true);
