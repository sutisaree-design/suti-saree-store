-- ============================================================
-- COLLECTIONS — separate "show on homepage" toggle
-- ============================================================
-- is_active already gates whether a collection's page (/collection/[slug])
-- exists and whether it can be linked from a Promotion or a Homepage Tile.
-- This adds a second, independent toggle that only controls whether the
-- collection appears as a circle in the "Shop by Collection" row on the
-- homepage — so an admin can hide a collection from that row (e.g. a BOGO
-- collection that's only meant to be reached via a Promotion tile) without
-- deactivating it and breaking any Promotion/Homepage Tile that links to
-- it.
-- ============================================================

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT true;
