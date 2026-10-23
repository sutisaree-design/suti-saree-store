# Threads Auto-Publish (added to Social Auto-Post)

## Kya add hua
Ab jab bhi product auto-post feature chalta hai (vendor listing, admin "Add
Product", ya stuck-listing recovery), Facebook + Instagram ke saath **Threads
pe bhi** automatically post ho sakta hai — agar tum toggle on karo.

Threads ek **alag Meta app/login flow** hai (`graph.threads.net`, `graph.facebook.com` nahi)
— isliye Facebook/Instagram wala Page Access Token yahan **kaam nahi karega**. Isko
alag se apna token aur apna user ID chahiye.

## Files changed
- `lib/social-publish-api.ts` — naya `postToThreads()` function (container-create
  → publish, Instagram jaisa hi 2-step flow), settings me `threads_enabled`,
  `threads_access_token`, `threads_user_id` fields, aur `publishProductToSocial()`
  me hook kiya gaya.
- `lib/settings-api.ts` — same naye fields client-side type/default me mirror kiye.
- `components/admin/marketing-panel.tsx` — Admin → Marketing → Social Auto-Post
  tab me naya "Threads" section (toggle + User ID + Access Token fields).

Koi naya database migration nahi chahiye — settings already ek JSON column
(`settings` table, key = `social_publish`) me store hoti hain, naye fields us
JSON me automatically fit ho jayenge.

## Kaise apply karo
1. `threads-support.diff` ko apne local repo (`E-Commerce-ethnic`) root me apply karo:
   ```
   git apply threads-support.diff
   ```
   (Ya teeno files manually replace kar do — diff me poora context hai.)
2. `git add -A && git commit -m "feat: Threads auto-publish support" && git push`
3. Vercel automatically redeploy kar dega (agar GitHub se connected hai).

## One-time Threads setup (Meta ki taraf se)
1. **developers.facebook.com** → apna existing Meta App kholo (jo Facebook/Instagram
   ke liye use kiya tha) → **Add Product** → "Threads" dhundo, add karo.
2. Threads API permissions maango: `threads_basic`, `threads_content_publish`.
   (Development mode me apne hi Threads account se turant test kar sakte ho;
   production/live users ke liye Meta App Review chahiye hoga.)
3. Threads ke liye login/authorization flow complete karo (Meta docs: Threads API
   → Get Started) — isse ek **Threads-specific access token** milega (Facebook
   token se bilkul alag string).
4. Us token se apna Threads **User ID** nikaalo:
   ```
   GET https://graph.threads.net/v1.0/me?access_token=<your-threads-token>
   ```
   Response me jo `id` field hai, wahi Threads User ID hai.
5. Website ke **Admin → Marketing → Social Auto-Post → Threads** section me:
   - Threads User ID paste karo
   - Threads Access Token paste karo
   - Toggle "on" karo
   - Save karo

## Kaise kaam karta hai (technical, sirf reference ke liye)
1. `POST https://graph.threads.net/v1.0/{threads-user-id}/threads` — text +
   (agar image hai to) `image_url` ke saath ek media container banata hai.
2. `POST https://graph.threads.net/v1.0/{threads-user-id}/threads_publish` —
   container ka `creation_id` bhejke use publish karta hai.
3. Result ka post ID `products.social_post_ids.threads_post_id` me save hota hai
   (Facebook/Instagram ke `social_post_ids` ke saath hi, same JSON column).

Jaisa Facebook/Instagram ke saath already hai — Threads post fail bhi ho jaye
(bad token, rate limit, etc.), to bhi product store me live hona **kabhi block
nahi hoga** (fire-and-forget `.catch()` design).

## Test kaise karo
Ek naya test product list karo (purana koi bhi test product already
`social_posted_at` mark ho chuka hoga, wo dobara try nahi hoga). Kuch second
baad apne Threads profile (`threads.com/@aruhihandlooms`) pe check karo.
