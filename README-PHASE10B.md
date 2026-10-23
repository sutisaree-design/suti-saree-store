# Phase 10B — Referral Program — Changes

Sequence 2. Reuses Sequence 1's `loyalty_points_ledger` for both rewards —
no new coupon/discount logic anywhere.

## Naye files (as-is copy karo)
- supabase/migrations/20260723000000_phase10b_referrals.sql
- lib/referrals-api.ts
- app/api/referrals/route.ts
- app/api/admin/referrals/route.ts
- components/admin/referrals-panel.tsx
- app/account/referrals/page.tsx

## Modify hui files (in-jagah replace karo)
- app/api/order-confirm/route.ts   (loyalty hook + naya referral-completion hook)
- app/signup/page.tsx              (optional referral-code field, ?ref= se prefill)
- app/api/auth/signup/route.ts     (referredByCode ko user_metadata me pass karta hai)
- components/admin/admin-shell.tsx (naya "Referrals" tab, Marketing group me)
- app/admin/page.tsx               (ReferralsPanel wire kiya)
- components/account/account-nav.tsx (naya "Refer & Earn" link)

## Deploy steps
1. Ye sab files apne repo me same path pe copy/replace karo (git repo root se).
2. Supabase project (SQL editor) me `supabase/migrations/20260723000000_phase10b_referrals.sql`
   run karo — ya `supabase db push` se migrate karo agar Supabase CLI use kar rahe ho.
   Isse ye ban jayega:
   - `referral_codes` table (ek code per customer)
   - `referrals` table (pending → completed lifecycle)
   - `handle_new_user()` trigger update — ab signup ke time `referred_by_code`
     metadata read karke pending referral row bana deta hai
   - `settings` me default `referral_program` config row
3. `git add -A && git commit -m "Phase 10B: referral program" && git push`
4. Vercel apne aap deploy kar dega.
5. Admin panel me naya "Referrals" tab dikhega (sidebar > Marketing group) — yaha
   se reward points (referrer/referred) set kar sakte ho, aur saare referrals ki
   list (pending/completed) dekh sakte ho.
6. Customer account me naya "Refer & Earn" tab dikhega — apna code/link copy karo.
7. Signup page pe ek optional "Referral code" field dikhega. `/signup?ref=CODE`
   link se seedha prefill ho jata hai.
8. Jab referred customer ka PEHLA order confirm hota hai (order-confirm route),
   dono ko automatically loyalty points credit ho jaate hain — referrer ko
   `referrer_reward_points`, naye customer ko `referred_reward_points`.

## Kaise kaam karta hai (flow)
1. Customer A apna code copy karke share karta hai (`/signup?ref=CODE`).
2. Customer B us code se signup karta hai → `referrals` row banta hai,
   `status = 'pending'`.
3. Customer B apna pehla order place + confirm karta hai → order-confirm route
   check karta hai ki ye B ka pehla order hai aur ek pending referral hai.
4. Agar dono sahi hain → `loyalty_points_ledger` me 2 naye 'earn' entries insert
   hoti hain (A ko referrer bonus, B ko welcome bonus) aur `referrals.status`
   `'completed'` ho jata hai. Points turant dono ke `profiles.loyalty_balance`
   me reflect ho jaate hain (Sequence 1 ka trigger).

## Note
- Guest checkout / logged-out signup flow ka isse koi lena-dena nahi — referral
  sirf logged-in signup flow me kaam karta hai, jaise loyalty sirf logged-in
  customers ke liye kaam karta hai.
- Self-referral guard hai: agar koi apna hi code use kare to referral row nahi
  banti.
- Ek user sirf ek dafa "referred" ho sakta hai (`referred_user_id` unique hai),
  isliye dobara pending row nahi banegi agar wo dusre code se dubara try kare.
- `npx tsc --noEmit` aur `next lint` (changed files pe) dono clean pass hue hain,
  koi baaki file touch nahi hui.
