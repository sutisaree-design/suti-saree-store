# Egress usage fix — 2 files changed

## Kya badla aur kyu

### 1. `app/api/admin/woocommerce-import/route.ts`
Pehle: `select('*')` — poori `woocommerce_customers` table ke saare
columns (billing/address wagera jo UI kabhi use nahi karta) bhej raha
tha, wo bhi 20,000 rows tak, har baar jab admin panel ka "WooCommerce
Import" tab khulta tha.

Ab: sirf wahi 10 columns select hote hain jo panel actually dikhata
hai (`id, wc_customer_id, name, email, phone, source,
source_store_url, imported_at, opted_out, opted_out_at`). Payload
size bahut chhota ho jayega, isliye egress bhi kam hoga.

### 2. `components/admin/notification-bell.tsx`
Pehle: notification bell har 20 second mein `/api/admin/notifications`
ko poll karta tha — chahe admin tab background mein khuli pade ho,
kisi ki nazar na ho. Ghanton tak ye chalta rehta hai agar tab band
nahi ki.

Ab: `document.visibilitychange` ke through, jab tab hidden/background
mein ho tab polling automatically ruk jati hai, aur tab wapas focus
hote hi turant refresh + polling resume ho jaati hai. Isse background
mein bekar egress consumption bahut kam hoga.

## Kaise apply karo

1. In dono files ko apne project mein exact usi path pe replace karo:
   - `app/api/admin/woocommerce-import/route.ts`
   - `components/admin/notification-bell.tsx`
2. Phir normal tarike se:
   ```
   git add app/api/admin/woocommerce-import/route.ts components/admin/notification-bell.tsx
   git commit -m "fix: reduce Supabase egress from admin import panel and notification polling"
   git push
   ```
3. Vercel automatically redeploy karega.

## Future ke liye extra suggestions (optional, is package mein included nahi)

- WooCommerce bulk import/campaign send ko chhote batches mein aur
  off-peak time pe manually chalao — ek din mein 20,000 rows +
  campaign ek saath na chalayein.
- Supabase dashboard > Usage tab regularly check karte raho, khaaskar
  bulk operation chalane ke baad.
- Agar business badh rahi hai to Pro plan lena better rahega taaki ye
  limit baar-baar cross na ho.
