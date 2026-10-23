# Guest Review Rewards — Part 1 (Backend)

Yeh Part 1 hai us feature ka jisme customer bina login kiye email ke link se:
star rating de sake, review likh sake, photo laga sake — aur >= N-star rating
par automatically discount coupon mile (admin se configurable).

Part 2 (public review page `/review/[token]`, email template redesign, admin
"Rewards" tab) abhi baaki hai — woh alag se aayega.

## Naye files (as-is copy karo, replace koi nahi)
- `supabase/migrations/20261002000000_guest_review_reward_flow.sql`
- `lib/review-reward-settings.ts`
- `lib/review-link-tokens.ts`
- `lib/review-rewards-server.ts`
- `app/api/review-link/[token]/route.ts`
- `app/api/admin/review-reward-settings/route.ts`

## Modified file (REPLACE existing file with this one)
- `app/api/upload-review-photo/route.ts` — ab login ke sath-sath guest
  review-token se bhi photo upload accept karta hai. Existing logged-in
  flow bilkul waisa hi kaam karega jaisa pehle karta tha.

## Apply karne ka tareeka
1. Upar diye gaye har file ko usi path par apne repo me copy/replace karo
   (folder structure zip me exactly wahi hai jo repo me hona chahiye).
2. Supabase migration run karo (Supabase dashboard SQL editor me paste karo,
   ya `supabase db push` / apka jo bhi migration-run tarika hai). Yeh naya
   `review_link_tokens` aur `review_rewards` table banata hai, `reviews`
   table me `order_id` + `guest_email` column add karta hai, aur naya
   settings key `review_reward_settings` ko lock karta hai (sirf admin route
   se hi edit ho sakega, anon key se nahi) — bilkul us hi tarah jaise
   `cart_recovery_sequence_settings` already locked hai.
3. `git add -A && git commit -m "guest review reward backend (part 1)" && git push`
4. Vercel/host par deploy hone do.

## Test kaise karo (Part 2 ki UI aane se pehle, sirf backend)
Backend already kaam karega, bas UI nahi hai abhi. Test karne ke liye:

1. Kisi bhi `delivered` order ka id nikalo (admin > Orders se).
2. Abhi tak koi email/UI isse call nahi karta (woh Part 2 me `reviewRequestEmail`
   se hoga), toh testing ke liye ek token manually bana lo — Supabase table
   editor me `review_link_tokens` table me ek row insert karo: `order_id` =
   us order ka id, `token` = koi bhi random string (e.g. `test-token-123`),
   `expires_at` = koi future date.
3. Browser/Postman se:
   - `GET https://yourdomain.com/api/review-link/<token>` → order ke items
     dikhne chahiye, saath me `existingReview: null`.
   - `POST https://yourdomain.com/api/review-link/<token>` body:
     ```json
     { "productId": "<order ke items me se ek product_id>", "rating": 5, "comment": "Great!" }
     ```
     → response me `review` object aayega, aur agar
     `review_reward_settings.minStars <= 5` (default 4) to `reward` object
     bhi aayega jisme coupon `code` hoga.
4. Admin panel me `GET /api/admin/review-reward-settings` (admin login hone
   ke baad) call karke settings dekh sakte ho — abhi default values aayenge
   (`enabled: true, minStars: 4, discountType: 'percentage', discountValue: 10`)
   kyunki admin UI (Part 2) abhi nahi bana.
5. Dobara same productId ke sath POST karo → `409 "You have already
   reviewed this item."` aana chahiye (duplicate-proof check).

## Ye sab already verify ho chuka hai is session me
- Poora repo `npx tsc --noEmit` se typecheck kiya — **0 errors**, na naye
  files me, na kahin aur (existing code kahi nahi tootha).
- Naming/pattern existing codebase se match karta hai
  (`cart-recovery-settings.ts` + `app/api/admin/cart-recovery-settings`
  wale established pattern ko hi follow kiya hai settings ke liye).

## Part 2 me kya aayega
- `app/review/[token]/page.tsx` — actual customer-facing premium page
  (star picker, text box, photo upload UI, "You earned X% off" banner)
- `lib/email-templates.ts` → `reviewRequestEmail` / `reviewReminderEmail`
  redesign, jisme link ab `/review/[token]` par jayega (login wala
  `/account/orders/[id]` link hatega) aur discount incentive banner add hoga
- Admin panel me naya "Review Rewards" settings tab (is Part 1 ke
  `/api/admin/review-reward-settings` route ko UI se connect karna)
