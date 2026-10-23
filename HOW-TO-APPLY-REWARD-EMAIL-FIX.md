# Review Reward Confirmation Email — Apply Instructions

## Problem yeh fix karta hai
Pehle: review complete karne par discount coupon sirf `/review/[token]`
page par on-screen dikhta tha (screenshot wala "THANKS-047B91" box). Agar
customer tab band kar de ya code copy karna bhool jaye, code hamesha ke
liye gum ho jata tha — kahi bhi dobara nahi milta tha (guest flow hai,
koi login/order-history nahi jaha wapas dekh sake).

## Ab kya hota hai
Jab bhi `issueReviewReward()` naya coupon issue karta hai (poora required
flow — rate/write/photo, jo bhi is store ne settings me required rakha
hai — complete hone par), usi waqt customer ko ek email bhi chala jata
hai jisme wahi coupon code, discount %, aur expiry date hoti hai. On-screen
banner bilkul waisa hi rehta hai — email sirf ek backup/permanent record
hai.

## Do files, dono REPLACE karo (as-is copy, existing file overwrite)
- `lib/email-templates.ts`
  — ek naya function add hua: `reviewRewardIssuedEmail()`. Baaki poora
    file bilkul waisa hi hai, kuch aur nahi chheda.
- `app/api/review-link/[token]/route.ts`
  — POST handler me, `issueReviewReward()` ke turant baad, agar naya
    `reward` mila to `sendEmail()` call karke upar wala template bhejta
    hai `guestEmail || order.customer_email` par. Agar koi email hi nahi
    hai (dono null), ya email provider configure nahi hai (Admin ->
    Settings -> Email Notifications), to silently skip ho jata hai —
    review submission kabhi fail nahi hogi isi wajah se, review pehle
    hi save ho chuka hota hai.

## Apply karne ka tareeka
1. Dono files ko exactly usi path par apne local repo me copy/replace
   karo (zip me folder structure repo jaisa hi hai:
   `app/api/review-link/[token]/route.ts` aur `lib/email-templates.ts`).
2. `git add -A && git commit -m "send review reward coupon code by email too" && git push`
3. Vercel/host par deploy hone do.

## Verify kaise karo
- Isi session me poora repo `npx tsc --noEmit` se check kiya — **0
  errors**, na naye code me na kahin aur.
- Test: ek delivered order ka review link kholo, saare required steps
  (rating + review + photo, jo bhi tumhare Rewards settings me on hai)
  complete karo jab tak reward na mile. Usi order ke customer_email (ya
  jo bhi email tumne guest form me diya) par ek naya email aana chahiye
  subject: "Thanks for the review! Here's your X% off code".
- **Zaroori**: agar Admin -> Settings -> Email Notifications me koi email
  provider (Resend/ZeptoMail) configure nahi hai, to email silently skip
  hogi (log me warning aayega, error nahi) — pehle wahi check kar lena.

## Kya NAHI chheda gaya
- On-screen "You've earned X% off" banner (`app/review/[token]/page.tsx`)
  waisa ka waisa hai — is fix ka koi UI change nahi hai, sirf ek email
  add hui hai.
- `issueReviewReward()` (`lib/review-rewards-server.ts`) untouched —
  coupon-issuing logic bilkul same hai, sirf route.ts me ek naya
  best-effort email-send call add hua hai uske baad.
- Duplicate-email risk nahi hai: `issueReviewReward()` khud hi guarantee
  karta hai ki ek order+product ke liye sirf EK baar hi naya reward
  banta hai (UNIQUE constraint + pre-check) — aur email sirf tabhi jaati
  hai jab `reward` naya (non-null) ho, is route ke us hi POST call me.
