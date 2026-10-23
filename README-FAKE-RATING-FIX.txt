FIX: Fake "4.5 rating" trust signal (Google Misrepresentation flag)
=====================================================================

ROOT CAUSE
----------
Several places defaulted a product's `rating` to 4.5 whenever it wasn't
explicitly set, and one read path used `Number(row.rating) || 4.5`, which
silently overwrote a REAL 0 (0 is falsy in JS) with 4.5 too. Net effect:
brand-new products with 0 real reviews were showing "4.5 · 0 reviews" on
the storefront -- a fabricated trust signal, which is exactly what Google's
Misrepresentation policy (the one blocking your product feed) flags.

FILES CHANGED (8)
------------------
1. app/api/admin/products/route.ts
   - `rating: input.rating ?? 4.5` -> `?? 0`
   New admin-created products no longer get a fake 4.5 written to the DB.

2. app/api/vendor/products/route.ts
   - `rating: 4.5` -> `rating: 0`
   Same fix for vendor-submitted products.

3. lib/products-api.ts
4. lib/products-api-server.ts
   - `rating: Number(row.rating) || 4.5` -> preserves a real 0 instead of
     falling back to 4.5 (fixes the falsy-zero bug).

5. components/admin/products-panel.tsx
   - New-product form no longer pre-fills the Rating field with "4.5".
   - Save handler no longer falls back to 4.5 when the field is empty.

6. components/product-card.tsx
   - Product cards (incl. "New Arrivals" on homepage) now hide the
     star-rating row entirely when reviews = 0 (no text shown at all).

7. app/product/[slug]/product-detail.tsx
   - Product page now hides the rating/review row entirely when there
     are 0 reviews (no text shown at all).
   (Note: the JSON-LD structured data in app/product/[slug]/page.tsx was
   already correctly guarded with `reviews > 0` -- no change needed there.)

8. supabase/migrations/20260904000000_fix_fake_rating_misrepresentation.sql
   - Cleans up EXISTING rows already corrupted by the old default: any
     product/variant with rating = 4.5 and reviews = 0 gets rating reset
     to 0. Run the commented-out SELECT first to eyeball affected rows
     before running the UPDATEs, in case any of those really do have
     genuine ratings entered another way.

HOW TO APPLY
------------
1. Copy these files into your repo at the same paths (overwrite existing).
2. Run the SQL migration against your Supabase project (SQL editor, or
   `supabase db push` if you use the CLI / migrations folder as-is).
3. Commit and push:
     git add .
     git commit -m "fix: stop showing fake 4.5 rating on products with zero reviews"
     git push
4. In Google Merchant Center, after the fix is live and a few products have
   been re-crawled, use "Request review" on the Misrepresentation issue.

WHY THIS MATTERS FOR GOOGLE MERCHANT
-------------------------------------
Google's Misrepresentation policy exists to stop stores from showing fake
trust signals (ratings, review counts, badges) that mislead shoppers. A
site-wide pattern of "4.5 stars · 0 reviews" is a textbook trigger for that
flag and will keep blocking your whole feed until it's fixed and Google
re-reviews the account.
