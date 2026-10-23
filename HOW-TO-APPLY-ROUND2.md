# Round 2 — "Shop by Price" on the Product Page

Yeh **Round 1 (jo tumne already apply kar diya hai)** ke upar ek chhota
addition hai — sirf 3 files touch hue hain.

## Kya add hua
Product page par (jahan Buy Now button hai), uske turant niche ab **"Shop
by Price"** chips dikhenge — screenshot mein jahan tumne bola "yahan
scrollable nahi dikh raha", wahi jagah.

Yeh chips ek filter nahi hai (kyunki yahan ek hi product dikh raha hota
hai) — tap karne par shopper `/shop` page par chala jata hai, us price
range ke saath **already filtered** (Round 1 mein jo "Shop by Price" bar
banayi thi, wahi apply ho jati hai). Ranges wahi hain jo tum Admin > Catalog
> Price Filters se manage karte ho — koi alag jagah manage nahi karna.

## Files (is zip mein)
- `components/product/price-quick-browse-bar.tsx` — **naya file**
- `app/product/[slug]/product-detail.tsx` — **replace** (Buy Now ke niche
  naya chip bar add hua)
- `app/shop/shop-content.tsx` — **replace** (ab `/shop?pricebucket=<id>`
  link se aane par wahi price range apne aap filter ho jata hai)

## Apply kaise karein

**Option A — Patch (sirf ye 2 edited files ke liye):**
Repo root se:
```
git apply round2.diff
```
Fir naya component file manually copy karo:
`components/product/price-quick-browse-bar.tsx`

**Option B — Sabhi 3 files copy-paste:**
Zip ke andar jo files hain unhe same path par apne repo mein copy-paste/
replace karo, phir:
```
git add app/product/[slug]/product-detail.tsx app/shop/shop-content.tsx components/product/price-quick-browse-bar.tsx
git commit -m "feat: add Shop-by-Price quick browse chips to product page"
git push
```

(`round2.diff` ko maine ek fresh Round-1-applied copy par test karke
verify kiya hai — cleanly apply hota hai.)

## Test
1. Kisi bhi product page kholo — Buy Now button ke turant niche "Shop by
   Price" scrollable chips dikhne chahiye.
2. Koi bhi chip tap karo — `/shop` page khulna chahiye, us price range ke
   products already filtered dikhne chahiye (chip highlighted bhi rahega).
