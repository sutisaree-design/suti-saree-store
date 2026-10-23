# Cart Recovery Email Sequence — kya add hua

Is zip mein sirf **naye/changed files** hain (same folder paths — apne repo mein
replace kar dena, phir git push).

## Files

New:
- `supabase/migrations/20260928010000_cart_recovery_sequence.sql`
- `lib/email-tracking.ts`
- `lib/cart-recovery-settings.ts`
- `app/api/admin/cart-recovery-settings/route.ts`
- `app/api/admin/abandoned-carts/[id]/emails/route.ts`
- `app/api/track/cart-open/[token]/route.ts`
- `app/api/track/cart-click/[token]/route.ts`

Changed:
- `lib/email-templates.ts` (naya `renderCartRecoveryEmail`, `cartRecoveryEmail` ab coupon + sequence support karta hai)
- `lib/cron-jobs.ts` (`runAbandonedCartsJob` ab 3-step sequence bhejta hai)
- `app/api/admin/abandoned-carts/[id]/send/route.ts` (manual send ab custom subject/html/coupon accept karta hai)
- `app/api/order-confirm/route.ts` (order complete hone par conversion track hoti hai)
- `components/admin/abandoned-carts-panel.tsx` (naya UI: Carts tab + Sequence Settings tab)

## Apply karne ke steps

1. **Supabase migration run karo** — Supabase dashboard > SQL Editor mein
   `supabase/migrations/20260928010000_cart_recovery_sequence.sql` ka poora
   content paste karke run karo. (Ya `supabase db push` agar CLI use karte ho.)

2. **Files replace karo** apne local repo mein (same paths), phir:
   ```
   git add -A
   git commit -m "Cart recovery: 3-email sequence + custom templates + open/click/conversion tracking"
   git push
   ```

3. Deploy hone ke baad, **Admin > Abandoned Carts > Sequence Settings** tab
   par jaake:
   - Har email (1st/2nd/3rd) on/off kar sakte ho
   - Kitne ghante baad jaaye (delay hours) set kar sakte ho
   - Apna khud ka subject/message likh sakte ho (ya blank chhod do to default
     template use hoga)
   - Coupon code daal sakte ho (pehle Admin > Coupons mein wo code banana
     zaroori hai, tabhi checkout par kaam karega)

## Kya-kya kaam karta hai ab

- **3 emails**: pehla email cart abandon hone ke X ghante baad (default 1hr),
  dusra pehle email ke Y ghante baad (default 24hr), teesra dusre ke Z ghante
  baad (default 72hr). Har step alag se on/off + customize ho sakta hai.
- **Manual send**: Admin > Abandoned Carts mein har cart ke saamne "Send" button
  (default template) aur "Customize & send" button (apna subject/message/coupon
  daal ke bhejo) — dono hi automatically sequence ka agla step count hote hain.
- **Tracking**: har cart row expand karke (jab kam se kam 1 email jaa chuka ho)
  dekh sakte ho — kaunsa email kab gaya, khula (opened) ya nahi, click hua ya
  nahi, aur order complete hua (converted) ya nahi.
- Purane abandoned carts jinko pehle se 1 email ja chuka tha, unke liye
  `recovery_stage = 1` set ho jaayega migration mein — matlab unko ab agla
  (2nd) email milega sequence ke hisaab se, purana wala dobara nahi jaayega.

## Note

- Email templates mein merge fields use kar sakte ho: `{{items_table}}`,
  `{{cart_total}}`, `{{cart_url}}`, `{{coupon_code}}`, `{{coupon_line}}`.
- Tracking pixel/click-redirect naye path `/api/track/cart-open/...` aur
  `/api/track/cart-click/...` par hain (na ki `/api/track/open/...` —
  wo path pehle se WooCommerce campaign emails ke liye use ho raha tha, isliye
  conflict avoid karne ke liye alag naam rakha).
