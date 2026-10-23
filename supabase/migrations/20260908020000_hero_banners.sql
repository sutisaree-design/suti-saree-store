-- ============================================================
-- HERO BANNERS — new table, Admin > Hero Banners
-- ============================================================
-- Multiple homepage hero images that auto-rotate as a carousel.
-- Each banner can optionally link somewhere on click, but the link
-- is never shown as visible text/UI on top of the image itself —
-- the whole slide is just a click target.
--
-- Same RLS pattern as `homepage_tiles`
-- (20260906000000_homepage_tiles.sql): writes are service-role only
-- (via app/api/admin/hero-banners/*, gated by the same
-- requireAdmin()/ADMIN_SESSION_COOKIE check every other
-- /api/admin/* route uses), public SELECT is restricted to
-- is_active = true rows only.
-- ============================================================

CREATE TABLE IF NOT EXISTS hero_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  image_url text NOT NULL,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_banners_active_position_idx
  ON hero_banners (is_active, position);

ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;

-- Public can only ever see live banners — never draft/inactive ones.
DROP POLICY IF EXISTS "public_select_active_hero_banners" ON hero_banners;
CREATE POLICY "public_select_active_hero_banners" ON hero_banners FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- No anon/authenticated INSERT/UPDATE/DELETE policy is created — the
-- service role (used exclusively by app/api/admin/hero-banners/*)
-- bypasses RLS automatically, so this is enough to make writes admin-only.
DROP POLICY IF EXISTS "admin_write_hero_banners" ON hero_banners;
CREATE POLICY "admin_write_hero_banners" ON hero_banners FOR ALL
  TO service_role USING (true) WITH CHECK (true);
