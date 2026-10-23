FEATURE: Auto-post every new product to Facebook + Instagram
================================================================

WHAT YOU ASKED FOR
-------------------
"Vendor ho ya admin, list koi bhi kare, list hote hi automatic Facebook
aur Instagram par post ho jaye."

WHAT WAS BUILT
--------------
1. lib/social-publish-api.ts (NEW, server-only)
   Core Meta Graph API integration. postToFacebook() posts a Page photo/
   feed post; postToInstagram() does the 2-step container-create then
   media_publish flow Instagram requires. publishProductToSocial() wraps
   both, reads Admin > Marketing > Social Auto-Post settings, builds the
   caption from your template, and stamps social_posted_at so a product
   is never posted twice.

2. supabase/migrations/20260819000000_social_auto_publish.sql (NEW)
   Adds products.social_posted_at + products.social_post_ids so re-runs
   (edits, cron retries) don't double-post.

3. Hooked in at every path that makes a product go live:
   - app/api/vendor/ai-process/[id]/route.ts — vendor's AI-processed
     listing (the normal path).
   - lib/cron-jobs.ts (runStuckVendorListingsJob) — the safety-net path
     for listings that got stuck and are recovered.
   - app/api/social/publish/route.ts (NEW) + lib/vendor-api.ts
     (triggerSocialAutoPost) + components/admin/products-panel.tsx —
     admin's direct "Add Product" flow. This is a separate tiny route
     because the Meta access token is server-only and admin's
     createProduct() runs client-side.
   All hooks are fire-and-forget with .catch() — a social-post failure
   (bad token, rate limit, etc.) can NEVER block or undo a product
   actually going live in your store.

4. Admin settings UI — Admin > Marketing > "Social Auto-Post" tab
   (components/admin/marketing-panel.tsx, lib/settings-api.ts):
   toggle Facebook / Instagram independently, enter your Facebook Page
   ID, Instagram Business Account ID, one Page Access Token (used for
   both), and edit the caption template
   (placeholders: {name} {price} {description} {url}).

ONE-TIME SETUP YOU NEED TO DO (outside this codebase)
-------------------------------------------------------
1. developers.facebook.com -> create a Meta App -> add "Facebook Login
   for Business" + the Instagram Graph API product.
2. Generate a long-lived Page Access Token for your Facebook Page with
   permissions: pages_manage_posts, pages_read_engagement,
   instagram_content_publish, instagram_basic.
3. Copy your Facebook Page ID.
4. If you also want Instagram: link an Instagram Business/Creator
   account to that Page, then find its ID via Graph API Explorer:
   GET /{page-id}?fields=instagram_business_account
5. Paste Page ID / Instagram Account ID / token into Admin > Marketing >
   Social Auto-Post, toggle on, save.
6. Set NEXT_PUBLIC_SITE_URL in your env (used to build the product link
   in the caption) if not already set.

RESULT
------
- Vendor submits -> AI enriches -> product goes live -> auto-posted.
- Admin clicks "Add Product" -> product goes live -> auto-posted.
- A product stuck & auto-recovered by the safety-net cron -> also
  auto-posted once it actually goes live.
- Editing an already-live product does NOT re-post it (social_posted_at
  guards against duplicates).

HOW TO APPLY
------------
1. Copy the new/changed files into your local repo at the same paths.
2. Run the new migration against your Supabase project (or `supabase db
   push` if you use the CLI).
3. git add -A && git commit -m "feat: auto-post new products to
   Facebook/Instagram (vendor + admin)" && git push
4. Do the one-time Meta setup above, then fill in Admin > Marketing >
   Social Auto-Post.

FILES CHANGED/ADDED
--------------------
  lib/social-publish-api.ts                                (new)
  supabase/migrations/20260819000000_social_auto_publish.sql (new)
  app/api/social/publish/route.ts                           (new)
  app/api/vendor/ai-process/[id]/route.ts                   (edited)
  lib/cron-jobs.ts                                          (edited)
  lib/vendor-api.ts                                         (edited)
  lib/settings-api.ts                                       (edited)
  components/admin/products-panel.tsx                       (edited)
  components/admin/marketing-panel.tsx                      (edited)
