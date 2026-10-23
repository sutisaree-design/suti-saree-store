UPDATE: Variation Count + Expand Arrow (Vendor) aur Count Badge (Admin)
=========================================================================

1) VENDOR PRODUCTS LIST
------------------------
- Har LIVE product ke row me ab ek button hai jo bata deta hai kitne
  variations hain — jaise "2 variations ▾" — aur "Add Variation" ki
  jagah le liya hai (same button ab dono kaam karta hai: count dikhana
  + expand/collapse).
- Click karne par NICHE HI (same page pe, popup nahi) ek panel khulta
  hai jisme saari colours dikhti hain — photo, size/stock — aur har
  colour ke aage ek pencil (edit) aur trash (delete) icon hai. Neeche
  "+ Add colour" button bhi hai naya colour add karne ke liye.
- Arrow upar (▴) ho jaata hai jab khula ho, neeche (▾) jab band ho.

2) ADMIN — MANAGE PRODUCTS LIST
---------------------------------
- Har product ke naam ke neeche ab ek chhoti si line dikhti hai
  "2 colours" (agar variants hain) — bina kuch click kiye. Pehle yeh
  sirf palette icon click karke, product edit dialog khol ke pata
  chalta tha.

NAYI/CHANGED FILES:
  app/api/vendor/variants/counts/route.ts        (naya) - vendor ke
      saare products ke variant counts ek hi call me
  app/api/admin/product-variant-counts/route.ts  (naya) - admin ke
      liye sabhi products ke variant counts
  lib/vendor-api.ts                              (edit) - naya
      fetchMyVendorVariantCounts() helper add kiya
  components/vendor/vendor-variants-manager.tsx  (REWRITE) - ab yeh
      popup (Dialog) ki jagah seedha inline panel render karta hai,
      "expanded" prop se control hota hai (parent row ke chevron se)
  app/vendor/dashboard/products/page.tsx         (edit) - chevron
      button + count badge + inline panel wire kiya
  components/admin/products-panel.tsx            (edit) - count
      fetch + "N colours" badge product name ke neeche

HOW TO APPLY
------------
1. Sabhi files apne repo me isi path pe copy-overwrite karo (kuch naye
   folders/files ban sakte hain).
2. git add -A
3. git commit -m "feat: variation count + inline expand for vendor, count badge for admin"
4. git push
5. Deploy hone do.

NOTE: agar aapne pichla zip (vendor-variations-and-admin-vendor-column)
abhi tak apply nahi kiya hai, to pehle wo lagao, uske baad yeh — kyunki
yeh usi vendor-variants-manager.tsx aur page.tsx ko aage badhata hai.

TESTING
-------
- Vendor dashboard > Products: live product pe button ab
  "Add Variation" ki jagah "2 variations ▾" (ya sirf "Variations ▾"
  agar 0 hain) dikhna chahiye. Click karke niche list khulni chahiye,
  edit/delete/add sab wahin se kaam karna chahiye.
- Admin > Products: product name ke neeche "N colours" line dikhni
  chahiye agar us product ke colour variants hain.
