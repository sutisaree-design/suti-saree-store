# Checkout "Failed to place order" — fix + instructions

## Files in this zip
- `app/checkout/page.tsx` — replaces your existing file. Only change:
  added `console.error(...)` in the two error paths so the REAL error
  (Postgres/RLS message, or network failure) shows up in the browser
  console instead of always just the generic "Failed to place order" toast.
- `supabase/migrations/20260922000000_fix_place_order_affiliate_regression.sql`
  — a NEW migration file. Add it to your `supabase/migrations` folder,
  don't replace anything.

## What was actually found
Your `place_order_with_items()` database function has been redefined by
5+ migrations in a row (`20260911000000`, `20260912120000`,
`20260913000000_affiliate_program`, `20260915010000`, ...). Each one
uses `CREATE OR REPLACE FUNCTION`, which replaces the WHOLE function
body — and each of those migrations was branched off a different,
earlier copy of the function. Net result: whichever migration was
applied last to your live database silently undoes fixes from an
earlier one (e.g. the affiliate-program migration reverted the
price-manipulation fix; the migration after it then reverted the
affiliate commission logic). The new migration merges all of it back
together so nothing gets silently dropped again.

**Important — this is a real bug I found by reading the code, but I
could not connect to your actual Supabase project**, so I can't 100%
confirm it's *the* cause of your specific "Failed to place order"
screenshot. Also, your local project folder (from the first screenshot)
has 200+ loose `.patch`/`.diff`/README files that were never committed —
your live site may already differ from what's on GitHub.

## Steps
1. Apply the SQL migration to your Supabase project:
   - Supabase Dashboard → SQL Editor → paste the contents of
     `20260922000000_fix_place_order_affiliate_regression.sql` → Run.
   - Or, if you use the Supabase CLI: drop the file into
     `supabase/migrations/` and run `supabase db push`.
2. Replace `app/checkout/page.tsx` with the one in this zip, commit, push, redeploy.
3. Try placing the order again. If it STILL fails:
   - Open the browser DevTools Console (F12 → Console tab) right when
     you click "Place Order (COD)".
   - You'll now see a line like `Order placement failed: {...}` or
     `place_order_with_items failed: {...}` with the real Postgres
     error (code/message/hint) — send me that exact text and I can
     pinpoint the actual cause (common ones: RLS policy blocking the
     insert, a required column with no default, or the
     `customer_return_risk` table not existing if that migration
     wasn't applied yet).
