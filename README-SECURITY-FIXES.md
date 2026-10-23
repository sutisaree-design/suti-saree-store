# Security fixes — July 26, 2026

## ⚠️ Karne wala pehla kaam (code se pehle): repo ko PRIVATE karo, abhi

Ye repo abhi bhi public hai. Isme har RLS policy, har admin route path, aur
poori DB schema publicly readable hai — matlab koi bhi is repo ko dekh ke
seedha jaan sakta hai ki aapki live site pe kaunse exact endpoints/tables
attack karne hain. "Project pura banne ke baad private karunga" wait mat
karo — GitHub settings > Danger Zone > Change visibility se abhi private
karo. Isse code ka kaam nahi rukta, bas exposure turant kam ho jata hai.

## Is batch mein kya fix hua (safe to apply)

1. **Checkout price manipulation** (`supabase/migrations/20260726150000_fix_order_price_manipulation.sql`)
   Pehle: order ka price/total client (browser) se seedha trust hota tha.
   Ab: `place_order_with_items()` function har item ka price `products`
   table se khud nikaal ke total recalculate karta hai. Koi bhi price
   tamper nahi kar sakta.

2. **Admin panel ko public RLS se decouple kiya** (22 files mechanically
   swapped: `lib/orders-api.ts` + saare `app/api/admin/**/route.ts` jo
   pehle anon-key client use kar rahe the) — ab sab `getSupabaseAdmin()`
   (service-role key) use karte hain. Behavior AAJ same hi hai (kyunki
   RLS abhi bhi open hai), lekin ab admin panel `orders` table ki RLS
   tight hone ke baad bhi kaam karega — ye agla step safe banata hai.

3. **Coupon aur Gift Card fraud fix**
   - Naye routes: `app/api/admin/coupons/route.ts`,
     `app/api/admin/coupons/[id]/route.ts` — admin-cookie-gated, service
     role se likhte hain.
   - `lib/coupons-api.ts` ke admin-write functions (create/update/delete/
     toggle) ab in naye routes ko call karte hain, seedha DB nahi.
   - `supabase/migrations/20260726150100_lock_coupon_giftcard_writes.sql`
     — `coupons`, `gift_cards`, `gift_card_transactions` pe anon/
     authenticated WRITE policies hata di gayi (pehle koi bhi browser se
     apna khud ka 100%-off coupon ya gift-card balance bana sakta tha).
   - `components/admin/coupons-panel.tsx` mein **koi change nahi** — wo
     already sirf lib functions call karta hai, isliye UI same rahega.

## Kya UNCHANGED chhoda (jaan-boojh kar, aur kyun)

**`orders` table ka SELECT/UPDATE/DELETE RLS abhi bhi khula hai** —
matlab customer PII (naam/email/phone/address) ka leak issue **abhi bhi
maujood hai**. Isko fix na karne ki wajah:

`orders` table ko sirf 3 files nahi, **26 alag-alag files** touch karti
hain — customer "my orders", vendor order-accept, reseller dashboard,
admin returns/COD/analytics, chat order-lookup, guest tracking, invoice.
Vendor apne assigned orders `vendor_id` se dekhta hai (apna `user_id`
nahi), reseller apna `reseller_id` se, guest checkout bina login ke order
dekhta hai — inn sabko sahi se allow karne wali ek RLS policy design
karne ke liye mujhe aapke `vendors`/`reseller_profiles` table ke exact
column names confirm karne honge, aur ye without testing production mein
daalna risky hai (galat policy = vendor/reseller dashboard poora khaali
dikhne lag sakta hai).

**Isliye main ye change abhi ship nahi kar raha** — ye agla, sabse zaroori
step hai, aur main abhi isi conversation mein aapke saath step-by-step
kar sakta hoon (bas thoda back-and-forth chahiye: vendors table ka
schema confirm karna). Bol dena "orders RLS wala fix karo" to hum wahi
shuru karte hain.

Isi tarah `products` table pe bhi anon write khula hai (koi bhi catalog
edit/delete kar sakta hai) — isko fix karne ke liye admin ke liye poora
naya `/api/admin/products` CRUD route banana padega (abhi admin seedha
browser se anon client use kar raha hai, orders/coupons wale hi pattern
ki tarah). Ye bhi agla step hai, isi batch mein risk kam rakhne ke liye
nahi kiya.

## Apply kaise karo

1. Repo private karo (upar dekho).
2. Pehle **staging/dev Supabase project** pe dono naye migration files
   run karo, checkout + admin coupon panel test karo.
3. Sab sahi chale to production Supabase pe migrations run karo
   (Supabase dashboard > SQL editor, ya `supabase db push` agar CLI use
   karte ho).
4. Naya code deploy karo (git push jaisa aap plan kar rahe ho).
5. Mujhe bata dena — agla step `orders` RLS + `products` RLS hoga.
