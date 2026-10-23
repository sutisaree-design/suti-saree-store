# Vendor Collection feature — check + fix

Maine pura repo clone karke check kiya. Achi baat — jo aapne pehle setup kiya tha,
wo **code me poora aur sahi tarike se bana hua hai**, `tsc --noEmit` bhi clean pass
hua, koi type error nahi. Har piece already wired hai:

## Already working (code-level)
- `components/product/vendor-collection.tsx` → product page par "<Vendor Name>'s
  Collection" carousel, "You may also like" ke turant neeche
  (`app/product/[slug]/product-detail.tsx` line ~570-572).
- `app/api/vendor-collection/[productId]/route.ts` → product ka vendor dhoondhta
  hai, uske baaki live products deta hai.
- Carousel scrollable hai + "View All" right side me (`components/product/
  product-carousel.tsx`), click karne par `/store/[vendor-slug]` par jaata hai.
- `app/store/[slug]/` → vendor ka public page, jisme total rating + review count
  dikhta hai (agar admin ne on rakha ho).
- `components/admin/vendors-panel.tsx` → Admin > Vendors me har approved vendor
  ke saath ek **Switch (toggle)** hai "Show rating/reviews on storefront". Yehi
  aapka "dikhana hai ya nahi" wala toggle hai — off karne par sirf vendor ka
  poora listing dikhega, rating/review block gayab ho jaayega. (Vendor listing
  khud kabhi hide nahi hoti — sirf rating summary toggle hoti hai, jo intentional
  hai kyunki aapne khud yehi behaviour maanga tha.)

## Maine ek chhota sa gap fix kiya
Pehle sirf "View All" clickable tha, collection ka naam (title) clickable nahi
tha. Ab **dono clickable hain** — title pe click karne se bhi `/store/[slug]`
par jaata hai. Changed file: `components/product/product-carousel.tsx`
(diff `changes.diff` me hai).

## Jo cheez shayad "kaam nahi kar raha" laga — most likely wajah
Ye sab UI/API code hai, lekin iske peeche jo naya database column/view chahiye
(`vendors.storefront_slug`, `vendors.show_public_rating`, `vendor_public_profiles`
view) wo `supabase/migrations/20260813000000_vendor_public_storefront.sql`
migration file me hai. **Repo me migration file hona ≠ aapke live Supabase
project me apply hona.** Agar ye migration Supabase par run nahi hui, to:
- Admin panel me toggle dikhega lekin save/update fail hoga, ya
- Vendor collection widget hamesha empty (null) aayega, ya
- Store page 404 dega.

**Fix:** Supabase dashboard → SQL Editor me jaake ye file run kar dijiye
(ya `supabase db push` agar CLI use karte hain):
`supabase/migrations/20260813000000_vendor_public_storefront.sql`

Us migration ke run hone ke baad:
1. Kisi approved vendor ka product open karke check karein — "<Vendor>'s
   Collection" carousel dikhna chahiye (agar us vendor ke 2+ live products
   hain).
2. Admin → Vendors me us vendor ke card me "View public storefront" link aur
   rating toggle dikhna chahiye.

## Is zip me kya hai
- `changes.diff` — sirf jo maine change kiya uska diff
- `components/product/product-carousel.tsx` — updated file (dono title +
  View All clickable)

Isko apne local repo me `components/product/product-carousel.tsx` par
overwrite kar dijiye (ya `changes.diff` ko `git apply changes.diff` se apply
kar dijiye), phir `git push`.
