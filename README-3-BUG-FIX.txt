3 BUG FIX — README
==================

7 files hain, sab same path pe apne repo mein copy-overwrite karo:
  lib/types.ts
  lib/cart-context.tsx
  app/product/[slug]/product-detail.tsx
  app/checkout/page.tsx
  app/cart/page.tsx
  components/cart-drawer.tsx
  components/cart/cart-bump.tsx

--------------------------------
BUG 1: Mobile pe swipe-back se 2 baar lagta hai (button se 1 click me ho jata hai)
--------------------------------
File: app/product/[slug]/product-detail.tsx (handleSelectVariant function)

Asli wajah: jab tum colour/variant switch karte ho, code
`window.history.replaceState(null, '', naya-url)` call karta tha. Isme
`null` pass karne se Next.js ka apna internal router state (jo wo har
history entry pe attach karta hai) uda jaata tha. Isse browser ki real
history aur Next.js ke router ka hisaab mismatch ho jaata tha.

Jab tum checkout se swipe-back karte ho: pehla swipe sirf URL bar change
karta hai (browser level), lekin Next.js ka router isko "route change"
samajh hi nahi paata kyunki state corrupt tha — isliye screen wahi rehti
hai. Doosra swipe tab jaake actually kaam karta hai. Yehi wo "2 baar
back karna padta hai" wala bug tha. Header ke apne back BUTTON mein ye
problem nahi thi kyunki wo history pe depend hi nahi karta (sessionStorage
wale saved path pe seedha router.push karta hai) — isliye button hamesha
1 click me kaam karta tha, sirf native swipe/hardware-back hi affected tha.

Fix: `null` ki jagah `window.history.state` pass kiya — matlab Next.js ka
internal state jaisa hai waisa hi rakha, sirf URL badla. Ab swipe-back bhi
1 hi baar me kaam karega.

--------------------------------
BUG 2: Variant switch karke Buy Now/Add to Cart karne pe cart mein naya
add hone ke bajaye purana wala quantity 2 ho jaata hai
--------------------------------
Files: lib/cart-context.tsx, lib/types.ts, components/cart-drawer.tsx,
       app/cart/page.tsx, components/cart/cart-bump.tsx

Asli wajah: cart ka code sirf `product.id + size` dekh ke match karta
tha ki ye "same item hai ya naya". Lekin colour variants (Red/Blue/Green
wagera) sab ek hi base product ka `id` share karte hain — sirf color,
price, images alag hote hain. Isliye jab tum colour switch karke phir se
Buy Now/Add to Cart karte the, cart isko "same line" samajh leta tha aur
purani wali quantity +1 kar deta tha, naya colour ka alag line item nahi
banta tha.

Fix: ab cart matching mein product ka colour (`product.colors[0]`) bhi
dekha jaata hai — id + size + colour teeno match hone par hi "same item"
maana jaata hai. Alag colour = alag cart line, jaisa hona chahiye.
removeItem aur updateQuantity functions ko bhi ek optional `color`
parameter diya hai taaki sahi variant hi target ho (sab jagah se call
sites update kar diye hain: cart drawer, cart page, checkout bump).

--------------------------------
BUG 3: Variation product Buy Now karne ke baad checkout page pe quantity
+/- ka option gayab
--------------------------------
Files: app/checkout/page.tsx, lib/types.ts, lib/cart-context.tsx,
       components/cart/cart-bump.tsx

Asli wajah: checkout page pe ek "order bump" (upsell add-on) feature hai
jo Admin panel se ek fixed product ke roop mein set kiya jaata hai. Code
ye check karta tha `item.product.id === bumpProduct.id` — matlab agar
current item ka id bump product ke id se match ho gaya to usko "bump
item" maan ke uska qty +/- hide kar deta tha.

Problem tab aati hai jab jo product tum khud Buy Now se khareed rahe ho
(uska koi bhi colour variant), wahi product admin ne bump/upsell product
bhi set kar rakha hai — to code galti se tumhare MAIN item ko hi "bump
add-on" samajh leta tha aur uska +/- chhupa deta tha. Yehi wajah thi ki
sirf us particular (variation) product ke saath ye masla dikh raha tha.

Fix: ab bump item ko id se pehchanne ke bajaye, jab bhi bump
checkbox se add hota hai tabhi us cart line pe `isBump: true` flag laga
diya jaata hai (naya field, lib/types.ts mein). Checkout page ab sirf
is flag ko dekh ke decide karta hai ki +/- hide karna hai ya nahi — isse
tumhara khud ka main item (chahe wahi product admin ne bump ke liye bhi
select kar rakha ho) kabhi galti se hide nahi hoga.

--------------------------------
NAYA: Side cart (mobile) ab swipe se bhi close ho sakta hai
--------------------------------
File: components/cart-drawer.tsx

Pehle side cart drawer sirf X (cross) tap karne se ya overlay pe tap
karne se band hota tha. Ab mobile pe panel ko finger se right side
(jis taraf se wo aaya tha) ki taraf drag/swipe karne se bhi close ho
jaata hai — jaise finger chhodo, panel wapas snap ho jaata hai agar
kaafi dur tak nahi khincha, ya poora slide-out ho jaata hai agar
threshold (~30% width) cross kiya ya fling jaisi speed thi.

Item list ko upar-neeche scroll karna is se affect nahi hota — swipe
sirf tabhi "close" gesture maana jaata hai jab horizontal movement
vertical se zyada ho; warna normal vertical scroll hi hota hai. X
button bhi pehle jaisa hi kaam karta hai, ye sirf ek extra tareeka hai.


  - npx tsc --noEmit  -> koi type error nahi
  - npx next lint      -> sirf pre-existing (mere changes se pehle wale,
    unrelated) warnings/errors hain, jo pehle se repo mein the

(Production build sandbox mein Google Fonts fetch na kar paane ki wajah
se fail hoti hai — ye sirf testing sandbox ki network restriction hai,
real Vercel/Netlify deployment mein aisa nahi hoga.)

--------------------------------
IMPORTANT
--------------------------------
Maine tumhare GitHub repo mein push nahi kiya (push access nahi hai) —
sirf clone karke local copy mein fix kiya hai. Ye zip apne repo mein
copy-paste (ya git apply) karke commit + push + redeploy karna hoga.
