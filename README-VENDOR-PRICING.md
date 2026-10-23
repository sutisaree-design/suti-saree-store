# Vendor Pricing Fix — what changed

## The problem
Vendor's "Expected Price" was being saved straight into `products.price` /
`final_price` with **zero markup** — the website showed exactly what the
vendor typed. Shipping (both legs) and platform commission were never
actually recovered, and editing a vendor's price didn't even update the
live price at all.

## The fix
Vendor's price is now treated as their **cost price**, same role
`costPrice` plays on your Admin → Add/Edit Product form. The website price
is computed from it using the **same markup structure you already have**
in Admin → Settings → Profit Estimate (entry/mid/premium % tiers):

```
website price = (vendor's price + pickup shipping + delivery shipping) × (1 + mid_markup_percent / 100)
```

- **Pickup shipping** (vendor → your warehouse) — NEW setting, configurable
  at Admin → Settings → "Vendor pickup shipping cost (₹)", right under the
  COD/prepaid courier cost fields. Defaults to ₹60 until you set a real
  number.
- **Delivery shipping** (warehouse → customer) — reuses your existing
  blended COD/prepaid courier cost settings.
- Both legs are now shown to the vendor on the Add/Edit Product form, so
  they can see exactly where the difference between "Your Price" and the
  website price comes from.

## v2 — layout fix
The price breakdown card was originally squeezed into the same half-width
column as the "Your Price" input, next to "Quantity" — on the vendor
form's already-narrow left column this made everything cramped (tiny
tiles, wrapped text, numbers overlapping). Fixed by:
- Moving the breakdown card **out of the 2-column grid** so it spans the
  full form width, right below the Quantity/Price row, on all 3 vendor
  pages.
- Redesigned the card itself: clearer heading, more padding, line items
  that don't crowd together, and the 3 markup tiles (Entry/Mid/Premium)
  now stack in a single column on very narrow screens instead of always
  forcing 3-across.

## Files changed
- `lib/pincode-api.ts` — added `vendor_pickup_shipping_cost` to `ShippingSettings`.
- `lib/vendor-pricing.ts` **(new)** — the calculator: `computeVendorPriceBreakdown()`.
- `components/vendor/vendor-price-breakdown.tsx` **(new)** — the vendor-facing
  breakdown card (replaces `components/vendor/payout-preview.tsx` on the
  Add/Edit Product forms; that old file is untouched and still used as-is
  inside the colour-variant "Price override" panel, which is a different,
  intentionally-direct field).
- `app/api/vendor/products/route.ts` — POST (create): live price now comes
  from `computeVendorPriceBreakdown()` instead of the vendor's raw number.
- `app/api/vendor/products/[id]/route.ts` — PATCH (edit): now actually
  recomputes `price`/`final_price` when the vendor changes their price
  (previously it silently didn't touch the live price at all on edit).
- `app/vendor/dashboard/add-product/page.tsx`,
  `app/vendor/dashboard/products/add-product/page.tsx`,
  `app/vendor/dashboard/products/edit-product/[id]/page.tsx` — swapped in
  the new breakdown component (now full-width, see "v2" above), relabeled
  "Expected Price" → "Your Price" with copy explaining it's not the
  website price.
- `components/admin/settings-panel.tsx` — added the input field for the
  new `vendor_pickup_shipping_cost` setting.

## How to apply
1. Unzip this into your project root, overwriting the matching paths
   (same folder structure as your repo — `lib/`, `components/`, `app/`).
2. `git add -A && git commit -m "Vendor price structure: cost price + 2 shipping legs + markup -> real website price" && git push`
3. No DB migration needed — `vendor_pickup_shipping_cost` is just a new
   key inside the existing `shipping` settings JSON row, defaulted in code
   (`DEFAULT_SHIPPING_SETTINGS`). It'll just be `60` until you open
   Admin → Settings and change it to your real pickup courier cost.
4. Go to Admin → Settings → Profit Estimate and set the real pickup
   shipping cost, and double check your entry/mid/premium markup % —
   those now drive the vendor-side website price too.

## What I verified
- Full project `tsc --noEmit` — zero type errors (checked again after the
  layout fix).
- `next build` couldn't finish in my sandbox only because Google Fonts
  (`fonts.googleapis.com`) isn't reachable in this network-restricted
  environment — unrelated to this change. Worth a normal `npm run build`
  on your end before pushing, as always.
