FIXES — README (v2, Hinglish)
===============================

5 FILES change hue hain (sab same path par copy-overwrite karo):
  lib/stock-api.ts                        <- NAYI FILE (pehle bhej chuka)
  lib/cart-context.tsx                    <- updated (NAYA)
  app/checkout/page.tsx                   <- updated
  app/product/[slug]/product-detail.tsx   <- updated
  components/header.tsx                   <- updated

Verify kiya: npx tsc --noEmit -> clean. npx next lint -> koi NAYA
error/warning nahi in files se.

--------------------------------------------------------------
NAYE ISSUES (jo tumne last message mein bataye) — sab fix kar diye
--------------------------------------------------------------

1) VARIATION SWITCH KARNE PAR PURA PAGE RELOAD HO RAHA THA
--------------------------------------------------------------
Ye meri hi pichli fix ki wajah se hua tha — maine colour-swap ke liye
Next.js ka router.replace() use kar diya tha (taaki back-button bug
fix ho), lekin isse Next.js poore route ko naya navigation samajh kar
re-render/refetch kar raha tha — matlab "no reload" wala design hi
tootgaya.

Fix: wapas purane, halke approach par laut aaya — raw
window.history.replaceState() (jaisa original code mein tha). Ye sirf
address bar badalta hai, page ko chhoota tak nahi. Back-button wala fix
isse independent hai (wo header.tsx mein hai, jo actual /checkout se
bahar jaane par hi kaam karta hai) — isliye reload wapas hata dene se
back-button fix par koi asar nahi padा.

--------------------------------------------------------------
2) CHECKOUT PAGE MEIN QUANTITY +/- VARIATION PRODUCTS KE LIYE KAAM
   NAHI KAR RAHA THA
--------------------------------------------------------------
Asli wajah: jab koi variation product cart/buy-now mein add hota tha,
uska "stock_quantity" us colour ke SAARE sizes ka total (sum) store ho
raha tha — us specific size ka nahi jo shopper ne actually select kiya
tha. Checkout ka +/- button isi number se decide karta hai ki aur badha
sakte ho ya nahi — galat number ki wajah se kabhi + button locked reh
jaata tha (jab total 0 ya bahut kam dikh raha ho), kabhi zyada allow ho
jaata (jab dusre sizes ka stock bhi jud kar dikh raha ho).

Fix (app/product/[slug]/product-detail.tsx): ab jo size shopper ne
select kiya hai, sirf uska real stock number nikalta hai aur wahi
number Add to Cart / Buy Now ke time par cart mein save hota hai. Isse
checkout ka +/- ab sahi size ke sahi stock ke hisaab se kaam karta hai.
"Only X left" message aur "Out of Stock" button bhi ab isi sahi number
se dikhte hain.

--------------------------------------------------------------
3) BACK KARTE HI SIDE CART DRAWER PHIR BHI KHUL RAHI THI
--------------------------------------------------------------
Pichli fix mein maine header ke back-button click se seedha
"setCartOpen(true)" hata diya tha — lekin asli wajah kuch aur nikli:
cart mein item add karne wala core function (addItem, lib/cart-
context.tsx mein) khud hi HAMESHA drawer open kar deta tha, chahe
kahin se bhi call ho. Buy Now se back aane par hum item ko silently
cart mein wapas daalte hain (taaki kuch lose na ho) — aur wahi addItem
call drawer bhi khol de raha tha.

Fix: addItem ab ek optional "silent" flag leta hai. Back-navigation
recovery isi silent mode se cart mein item daalta hai — drawer bilkul
nahi khulti, bas chupchaap cart mein add ho jaata hai jaisa tumne
maanga tha. Baaki jagah (normal "Add to Cart" button) pehle jaisa hi
kaam karta hai — drawer khulti hai, jo sahi behavior hai wahan.

--------------------------------------------------------------
IMPORTANT
--------------------------------------------------------------
Upar diye 5 files apne repo mein same path par copy-paste karke commit
+ push + redeploy karo.

Test checklist:
  - Colour badlo — ab page reload/flash nahi hona chahiye
  - Ek size select karke Buy Now se checkout jao, wahan quantity +/-
    try karo — ab sahi se badhna/ghatna chahiye
  - Checkout se back karo (button ya native swipe/back se) — item
    cart mein chala jaana chahiye lekin drawer khud se nahi khulni
    chahiye
