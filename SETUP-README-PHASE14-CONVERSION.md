# Phase 14 — Checkout Trust Signals + Product Video + Review Photos (UGC)

3 conversion-focused changes, sab additive hain — koi existing data/column touch nahi hua.

## 1. Migration chalao (sabse pehle)

Supabase project mein ye ek file run karo (SQL editor ya `supabase db push` se):

```
supabase/migrations/20260726000000_product_video_review_photos.sql
```

Ye banata hai:
- `products.video_url` column (nullable text)
- `reviews.photos` column (`text[]`, default `{}`)
- Naya storage bucket `review-images` (public read, logged-in users upload kar sakte hain)

## 2. Checkout Trust Signals
Koi setup nahi chahiye — turant live ho jayega. Checkout page ke "Place Order" button ke
neeche ab dikhta hai:
- Secure payment / SSL / 7-day returns / support badges
- Payment method row (Razorpay, UPI, Visa, Mastercard, RuPay, Net Banking)

Naya file: `components/checkout/trust-badges.tsx`
Modified: `app/checkout/page.tsx`

## 3. Product Video
**Admin → Products → koi product edit karo** → naya field "Product Video URL" milega.
Koi bhi public `.mp4`/`.webm` URL paste karo (apne Supabase storage ya kisi bhi CDN se).
Product page pe gallery ke neeche "Watch Product Video" button dikhega — click karne par
video modal mein khulti hai.

Naye files: `components/product/product-video.tsx`
Modified: `lib/types.ts`, `lib/products-api.ts`, `lib/products-api-server.ts`,
`components/admin/products-panel.tsx`, `app/product/[slug]/product-detail.tsx`

Note: Deliberately video ko existing photo-gallery ke scroll-snap strip ke andar merge
nahi kiya — wo component (`product-gallery.tsx`) already kaafi complex/fine-tuned hai
(zoom, lightbox, swipe). Video ek alag, safe "Watch Video" trigger ke through dikhta hai
taaki gallery ka existing behaviour bilkul na tute.

## 4. Review Photos (UGC)
Customer jab review likhta hai, ab "Add photos (optional)" section dikhega — up to 4
photos attach kar sakta hai. Approve hone ke baad wo photos product page ke reviews section
mein thumbnail ke roop mein dikhti hain (click → full-screen preview). Admin → Reviews panel
mein bhi photos dikhengi (moderation ke waqt dekhne ke liye).

Naya function: `uploadReviewPhoto()` (`lib/reviews-api.ts`), same pattern jaisa product
image upload already use karta hai.

Modified: `lib/reviews-api.ts`, `components/product/reviews-section.tsx`,
`components/admin/reviews-panel.tsx`

## Naye/modified files ka summary

```
supabase/migrations/20260726000000_product_video_review_photos.sql   NEW
components/checkout/trust-badges.tsx                                  NEW
components/product/product-video.tsx                                  NEW
app/checkout/page.tsx                                                 MODIFIED
lib/types.ts                                                          MODIFIED
lib/products-api.ts                                                   MODIFIED
lib/products-api-server.ts                                            MODIFIED
lib/reviews-api.ts                                                    MODIFIED
components/admin/products-panel.tsx                                   MODIFIED
components/admin/reviews-panel.tsx                                    MODIFIED
components/product/reviews-section.tsx                                MODIFIED
app/product/[slug]/product-detail.tsx                                 MODIFIED
```

## Deploy karne se pehle

```bash
npm install
npx tsc --noEmit   # already clean pass hua hai is repo pe
```

`git add -A && git commit -m "Phase 14: checkout trust signals, product video, review photos" && git push`
Vercel apne aap deploy kar dega.
