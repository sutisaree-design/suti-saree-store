RAZORPAY "PAYMENT CAPTURED LEKIN ORDER PENDING" BUG - FIX
===========================================================

BUG: Razorpay dashboard pe payment "Captured" dikhta hai, lekin order
admin panel mein "PAYMENT PENDING" hi rehta hai.

WAJAH: Order status sirf tab 'paid' hota tha jab customer ke browser
mein Razorpay Checkout ka success `handler` callback fire hoke
/api/razorpay/verify-payment ko call karta tha. Agar payment capture
hone ke turant baad tab/app close ho jaaye, network drop ho jaaye,
ya redirect fail ho jaaye -- payment ho chuka hota hai, par callback
kabhi backend tak nahi pahuchta, aur order hamesha 'pending' reh
jaata hai.

FIX: Ek naya server-to-server webhook route add kiya hai jo Razorpay
seedha call karta hai jab payment capture ho -- customer ke browser
pe depend nahi karta. Ye purane verify-payment route ke saath hi
kaam karega (dono idempotent hain, jo pehle pahunche wahi order ko
'paid' karega).

------------------------------------------------------------
STEP 1: File copy karo
------------------------------------------------------------
Is zip mein sirf ek naya file hai:

  app/api/razorpay/webhook/route.ts

Ise apne project ke andar EXACT isi path pe copy karo (naya folder
"webhook" banega app/api/razorpay/ ke andar). Koi existing file
overwrite nahi hoga.

------------------------------------------------------------
STEP 2: .env mein naya secret add karo
------------------------------------------------------------
Apne .env / .env.local (aur Vercel/Netlify ke environment variables
mein bhi) ye line add karo:

  RAZORPAY_WEBHOOK_SECRET=<Razorpay se milega, Step 3 dekho>

NOTE: Ye RAZORPAY_KEY_SECRET se ALAG hai. Ye specifically webhook ke
liye Razorpay generate karta hai.

------------------------------------------------------------
STEP 3: Razorpay Dashboard mein webhook configure karo
------------------------------------------------------------
1. dashboard.razorpay.com pe login karo
2. Settings -> Webhooks -> "+ Add New Webhook"
3. Webhook URL:
     https://aruhihandlooms.com/api/razorpay/webhook
4. Alert Email: apna email daalo (failures ke liye)
5. Active Events mein sirf ye tick karo:
     [x] payment.captured
6. Save karte hi Razorpay ek "Secret" generate karega -- wahi value
   Step 2 wale RAZORPAY_WEBHOOK_SECRET mein daalo.
7. Deploy karo taaki naya env var live ho.

------------------------------------------------------------
STEP 4: Test karo
------------------------------------------------------------
- Ek test/real payment karo aur BEECH MEIN payment complete hone ke
  baad turant tab band kar do (ya airplane mode on kar do) -- purane
  code mein order 'pending' reh jaata, ab bhi 'paid' ho jaana chahiye
  kuch second ke andar.
- Razorpay Dashboard -> Webhooks -> us webhook pe click karke
  "Recent Deliveries" mein status 200 dikhna chahiye.
- Vercel/server logs mein "[razorpay-webhook]" prefix se koi error
  to nahi aa raha, check kar lena.

Purane "pending" pade hue orders (jaise #8A29F918) is webhook se
AUTOMATICALLY fix nahi honge -- wo already hue hain, webhook sirf
AAGE se hone wale payments ke liye kaam karega. Unhe admin panel se
manually "paid" mark karna hoga (Razorpay dashboard mein Payment ID
match karke confirm kar lena ki paisa aaya hai).
