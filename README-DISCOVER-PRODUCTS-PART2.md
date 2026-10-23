# Discover Products For You — Part 2 (Storefront + Quick View)

This zip contains only the files that are **new or changed** for Part 2.
Part 1 (backend + admin panel) is assumed to already be merged.

## How to apply

Copy each file into the same path in your repo, overwriting the existing
ones (`app/home-client.tsx`, `app/page.tsx`, `lib/home-data-server.ts`),
and adding the new ones:

```
app/api/discover-products/route.ts          (new)
app/home-client.tsx                         (replace)
app/page.tsx                                (replace)
lib/home-data-server.ts                     (replace)
components/home/discover-products-section.tsx  (new)
components/product/discover-quick-view.tsx     (new)
```

Then:

```
git add .
git commit -m "Discover Products For You: Part 2 - storefront section + quick view"
git push
```

## What was built

1. **`app/api/discover-products/route.ts`** — public GET route that wraps
   `fetchDiscoverProductsServer()` (from Part 1's `lib/discover-products-api.ts`)
   with `category`, `priceMin`, `priceMax`, `page`, `pageSize` query params.
   Powers the section's "load more" / infinite scroll and filter re-fetches.

2. **`lib/home-data-server.ts`** — `fetchHomeData()` now also calls
   `fetchDiscoverProductsServer({ page: 1 })` server-side (fail-quiet, same
   pattern as the homepage tiles/hero banners) and returns
   `discoverSettings`, `discoverInitialProducts`, `discoverInitialHasMore`
   alongside the existing homepage data — so the section's first page
   renders with no client-side loading flash.

3. **`app/page.tsx`** — passes the three new fields through to
   `<HomeClient />`.

4. **`app/home-client.tsx`** — imports and renders
   `<DiscoverProductsSection />` directly after `<HomepageGrid />` (Today's
   Picks) and before `<PromoSlider />`, exactly as specified.

5. **`components/home/discover-products-section.tsx`** (new) — the
   section itself:
   - Eyebrow title/subtitle from admin settings.
   - Category filter chips (from the `categories` prop already available
     on the homepage) — optional per `settings.show_category_filter`.
   - Price filter chips reusing the exact same `PriceRangeFilterBar` +
     `fetchPriceRangeFilters()` the Shop page's "Shop by Price" uses —
     optional per `settings.show_price_filter`.
   - A 2/4-column product grid matching `HomepageGrid`'s visual language.
   - Infinite scroll via `IntersectionObserver` on a sentinel div, calling
     `/api/discover-products` for further pages; changing a filter resets
     to page 1 and replaces the list.
   - A local, lightweight `DiscoverProductCard` (not the shared
     `ProductCard`) so nothing about `ProductCard`'s behaviour elsewhere
     on the site (Featured, New Arrivals, Similar Products, Search, etc.)
     is touched. Clicking a card opens the Quick View instead of
     navigating.
   - Section is hidden entirely (renders `null`) when disabled from
     Admin, or when in Manual mode with zero active picks — evaluated off
     the server-rendered first page, so there's no flash-then-hide.

6. **`components/product/discover-quick-view.tsx`** (new) — the inline
   "Quick View": a bottom sheet on mobile that re-centers into a modal-like
   card on `sm:` and up (via CSS on the existing `Sheet` component, per
   the brief's "simplicity over over-engineering" allowance — no new
   `useMediaQuery` hook needed). Contents:
   - Close (X) — built into `SheetContent`.
   - Product image, name (colour-aware via `getVariantDisplayName`),
     price/MRP/discount.
   - Colour swatches (if the product has variants) — switching colour
     calls `fetchVariantBySlug()` and merges the variant's price/images/
     sizes/stock onto the base product, the same formula
     `app/product/[slug]/product-detail.tsx` already uses, kept
     deliberately pragmatic rather than porting the full PDP logic.
   - Size chips (if applicable).
   - **Add to Cart** — calls the same `useCart().addItem()` `ProductCard`
     uses; opens the cart drawer as feedback exactly like the existing
     quick "+" add-to-cart does elsewhere, without closing the Quick View
     or navigating.
   - **Wishlist** — reuses `components/wishlist-button.tsx` as-is.
   - **"View full details →"** — the only link that navigates away, to
     `/product/[slug]`.
   - Opening a card whose product has a `default_variant_slug` shows that
     variant by default, matching what a full click-through would land on
     (same as `ProductCard`'s own href logic).

## Verified

- `npx tsc --noEmit` — **0 errors** across the whole repo with these
  changes applied.
- `npm run build` gets past compiling all application code (including
  every new/changed file here) and only fails in this sandbox because
  outbound requests to `fonts.googleapis.com` are blocked by the sandbox's
  network allowlist — unrelated to this change. It should build cleanly
  in your normal environment (Netlify/Vercel/local) where Google Fonts is
  reachable. If you want to double-check locally before pushing:

  ```
  npm install
  npm run build
  ```

## Not touched

`components/product-card.tsx` and every existing usage of it (Featured,
New Arrivals, Similar Products, Search, etc.) are untouched — the new
section uses its own local `DiscoverProductCard` instead, per the brief's
explicit "prefer NOT breaking ProductCard's existing behaviour" guidance.
