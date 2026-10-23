# Part 4a — Auto-link a BOGO promotion to a homepage tile

Extract this zip into your repo root (`E-Commerce-ethnic/`) and let it overwrite/add files at
the matching paths — the folder structure inside the zip mirrors the repo exactly.

## Files

**New:**
- `supabase/migrations/20260907000000_homepage_tiles_source_promotion.sql`
  Adds `source_promotion_id` to `homepage_tiles` (FK to `promotions`, `ON DELETE CASCADE`, unique
  when set). Run this migration against your Supabase project before testing.
- `lib/promotion-homepage-tile-sync.ts`
  Server-only helper (`syncHomepageTileForPromotion`, `promotionHasLinkedTile`,
  `fetchLinkedTilePromotionIds`) that creates/updates/removes a promotion's auto-linked tile.

**Modified:**
- `app/api/admin/promotions/route.ts` — GET now returns `show_as_homepage_tile` per promotion;
  POST auto-creates the linked tile when the checkbox was checked on create.
- `app/api/admin/promotions/[id]/route.ts` — PATCH now syncs the linked tile on every edit
  (create/update/remove depending on the checkbox + scope). DELETE is untouched — the
  `ON DELETE CASCADE` FK removes the tile automatically when a promotion is deleted.
- `lib/promotions-api.ts` — `Promotion` and `PromotionInput` types gained the optional
  `show_as_homepage_tile` field.
- `components/admin/promotions-panel.tsx` — new "Show as homepage tile" toggle in the
  Add/Edit Promotion form, visible only when Scope = "Specific Collection" (a tile needs a
  collection to route to, which Part 4b wires up).

## Design notes

- `source_promotion_id` is a dedicated column rather than matching on
  `link_type='promotion' AND link_value=promotion.id`, so a manually-typed matching id in the
  Homepage Tiles panel can never be mistaken for an auto-linked tile.
- Tile title/subtitle/badge text are derived from `buy_qty` / `get_qty` /
  `free_item_discount_percent` and re-derived on every promotion edit, so editing the offer
  later keeps the tile text correct without re-checking the box.
- `show_as_homepage_tile` is only honored when `scope === 'collection'`; if scope is `'all'` the
  panel hides the toggle and the API forces `shouldShow=false`.
- Tile sync failures are swallowed (non-fatal) so a promotion save never fails because of a
  homepage_tiles hiccup — same "fail quiet" philosophy as `fetchHomeBanner`.

## Test checklist (from the build plan)

1. Run the new migration.
2. Create a promotion with scope = Specific Collection, check "Show as homepage tile", save →
   confirm exactly one `homepage_tiles` row appears (title like "Buy 1" / "Get 1 Free").
3. Edit that promotion (e.g. change `get_qty`) → confirm the tile's title/subtitle updates.
4. Uncheck the box, save → confirm the tile row is gone.
5. Re-check it, then delete the promotion entirely → confirm the tile is gone (cascade).

Part 4b (tile → collection routing + BOGO badge on product cards) is next, per the original plan.
