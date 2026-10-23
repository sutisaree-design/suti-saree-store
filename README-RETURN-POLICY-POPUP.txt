RETURN POLICY OPENS AS A POPUP (SAME PAGE) INSTEAD OF NAVIGATING AWAY
=========================================================================

WHAT CHANGED (1 file)
----------------------
app/product/[slug]/product-detail.tsx

Old: "Return Policy" was a <Link> to /legal/refund-policy -- tapping it
navigated the shopper off the product page entirely.

New: "Return Policy" is now a Dialog trigger (using your existing
components/ui/dialog.tsx, Radix-based, already in your repo -- no new
dependency). Tapping it opens a popup right on top of the product page:
  - Same live admin-driven return/shipping text shown elsewhere on the
    page (shippingReturnsSummary(fulfillment, freeShippingThreshold) --
    same source of truth as the "Delivery & Returns" accordion item, so
    nothing new to maintain).
  - A dark overlay behind it, and a built-in "X" close button top-right
    (comes free from your dialog.tsx component).
  - A "Read the full policy ->" link at the bottom, still pointing to
    /legal/refund-policy, for shoppers who want the complete legal page
    instead of just the summary.
  - Shopper stays on the product page the whole time; closing the popup
    (X button, clicking the overlay, or pressing Esc) just returns them
    to exactly where they were.

Also threaded `freeShippingThreshold` down into the ProductInfo
component (it already existed as page-level state, just wasn't passed
to this component before) so the popup's summary text can include the
free-shipping threshold like the rest of the page does.

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "feat: Return Policy opens as an in-page popup instead of navigating away"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check: tap "Return Policy" -> popup opens over the product page
   with an X to close -> tapping "Read the full policy" still goes to
   /legal/refund-policy as before.
