EXIT-INTENT: Percentage vs Flat (Rupees) discount setting
=============================================================

3 files changed:
  lib/growth-api.ts
  components/admin/marketing-panel.tsx
  components/growth/exit-intent-modal.tsx

KYA ADD HUA
============
Admin > Marketing > Growth Tools > Exit-intent discount popup section
mein 2 naye fields:

  - "Discount type shown on popup"  -> dropdown: Percentage (%) / Flat amount (₹)
  - "Percent off" ya "Amount off (₹)" -> number field (dropdown ke hisaab se label badalta hai)

Storefront popup pe ab headline ke neeche ek prominent badge dikhega,
jaise "10% OFF" ya "₹200 OFF" -- jo inhi 2 settings se auto-generate hota
hai, taaki popup pe dikhne wala number hamesha admin ke set kiye
number se match kare.

IMPORTANT -- ye sirf DISPLAY hai
==================================
Ye setting sirf popup pe dikhne wala badge control karti hai. Discount
asal mein checkout pe kaam kare, iske liye aapko wahi value/type ka ek
REAL coupon Admin > Coupons mein bhi banana hoga (same code jo
"Coupon code shown" field mein hai). Ye do jagah (Growth Tools ka display
setting, aur Coupons ka actual coupon) manually sync rakhne honge --
system automatically coupon nahi banata.


APPLY KAISE KAREIN
===================
1. Teeno files apne repo mein SAME PATH pe copy-paste karke replace karo.

2. Terminal mein:
     git add lib/growth-api.ts components/admin/marketing-panel.tsx components/growth/exit-intent-modal.tsx
     git commit -m "feat: percentage vs flat discount type setting for exit-intent popup"
     git push

3. Deploy hone ke baad Admin > Marketing > Growth Tools > Exit-intent
   discount popup mein jaake type + value set karo, aur wahi value ka
   coupon Admin > Coupons mein bhi bana lo.

Verified: npx tsc --noEmit clean pass hua is change ke saath.
