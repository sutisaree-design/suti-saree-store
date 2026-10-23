TOAST POPUP NO LONGER COVERS THE HEADER — files in this zip
==============================================================

PROBLEM
-------
Any toast ("Saved to wishlist", "Added to cart", coupon messages, etc.)
used `position="top-center"` from the sonner library with no offset, so
it rendered flush against the very top of the screen -- directly on top
of / overlapping the sticky header, hiding the logo, search, cart icon,
etc. until the toast auto-dismissed.

WHAT CHANGED (1 file)
----------------------
components/providers.tsx

  - Both <Toaster> instances (the storefront one and the admin-route one)
    now pass `offset="68px"`.
  - Your header is a fixed 48px tall (`h-12` in components/header.tsx)
    plus its 1px bottom border. 68px offset gives it ~19px of breathing
    room below the header before the toast starts, instead of sitting
    right at pixel 0.
  - No other toast behavior changed -- same position (top-center), same
    colors/close button, same auto-dismiss timing. This only moves it
    down slightly so it stops covering the header.

HOW TO APPLY
------------
1. Copy components/providers.tsx from this zip into your repo at the
   same path (overwrite the existing file).
2. Commit and push:
     git add components/providers.tsx
     git commit -m "fix: offset toast notifications below the sticky header"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check: tap the wishlist heart (or add to cart) on mobile and
   confirm the toast now appears just below the header instead of
   overlapping it.

NOTE
----
If your header ever grows taller (e.g. a promo banner is enabled above
it via UrgencyBanner/SaleCountdownBar/SiteBanner, which are separate
dynamic strips), you may want to bump 68px up slightly so the toast still
clears everything. Those banners are conditional/dynamic, so this fix
uses a fixed value tuned for the normal (banner-free) header height.
