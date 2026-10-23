# Review Reward — show in Email Log too

Pichhle fix (reward coupon email) ke upar ye build hota hai. Ab Admin ->
Orders -> (order expand karo) -> **Email Log** me ek naya row bhi dikhega
har product ke liye jisne review-reward coupon earn kiya:

    ✓ Review Reward — Mustard Cotton Silk Flower Motif Embroidery Sa...
      (THANKS-047B91 · 10% off)                    23 Sep 2026, 2:14 pm

Agar email fail ho gayi ho (provider configure nahi, ya koi aur error),
to green tick ki jagah red cross + actual error message dikhega (e.g.
"Email provider not configured") — sirf "Not sent yet" nahi, taaki pata
chale ki attempt hui thi ya nahi.

Agar order me customer ka email hi na ho (guest ne form me bhi nahi
diya), to row dikhega with "No email address on this order/review".

## 6 files, sab REPLACE karo (as-is copy, existing files overwrite) —
    naya `supabase/migrations/` wala file bas ADD karo, replace nahi
    (naya filename hai, kuch overwrite nahi hoga)

- `supabase/migrations/20261011000000_review_reward_email_tracking.sql`
  (NEW) — `review_rewards` table me do naye columns add karta hai:
  `email_sent_at` aur `email_error`.
- `lib/review-rewards-server.ts` — `issueReviewReward()` ab reward ke
  saath uska `id` (review_rewards row id) bhi return karta hai, taaki
  baad me wahi row update ho sake.
- `app/api/review-link/[token]/route.ts` — email bhejne ke baad (pichle
  fix wala hi call), ab result ke hisaab se `review_rewards.email_sent_at`
  ya `.email_error` us row par likh deta hai.
- `lib/orders-api.ts` — naya `attachReviewRewards()` helper, jo
  `fetchOrders()` ke through har order par `_review_rewards` array
  attach karta hai (existing `attachItemSources` / `attachReturnRefundStatus`
  wale hi pattern follow karta hai).
- `components/admin/orders-panel.tsx` — `EmailLog` component ab in
  extra rows ko bhi render karta hai, product name order ke apne
  `items` se match karke (koi extra products-table lookup nahi).
- `lib/email-templates.ts` — pichle fix wala hi file, ismein is baar
  koi naya change nahi hai (bas reference ke liye zip me dobara diya hai
  taki tumhe dono session ke changes ek hi zip me mil jayein).

## Apply karne ka tareeka
1. Migration file ko `supabase/migrations/` me **add** karo (naya file
   hai, kisi ko replace nahi karega). Fir Supabase dashboard SQL editor
   me run karo, ya jo bhi tumhara migration-run tarika hai
   (`supabase db push`, etc).
2. Baaki 5 files ko unke exact path par apne repo me **replace** karo.
3. `git add -A && git commit -m "show review reward email status in Email Log" && git push`
4. Vercel/host par deploy hone do.

## Verify
- `npx tsc --noEmit` — **0 errors** (poore repo pe check kiya, is session
  ke changes ke saath).
- Test: pichle fix wale test jaisa hi — ek order ka review link kholo,
  saare required steps complete karke reward earn karo. Fir Admin ->
  Orders me wahi order expand karo — Email Log me "Review Reward —
  <product name>" row dikhni chahiye, sahi timestamp ke saath.

## Kya NAHI chheda gaya
- On-screen reward banner (`app/review/[token]/page.tsx`) aur pichli
  session ka email-sending logic — dono waise hi hain. Ye sirf ek
  **tracking/visibility** layer add karta hai, koi naya email nahi
  bhejta aur reward-issuing logic (`issueReviewReward`'s coupon-creation
  part) bilkul untouched hai.
- Baaki 5 fixed lifecycle rows (Order Confirmed/Shipped/etc) — waise hi
  hain, koi change nahi.
