# Kya kya badla — summary

## ⚠️ Sabse zaroori addition (jo pehle miss ho gaya tha)
Aapke screenshot wala order **COD** tha ("pending" status). Status dropdown mein `paid`
option pehle se tha (isliye "naya status kahan hai" confusion hua) — lekin asli cheez jo
missing thi wo ye thi: **COD order ko "online payment chahiye" mein convert karne ka
button hi nahi tha.**

Ab **Admin → Orders → Payment column** mein, jab bhi order COD + pending ho, ek naya button
dikhega: **"Request Online Payment"**. Isko click karne par:
1. Order COD se "online" mein convert ho jaata hai (status abhi bhi pending rahega).
2. Customer ko email jaati hai — apology message ke saath ("ye piece ready-made nahi
   rehta, isliye COD nahi, pehle online payment chahiye") + ek **"Pay Now" link**.
3. Customer us link par jaake online payment karta hai (Razorpay).
4. Payment ho jaane par order automatically `paid` status mein chala jaata hai — aur wahi
   pehle wala flow trigger hota hai: naya "Payment Confirmed" email + account/track page
   par green banner.

Yani poora loop complete ho gaya:
**COD order → "Request Online Payment" button → customer ko payment link wali email →
customer pay karta hai → status apne aap "paid" → naya email + banner** — jaisa aapne
originally maanga tha.

## Baaki sab (pichle session se)

### 1. "Payment Confirmed" status
- Online payment (Razorpay) verify hone ke baad pehle email nahi jaata tha — bug fix
  ho gaya, ab jaata hai.
- Email mein apology message: "Sorry for the inconvenience — ye product hamesha ready
  nahi rehta, isliye prepare karne mein thoda extra time lag sakta hai."
- Yehi message customer ke **account order page** aur **guest tracking page** par bhi
  green banner ki tarah dikhta hai.

### 2. Admin test email option
`Admin → Orders → order expand karo → Test Notifications` mein **"Payment Confirmed"**
button hai — Preview aur Send Test dono kaam karte hain.

### 3. Emails mein product image
Shipped, Arriving, Out for Delivery, Payment Confirmed — sab emails mein ab product image +
name + price table dikhta hai (order-confirmation email jaisa hi).

### 4. Order link exact colour-variation par jaata hai
Jo colour customer ne actually khareeda (jaise "Rani Pink"), uska link ab admin panel,
account page, aur email — sabme wahi exact variation kholta hai, default colour nahi.

## Files (is zip mein)
- **`app/api/admin/orders/[id]/request-online-payment/route.ts`** — NAYA route, COD→online
  convert karta hai + email bhejta hai
- `components/admin/orders-panel.tsx` — "Request Online Payment" button + item links
- `lib/email-templates.ts` — `codToPrepaidRequestEmail` naya template + baaki sab email fixes
- `app/api/razorpay/verify-payment/route.ts` — payment-confirmed email bug fix
- `app/api/admin/orders/[id]/preview-email/route.ts` — preview/test emails mein product image
- `components/admin/delivery-notification-tester.tsx` — "Payment Confirmed" test button
- `app/product/[slug]/product-detail.tsx` — variant slug bug fix (root cause of link issue)
- `app/checkout/page.tsx` — order item mein slug save karna
- `app/account/orders/[id]/page.tsx`, `app/track/[id]/page.tsx` — banner + item link
- `lib/delivery-notifications.ts`, `lib/orders-api.ts` — emails ko items/total pass karna
- `components/growth/low-stock-badge.tsx`, `components/product/coupon-list.tsx` — pehle
  session ke minimal-design changes

## Apply kaise karein
1. Har file ko iske path ke sath apne project mein copy-paste karo (naya folder
   `app/api/admin/orders/[id]/request-online-payment/` bhi banana hoga — wo pehle
   exist nahi karta tha).
2. `changes.diff` mein baaki sab files ka poora diff hai reference ke liye.
3. `npm run build` chala ke check karo koi error to nahi.

## Test kaise karein
1. Koi COD order banao (ya screenshot wala order use karo).
2. Admin → Orders → us order ki row mein Payment column ke neeche "Request Online
   Payment" button dabao.
3. Customer ke email (test ke liye apna hi email use karo) mein "action needed, online
   payment required" wali mail check karo — usme "Pay Now" jaisa link hoga.
4. Wo link kholo, Razorpay test payment complete karo.
5. Payment ke baad: (a) doosri email aani chahiye "Payment Confirmed" wali, (b)
   `/track/[order-id]` ya account order page par green banner dikhna chahiye,
   (c) admin panel mein order status apne aap "paid" dikhna chahiye.
