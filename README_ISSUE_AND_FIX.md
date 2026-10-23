# Checkout "Failed to place order" — kya mila

## Zaroori baat: revert karna sahi solution NAHI hai

Jo SQL aapne last deploy kiya (`20260912120000_fix_discount_price_manipulation.sql`),
woh ek SECURITY fix hai — usse pehle koi bhi customer devtools khol kar
`coupon_discount`, `gift_card_discount` ya `loyalty_discount` ko manually
bada kar sakta tha aur order free ya bahut kam price mein place kar sakta tha.

Agar aap isko revert kar dete ho, to order placement to shayad theek ho
jaaye, lekin **wahi price-manipulation bug wapas khul jaayega**. Isliye
revert recommend nahi kar raha.

## Asli wajah jo repo mein mili

`place_order_with_items()` function ko is SQL ne poori tarah replace kar
diya (`CREATE OR REPLACE FUNCTION`). Problem ye hai ki ye migration
**20260901** wale purane version par based thi — uske baad `20260911`
migration ne isi function mein ek COD safety-check add kiya tha (return/RTO
risk wale phone numbers ke liye COD block karna). Wo check is naye SQL mein
nahi hai, kyunki ye purane version se likha gaya tha.

Matlab: aapka Sept 12 wala deployment silently ek pehle se live feature
(COD return-risk block) ko hata deta hai. Ye apne aap mein crash nahi
karega, lekin agar us function ke andar koi aur table/column mismatch ho
(jaise `customer_return_risk` table already exist na ho, ya koi aur schema
drift), to Postgres exception throw hoga aur checkout page par generic
"Failed to place order" dikhega — kyunki frontend (`app/checkout/page.tsx`
line ~1279) sirf do specific error codes (`INSUFFICIENT_STOCK`,
`COD_BLOCKED_RETURN_RISK`) ko pakadta hai, baaki sab errors generic message
mein chala jaate hain.

## Sabse pehla step — asli error dekho

Main aapke live Supabase project ko access nahi kar sakta, isliye exact
error text mujhe nahi pata. Please ye karke exact error nikaalo:

1. Checkout page par jaake devtools kholo (F12) → **Network** tab.
2. "Place Order" par click karo.
3. `place_order_with_items` (ya `rpc/place_order_with_items`) request dhundo
   → uska **Response** tab kholo. Wahan Postgres ka asli error message
   milega (e.g. `relation "customer_return_risk" does not exist`, ya
   `column ... does not exist`, ya kuch aur).
4. Ya phir Supabase Dashboard → **Logs → Postgres Logs** mein bhi yahi
   error dikhega.

Wo exact message bhej dena — usse main 100% confirm kar sakta hoon ki
kaunsa hissa fail ho raha hai.

## Maine ek forward-fix migration bana di hai (revert nahi)

`supabase/migrations/20260915010000_restore_return_risk_gate_after_discount_fix.sql`
— isme:
- Price-manipulation fix **poora wapas rakha** hai (coupon/gift-card/loyalty
  discount ab bhi server-side hi recompute hote hain, client ki value trust
  nahi ki jaati).
- Sath hi `20260911` wala COD return-risk block **wapas add** kar diya hai,
  jo accidentally drop ho gaya tha.

**IMPORTANT**: Ye migration `customer_return_risk` table ko use karta hai.
Agar `20260911000000_return_rto_risk_tracking.sql` migration aapke DB mein
already run nahi hui hai, to ye naya migration error dega
(`relation "customer_return_risk" does not exist`). Pehle confirm kar lena
ki wo table exist karti hai (Supabase → Table Editor mein dekh lo), tabhi
ye naya migration run karna.

Is file ko apne Supabase project mein run karo (SQL Editor mein paste karke,
ya `supabase db push` se migrations folder ke through) — GitHub push ki
zaroorat nahi hai kyonki ye sirf ek database migration hai, koi app code
nahi badla.
