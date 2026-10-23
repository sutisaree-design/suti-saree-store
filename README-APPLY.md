# Review Reward -- 3-Step Gate + Variation Filter (PART 1 + PART 2, full)

Fresh clone pe seedha apply karne ke liye -- isme PART 1 (backend/DB, pehle
diya tha) aur PART 2 (admin UI + frontend stepper + colour filter) dono ke
saare files ek saath hain, taaki alag-alag zip combine na karna pade.

## Files (10 total) -- exact repo path

```
supabase/migrations/20261010000000_review_variation_and_step_reward.sql   NAYI
lib/review-reward-settings.ts                                             UPDATE
lib/review-rewards-server.ts                                              UPDATE
lib/reviews-api.ts                                                        UPDATE
lib/review-link-client.ts                                                 UPDATE
app/api/review-link/[token]/route.ts                                      UPDATE
app/review/[token]/page.tsx                                               UPDATE (poora rewrite -- 3-step wizard)
components/admin/review-rewards-panel.tsx                                 UPDATE (2 naye toggle)
components/product/reviews-section.tsx                                   UPDATE (colour filter chips)
app/product/[slug]/product-detail.tsx                                    UPDATE (sirf 1 line -- selectedColor prop)
```

## Apply kaise karein
1. Repo fresh clone/pull karein: `git clone https://github.com/bapan470/E-Commerce-ethnic.git`
2. Upar list ke 10 files ko is zip se replace kar dein (same path pe).
3. Naya migration Supabase par run karein (SQL editor me paste-run, ya `supabase db push`):
   `20261010000000_review_variation_and_step_reward.sql`
4. `git add -A && git commit -m "Review reward: 3-step gate, variation tagging, admin UI, stepper, colour filter" && git push`
5. Vercel/Netlify apne aap deploy kar dega.

## Kya-kya bana (Part 2 me)

### 1. Admin panel -- `/admin?section=review-rewards`
"Review Rewards" tab pehle se tha (settings/enabled/%-flat sab already), usme
2 naye toggle add kiye:
- **Require a written review** -- on rakha to review-text zaroori hoga.
- **Require a real photo** -- on rakha to photo upload zaroori hoga.
Dono default **ON** hain, yaani abhi 3 steps (Rate → Write → Photo) hi zaroori
hain coupon ke liye. Neeche ek line me live preview dikhta hai ki abhi kaunse
steps required hain.

### 2. Customer-facing `/review/[token]` page -- poora stepper bana
- Pehle: ek hi form me rating + review + photo saath me tha, submit ek hi click me.
- Ab: **Rate → Write a review → Add a photo** -- alag-alag steps, har item card
  ke upar progress-chips (✓ done / current / baaki) dikhte hain.
- Agar admin ne "Require photo" ya "Require written review" off kar diya ho,
  to utna hi step dikhega (2 steps ya sirf 1 -- rating).
- Beech me chhod ke gaye to next baar link kholne par wahi step se resume hota
  hai jahan chhoda tha (kisi step ko dobara karna nahi padta).
- Reward banner (coupon code) sirf tab dikhta hai jab saare required steps
  poore ho chuke hon -- exactly jaisa aapne manga tha.
- Har item card me ab "Colour: <naam>" bhi dikhta hai (order me jo colour
  kharida gaya wahi).

### 3. Product page reviews section -- "Filter by colour"
- Reviews ke upar ek chip row: "All colours (12)", "Green (5)", "Red (7)"
  wagera -- sirf tab dikhta hai jab kam se kam 2 alag colours ki reviews ho
  chuki hon.
- Har review card me uska colour badge bhi dikhta hai (rating ke paas).
- Jis colour-variant page par shopper hai, uska colour chip halka highlight
  hota hai (par by default saari reviews dikhti hain jab tak khud filter na
  chune -- taaki review count kam na lage).
- Logged-in account se diya review bhi ab colour ke saath tag hota hai
  (product page par jo variant khula hai, wahi colour save hota hai).

## Test kaise karein (deploy ke baad)
1. Admin > Review Rewards me settings check karein -- dono naye toggle ON
   rakhein (default).
2. Ek test order ke review-link (`/review/<token>`) ko kholein -- 3 steps
   dikhne chahiye. Sirf rating do to koi coupon nahi milega. Teeno steps
   (rating 4★+, review-text, real photo) poore karne ke baad hi coupon
   banega aur dikhega.
3. Product page kholein, do alag colour-variant ke reviews already ho to
   "Filter by colour" chips dikhne chahiye.
