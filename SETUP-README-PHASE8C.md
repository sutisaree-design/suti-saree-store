# Phase 8c — Favicon, 404 Page, Analytics, Homepage Schema

Yeh Phase 8/8b ke baad ka extension hai. Files replace/add karo (isi folder structure ke saath):

- `app/icon.tsx`                       → NEW (dynamic favicon)
- `app/apple-icon.tsx`                 → NEW (iPhone "Add to Home Screen" icon)
- `app/not-found.tsx`                  → NEW (branded 404 page)
- `app/home-client.tsx`                → NEW (tumhara purana homepage UI, ab yahan move ho gaya)
- `app/page.tsx`                       → REPLACE (ab poora naya — sirf Organization/WebSite schema
                                          add karke `home-client.tsx` ko render karta hai)
- `app/layout.tsx`                     → REPLACE (Google Analytics + Meta Pixel wiring add ki)
- `lib/marketing-api.ts`               → REPLACE (favicon + analytics settings functions add ki)
- `components/admin/marketing-panel.tsx` → REPLACE (naye "Analytics" tab + favicon field add ki)

**Important:** `app/page.tsx` ab bilkul alag file hai (poora replace karo, merge mat karna) — iska
UI content `home-client.tsx` mein move ho gaya hai taaki homepage server-side pe structured data
bhi render kar sake.

## Koi naya SQL nahi chahiye
Sab kuch existing `settings` table mein hi store hota hai (`seo_settings` aur `analytics_settings`
keys) — koi migration ki zaroorat nahi.

## Ab admin se kya-kya control hota hai

### 1. Favicon / Logo (Admin → Marketing → SEO → "Favicon / logo image URL")
Apna logo ka image URL daal do (square image, 180×180px ya bada) — turant browser tab icon aur
phone home-screen icon ban jayega. Khali chhodoge to ek default "S" monogram icon dikhega
(tumhare brand colors mein already generate hota hai, kuch upload karne ki zaroorat nahi).

### 2. Custom 404 page
Kisi bhi galat/expired link pe ab branded "This page has wandered off" page dikhega, Home aur
Shop pe wapas jaane ke buttons ke saath — koi setting nahi chahiye, automatic hai.

### 3. Google Analytics + Meta Pixel (Admin → Marketing → Analytics)
- **Google Analytics (GA4):** Toggle on karo, Measurement ID daalo (`G-XXXXXXXXXX` format) —
  Google Analytics → Admin → Data Streams → apna web stream kholo, wahan se copy karo.
- **Meta Pixel:** Toggle on karo, Pixel ID daalo (numeric) — Meta Events Manager → Data Sources →
  apna Pixel → ID copy karo.
- Dono independently on/off ho sakte hain. Save karne ke baad site ek baar reload karo taaki
  tracking script load ho jaye.

### 4. Homepage structured data (Organization + WebSite)
Yeh automatic hai — koi setting nahi. Google ko batata hai ki tumhara brand naam, website URL,
aur contact info kya hai (Admin → Settings → Store Info se uthata hai), plus ek "Search" action
jo Google ko site ka search box istemaal karne deta hai search results mein. Koi extra kaam nahi
karna, bas Store Info settings sahi bhare hue hone chahiye.

## Ek dhyaan rakhne wali baat (test/verify)
`next build` iss sandbox mein Google Fonts fetch na kar paane ki wajah se yahan complete nahi ho
saka (network restriction hai isi container mein, tumhare Vercel/Netlify pe yeh problem nahi
aayegi — woh already internet se connected hain). Maine `tsc --noEmit` aur `eslint` dono clean
pass karwaye hain saari nayi/badli hui files pe, so type-safety aur code quality confirm hai.
Tumhare deploy pe normal build hoga — bas agar kuch missed reh gaya ho to bata dena, turant fix
kar dunga.
