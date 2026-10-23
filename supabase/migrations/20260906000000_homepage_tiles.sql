-- ============================================================
-- HOMEPAGE TILES — new table, Admin > Homepage Tiles
-- ============================================================
-- Flexible homepage promo-grid tiles (e.g. the "BUY 1 GET 1 FREE" /
-- "Up to 60% off" 2x2 grid). Each tile can link to a collection, a
-- promotion (see Part 4), or a raw custom URL.
--
-- Same RLS pattern as `promotions` (20260905000000_promotions_bogo.sql):
-- writes are service-role only (via app/api/admin/homepage-tiles/*,
-- gated by the same requireAdmin()/ADMIN_SESSION_COOKIE check every
-- other /api/admin/* route uses), public SELECT is restricted to
-- is_active = true rows only.
-- ============================================================

CREATE TABLE IF NOT EXISTS homepage_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  subtitle text,
  badge_text text,
  price_label text,
  image_url text,
  cta_label text NOT NULL DEFAULT 'Shop Now',
  link_type text NOT NULL DEFAULT 'collection',
  link_value text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_tiles_link_type_check
    CHECK (link_type IN ('collection', 'promotion', 'custom_url'))
);

CREATE INDEX IF NOT EXISTS homepage_tiles_active_position_idx
  ON homepage_tiles (is_active, position);

ALTER TABLE homepage_tiles ENABLE ROW LEVEL SECURITY;

-- Public can only ever see live tiles — never draft/inactive ones.
DROP POLICY IF EXISTS "public_select_active_homepage_tiles" ON homepage_tiles;
CREATE POLICY "public_select_active_homepage_tiles" ON homepage_tiles FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- No anon/authenticated INSERT/UPDATE/DELETE policy is created — the
-- service role (used exclusively by app/api/admin/homepage-tiles/*)
-- bypasses RLS automatically, so this is enough to make writes admin-only.
DROP POLICY IF EXISTS "admin_write_homepage_tiles" ON homepage_tiles;
CREATE POLICY "admin_write_homepage_tiles" ON homepage_tiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);
