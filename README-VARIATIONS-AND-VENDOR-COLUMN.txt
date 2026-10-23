NAYA FEATURE: Vendor Variations + Admin Catalog mein Vendor Column/Filter
==========================================================================

Ismein 2 alag features hain:

------------------------------------------------------------------------
1) VENDOR SIDE: "Add Variation" (colour/size options)
------------------------------------------------------------------------
Jaisa maanga tha, vendor ko product LIVE hone ke baad hi "Add Variation"
button dikhta hai (Products list me, Edit button ke bagal). Isse woh
product ke alag COLOURS add kar sakta hai — har colour ki apni photos,
optional price-override, aur sizes+stock.

Yeh admin ke already-existing "colour variant" system (product_variants /
product_variant_sizes tables) ka hi use karta hai — jo storefront pe pehle
se colour-swatch pages dikhata hai. Matlab vendor ka add kiya variation
seedha frontend pe bhi show hoga, alag se kuch nahi karna padega.

NAYE/CHANGED FILES:
  app/api/vendor/variants/route.ts            (naya)  - list + create
  app/api/vendor/variants/[id]/route.ts        (naya)  - update + delete
  lib/vendor-api.ts                            (edit)  - client helper functions add ki
  components/vendor/vendor-variants-manager.tsx (naya) - "Add Variation" modal
  app/vendor/dashboard/products/page.tsx       (edit)  - button wire kiya

SECURITY / RULES JO BUILT-IN HAIN:
  - Vendor sirf apne hi product ke variants add/edit/delete kar sakta hai
    (ownership check server-side)
  - Variant tabhi add ho sakta hai jab product ka status 'live' ho
  - Har colour ke liye kam se kam 1 photo aur 1 size/stock row zaroori hai

------------------------------------------------------------------------
2) ADMIN CATALOG: Vendor column + filter + search
------------------------------------------------------------------------
Admin > Products (Manage Products) list me ab:
  - Ek "Vendor" column dikhta hai har product ke row me (ya "In-house"
    agar wo vendor se nahi, khud admin ne add kiya product hai)
  - Ek "All Vendors" dropdown filter (Category/Stock filter ke bagal) —
    isse ek specific vendor ke products hi dikha sakte ho
  - Search box (name/SKU/fabric search wala) ab vendor ke naam se bhi
    match karta hai

NAYE/CHANGED FILES:
  app/api/admin/product-vendors/route.ts   (naya)  - product_id -> vendor
                                                      name/id ka lookup
  components/admin/products-panel.tsx      (edit)  - column, filter,
                                                      search sab wire kiya

Yeh implementation deliberately alag rakha gaya hai storefront ke shared
product-fetching code se (jo customer-facing hai aur sirf 'live' products
dikhata hai) — taaki storefront ya existing admin features accidentally
na toot jaayein. Bas ek chhota extra API call hota hai jab admin panel
khulta hai.

------------------------------------------------------------------------
HOW TO APPLY
------------------------------------------------------------------------
1. Is zip ke andar jitni files hain, sab apne repo me EXACT same path pe
   copy-overwrite kar do (kuch naye folders/files banenge, kuch existing
   overwrite honge):

     app/api/vendor/variants/route.ts
     app/api/vendor/variants/[id]/route.ts
     app/api/admin/product-vendors/route.ts
     app/vendor/dashboard/products/page.tsx
     components/vendor/vendor-variants-manager.tsx
     components/admin/products-panel.tsx
     lib/vendor-api.ts

2. git add -A
3. git commit -m "feat: vendor product variations + admin vendor column/filter"
4. git push
5. Deploy hone do.

------------------------------------------------------------------------
TESTING
------------------------------------------------------------------------
- Vendor dashboard > Products: jo product "Live on Site" hai uspar "Add
  Variation" button dikhna chahiye. Click karke ek colour add karo
  (photo + size/stock) — save hone ke baad admin panel me us product ke
  "palette" icon se bhi wahi variant dikhna chahiye, aur storefront pe
  bhi colour-swatch ke roop me.
- Admin panel > Products: list ke top pe ab "All Vendors" dropdown dikhna
  chahiye, aur har row me vendor ka naam. Kisi vendor ka naam search box
  me type karke bhi filter ho jaana chahiye.

Agar kahin koi field missing/broken laga, us screenshot ke saath bata
dena, turant theek kar dunga.
