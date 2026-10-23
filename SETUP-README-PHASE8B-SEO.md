# Phase 8b — SEO Settings (Admin)

Yeh Phase 8 ka chhota extension hai — sirf 3 files replace karni hain (in files ko
Phase 8 wale zip ke baad extract karo, taaki latest version overwrite ho jaye):

- `lib/marketing-api.ts`              → REPLACE (SEO settings functions add kiye)
- `app/layout.tsx`                    → REPLACE (ab settings table se dynamic meta tags aate hain)
- `components/admin/marketing-panel.tsx` → REPLACE (naya "SEO" sub-tab add kiya)

## Koi naya SQL nahi chahiye
SEO settings bhi tumhare existing `settings` table (key/value) mein hi store hote hain
(`key = 'seo_settings'`) — koi migration nahi chahiye, bas files replace karo aur push kar do.

## Admin → Marketing → SEO tab mein kya-kya hai
1. **Site title** — homepage ka `<title>` aur Google search result mein dikhne wala title
2. **Meta description** — Google search result ke neeche wala description (160 characters ke andar rakho)
3. **Keywords** — comma-separated (ab search engines isko utna weight nahi dete, but harm nahi karta)
4. **Social share image (OG image)** — jab tumhara link WhatsApp/Facebook/Twitter pe share ho to
   yeh image dikhegi. Ek image URL daalo (1200×630px recommended), CDN/Supabase storage pe upload
   karke uska public URL yahan paste kar dena.
5. **Google Search Console verification code** — Google Search Console mein property add karte
   waqt "HTML tag" method choose karoge, wahan ek line milegi jaisi:
   `<meta name="google-site-verification" content="abc123XYZ..." />`
   Isme se sirf `content="..."` ke andar wali value copy karke yahan paste karo (poora tag nahi).

Save karte hi turant site ke `<head>` mein reflect ho jayega — koi redeploy nahi chahiye.

Note: individual product pages ka SEO already automatic hai (product ke naam/description se khud
ban jata hai) — yeh settings sirf homepage/site-wide default ke liye hain.
