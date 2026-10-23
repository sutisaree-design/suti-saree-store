-- ============================================================
-- HOMEPAGE TILES — auto-link column (Part 4a)
-- ============================================================
-- Promotions panel gets a "Show as homepage tile" checkbox. When
-- checked, the promotions API auto-creates/updates a homepage_tiles
-- row instead of the admin having to enter the tile by hand.
--
-- `source_promotion_id` marks a tile as "owned" by a promotion, kept
-- distinct from `link_value` (which is what the storefront actually
-- reads to route clicks, per link_type='promotion'). Using its own
-- column instead of matching on link_type/link_value means a tile
-- can never be mistaken for auto-linked just because someone typed
-- a matching id by hand in the raw link_value field.
--
-- ON DELETE CASCADE: deleting a promotion removes its auto-linked
-- tile automatically, so app/api/admin/promotions/[id]/route.ts's
-- DELETE handler doesn't need extra homepage_tiles cleanup code.
-- ============================================================

ALTER TABLE homepage_tiles
  ADD COLUMN IF NOT EXISTS source_promotion_id uuid
    REFERENCES promotions(id) ON DELETE CASCADE;

-- A promotion should only ever auto-own one tile.
CREATE UNIQUE INDEX IF NOT EXISTS homepage_tiles_source_promotion_unique_idx
  ON homepage_tiles (source_promotion_id)
  WHERE source_promotion_id IS NOT NULL;
