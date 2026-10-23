MOVED ADD TO BAG / BUY NOW BUTTONS UP (right after coupon + stock line)
==========================================================================

WHAT CHANGED (1 file)
----------------------
app/product/[slug]/product-detail.tsx

Old order on the buy box:
  Coupon list (with "Applied" state)
  -> Low stock badge ("Only 3 left in stock")
  -> Product Highlights (Occasion/Fabric/Transparency/Blouse table)
  -> Add to Bag / Buy Now buttons
  -> Pincode checker

New order:
  Coupon list (with "Applied" state)
  -> Low stock badge ("Only 3 left in stock")
  -> Add to Bag / Buy Now buttons          <- moved up
  -> Product Highlights
  -> Pincode checker

So the buttons now sit directly below the applied-coupon confirmation and
the stock-urgency line, instead of after the highlights table -- the
shopper sees "coupon applied, only 3 left" and the buy buttons in the
same glance, no scrolling past the highlights table first.

No styling changed, only the position in the JSX -- same buttons, same
props, same mobile-visible behavior from the last fix.

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "reorder: move Add to Bag / Buy Now above Product Highlights"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
