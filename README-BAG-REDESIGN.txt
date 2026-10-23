BAG REDESIGN + "ADD TO BAG" RENAME — README
=============================================

Ye batch pehle wale 3-bug-fix se ALAG hai (agar wo pehle se already apne
repo mein daal chuke ho, to ye upar hi copy-overwrite kar dena, koi
conflict nahi hoga — same files phir se touch hui hain).

10 files, sab same path pe copy-overwrite karo:
  components/cart-drawer.tsx                        <- redesign (Bag)
  lib/types.ts                                       <- (pehle se)
  lib/cart-context.tsx                               <- (pehle se)
  app/cart/page.tsx                                  <- (pehle se)
  app/checkout/page.tsx                              <- (pehle se)
  app/product/[slug]/product-detail.tsx              <- "Add to Bag"
  components/product-card.tsx                        <- "Add to bag"
  components/product/frequently-bought-together.tsx <- "Add selected to bag"
  components/product/mobile-sticky-cart-bar.tsx      <- "Add to Bag"

--------------------------------
1) Side cart ka naya "Bag" design
--------------------------------
File: components/cart-drawer.tsx (poora rewrite)

Screenshot jaisa structure banaya hai, lekin tumhare site ke apne
maroon/gold/cream theme aur serif branding mein (Meesho ka pink/white
colour nahi copy kiya — sirf layout/structure liya hai):

  - Header: "Bag" (bold serif) + "N item(s)" — back arrow se close hota
    hai (pehle jaisa hi)
  - Agar login nahi kiya hai to upar "Get Started & grab best offers!"
    card + "Login / Register" pill button (agar login hai to ye card
    nahi dikhta)
  - Har item apne card mein: image, naam, size + colour, trash icon,
    "Quantity :" ke saath +/- stepper (dropdown ki jagah +/- hi rakha
    hai — wahi tested/working interaction hai, sirf label add kiya hai),
    aur "You Pay" row jisme final price + strikethrough MRP + green
    "X% off" dikhta hai (jo product ka mrp/price set hai usi se aata hai)
  - "Coupons" card — tap karne se expand hoke coupon input dikhata hai
    (chevron rotate hoke down ho jaata hai); coupon apply hone ke baad
    ye "CODE applied" state mein badal jaata hai, jaisa pehle tha
  - "Price details" card — collapsed rehta hai, tap karne se Subtotal /
    Coupon discount / Total ka breakdown expand hota hai
  - Neeche sticky: agar koi savings hai (product ka MRP discount +
    coupon discount dono milaake) to green "You are saving ₹X on this
    order" strip, uske neeche Checkout aur "View Bag" buttons (pehle
    jaisa hi kaam karte hain — checkout navigation, markCheckoutEntry,
    clearBuyNow sab same hai, sirf UI badla hai)

Functionality kuch nahi badla — addItem/removeItem/updateQuantity,
coupon apply/remove, checkout jaana — sab wahi hai jo pehle test kiya
tha (colour-aware cart matching wala fix bhi isi file mein hai already).

--------------------------------
2) "Add to Cart" → "Add to Bag"
--------------------------------
Jahan bhi shopper ko "Add to Cart" text dikhta tha, ab "Add to Bag"
(ya iske hi variant) dikhega:

  - Product page ka big "Add to Cart" button    -> "Add to Bag"
  - Mobile sticky bottom bar ka button           -> "Add to Bag"
  - Product card ka quick-add hover button       -> accessibility label
    "Add to bag" (button pe khud chhota "Add" text hi rehta hai, jagah
    kam hone ki wajah se, jaisa pehle tha)
  - "Frequently bought together" ka bulk button  -> "Add selected to bag"

Code ke andar internal comments/variable names (addItem, cart-context,
etc.) jaan-bujh ke nahi badle — wo sirf developer-facing hain, shopper
ko kabhi nahi dikhte, aur badalne se naye bugs aane ka risk hota
bina kisi fayde ke.

--------------------------------
Verify kiya hai
--------------------------------
  - npx tsc --noEmit  -> koi type error nahi
  - npx next lint      -> in files mein koi naya warning/error nahi

(Production build sandbox mein Google Fonts fetch na kar paane ki
wajah se fail hoti hai — ye sirf is testing sandbox ki network
restriction hai, real Vercel/Netlify deployment mein aisa nahi hoga.)

--------------------------------
IMPORTANT
--------------------------------
Push nahi kiya tumhare GitHub repo mein (access nahi hai) — sirf clone
karke local copy mein kiya hai. Ye zip apne repo mein copy-paste
karke commit + push + redeploy karna hoga.
