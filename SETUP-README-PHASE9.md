# Phase 9 — Product Discovery & Engagement

## 1. Files kaise replace karein
Yeh zip sirf **naye aur badle hue files** ka hai (poora project nahi). Apne local project folder
(`E-Commerce-ethnic`) ke andar isi folder structure ke saath extract/copy kar do — same paths pe
overwrite/create ho jayenge:

- `supabase/migrations/20260719000000_phase9_discovery.sql` → NEW
- `lib/types.ts`                                              → REPLACE (adds `occasion` tag field to Product)
- `lib/products-api.ts`                                       → REPLACE (reads/writes `occasion`)
- `lib/products-api-server.ts`                                → REPLACE (same, server-side)
- `lib/stock-notify-api.ts`                                   → NEW (Notify-me signup + admin list/delete)
- `lib/recently-viewed.ts`                                    → NEW (localStorage-based view history)
- `lib/email-templates.ts`                                    → REPLACE (adds restock email template)
- `app/api/admin/notify-restock/route.ts`                      → NEW (emails everyone waiting, marks notified)
- `components/product/notify-me-form.tsx`                      → NEW
- `components/product/related-products.tsx`                    → NEW (smarter "You may also like")
- `components/product/recently-viewed.tsx`                     → NEW
- `app/product/[slug]/product-detail.tsx`                      → REPLACE (wires in all 3 above)
- `app/shop/page.tsx`                                          → REPLACE (adds Fabric + Occasion filters)
- `components/admin/products-panel.tsx`                        → REPLACE (Occasion field + auto restock emails)
- `components/admin/stock-notifications-panel.tsx`              → NEW (Admin → Restock Alerts)
- `app/admin/page.tsx`                                          → REPLACE (new "Restock Alerts" tab)
- `app/account/wishlist/page.tsx`                               → REPLACE (type fix for new `occasion` field)

Zip ke andar bhi wahi folder structure hai, so bas root mein extract karo aur "Yes, overwrite" bol do.

## 2. Supabase mein SQL run karna hoga
Supabase Dashboard → SQL Editor → naya query → is file ka poora content paste karke Run karo:

`supabase/migrations/20260719000000_phase9_discovery.sql`

Yeh karta hai:
- `products` table mein `occasion text[]` column add karta hai (default empty array — koi existing
  product data touch nahi hota)
- Ek naya table `stock_notifications` banata hai ("Notify me" signups ke liye)

Koi bhi existing table ka data delete/modify nahi hota, safe hai.

## 3. Naye features kya karte hain

### a) Related / recommended products ("You may also like")
Ab yeh sirf same-category nahi dikhata — scoring system hai:
- Same category → +3
- Same fabric → +2
- Shared occasion tags → +1 per match
- In-stock products ko halka priority milta hai

### b) Recently viewed
Har product page visit par product ID browser ke `localStorage` mein save hota hai (guest users ke
liye bhi kaam karta hai, koi login nahi chahiye). Product page ke bottom mein "Recently Viewed"
section dikhta hai (agar kam se kam 1 product dekha ho).

### c) Stock notification ("Notify me")
Jab product out-of-stock ho, "Add to Cart" ke jagah ek email form dikhta hai. Customer email daal
ke submit karta hai → `stock_notifications` table mein save hota hai.

Jab admin us product ka stock 0 se kisi bhi positive number par update karta hai (Products panel ke
+/- buttons se ya edit form se), system **automatically** un sab customers ko "Back in stock" email
bhej deta hai jinhone signup kiya tha, aur unhe "notified" mark kar deta hai. Admin chahe to
**Admin → Restock Alerts** tab se manually bhi "Notify now" bhej sakta hai, aur signups dekh/delete
kar sakta hai.

(Email bhejne ke liye tumhara Admin → Settings → Email Notifications already configured hona
chahiye — Phase 8 mein jo Resend/ZeptoMail setup kiya tha, wahi use hota hai.)

### d) Advanced filters — Fabric & Occasion
Shop page ke filter panel mein ab **Fabric** aur **Occasion** filters bhi hain, category/size/price
ke saath. Yeh dynamically har existing product se derive hote hain — jo bhi fabric/occasion values
admin ne products mein daale hain, wahi options filter mein dikhte hain.

**Occasion tags admin se manage karo:** Admin → Products → koi product edit/add karo → ab ek naya
field "Occasion tags (comma-separated)" milega — jaise `Wedding, Festive, Party, Casual, Office Wear`.
Yeh tags hi shop page ke Occasion filter mein options ban jate hain, aur related-products scoring
mein bhi use hote hain.

## 4. Git push
Files replace karne ke baad normal tarike se:
```
git add .
git commit -m "Phase 9: related products, recently viewed, restock notifications, fabric/occasion filters"
git push
```
