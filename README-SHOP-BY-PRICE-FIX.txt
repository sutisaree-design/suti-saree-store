Shop by Price -- category-aware fix
====================================

Kya badla (3 files):

1) lib/products-api.ts
   - Naya function add kiya: fetchCategoryPrices(category)
   - Ye sirf us category ke saare LIVE products ke price fetch karta hai
     (sirf `price` column, halka/fast query).

2) components/product/price-quick-browse-bar.tsx
   - Ye hi "Shop by Price" bar hai jo product page par dikhta hai.
   - Ab ye ek naya required prop leta hai: category
   - Har admin-configured price bucket ko us category ke products ke
     against check karta hai (getAvailablePriceBuckets helper, jo pehle
     se hi /shop page par use ho raha tha -- same logic yahan bhi laga
     diya).
   - Jis bucket me is category ka koi product nahi hai, wo bucket hide
     ho jayega.
   - Chip par click karne se ab /shop?category=<is category>&pricebucket=<id>
     par jayega (pehle sirf pricebucket jaata tha, category nahi) -- taaki
     "Under Rs499" dabane par sirf isi category ke Rs499 se neeche wale
     products dikhein, poore store ke nahi.

3) app/product/[slug]/product-detail.tsx
   - Sirf 1 line badli: <PriceQuickBrowseBar /> ko
     <PriceQuickBrowseBar category={product.category} /> kar diya,
     taaki current product ki category component ko pata chale.

Kaise apply karein
-------------------
Zip ke andar wahi folder-structure hai jo aapke repo me hai
(lib/, components/product/, app/product/[slug]/). Bas in 3 files ko
apne project me same paths par overwrite/replace kar dein, phir:

  git add -A
  git commit -m "Shop by Price: category-aware, hide empty buckets"
  git push

Agar patch se apply karna chahein to CHANGES.diff bhi zip me hai:
  git apply CHANGES.diff

Verify kiya gaya
------------------
- npx tsc --noEmit  -> 0 errors
- npx eslint (in 3 files) -> 0 errors/warnings
- Poori repo clone karke, real Supabase se connect karke, actual browser
  me click-through NAHI test kiya ja saka (mere paas aapke live
  Supabase credentials nahi hain) -- so localhost par ek baar khud
  zaroor check kar lein.
