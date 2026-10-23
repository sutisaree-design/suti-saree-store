SIZE BUTTONS — COMPACT DESIGN, SIZE + PRICE DONO CLEAR
==========================================================

Kya change hua
----------------
Size buttons pehle bade oval pills the (px-4 py-1.5, rounded-full) —
product page pe kaafi jagah ghere hue the. Ab:

  - Chhota, tight rounded-corner button (rounded-lg, kam padding)
  - Size ka naam bold aur clear (text-xs font-semibold)
  - Price uske neeche chhota, halka grey (text-[10px], muted colour) —
    taaki dono ek nazar mein alag-alag saaf dikhein: size zyada bold,
    price zyada subtle
  - Buttons ke beech ka gap bhi thoda kam kiya, taaki poori row zyada
    compact dikhe lekin fir bhi tap karne layak size ka rahe

Selected size ab bhi highlighted rehta hai (primary colour border +
halka background), sirf ab size bilkul bada-sa nahi lagega.

File jo replace karni hai
----------------------------
  app/product/[slug]/product-detail.tsx

Isi folder structure mein hai — project root mein copy-paste/replace
karke `git add`, `commit`, `push` kar dena.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue.
