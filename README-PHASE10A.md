# Phase 10A — Loyalty / Reward Points — Changes

## Naye files (as-is copy karo)
- supabase/migrations/20260722000000_phase10a_loyalty.sql
- lib/loyalty-api.ts
- app/api/admin/loyalty/route.ts
- components/admin/loyalty-panel.tsx
- app/account/loyalty/page.tsx

## Modify hui files (in-jagah replace karo)
- app/api/order-confirm/route.ts
- app/checkout/page.tsx
- components/admin/admin-shell.tsx
- app/admin/page.tsx
- components/account/account-nav.tsx

## Deploy steps
1. Ye sab files apne repo me same path pe copy/replace karo (git repo root se).
2. Supabase project (SQL editor) me `supabase/migrations/20260722000000_phase10a_loyalty.sql`
   run karo — ya `supabase db push` se migrate karo agar Supabase CLI use kar rahe ho.
   Isse ye ban jayega:
   - `loyalty_points_ledger` table
   - `profiles.loyalty_balance` column + auto-update trigger
   - `orders` me `loyalty_points_redeemed`, `loyalty_discount`, `loyalty_points_earned` columns
   - `settings` me default `loyalty_program` config row
3. `git add -A && git commit -m "Phase 10A: loyalty points system" && git push`
4. Vercel apne aap deploy kar dega.
5. Admin panel me naya "Loyalty" tab dikhega (sidebar > Marketing group) — yaha se
   points-per-₹100, redeem value, min redeem points set kar sakte ho, aur kisi bhi
   customer ko manually points credit/debit kar sakte ho.
6. Customer account me "Reward Points" tab dikhega (balance + history).
7. Checkout page pe agar logged-in customer ke paas points hain to "Use reward points"
   toggle apne aap dikhega.

## Note
- Guest checkout (login nahi kiya hua) me points earn/redeem nahi hote — sirf logged-in
  customers ke liye kaam karta hai, kyunki points ek profile se linked hote hain.
- `npx tsc --noEmit` se poora typecheck clean pass hua hai, koi baaki file touch nahi hui.
