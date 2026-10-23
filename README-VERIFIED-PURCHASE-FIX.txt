VERIFIED PURCHASE FIX — files in this zip
==========================================

Problem: Every review showed a "Verified Purchase" badge regardless of
whether the reviewer actually bought the product. Google Merchant Center
flagged this kind of thing under "Misrepresentation" (false trust badges).

Files changed / added (paths are relative to your repo root — just extract
this zip into your project folder and overwrite):

1. supabase/migrations/20260903000000_reviews_verified_purchase.sql  [NEW]
   - Adds a `verified_purchase` boolean column to the reviews table.
   - Backfills true for existing reviews from customers who actually have
     a matching order for that product.
   - Run this against your Supabase project (SQL editor, or
     `supabase db push` / your usual migration flow).

2. lib/reviews-api.ts  [MODIFIED]
   - Review interface now has a `verified_purchase: boolean` field.
   - submitReview() now re-checks hasPurchasedProduct() at submit time and
     stores the real result in verified_purchase (never trusts client input).

3. components/product/reviews-section.tsx  [MODIFIED]
   - The "Verified Purchase" badge now only renders when
     r.verified_purchase is true, instead of unconditionally for every
     review.

STEPS TO APPLY:
1. Extract this zip into your local repo (overwrite the 2 existing files).
2. Run the new migration against your Supabase database.
3. Commit and push:
     git add -A
     git commit -m "fix: only show Verified Purchase badge for actual purchasers"
     git push
4. Redeploy (Vercel/Netlify will pick it up automatically on push if
   connected, otherwise trigger a deploy).
5. Once live, go back to Merchant Center and mention in your review
   request that fake/unverified trust badges have been fixed, if it asks
   for details of what changed.
