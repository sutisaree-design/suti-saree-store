VARIANT SIZE ROW — ab SELECT DROPDOWN + PRICE, DONO EK SAATH
=================================================================

Zaroori note pehle
---------------------
Aapke screenshot mein Price box dikh hi nahi raha tha — iska matlab
pichla fix (jo maine "per-size-price-input.zip" mein diya tha) abhi tak
aapke local project mein replace nahi hua hai. Yeh naya file (isi
component ka) dono cheezein ek sath leke aata hai, isliye SIRF yeh ek
file replace kar dena kaafi hai — purana wala dobara replace karne ki
zaroorat nahi.

Kya-kya change hua
---------------------
1. Size ab free-text type karne ki jagah ek proper SELECT DROPDOWN se
   choose hoga — "Free Size, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL"
   list mein se. Yeh wahi list hai jo product-level "Sizes" checkbox
   mein bhi use hoti hai, to naam hamesha consistent rahenge (koi typo
   "Xl" vs "XL" wala mismatch nahi hoga).
2. Ek chhota safety bhi add kiya: agar aapne kisi size ko ek row mein
   already select kar liya hai, to dusri rows ke dropdown mein wo size
   dikhega hi nahi — isliye galti se ek hi colour ke andar same size ki
   do rows nahi ban sakti.
3. Price field pehle jaisa hi hai — har size row mein "Price (₹,
   optional)" box, khali chhodo to colour/product ka price use hoga,
   number daalo to sirf usi size ka price change hoga.

Kaise use karein
-------------------
Admin > Products > product edit karo > colour variant Add/Edit karo >
"Sizes, stock, price & SKU" section:

  [ Size ▾ ]   [ Stock ]   [ Price (₹, optional) ]   [ SKU ]

"+ Add size" se naya row banao, dropdown se size choose karo, stock aur
(chahiye to) price bhar do, Save karo.

File jo replace karni hai
----------------------------
  components/admin/product-variants-manager.tsx

Isi folder structure mein hai — project root mein copy-paste/replace
karke `git add`, `commit`, `push` kar dena. Koi database migration nahi
chahiye.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue.
