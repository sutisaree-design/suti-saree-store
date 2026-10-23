TRUST BADGES + RETURN POLICY LINK + PAYMENT SECURITY (v2 — cleaner visual) — files in this zip
=================================================================================================

WHAT CHANGED (1 file)
----------------------
app/product/[slug]/product-detail.tsx

v1 -> v2 fix: the bottom row (Return Policy link + payment note) looked
cramped and low-contrast — two different pieces of info squeezed into
one tiny 10-11px row with no visual separation. v2 redesigns just that
row to match the site's existing pill/chip visual language (same style
as the "32% OFF" and "Buy 2 Get 1 Free" tags already on the product
page), so it reads as an intentional, premium UI element instead of an
afterthought:

  - "Return Policy" link now uses a proper Tabler-style chevron icon
    (ChevronRight from lucide-react) instead of a plain "→" character,
    at 12px font-semibold, with a subtle slide-on-hover micro-interaction.
  - "Secure payments via Razorpay" is now a rounded pill/chip (rounded-full,
    subtle border + muted background) — same visual pattern as your
    existing coupon/discount tags — instead of bare inline text competing
    for space with the link.
  - Both sit in the same row with proper spacing (justify-between, gap-2)
    so neither wraps awkwardly on narrow (360-390px) screens.
  - The 3 badge icons above (Free Shipping / Authentic / Returns) keep
    their existing tooltips (hover/tap to see why each is true) —
    unchanged from v1, just visually untouched since that part already
    matched the site's look.

Total added height vs. the original 3-badge-only card: ~40px. No new
section, no extra scroll on mobile.

New icon imports: `Lock`, `ChevronRight` from lucide-react (added to the
existing lucide-react import list at the top of the file).

HOW TO APPLY
------------
1. Copy app/product/[slug]/product-detail.tsx from this zip into your
   repo at the same path (overwrite the existing file).
2. Commit and push:
     git add "app/product/[slug]/product-detail.tsx"
     git commit -m "polish: pill-style Razorpay badge + chevron Return Policy link on product page"
     git push
3. Vercel/Netlify will redeploy automatically on push if connected,
   otherwise trigger a deploy manually.
4. Spot check on a live product page (mobile width, ~375-390px) that:
     - The Return Policy link + Razorpay pill sit on one line, no wrap
     - Tapping/hovering a badge above still shows its tooltip
     - "Return Policy" opens /legal/refund-policy with real content
