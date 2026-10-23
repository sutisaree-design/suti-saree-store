# Variant instant-switch — background prefetch

## Kya already tha (repo mein pehle se)
- Jo colour/variation product page seedha open hua (URL/slug ke hisaab se),
  wahi server par render hokar **turant** dikhta hai — koi extra client
  fetch nahi hoti (`app/product/[slug]/page.tsx` -> `initialVariant`).
- Baaki saare colours ki list `VariantSwatches` component background mein
  fetch karta hai, aur unki **photos** ko idle time par (aur sirf
  4G/WiFi par, 3G/Data-Saver par nahi) preload kar deta hai — taaki pehli
  baar colour switch karne par bhi photo turant dikhe.

## Is patch mein kya add kiya
Ek cheez baaki thi: colour switch karte hi jo **sizes/stock** data hai,
wo abhi bhi switch karte waqt hi network se fetch hota tha (chhota sa
delay). Ab:

1. **`lib/variant-prefetch-cache.ts`** (naya file) — ek simple in-memory
   cache jisme har colour ka poora data (images + sizes/stock) store hota
   hai.
2. **`components/product/variant-swatches.tsx`** — photos preload karne ke
   baad, same idle/connection-aware logic se, baaki har colour ka **poora**
   data (`fetchVariantBySlug`) bhi background mein fetch karke is cache
   mein daal deta hai — ek-ek karke (sequential), taaki bandwidth par
   burst na pade.
3. **`app/product/[slug]/product-detail.tsx`** — jab user koi swatch click
   kare, sabse pehle cache check hota hai. Agar wo colour pehle se prefetch
   ho chuka hai (zyadatar case mein hoga, kyunki idle time mein already
   load ho chuka hota hai), to **zero network call** — turant switch,
   sizes/stock samet. Agar cache miss ho (bahut fast click ya slow
   connection), to purana fallback (live fetch) waisa hi kaam karta hai —
   kuch bhi break nahi hota.

## Result
- Jo variation pehle open hoga → wahi sabse pehle dikhega (already tha).
- Baaki sab colours ka data (photos + sizes/stock) backend/idle mein
  automatic load ho jata hai.
- User ko colour switch karte waqt koi delay mahsus nahi hoga (best case
  mein turant, worst case mein purane jaisa hi fallback).

## Apply kaise karein
Yeh 3 files apne repo mein same path par replace/add kar dein:
- `lib/variant-prefetch-cache.ts` (naya)
- `components/product/variant-swatches.tsx` (replace)
- `app/product/[slug]/product-detail.tsx` (replace)

Phir normal tarah se commit + push kar dein:
```
git add lib/variant-prefetch-cache.ts components/product/variant-swatches.tsx "app/product/[slug]/product-detail.tsx"
git commit -m "Prefetch full variant data (images+sizes) in background for zero-delay colour switching"
git push
```

Koi env var, migration, ya dependency change nahi chahiye — pure
client-side change hai.
