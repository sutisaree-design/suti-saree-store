ORDER-CONFIRM SIDE EFFECTS - EXTENSION TO THE WEBHOOK FIX
===========================================================

Pichle fix (razorpay-webhook-fix.zip) ne payment status ka bug theek
kiya tha. Ye extension uska agla hissa hai: agar customer ke browser
mein payment ke turant baad round-trip fail ho (tab close/network
drop/redirect fail), to order status to 'paid' ho jaata tha (pichle
fix se), lekin ye sab abhi bhi miss ho jaate the:
  - "Order Confirmed" customer email
  - Admin ko "new order" notification email
  - Gift card redemption
  - Loyalty points
  - Referral reward
  - Abandoned-cart "recovered" marking

Wajah: ye sab /api/order-confirm route mein hote hain, jo sirf tab
call hota hai jab browser mein Razorpay checkout ka poora flow
(payment + verify-payment) successfully complete ho jaaye.

------------------------------------------------------------
IS ZIP MEIN 3 FILES HAIN
------------------------------------------------------------
1. lib/order-confirmation.ts              -> NAYI FILE
   Purani /api/order-confirm/route.ts ki poori logic (5 jobs) ab
   yahaan ek reusable function mein hai: runOrderConfirmationSideEffects().

2. app/api/order-confirm/route.ts          -> REPLACE karo
   Ab ye chhota si file hai jo bas upar wale function ko call karti
   hai. Behavior bilkul same hai jo pehle tha.

3. app/api/razorpay/webhook/route.ts        -> REPLACE karo
   (Pichle fix wali file, ab updated) -- order ko 'paid' mark karne
   ke baad ye ab runOrderConfirmationSideEffects() bhi call karta
   hai, seedha server se, browser pe depend kiye bina.

------------------------------------------------------------
APPLY KAISE KARO
------------------------------------------------------------
- lib/order-confirmation.ts -> naya file hai, seedha copy kar do.
- app/api/order-confirm/route.ts -> apni existing file ko is se
  REPLACE kar do (poori tarah overwrite).
- app/api/razorpay/webhook/route.ts -> agar pichla webhook fix already
  apply kiya hai to is naye version se REPLACE kar do.

Koi naya env variable ya Razorpay dashboard setting nahi chahiye --
jo pichli baar configure kiya tha (RAZORPAY_WEBHOOK_SECRET + webhook
URL) wahi kaafi hai.

Safe/idempotent hai: agar customer ka browser normally kaam kar gaya
(zyaadatar cases mein hoga), to /api/order-confirm already sab kar
chuka hoga, aur webhook wala call bas ek harmless no-op hoga (kyunki
confirmation_email_sent_at aur baaki checks already set/exist honge)
-- koi duplicate email ya double loyalty points nahi milenge.
