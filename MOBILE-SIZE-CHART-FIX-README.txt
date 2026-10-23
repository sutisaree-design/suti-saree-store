SIZE CHART — MOBILE RESPONSIVE FIX
=====================================

Problem
--------
Size Chart table mein 6 columns hain (Size, Shoulder, Length, Waist,
Bust, Hip), aur table ki min-width 420px thi. Chhote phone screens
(~360-400px wide) par yeh poore table ko fit nahi kar pata tha, isliye
table horizontally scroll ho raha tha — lekin koi visible scroll hint
nahi tha, isliye "Hip" column bilkul cut ho ke gayab dikh raha tha
(aapke screenshot mein bhi Hip column nahi dikh raha tha).

Fix
----
Mobile (phone-width) par ab table ki jagah har size ka apna chhota card
dikhta hai, jismein saari 5 measurements (Shoulder, Length, Waist, Bust,
Hip) ek 2-column grid mein clearly dikhti hain — koi scroll ki zaroorat
nahi, sab kuch ek nazar mein dikh jata hai.

Tablet/desktop (jahan screen chaudi hoti hai) par pehle wala poora table
hi dikhta rahega, jaisa tha.

File jo replace karni hai
----------------------------
  components/product/size-chart.tsx

Isi folder structure mein hai — project root mein copy-paste/replace
karke `git add`, `commit`, `push` kar dena.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue.
