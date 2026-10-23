ALL ACCORDION SECTIONS NOW CLOSED BY DEFAULT — 1 file
========================================================

WHAT CHANGED
------------
app/product/[slug]/product-detail.tsx

Removed `defaultValue="core-features"` from the Accordion. Previously
"Core Features" auto-opened on page load; now all four sections (Core
Features, Details, Delivery & Returns, Care Guide) start collapsed and
only expand when the shopper taps one.

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "fix: all accordion sections closed by default on product page"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
