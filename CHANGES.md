# Real Blur Preview — Shop + Category grid (full implementation)

## 1. Root-cause bug fixed: real previews were stored under the wrong key
`lib/blur-preview-backfill.ts` was saving each legacy image's real blur
preview keyed by its **raw** pre-migration URL (raw Supabase/R2 URL), but
every read-side lookup (`getBlurPreviews`) always queries by the
**canonical** `/media/...` URL. Result: none of your 815 backfilled
previews were ever actually being found anywhere — including on the
product detail page, which silently fell back to the generic shimmer the
whole time. Only brand-new uploads (which already use the canonical URL
end-to-end) worked correctly.

Fixed: the backfill now stores (and checks "already done") using the same
canonical URL every reader expects.

**Action needed after deploying:** Go to Admin > Settings > Blur
Placeholder > "Generate Real Photo Previews" and click **Re-run
Backfill**. It will re-process the same 815 images, this time saving them
under the correct key. (No need to hit "Reset Status" first — Re-run
already re-checks everything against the fixed key.)

## 2. Shop + Category grid now use real per-photo blur previews
Previously these pages only showed the generic animated shimmer,
regardless of the real previews you generated. Now:

- `app/shop/page.tsx` and `app/category/[slug]/page.tsx` (server-side)
  fetch the real blur preview for every product's main photo + hover
  photo, using the same store the product page already reads from.
- That data flows down: page → `ShopContent`/`CategoryToolbarGrid` →
  `ProductCard` → `CatalogCardMedia`.
- Any photo that doesn't have a real preview yet (still mid-backfill, or
  generation failed for that one image) automatically falls back to the
  generic shimmer — never a blank or broken image.

## Files changed
- `lib/blur-preview-backfill.ts` — bug fix (wrong storage key)
- `app/shop/page.tsx` — fetches + passes real previews
- `app/category/[slug]/page.tsx` — fetches + passes real previews
- `app/shop/shop-content.tsx` — threads `blurPreviews` prop through
- `components/category/category-toolbar-grid.tsx` — threads `blurPreviews` prop through
- `components/product-card.tsx` — looks up this card's specific preview, passes to CatalogCardMedia
- `components/catalog-card-media.tsx` — uses real preview when available, else generic shimmer
- `components/product/variant-swatches.tsx` — untouched functionally, included so you have the current full/correct version (from the earlier build-fix round)

## Verified
Full `npx tsc --noEmit` typecheck across the whole project — **0 errors**.

## How to apply
1. Unzip into your project root, allow it to overwrite all 8 files
   (paths already match your repo structure).
2. `git add -A`
3. `git commit -m "feat: real per-photo blur preview on shop/category grid + fix backfill key bug"`
4. `git push`
5. After deploy: Admin > Settings > Blur Placeholder > Re-run Backfill (see note above).

## Note on scope
Only each card's **main photo** and **hover-swap photo** get the real
preview (those are the two images a shop/category card can actually
show). Dynamic swaps — the colour-swatch hover preview on the card, or a
"search by photo" match — fall back to the generic shimmer if that
specific photo wasn't part of the prefetch, since it's decided at click
time. This keeps the server-side fetch scoped to what's actually visible
by default instead of every possible colour of every product.
