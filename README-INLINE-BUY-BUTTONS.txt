INLINE ADD TO BAG + BUY NOW BUTTONS ON MOBILE (v3) — files in this zip
=========================================================================

PROBLEM
-------
On mobile, "Add to Bag" / "Buy Now" only existed inside the FIXED bottom
sticky bar (MobileStickyCartBar). The inline buttons next to the price/
stock info were hidden on mobile (`hidden ... md:flex` -- desktop only).
So a shopper reading the "Only 3 left in stock" line, highlights, coupons
etc. had no button right there -- they had to notice the fixed bar at the
very bottom of the screen, which is easy to miss or associate with
something else (e.g. it can visually blend in near the WhatsApp/chat
bubble also fixed at the bottom-right). That's a plausible reason for
drop-off between "browsing the product" and "tapping to buy."

WHAT CHANGED (1 file)
----------------------
app/product/[slug]/product-detail.tsx

  - The buy-box button row (right after "Only X left in stock", above
    the pincode checker) now shows BOTH "Add to Bag" and "Buy Now" on
    ALL screen sizes -- removed the `hidden ... md:flex` that hid them
    on mobile. Desktop previously only had "Add to Bag" here; "Buy Now"
    is now added inline for desktop too (it only existed in the sticky
    bar before, which is mobile-only).
  - "Add to Bag" -> outline button (border-primary, text-primary).
    "Buy Now" -> solid filled button (bg-primary). Same visual pairing
    already used in MobileStickyCartBar, so the two buttons look
    consistent wherever a shopper sees them on the page.
  - New prop `onBuyNow` threaded into the ProductInfo component (it
    already existed as `handleBuyNow` at the page level -- just wasn't
    passed down to this inline block before).
  - MOBILE STICKY BAR (MobileStickyCartBar) IS UNCHANGED -- it still
    shows fixed at the bottom of the screen exactly as before. This is
    intentionally a second, duplicate path to purchase, not a
    replacement: shoppers scrolling through the description/reviews
    further down the page still have the sticky bar as a fallback, while
    shoppers who stop right at the buy box now see a clear, unmissable
    call-to-action there too.

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "fix: show Add to Bag + Buy Now inline on mobile (not just in sticky bar)"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check on mobile width (~375-390px):
     - Both buttons appear right after the stock/price info, side by side
     - The fixed bottom sticky bar still appears separately, unchanged,
       once you scroll (it's meant to stay -- don't remove it)
     - Tapping either inline button behaves the same as the sticky bar's
       buttons (same handlers, same cart/checkout flow)
