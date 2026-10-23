SIZE SECTION UI TWEAKS — LINE POSITION + SIZE GUIDE REMOVED
================================================================

1) Divider line ab "Size Chart" ke NICHE hai
------------------------------------------------
Pehle wo thin border line "Size Chart" (aur uske arrow) ke UPAR thi —
size buttons aur "Size Chart" ke beech mein. Ab wo line "Size Chart" ke
neeche aa gayi hai, taaki Select Size + size buttons + "Size Chart"
header ek group jaisa dikhe, aur line usko neeche wale coupon/payment
section se separate kare.

File: components/product/size-chart.tsx (line ka position
border-top se border-bottom kar diya).

2) "Size guide" link hata diya
----------------------------------
Woh link kaam nahi kar raha tha (koi click handler hi nahi tha), isliye
abhi ke liye "Select Size" ke aage se hata diya hai. Jab aap size-guide
popup/page banwana chaho, to wapas add kar denge with actual
functionality.

File: app/product/[slug]/product-detail.tsx

Files jo replace karni hai
-----------------------------
  app/product/[slug]/product-detail.tsx
  components/product/size-chart.tsx

Isi folder structure mein hain — project root mein copy-paste/replace
karke `git add`, `commit`, `push` kar dena.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue.
