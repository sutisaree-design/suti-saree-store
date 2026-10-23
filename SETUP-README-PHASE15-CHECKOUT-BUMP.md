# Phase 15 — Checkout Order Bump (AOV booster, no free-shipping dependency)

Tumne bola tumhare paas already free shipping hai, isliye "unlock free shipping" wala
order-bump nahi banaya — iske bajaye ek classic order-bump banaya hai: checkout page par
ek admin-chuna hua sasta/high-margin product one-click add hota hai, chahe cart mein
kuch bhi ho. Discount bhi diya ja sakta hai (optional), taaki "sirf checkout par milega"
wali urgency bane.

Koi naya SQL/migration nahi chahiye — settings tumhare existing `settings`
(key/value) table mein hi store hoti hain, jaise Growth Tools/SEO settings already karti hain.

## Admin se manage karo
**Admin → Marketing → Checkout Bump** tab se:
1. **Enable** toggle on karo
2. **Product** dropdown se koi product chuno — sasta, high-margin, size-independent cheez
   chuno (pouch, scarf, jewellery box, bindi set, styling accessory) kyunki checkout par
   size choose karne ka option nahi hai
3. **Discount %** set karo (0 bhi chalega, discount zaroori nahi hai)
4. **Headline/Subtext** customize karo

Save karte hi turant live ho jata hai — koi redeploy nahi chahiye.

## Storefront par kya dikhta hai
Checkout page → Order Summary ke andar, totals ke upar ek dashed-border card dikhta hai:
product photo + naam + discounted price (strikethrough ke saath original price) + checkbox.
Check karte hi wo product turant cart items list mein add ho jata hai aur Total mein reflect
ho jata hai (checkout-only discounted price ke saath) — exactly jaisa normal cart item hota
hai, order place hote hi normal order_items ki tarah save hota hai.

Agar customer ne wahi product already cart mein daal rakha hai, to bump card apne aap hide
ho jata hai (double-offer confusion avoid karne ke liye).

## Naye/modified files

```
lib/checkout-bump-api.ts                 NEW
lib/products-api.ts                      MODIFIED (fetchProductById add kiya)
components/admin/marketing-panel.tsx     MODIFIED (naya "Checkout Bump" tab)
app/checkout/page.tsx                    MODIFIED (bump card + toggle logic)
```

## Deploy

```bash
npm install
npx tsc --noEmit   # clean pass hua hai
git add -A && git commit -m "Phase 15: checkout order bump" && git push
```

## Test kaise karo
1. Admin → Marketing → Checkout Bump → koi product chuno, enable karo, save karo
2. Site par koi bhi product cart mein daalo → Checkout page pe jao
3. Order Summary mein totals ke thoda upar naya dashed card dikhna chahiye
4. Checkbox tick karo → product turant items list + Total mein add ho jana chahiye
5. Untick karo → wapas hat jana chahiye
