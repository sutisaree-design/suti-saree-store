# Photo step ab skip-able hai (discount ke bina)

## Pehle
Photo step par "Submit Review" button tab tak disabled rehta tha jab tak
customer kam se kam ek photo na lagaye — matlab agar customer photo nahi
dena chahta, wo review hi submit nahi kar sakta tha (agar store settings
me "Require photo" on hai).

## Ab
Photo step par ek chhota "**Skip — submit without a photo (you won't
unlock the discount for this item)**" link dikhta hai (sirf tab jab tak
koi photo attach nahi ki gayi) — isse:
- Review (rating + written review, jo bhi is store me required hai) turant
  submit ho jata hai, photo ke bina bhi
- Discount coupon **nahi** milta (kyunki store ne photo required rakha hai)
  — backend ka existing step-gating logic (`lib/review-rewards-server.ts`)
  ye already sahi handle karta hai, is fix ne usko chheda nahi hai
- Submit hone ke baad ek clear note dikhta hai: "No discount this time —
  you skipped adding a photo." + ek button "**Add a photo now to unlock
  your discount**" — isse customer usi page par, turant, wapas photo step
  par ja sakta hai (page reload ki zaroorat nahi) aur photo daal ke
  discount unlock kar sakta hai. Agar wo page band kar de aur baad me wahi
  link dobara khole, to bhi wahi photo step par hi resume hoga (server-side
  progress tracking hi karta hai, koi "finished" flag save nahi hota) —
  matlab dono tareeke se (usi session me ya baad me link dobara khol ke)
  photo add karna hamesha possible rehta hai.

Agar customer photo attach kar leta hai (chahe skip dikh raha ho), to
normal "Submit Review" button khud enable ho jata hai aur skip link gayab
ho jata hai — do confusing options ek saath kabhi nahi dikhte.

## 1 file, REPLACE karo
- `app/review/[token]/page.tsx`

## Apply
1. File ko usi path par replace karo.
2. `git add -A && git commit -m "let guests submit a review without a photo (skip = no discount, made explicit)" && git push`
3. Deploy hone do.

## Verify
- `npx tsc --noEmit` — poore repo pe **0 errors** (is fix ke saath).
- Test: koi bhi review link kholo jahan "Require photo" on ho. Rating +
  written review complete karo, photo step par photo lagaye bina "Skip"
  link dabao — review submit ho jana chahiye, koi reward banner nahi
  dikhna chahiye, aur "No discount this time..." note dikhna chahiye.
- Backend/coupon-issuing logic (`lib/review-rewards-server.ts`,
  `app/api/review-link/[token]/route.ts`) me koi change nahi hai — ye
  sirf frontend UX fix hai jo already-existing "no photo = no reward"
  server behaviour ko clearly customer ko dikhata hai.
