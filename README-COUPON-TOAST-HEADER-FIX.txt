COUPON TOAST HIDING MOBILE HEADER — FIX
=========================================

WHAT CHANGED (1 file)
----------------------
app/globals.css

ROOT CAUSE
----------
The "Coupon applied" toast is rendered by the `sonner` library (via
<Toaster> in components/providers.tsx). Sonner injects its own
stylesheet at runtime, and that stylesheet hardcodes:

    @media (max-width: 600px) {
      [data-sonner-toaster][data-y-position="top"] { top: 20px; }
    }

This overrides the `offset="68px"` prop passed to <Toaster> on mobile
screens only (desktop was already fine). So on phones, the toast sat
just 20px from the top of the viewport — right on top of the sticky
header (h-12 = 48px tall) — hiding the hamburger menu / logo.

FIX
---
Added a CSS override in app/globals.css that pushes the toast down to
60px on mobile (below the 48px header, with a small gap), using
!important since sonner's own <style> tag is injected after ours and
would otherwise win the cascade at equal specificity.

HOW TO APPLY
------------
1. Copy app/globals.css from this zip into your repo at the same path
   (overwrite the existing file) — OR just open your existing
   app/globals.css and paste this block right before the final
   `@layer utilities {` block:

@media (max-width: 600px) {
  [data-sonner-toaster][data-y-position='top'] {
    top: 60px !important;
  }
}

2. Commit and push:
     git add app/globals.css
     git commit -m "fix: keep coupon toast below sticky header on mobile"
     git push

3. Redeploy (Vercel/Netlify auto-deploys on push if connected).

4. Test on an actual mobile-width screen (or DevTools responsive mode,
   <600px wide): apply a coupon on the product page — the toast should
   now appear below the header, and the hamburger menu / logo should
   stay visible the whole time.

NOTE
----
If you ever change the header's height (currently h-12 = 48px in
components/header.tsx), update the `top: 60px` value in this same
media query to keep them in sync.
