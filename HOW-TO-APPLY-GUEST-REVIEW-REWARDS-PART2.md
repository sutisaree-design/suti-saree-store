# Guest Review Rewards — Part 2 (Public Page, Premium Email, Admin Panel)

Part 1 ka backend (migration, `review_link_tokens`/`review_rewards` tables,
`lib/review-link-tokens.ts`, `lib/review-rewards-server.ts`,
`app/api/review-link/[token]/route.ts`, `/api/admin/review-reward-settings`)
maine repo me pehle se maujood paaya — usme koi change nahi kiya. Yeh Part 2
hai: customer-facing page, email redesign, aur admin "Review Rewards" tab.

## Naye files (as-is copy karo)
- `app/review/[token]/page.tsx` — public, login-free review page. Har order
  item ke liye: image + name, tap-to-rate 5-star picker, optional title +
  comment, photo upload (guest token ke saath, existing
  `/api/upload-review-photo` route reuse karta hai). Submit par agar
  qualifying rating ho to celebratory "You've earned X% off" banner with
  copy-to-clipboard coupon code. Already-reviewed items "Thanks, already
  reviewed" state me disabled dikhte hain. Invalid/expired token par clean
  error state (with a link back to `/account/orders` for logged-in users).
- `lib/review-link-client.ts` — is page ke liye client-side fetch helpers
  (`fetchReviewLinkOrder`, `submitGuestReview`, `uploadGuestReviewPhoto`).
  Jaan-bujh kar `lib/reviews-api.ts` se bilkul alag rakha hai, taaki existing
  logged-in review flow (`submitReview`, `uploadReviewPhoto`, etc.) ko haath
  bhi na lage.
- `lib/review-reward-admin-api.ts` — admin panel ke liye client fetch
  wrappers (`fetchAdminReviewRewardSettings`, `saveAdminReviewRewardSettings`),
  Part 1 ke `/api/admin/review-reward-settings` route ko call karte hain.
  Same split jaisa `lib/loyalty-api.ts` follow karta hai.
- `components/admin/review-rewards-panel.tsx` — naya "Rewards" tab ka UI:
  enable/disable toggle, minimum stars dropdown, discount type/value, expiry
  days, min order value — sab `review-reward-admin-api.ts` se bind. Do stat
  cards bhi hain: total rewards issued, aur current trigger (N★+).

## Modified files (REPLACE existing file with this one)
- `lib/email-templates.ts` — `reviewRequestEmail()` aur `reviewReminderEmail()`
  ab **async** hain (pehle sync the). Dono ab:
  1. `getOrCreateReviewToken(order.id)` call karke link ab
     `/review/[token]` par point karte hain (login wala
     `/account/orders/[id]` hata diya gaya).
  2. Ek naya "✦ Rate N★ or more and get a surprise discount" banner add
     karte hain, jiske minStars/discount values `review-reward-settings`
     se **dynamically** aate hain (hardcoded nahi) — agar admin Rewards tab
     se settings badlega to email ka copy bhi automatically update ho
     jayega. Agar reward program `disabled` hai to banner simply nahi
     dikhta.
  Baaki sab functions (`orderShippedEmail`, `codToPrepaidRequestEmail`,
  etc.) bilkul waise hi hain, kuch nahi chheda.
- `lib/review-notifications.ts` — sirf 2 lines change hui: ab
  `reviewRequestEmail(...)` / `reviewReminderEmail(...)` ko `await` karta
  hai (kyunki woh ab async hain). Baaki poora logic (dedup checks,
  `hasOrderBeenReviewed`, `force` flag, etc.) untouched hai.
- `components/admin/admin-shell.tsx` — `AdminSection` type me
  `'review-rewards'` add kiya, aur "Marketing" group me "Loyalty" ke
  neeche ek naya nav item "Review Rewards" (Award icon) add kiya. Baaki
  koi section nahi chheda.
