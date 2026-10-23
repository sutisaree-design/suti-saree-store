# Phase 8 — SEO/Marketing Polish

## 1. Files kaise replace karein
Yeh zip sirf **naye aur badle hue files** ka hai (poora project nahi). Apne local project folder
(`E-Commerce-ethnic`) ke andar isi folder structure ke saath extract/copy kar do — same paths pe
overwrite/create ho jayenge:

- `supabase/migrations/20260718000000_phase8_marketing.sql` → NEW
- `lib/marketing-api.ts`                                     → NEW
- `app/legal/[slug]/page.tsx`                                → NEW (Privacy/Terms/Shipping/Refund pages)
- `components/whatsapp-button.tsx`                            → NEW
- `components/newsletter-signup.tsx`                          → NEW
- `app/api/newsletter/route.ts`                                → NEW
- `app/api/merchant-feed/route.ts`                             → NEW
- `components/product/mobile-sticky-cart-bar.tsx`              → NEW
- `components/admin/marketing-panel.tsx`                       → NEW
- `components/providers.tsx`                                   → REPLACE (WhatsApp button wired in globally)
- `components/footer.tsx`                                      → REPLACE (legal links + newsletter form added)
- `app/product/[slug]/product-detail.tsx`                      → REPLACE (mobile sticky Add to Cart bar wired in)
- `app/admin/page.tsx`                                          → REPLACE (new "Marketing" tab added)
- `app/sitemap.ts`                                              → REPLACE (legal pages added to sitemap)

Zip ke andar bhi wahi folder structure hai, so bas root mein extract karo aur "Yes, overwrite" bol do.

## 2. Supabase mein SQL run karna hoga
Supabase Dashboard → SQL Editor → naya query → is file ka poora content paste karke Run karo:

`supabase/migrations/20260718000000_phase8_marketing.sql`

Yeh sirf ek naya table banata hai — `newsletter_subscribers` (email capture ke liye). Koi existing
table/data touch nahi hota, safe hai. Legal pages, WhatsApp number/message, aur merchant feed
on/off — yeh sab tumhare already-existing `settings` table (key/value) mein hi store hote hain,
unke liye alag se migration ki zaroorat nahi.

## 3. Git push
Files replace karne ke baad normal tarike se:
```
git add .
git commit -m "Phase 8: legal pages, WhatsApp, newsletter, merchant feed, mobile sticky cart bar"
git push
```
Vercel/Netlify jahan bhi deployed hai wahan auto-deploy ho jayega.

## 4. Naya kya-kya kaam karega

### Legal pages
- `/legal/privacy-policy`, `/legal/terms-conditions`, `/legal/shipping-policy`, `/legal/refund-policy`
- Footer mein links already add kar diye hain.
- Content Admin → **Marketing → Legal Pages** tab se edit karo (plain text, save karte hi live).

### WhatsApp chat button
- Admin → **Marketing → WhatsApp** tab: on/off toggle, apna WhatsApp number (country code ke
  saath, e.g. `919876543210`) aur default message daal ke save karo.
- Turant har page ke bottom-right corner mein floating green button dikhne lagega (admin panel
  mein nahi dikhega).

### Newsletter
- Footer mein email signup form already add hai — subscribe karte hi `newsletter_subscribers`
  table mein save hota hai.
- Admin → **Marketing → Newsletter** tab: pura subscriber list dekho, CSV export karo, ya kisi
  ko list se remove karo.

### Merchant feed (Google Shopping / Meta Catalog)
- Feed URL: `https://your-domain.com/api/merchant-feed` — yeh sab products ka live XML feed
  generate karta hai (title, price, image, availability, etc.), automatically update hota rehta
  hai jab bhi products change karo, kuch bhi manually export nahi karna padega.
- Google Merchant Center mein: Products → Feeds → "Scheduled fetch" mein yeh URL daal do.
- Admin → **Marketing → Merchant Feed** tab se on/off kar sakte ho, brand name set kar sakte ho,
  aur URL copy/open kar sakte ho.

### Mobile sticky Add to Cart bar
- Product page ko mobile pe kholne par ab bottom mein hamesha ek chhota bar dikhega jisme price
  aur "Add to Cart" button ho — user ko upar scroll karke buy box dhundhna nahi padega.
- Desktop pe yeh nahi dikhta (`md:hidden`), sirf mobile-width screens ke liye hai.

### Admin — sab kuch ek jagah
- Admin Dashboard mein ek naya **"Marketing"** tab add ho gaya hai jisme 4 sub-tabs hain: Legal
  Pages, WhatsApp, Newsletter, Merchant Feed — sab yahi se manage hota hai, koi env var ya code
  change nahi chahiye future changes ke liye.

## 5. Env vars — kuch naya nahi chahiye
Is phase ke liye koi naya `.env` variable nahi chahiye. Merchant feed aur legal page links
`NEXT_PUBLIC_SITE_URL` use karte hain — yeh Phase 7 mein already set kar diya tha; agar nahi kiya
to Vercel → Settings → Environment Variables mein add kar dena:
```
NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
```

## 6. Security note (existing pattern hi follow kiya hai)
`newsletter_subscribers` table bhi is project ke baaki tables jaisi hi open RLS policy pe hai
(anon key se admin panel read/delete kar sakta hai) — same trust model jo `settings`, `coupons`,
`reviews` waghera already use kar rahe hain. Agar future mein isse tighten karna ho (service_role
key + proper admin-only RLS), bata dena, alag se migration bana dunga.
