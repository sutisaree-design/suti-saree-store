# Site Banner — Home page / Product page toggles

## Kya change hua
Admin > Settings > **Site Banner** section mein ab do naye toggle hain:

- **Show on home page** — ON karoge tabhi banner home page (`/`) pe dikhega
- **Show on product page** — ON karoge tabhi banner product pages (`/product/...`) pe dikhega

Pehle banner checkout ke alawa HAR page pe automatically dikhta tha. Ab **default dono
toggle OFF** hain — banner tabhi dikhega jab aap khud us jagah ke liye toggle ON karoge.
Dono ek saath bhi ON kar sakte ho (home + product dono pe dikhega), ya sirf ek.

Banner image/link same rehta hai — bas ab visibility control mil gaya.

## Files changed (3)
- `lib/settings-api.ts` — `SiteBanner` type mein `show_on_home` / `show_on_product` fields add kiye
- `components/admin/settings-panel.tsx` — admin UI mein do Switch toggles add kiye
- `components/site-banner.tsx` — storefront pe banner dikhane ka logic ab pathname + toggles check karta hai

## Apply kaise karein
Zip ke andar teeno files hain, apne repo mein wahi paths pe copy-paste karke replace karo:
- `lib/settings-api.ts`
- `components/admin/settings-panel.tsx`
- `components/site-banner.tsx`

Phir:
```
git add lib/settings-api.ts components/admin/settings-panel.tsx components/site-banner.tsx
git commit -m "feat: add per-page toggles (home/product) for site banner visibility"
git push
```

Ya patch apply karo (repo root se):
```
git apply site-banner-toggles.diff
```

## Deploy ke baad
1. Admin > Settings > Site Banner pe jao
2. "Show on home page" / "Show on product page" toggle ON karo jahan chahiye
3. Home page aur ek product page kholke check karo — banner ab sirf wahi dikhega jahan toggle ON hai

⚠️ Note: agar tumne pichli baar wali video-autoplay fix (`app/media/[...path]/route.ts`) abhi tak
push nahi ki, wo is zip mein nahi hai — wo alag se pehle diya gaya zip use karna.