- `app/admin/page.tsx` — `ReviewRewardsPanel` import karke `PANELS` map me
  `'review-rewards': ReviewRewardsPanel` add kiya. Baaki sab panels wahi
  hain.

## `app/api/admin/orders/[id]/preview-email/route.ts` — koi change nahi
Us file ka `buildPreview()` function pehle se hi `async` hai aur `return
reviewRequestEmail(...)` / `return reviewReminderEmail(...)` karta hai —
ab woh functions async hone ke baad bhi yeh line automatically kaam karti
hai (async function ke andar se ek promise return karna aur uska caller
`await buildPreview(...)` karna — dono already sahi the), isliye is file
ko is zip me include nahi kiya, koi edit nahi chahiye.

## Apply karne ka tareeka
1. Upar diye gaye har naye/modified file ko usi path par apne repo me
   copy/replace karo (zip me folder structure exactly wahi hai jo repo me
   hona chahiye — `app/review/[token]/page.tsx` waali nested folder bhi
   included hai).
2. `git add -A && git commit -m "guest review reward: public page, email redesign, admin tab (part 2)" && git push`
3. Vercel/host par deploy hone do.

## Test kaise karo
1. **Public page**: Admin > Orders me se koi `delivered` order kholo,
   preview-email panel se "review_request" preview karo (ya seedhe cron/
   delivery-test se real email bhejo) — email ke "Rate & Review" button
   ka link ab `/review/<token>` hoga. Us link ko naye/incognito browser me
   kholo (login zaroori nahi): order ke items, star picker, photo upload
   sab dikhna chahiye.
2. Ek item ko 4-5 star do (ya jo bhi `minStars` admin me set hai) → submit
   karte hi celebratory banner "You've earned X% off" ke sath coupon code
   dikhna chahiye, "Tap to copy" kaam karna chahiye.
3. Same page reload karo (same token) → jis item ko review kar diya, woh ab
   "Thanks, already reviewed" state me disabled dikhna chahiye.
4. Ek expired/random token try karo (`/review/kuch-bhi-random`) → clean
   "Link expired or invalid" error state dikhna chahiye, koi crash nahi.
5. **Emails**: Admin > Orders > kisi order ke "Test" panel se
   `review_request` / `review_reminder` preview kholo → discount banner
   dikhna chahiye ("Rate N★ or more..."), aur "Rate & Review" button ka
   href `/review/...` hona chahiye (`/account/orders/...` nahi).
6. **Admin tab**: Admin panel > "Marketing" group me neeche naya "Review
   Rewards" tab dikhna chahiye. Usme settings load/save karo (toggle
   off/on karke save karo, phir reload karke confirm karo settings persist
   hui), aur "Rewards issued" stat number dikhna chahiye (Part 1 me kiye
   gaye test submissions ka count).
7. Reward settings disable karke ek naya guest review submit karo → is baar
   `reward` na aaye (page par koi celebratory banner nahi), lekin review
   phir bhi save ho.

## Ye sab already verify ho chuka hai is session me
- Poora repo `npx tsc --noEmit` se typecheck kiya (671 packages install
  karke) — **0 type errors**, na naye files me, na kahin aur.
- `npm run build` chalaya — webpack compile khud successful tha; sirf
  Google Fonts (`fonts.googleapis.com`) fetch fail hui kyunki mere sandbox
  ka network usse block karta hai (koi code issue nahi). Aapke normal
  dev/CI/Vercel environment me (jahan internet available hai) yeh step bhi
  clean pass hoga — agar phir bhi koi doubt ho to `npm run build` ek baar
  apne local/CI me chala kar confirm kar lena.
- Existing logged-in review flow (`components/account/delivered-item-review.tsx`,
  `lib/reviews-api.ts`), existing delivery-test admin panel, aur baaki
  email templates (`orderShippedEmail`, `codToPrepaidRequestEmail`, etc.)
  ko koi edit nahi kiya — sirf `reviewRequestEmail`/`reviewReminderEmail`
  ke andar ka link + copy change hua hai, jaisa scope me tha.
