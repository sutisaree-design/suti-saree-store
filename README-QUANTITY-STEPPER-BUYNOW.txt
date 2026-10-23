QUANTITY STEPPER + ADD TO BAG (ROW 1), BUY NOW FULL-WIDTH BELOW (ROW 2)
==========================================================================

WHAT CHANGED (1 file)
----------------------
app/product/[slug]/product-detail.tsx

Old layout: "Add to Bag" and "Buy Now" side by side, same width, no
quantity control visible in the buy box at all (quantity state existed
but was never exposed as a stepper on this page).

New layout (matches the reference screenshots):
  Row 1: [ - 1 + ] quantity stepper  +  [Add to Bag] (outline button,
         takes remaining width)
  Row 2: [Buy Now] -- full width, filled, sits directly below Row 1

  - Quantity stepper: -/+ buttons around the number, same visual pattern
    already used in your cart drawer (components/cart-drawer.tsx) for
    consistency. Decrease is disabled at 1, increase is disabled at the
    selected size's stock limit (selectedSizeStock) so a shopper can't
    request more than what's in stock.
  - New icon imports: Minus, Plus (from lucide-react, already a
    dependency -- no new package).
  - "Only 3 left in stock" text now sits on its own line above both rows
    (was inline before).
  - Out-of-stock state: single full-width disabled button, unchanged
    logic, just full-width now to match the new column layout.

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "redesign: quantity stepper + Add to Bag row, full-width Buy Now below"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check on mobile: tap +/- to confirm quantity updates and clamps
   at 1 and at available stock, then confirm Add to Bag and Buy Now both
   still add the correct quantity to the cart/checkout.
