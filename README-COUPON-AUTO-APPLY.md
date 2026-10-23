# Abandoned-cart recovery: extra discount stack hota hai

## Apply karne ka order (zaroori)
1. Supabase SQL Editor me `supabase/migrations/20261014000000_recovery_offer_stacking.sql` run karo.
   (Ye place_order_with_items() me sirf ek naya block jodta hai, purani koi line nahi hatati.)
2. Files replace karke git push.

## Kya hota hai
- Email button -> /recover/CODE  (naya URL)
- WhatsApp link -> /cart-link/<id>?offer=CODE
- Dono /cart pe le jaate hain. Customer ka pehle wala coupon (jaise ARUHI75) applied rehta hai,
  recovery code uske UPAR extra discount deta hai (bacha hua amount pe).
- /cart pe upar highlight banner: pehle ka price, extra discount, ab kitna pay karna hai.
- Cart drawer, cart page summary aur checkout me "Extra offer (CODE)" alag line me dikhta hai.
- Server (RPC) recovery code ko khud validate + calculate karta hai; order me coupon_code = "ARUHI75 + CARTBACK5"
  aur coupon_discount = dono ka total. times_used dono ka badhta hai.
- Buy Now checkout me recovery offer nahi lagta (sirf cart checkout).
