# Site Banner — shop/category pages fix

## Problem
Pehli baar toggles add karte waqt banner ko sirf home aur product page tak
hi limit kar diya tha. Isse shop page, category pages, aur baaki sab jagah
banner poori tarah gayab ho gaya — jo galat tha.

## Fix
Ab logic ye hai:
- **Home page** → sirf tab dikhega jab "Show on home page" toggle ON ho
- **Product page** → sirf tab dikhega jab "Show on product page" toggle ON ho
- **Baaki sab pages** (shop, category, waghera) → **hamesha** dikhega, jaisa
  in toggles ke aane se pehle tha — koi extra setting nahi chahiye
- **Checkout** → hamesha hidden (jaisa pehle se tha)

## Files changed (2)
- `components/site-banner.tsx` — visibility logic fix
- `components/admin/settings-panel.tsx` — description text update (sirf spelling out ki toggles sirf home/product ke liye hain)

## Apply
Zip ke andar dono files hain, apne repo mein same path pe replace karo:
```
git add components/site-banner.tsx components/admin/settings-panel.tsx
git commit -m "fix: site banner should stay always-on for shop/category pages, only home+product are toggle-gated"
git push
```
Ya patch:
```
git apply site-banner-shop-category-fix.diff
```
