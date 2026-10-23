# Phase 10C — Gift Cards / Store Credit — Changes

Sequence 3 (sabse last). Razorpay payment flow ko touch karta hai (naya
purchase flow, checkout ka naya redeem field), isliye deploy ke baad
zaroor test karo — pehle Sequence 1 aur 2 stable ho chuke hain, ab ye.

## Naye files (as-is copy karo)
- supabase/migrations/20260724000000_phase10c_giftcards.sql
- lib/giftcards-api.ts
- app/api/giftcards/route.ts
- app/api/giftcards/confirm/route.ts
- app/api/admin/giftcards/route.ts
- app/gift-cards/page.tsx
- components/admin/giftcards-panel.tsx

## Modify hui files (in-jagah replace karo)
- app/checkout/page.tsx          (naya "Apply gift card code" field + discount chain)
- app/api/order-confirm/route.ts (naya gift-card-redeem hook)
- components/admin/admin-shell.tsx (naya "Gift Cards" tab, Marketing group me)
- app/admin/page.tsx              (GiftCardsPanel wire kiya)
- components/footer.tsx           (naya "Gift Cards" link, Shop column me)
- lib/email-templates.ts          (naya giftCardEmail() template add kiya, baaki templates untouched)

## Deploy steps
1. Ye sab files apne repo me same path pe copy/replace karo (git repo root se).
2. Supabase project (SQL editor) me
   `supabase/migrations/20260724000000_phase10c_giftcards.sql` run karo — ya
   `supabase db push` se migrate karo agar Supabase CLI use kar rahe ho.
   Isse ye ban jayega:
   - `gift_cards` table (code, balance, recipient, status lifecycle)
   - `gift_card_transactions` table (issue/redeem/refund/adjust/deactivate ledger)
   - `apply_gift_card_transaction()` trigger — Phase 10A ke loyalty-ledger
     trigger jaisa hi, balance/status hamesha ledger ke sync me rehta hai
   - `orders` me `gift_card_code` aur `gift_card_discount` columns
   - `settings` me default `gift_card_program` config row
3. `.env` me Razorpay keys pehle se hone chahiye (`RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`) — same keys jo checkout already use karta hai,
   koi naya env var nahi chahiye.
4. `git add -A && git commit -m "Phase 10C: gift cards / store credit" && git push`
5. Vercel apne aap deploy kar dega.
6. Admin panel me naya "Gift Cards" tab dikhega (sidebar > Marketing group):
   - Denominations aur validity (months) set kar sakte ho.
   - Sabhi issued cards ki list (code, recipient, value, balance, status).
   - "Issue Gift Card" button se free/comp card manually issue kar sakte ho.
   - Active card ko deactivate kar sakte ho (balance turant 0 ho jata hai).
7. `/gift-cards` par naya public page dikhega — denomination choose karke
   Razorpay se pay karo, khud ke liye ya kisi aur ko gift karo (naam +
   email + optional message). Payment confirm hote hi email me code chala
   jata hai, aur code turant screen par bhi dikh jata hai.
8. Checkout page ke order summary me naya "Apply gift card code" field
   dikhega (coupon field ke bilkul niche) — coupon → gift card → loyalty
   points, is order me discounts apply hote hain.

## Kaise kaam karta hai (flow)
1. **Purchase**: `/gift-cards` page pehle `/api/giftcards` (POST) call karta
   hai jo ek `pending` gift_cards row banata hai (0 balance, code already
   generated) — isi id ko Razorpay order ke receipt/internalOrderId ki
   tarah use karte hain.
2. Razorpay checkout khulta hai, payment hone par uska handler
   `/api/giftcards/confirm` (POST) call karta hai — ye route signature
   **server-side dobara verify karta hai** (client ke "verified" flag par
   trust nahi karta), phir ek `'issue'` ledger entry insert karta hai.
   Trigger balance ko `initial_value` set kar deta hai aur status
   `'pending'` se `'active'` ho jata hai. Recipient (ya khud purchaser) ko
   email chala jata hai code ke saath.
3. **Redeem**: Checkout page par gift card code type karke "Apply" dabane
   par `validateGiftCard()` seedha Supabase se card check karta hai
   (coupon validation jaisa hi pattern) — status, expiry, balance sab
   check hote hain. Discount current subtotal (coupon ke baad) se clamp
   hota hai.
4. Order place hone ke baad `order-confirm` route ek `'redeem'` ledger
   entry insert karta hai (`amount = -gift_card_discount`) — trigger
   balance ghata deta hai, aur balance 0 hone par status `'redeemed'` ho
   jata hai.
5. **Admin**: Loyalty/Referrals jaisa hi RLS convention — open at DB layer,
   admin writes `/api/admin/giftcards` se admin-session-cookie check
   karke hote hain.

## Note
- Guest checkout bhi gift card redeem kar sakta hai — ye loyalty se
  alag hai (jo sirf logged-in customers ke liye kaam karta hai), kyunki
  gift card code kisi login se tied nahi hota.
- Ek gift card partially bhi redeem ho sakta hai — jitna use hua utna hi
  balance se ghatega, baaki agli order me use ho sakta hai (jab tak
  balance ya expiry khatam na ho).
- Razorpay ke `create-order` aur `verify-payment` generic routes
  (already existing) reuse kiye hain as-is — koi change nahi kiya, kyunki
  wo dono routes kisi bhi table se dependent nahi the.
- `npx tsc --noEmit` clean pass hua hai (poore repo par), aur naye/modify
  hue files par `next lint` bhi clean hai (ek pre-existing unrelated
  warning checkout/page.tsx ki line 529 par hai — `you'd` apostrophe,
  humari change se pehle se tha, humne touch nahi kiya).
