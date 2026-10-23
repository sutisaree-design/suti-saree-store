# PART 1 -- Backend / Database (Review Reward: 3-step gate + Variation tagging)

## Ye zip kya karta hai
Sirf 5 files hain, apke repo (`bapan470/E-Commerce-ethnic`) ke EXACT same path par:

```
supabase/migrations/20261010000000_review_variation_and_step_reward.sql   <-- NAYI FILE
lib/review-reward-settings.ts                                             <-- UPDATE
lib/review-rewards-server.ts                                              <-- UPDATE
lib/reviews-api.ts                                                        <-- UPDATE
app/api/review-link/[token]/route.ts                                      <-- UPDATE
```

## Apply kaise karein
1. Apna repo fresh clone/pull karein.
2. Is zip ke andar jo 5 files hain, unhe wahi path par copy-paste/replace kar dein (ऊपर list ke mutabik).
3. Naya migration Supabase par run karein (SQL editor me paste karke run karein, ya `supabase db push` se) --
   `20261010000000_review_variation_and_step_reward.sql`
4. `git add -A && git commit -m "Review reward: 3-step gate + variation tagging (backend)" && git push`
5. Vercel/Netlify apne aap re-deploy kar dega.

## Kya badla (functionally)

### 1. Ek hi reward, teeno step complete hone ke baad
- Pehle: sirf rating (>= minStars) dete hi turant coupon ban jata tha -- review likha ho ya photo ho na ho.
- Ab: coupon **sirf tab** banta hai jab (a) rating minStars se upar ho, (b) written review ho (agar admin ne "Require written review" on rakha hai), (c) real photo upload ho (agar admin ne "Require photo" on rakha hai). Teeno steps isi ek review row par jama hote hain -- 3 alag coupon kabhi nahi milte, hamesha sirf 1.
- `lib/review-reward-settings.ts` me 2 naye toggle add hue: `requireWrittenReview` aur `requirePhoto` (dono default `true`) -- master `enabled` toggle already tha, wo bhi as-is hai.

### 2. `/api/review-link/[token]` ab multi-step hai
- Pehle: ek hi POST call me rating+review+photo sab ek saath chahiye tha, aur dusri baar call karo to "already reviewed" error aata tha.
- Ab: same endpoint 3 baar bhi call ho sakta hai (step 1: sirf rating, step 2: rating+comment, step 3: +photos) -- har call pichli row ko UPDATE karti hai, naya row nahi banati. Reward sirf us call par issue hota hai jisme required steps complete ho jayein.
- GET response me ab har item ke saath `progress: { rated, reviewed, photoUploaded, allRequiredStepsDone, rewardIssued }` aur ek `reward: { enabled, minStars, requireWrittenReview, requirePhoto, discountType, discountValue }` block bhi aata hai -- Part 2 ka frontend stepper isi se steps dikhayega.

### 3. Variation (colour) ab review ke saath save hoti hai
- `reviews` table me 2 naye column: `variant_color`, `variant_slug`.
- Order me jo colour actually kharida gaya tha (checkout ke `color` field se), wahi guest-review submit hote waqt review row par copy ho jata hai.
- `lib/reviews-api.ts` me `getReviewColorOptions()` aur `filterReviewsByColor()` naye helper functions add kiye -- Part 2 ka product-page filter UI inhi ko use karega.

## Abhi kya baaki hai (Part 2 me aayega)
- Admin panel me ek naya "Rate & Review Rewards" tab -- master toggle, % ya flat discount, min stars, require-written-review/require-photo toggles -- UI se set karne ke liye (backend already ready hai, bas UI nahi bana).
- `/review/[token]` page ka 3-step stepper UI (Image 2 jaisa wireframe hai) -- Rate -> Write -> Upload Photo, progress bar ke saath.
- Product page par reviews section me "Filter by colour" chips/dropdown.
