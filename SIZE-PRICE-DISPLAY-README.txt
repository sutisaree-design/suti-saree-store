PER-SIZE PRICE — DISPLAY + CHECKOUT FIX
=========================================

Aapka sawaal tha: "kisi bhi size ka price change karna ho to kaise hoga,
aur product page pe isko kaise setup karu" (jaisa screenshot mein
S ₹260 / M ₹265 / L ₹270 / XL ₹274 ... dikh raha tha).

Achi khabar: admin side (product-variants-manager.tsx) aur database
(`product_variant_sizes.price_override` column) mein yeh feature already
tha aur poora wired tha — aap admin mein har size ke aage price already
daal sakte the aur wo save ho raha tha.

Lekin ek gap tha: **product page (jo customer dekhta hai) us per-size
price ko ignore kar raha tha** — sirf colour-level price use ho raha tha,
size-level override kahin bhi nahi dikh raha tha ya use nahi ho raha tha
(na size button ke niche price, na cart, na buy-now, na coupon calc mein).

Yeh fix wahi gap band karta hai.

Kya change hua
---------------
File: app/product/[slug]/product-detail.tsx

1. `selectedSizePrice` — jo bhi size currently selected hai, uska apna
   price (agar override set hai) nikalta hai, warna colour/base price pe
   fallback karta hai.
2. `sizePriceMap` — har size ka apna price ek saath (S -> 260, M -> 265,
   XL -> 274, ...) taaki size-selector mein har button ke niche price
   dikhaya ja sake — bilkul aapke screenshot jaisa.
3. Size-selector UI ab har size pill ke andar size ke niche price bhi
   dikhata hai.
4. Headline price, discount badge, "Save ₹X", coupon validation/discount,
   Add to Bag, Buy Now, aur mobile sticky cart bar — sab ab
   `selectedSizePrice` use karte hain, flat `product.price` nahi. Matlab
   jo size customer select karega, wahi price cart/checkout mein jayega.

Kaise use karein (admin side — already working tha)
-----------------------------------------------------
Admin > Product > Edit/Add > Colour variant ke andar, har size row mein
ek "Price override" field hai. Wahan blank chhodo to us size ka price
product/colour ke normal price jaisa hi rahega; koi number daaloge to
sirf usi size ka price change ho jayega — baaki sizes pe asar nahi
padega.

Test kaise karo
-----------------
1. `npm install` (agar pehle se nahi kiya).
2. Ek product open karo jiske multiple sizes hain, admin se 2-3 sizes
   ke price alag-alag set karo (jaise S = 260, XL = 274).
3. Product page kholo — har size ke niche uska apna price dikhna
   chahiye, aur size badalte hi headline price bhi update hona chahiye.
4. Us size ko cart mein daalo / Buy Now karo — cart/checkout mein wahi
   size-specific price dikhna chahiye.
5. Koi coupon try karo — discount ab select ki hui size ke price pe
   calculate hona chahiye.

Verified: `npx tsc --noEmit` aur `npx eslint` dono clean pass hue.

File jo replace karni hai
---------------------------
  app/product/[slug]/product-detail.tsx

Isi folder structure mein hai is zip mein — seedha apne project root mein
copy-paste/replace kar do, phir `git add`, `git commit`, `git push`.

Koi database migration nahi chahiye — `price_override` column already
tha.
