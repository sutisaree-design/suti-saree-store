# COD one-tap confirmation + Shipping Policy update

## Deploy ka sahi order (zaroori)
1. `git pull`
2. **Supabase SQL Editor me pehle** `supabase/migrations/20261022000000_cod_order_confirmation.sql` run karo
   (sirf 4 naye columns + 1 index; koi purana column/flow nahi badalta).
3. Files same path pe rakho ya `git apply cod-confirm-and-policy.patch`, phir `git add . && git commit && git push`.
4. Deploy ke baad: Admin → Marketing → Legal Pages → Shipping Policy → "Replace with ready-made template" → Save.
   (Ye poora content overwrite karta hai. Agar tumne policy me khud kuch aur badla hai to button ki jagah
   `SHIPPING-POLICY-FULL-TEXT.txt` ka text dekh kar sirf naya section "Prepaid and Cash on Delivery (COD) Orders" paste karo.)

> Agar SQL run karna bhool gaye to bhi order place hona band nahi hoga: email bas purane format me jayegi
> (confirm button ke bina). Matlab migration se pehle deploy karna safe hai.

## COD confirm kaise kaam karta hai
- COD order place hote hi customer ko email me **"Yes, confirm my order"** button milta hai.
- Admin → Orders → COD pending order me: badge (Awaiting / Confirmed ✓), **"Ask to confirm on WhatsApp"**
  (link wala message ready), "Copy link", aur "Mark confirmed" (phone/WhatsApp reply ke liye).
- Customer link kholta hai → button dabata hai → `cod_confirmed_at` set. **Order status nahi badalta**,
  isliye shipping/Delhivery/invoice/reports pe koi asar nahi.
- Link khulte hi confirm nahi hota (WhatsApp/email scanners ke liye); customer ko button dabana padta hai.

## WhatsApp pe "YES" reply se auto-confirm
- wa.me wale message ka reply tumhare phone me aata hai; website use nahi padh sakti → tab "Mark confirmed" dabao.
- Auto-confirm ke liye official **WhatsApp Business Platform (Meta Cloud API)** ya uska provider chahiye
  (+ business-initiated message ke liye approved template). Tab Meta webhook me
  `https://aruhihandlooms.com/api/whatsapp/webhook` set karo aur Vercel env me daalo:
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
  Ye route abhi **untested** hai (mere paas Meta account nahi). Sirf tab confirm karta hai jab us number ka
  ek hi pending COD order ho.

## Ye changes orders ko kaise affect karte hain
- Order placement, Razorpay, stock, status, Delhivery: **code touch nahi kiya** (sirf confirmation email + admin UI).
- Prepaid default (pichla change): unpaid Razorpay popups ke "pending/failed" orders thode badh sakte hain.
  Existing 30-min payment-reminder email unhe follow-up karta hai.
- **Operational rule**: policy aur checkout me likha hai "prepaid pehle dispatch, COD confirm hone ke baad".
  Isliye sach me aisa hi karo: Admin me prepaid orders pe "Prepaid · ship first" badge dikhta hai, COD pe confirmed/awaiting.
