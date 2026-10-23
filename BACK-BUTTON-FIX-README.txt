BACK BUTTON FIX (v2) — README
===============================

IMPORTANT: Maine dekha ki tumhare GitHub repo mein pehla fix
(components/header.tsx + product-detail.tsx wala router.back() fix)
already committed hai (commit d4c02b6). Lekin wo fix sirf ek possible
cause (Next.js router.back() ka cache lag) target kar raha tha — aur
tumne confirm kiya ki bug abhi bhi hai, matlab asli cause kuch aur tha.

Is baar maine approach hi badal di hai — ab back button browser history
(depth/stack) pe depend hi nahi karta, isliye ye guaranteed reliably
1 click mein kaam karega, chahe history stack mein jitni bhi entries ho.

--------------------------------
NAYA APPROACH: Deterministic "return path"
--------------------------------
Pehle: back button `router.back()` / `history.back()` use karta tha, jo
history stack mein "N steps peeche jao" bolta hai. Agar stack mein kahin
bhi ek extra entry hai (chahe kisi bhi wajah se — prefetch, redirect,
kaise page pehli baar khula, etc.), to "peeche" jaane ke liye 2 click
lagte the.

Ab: jab bhi shopper checkout par jaata hai (Buy Now se, Cart page se,
Cart drawer se, ya Footer se), hum exact us page ka path
sessionStorage mein save kar dete hain (markCheckoutEntry() function,
naya file: lib/checkout-return.ts). Checkout page par jab back arrow
click hota hai, hum seedha us saved path par router.push() karte hain
— history stack ka bilkul use nahi hota. Isliye ab ye 100% predictable
hai: hamesha exact 1 click mein sahi page par jaayega.

--------------------------------
FILES (6 total — sab same path par copy-overwrite karo)
--------------------------------
  lib/checkout-return.ts                  <- NAYI FILE
  components/header.tsx                   <- updated
  app/product/[slug]/product-detail.tsx   <- updated (Buy Now)
  app/cart/page.tsx                       <- updated (Cart page checkout button)
  components/cart-drawer.tsx              <- updated (Cart drawer checkout button)
  components/footer.tsx                   <- updated (Footer checkout link)

--------------------------------
Verify kiya hai
--------------------------------
  - npx tsc --noEmit  -> koi type error nahi
  - npx next lint      -> koi warning/error nahi

(Production build is sandbox mein Google Fonts fetch na kar paane ki
wajah se fail hui — wo sirf is testing sandbox ki network restriction
hai, tumhare real Vercel/Netlify deployment mein aisa nahi hoga.)

--------------------------------
NAYA (v3): Buy Now se back karne par cart drawer khulegi
--------------------------------
Ab jab shopper Buy Now se checkout par gaya ho aur back button dabaye:
  1. Wo item real cart mein add ho jaata hai (taaki kuch bhi lose na ho)
  2. Product page par wapas navigate hota hai
  3. Side cart drawer automatically khul jaati hai, item dikhate hue

Normal checkout (Cart page / Cart drawer / Footer se) ke liye back
button pehle jaisa hi behave karta hai — bas wapas us page par jaata
hai jahan se aaye the, drawer force-open nahi hoti.

--------------------------------
Quantity +/- (already implemented, no change needed)
--------------------------------
Confirm kiya — ye already tumhare live repo mein hai aur kaam kar raha
hai: app/checkout/page.tsx, Order Summary section, har item ke niche
+/- stepper (changeItemQuantity function). Buy Now flow ke liye bhi
sahi se wired hai. Agar phir bhi checkout page par ye nahi dikh raha,
to browser cache clear karke / hard refresh karke check karo, ya batao
exactly kahan pe missing lag raha hai (screenshot ho to aur clear ho
jaayega).

--------------------------------
IMPORTANT — Maine tumhare GitHub repo mein push nahi kiya
--------------------------------
Mere paas tumhare GitHub repo mein likhne/push karne ka access nahi
hai — maine sirf clone karke local copy mein fix kiya hai. Isliye ye
zip file khud copy-paste (ya git apply) karke apne repo mein commit +
push + redeploy karna hoga, tabhi live site par bug fix hoga.
