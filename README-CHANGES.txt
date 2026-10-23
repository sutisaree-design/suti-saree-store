Changed files (6) — copy these into your repo at the same paths, then commit & push:

  lib/discover-products-api.ts        (edited)
  lib/home-data-server.ts             (edited)
  app/page.tsx                        (edited)
  app/home-client.tsx                 (edited)
  components/home/discover-products-section.tsx   (edited)
  components/product/discover-quick-view.tsx       (edited)

What changed:

1) Empty categories hidden from "Discover Products For You" filter pills
   - lib/discover-products-api.ts: new fetchDiscoverCategoryCountsServer()
     counts live products per category across the whole Discover set.
   - lib/home-data-server.ts, app/page.tsx, app/home-client.tsx: wire that
     count map through to the section as `discoverCategoryCounts`.
   - components/home/discover-products-section.tsx: category pills with a
     zero count are filtered out of the bar entirely.

2) Category/price filter bar goes sticky under the header on scroll (mobile)
   - components/home/discover-products-section.tsx: the filter-pill wrapper
     is now `sticky top-12` (matches the site header's height) with a
     blurred background, same pattern the /shop page's category row uses.

3) Quick View popup: colour picker now shows each variation's own photo
   instead of a plain colour dot
   - components/product/discover-quick-view.tsx: swatch buttons render a
     56x56 thumbnail of that colour's product image (falls back to a
     colour dot only if that variant has no image).

4) Quick View popup: drag-down-to-close on mobile, in addition to the X
   - components/product/discover-quick-view.tsx: added touch handlers
     (same technique as the cart drawer's swipe-to-close) so dragging the
     sheet down past ~25% of its height, or a fast flick, closes it. The
     existing X button still works as before. A small drag handle bar was
     also added at the top on mobile as a visual affordance.

5) Tapping a category/price pill while scrolled down now scrolls back to
   the top of the results
   - components/home/discover-products-section.tsx: the section now has a
     ref + `scroll-mt-12`, and every category/price selection calls
     `scrollIntoView({behavior:'smooth', block:'start'})`. Previously the
     grid swapped to the new (often shorter) product list off-screen below
     the shopper's current scroll position, so it looked like nothing had
     happened and the sticky bar could end up outside its section's
     scrollable bounds and stop sticking. Now every tap lands the shopper
     right at the top of the fresh results, directly under the sticky bar.

CHANGES.diff is the full unified diff of these edits against the repo you
cloned, if you'd rather apply it with `git apply CHANGES.diff` instead of
copying files by hand.
