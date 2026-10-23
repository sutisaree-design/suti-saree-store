FREE SIZE TOGGLE + FULL SIZE LIST + GOOGLE MERCHANT PRICE FIX
================================================================

1) Google Merchant — colour/size price alag-alag hone se error?
------------------------------------------------------------------
Check kar liya — YEH ISSUE ASLI THA, ab fix kar diya.

Aapka merchant feed (app/api/merchant-feed/route.ts) pehle har COLOUR ke
liye ek hi listing bhejta tha, aur us listing mein saari sizes ek sath
"S/M/L/XL" jaisa jodkar ek hi price bhej raha tha (colour ka price, ya
agar wo bhi na ho to product ka base price) — size ka apna price_override
bilkul ignore ho raha tha.

Isse Google Merchant Center mein "price mismatch" error/disapproval aane
ka pura chance tha: Google aapki product page pe jaake actual price check
karta hai aur feed ke price se compare karta hai. Agar XL ka page pe
price ₹274 hai lekin feed mein pura group ek hi ₹260 (ya jo bhi colour
price ho) bhej raha hai, to Google usko mismatch maanta hai aur listing
disapprove kar sakta hai.

Fix: ab feed har SIZE ke liye alag listing bhejta hai — apne sahi price
(size ka price_override, warna colour ka price, warna product ka price)
aur apne sahi stock ke sath. Sab ek hi product ke swatches jaise dikhte
rahenge (item_group_id same rehta hai), bas ab har size ka price sahi se
match karta hai.

Koi aur setup nahi chahiye — feed URL same rehta hai
(https://<aapka-domain>/api/merchant-feed), bas agli baar Google jab
fetch karega to naya, sahi data milega.

2) "Free Size" hamesha select rehta tha, unselect nahi ho raha tha
---------------------------------------------------------------------
Yeh code mein hardcoded tha — "Free Size" button disabled tha aur har
baar kisi bhi size ko toggle karne pe wapas force-add ho jata tha, isiliye
aap use kabhi bhi permanently unselect nahi kar pa rahe the.

Fix: ab "Free Size" ek normal checkbox jaisa hai:
  - NAYA product banate waqt (Add Product form khali hota hai) "Free Size"
    apne aap selected/checked rehta hai — jaisa pehle tha.
  - Lekin ab aap usse uncheck kar sakte ho, aur SAVE karne ke baad wo
    unchecked hi rahega — dobara apne aap select nahi hoga.

3) Sizes list — ab market ke saare common sizes available hain
-------------------------------------------------------------------
Pehle sirf Free Size, S, M, L, XL, XXL the. Ab poori list hai:

  Free Size, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL

Yeh dono jagah apply hota hai:
  - Admin > Add/Edit Product > Sizes checkboxes
  - Shop page ka "Size" filter (sidebar)

Size Chart table (product page pe "How to Measure") mein bhi in naye
sizes (XS, XXXL, 4XL, 5XL, 6XL) ke measurements add kar diye hain — yeh
existing S-XXL ke pattern se hi extrapolate kiye hain (roughly +1 inch
shoulder aur +2 inch waist/bust/hip har size step pe), taaki table khali
na rahe. Agar aap apni real measurements se replace karna chahein to
lib/size-chart.ts mein SIZE_CHART object mein wahi values edit kar dena.

Files jo change/replace karni hain
-------------------------------------
  lib/size-chart.ts
  components/product/size-chart.tsx
  components/admin/products-panel.tsx
  app/shop/shop-content.tsx
  app/api/merchant-feed/route.ts

Sab isi folder structure mein hain — seedha project root mein
copy-paste/replace kar do, phir `git add`, `git commit`, `git push`.

Koi database migration nahi chahiye.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue in sab
files pe.
