# Return/RTO Risk Tracking + Live Delhivery Tracking — Kya Naya Hai

## Ye kya solve karta hai
Tumne bola: same phone/order 2 baar return ya RTO ho to system ko pata
chale, admin/vendor ko live update mile, aur 15 din ke liye us number
ka COD repeat-order automatically ruk jaaye jab tak admin allow na kare.

## Kaise kaam karta hai

1. **Live tracking (Delhivery se)**: Naya daily job
   `runForwardShipmentTrackingJob` (`lib/cron-jobs.ts`) har us order ka
   Delhivery status check karta hai jiska forward shipment (Admin →
   "Create Shipment") already booked hai. Status ko `orders.delivery_status`
   me likh deta hai: `in_transit` / `delivered` / `rto_initiated` /
   `rto_delivered`. Ye already `/api/cron/daily-jobs` me wired hai — koi
   naya Vercel cron add nahi karna (Hobby 2-cron limit ke andar hi hai).
   Manually test karne ke liye: `/api/cron/forward-shipment-tracking`.

2. **Return/RTO risk per phone number**: Naya table
   `customer_return_risk` (phone → return_count, rto_count,
   blocked_until). Do jagah se update hota hai:
   - Jab ek return "refunded"/"completed" ho jaata hai
     (`lib/return-automation.ts`).
   - Jab live tracking se pehli baar RTO dikhta hai (upar wala job).

   Jaise hi combined count (return + RTO) **2** tak pahunchta hai, agle
   **15 din** ke liye `blocked_until` set ho jaata hai.

3. **COD auto-block**: `place_order_with_items()` (SQL function,
   migration me redefine hua hai) ab COD orders ke liye ye check karta
   hai. Agar number cooldown window me hai, order reject ho jaata hai
   (`COD_BLOCKED_RETURN_RISK: ...` error) — checkout page (`app/checkout/page.tsx`)
   isko catch karke customer ko friendly message deta hai: "COD abhi
   available nahi, online pay karke order place karein". **Online/prepaid
   orders kabhi block nahi hote** — sirf COD abuse loop rukta hai.

4. **Admin visibility**: Admin → Returns panel ke har return card par ab
   ek badge dikhta hai — "X returns · Y RTOs" — aur agar customer abhi
   cooldown me hai to "COD paused till <date>" bhi.

5. **Vendor visibility**:
   - Vendor ke Add Product page aur My Orders page dono par ek naya card
     dikhta hai — "Your store's return/RTO rate" — vendor ka apna
     store-wide return % aur RTO % (customer ka koi data nahi, sirf
     aggregate number).
   - My Orders me har order item ke neeche ab live courier status bhi
     dikhta hai ("Live: On the way to customer" / "Live: RTO — courier
     bringing it back" / etc.) jab admin ne shipment book kar diya ho.

## Setup / deploy steps
1. **Supabase migration**: `supabase/migrations/20260911000000_return_rto_risk_tracking.sql`
   ko apne Supabase project (SQL editor ya CLI) par run karo. Ye:
   - `orders` table me 3 naye columns add karta hai
   - naya `customer_return_risk` table banata hai
   - `place_order_with_items()` function ko redefine karta hai (COD risk
     check ke saath) — baaki poora function bilkul same hai jo abhi
     production me hai, sirf ek naya check upar add hua hai.
2. Env vars kuch naye nahi chahiye — same `DELHIVERY_API_TOKEN` /
   `DELHIVERY_ENV` jo already set hai wahi reuse hota hai.
3. Files replace karke `git push` karo, deploy hone do.
4. Ek test order place karke dekh lena checkout normal chal raha hai
   (risk-free number ke liye kuch change nahi dikhega).

## Files changed/added
- `supabase/migrations/20260911000000_return_rto_risk_tracking.sql` (new)
- `lib/return-risk-api.ts` (new) — risk record read/write helpers
- `lib/return-automation.ts` — refund success par risk record hota hai
- `lib/cron-jobs.ts` — `runForwardShipmentTrackingJob()` added
- `app/api/cron/daily-jobs/route.ts` — naya job wire kiya
- `app/api/cron/forward-shipment-tracking/route.ts` (new) — manual trigger
- `app/checkout/page.tsx` — COD_BLOCKED_RETURN_RISK error handle
- `app/api/admin/returns/route.ts` — return_risk har row ke saath attach
- `components/admin/returns-panel.tsx` — risk badge UI
- `app/api/vendor/orders/route.ts` — delivery_status join (customer data nahi)
- `lib/vendor-api.ts` — naye types + `fetchMyReturnRiskStats()`
- `app/api/vendor/return-risk/route.ts` (new) — vendor ka apna return/RTO %
- `components/vendor/return-rto-stats.tsx` (new) — widget
- `app/vendor/dashboard/add-product/page.tsx` — widget render
- `app/vendor/dashboard/orders/page.tsx` — widget + live status badge

## Scope me kya nahi hai (agla step agar chahiye ho)
- Return hone par product physically **vendor ko wapas** bhejne wala
  courier leg (abhi sirf customer → apna warehouse tak reverse pickup
  hota hai, jo already tha) — ye alag/bada feature hai, isme touch nahi
  kiya.
- Vendor pricing engine ko live Delhivery rate se fully replace karna —
  abhi settings-based flat logistics cost hi price calc me use hota hai
  (already tha), Delhivery ka live rate calculator (`getDelhiveryRateEstimate`)
  admin ke shipment-creation popup me already hai. Agar chaho to isko
  bhi vendor price form me expose kar sakte hain — bata dena, next round
  me kar dunga.
