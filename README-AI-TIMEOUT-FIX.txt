NEW BUG FOUND: "went live but AI fields are all empty"
========================================================

ROOT CAUSE
----------
lib/vendor-ai-listing.ts set an 8-second timeout on the NVIDIA vision
model call, based on a comment that assumed this app is hosted on
Netlify (10s hard function limit). But your actual host is Vercel
(confirmed from your Vercel dashboard/logs screenshots) — and Vercel
Hobby allows up to 60 seconds, which the calling route already declares
(`export const maxDuration = 60`).

Proof this was the bug: your own ADMIN "Generate with AI" button
(app/api/admin/generate-listing/route.ts) calls the exact same NVIDIA
model and already uses a 55-second timeout, with a comment noting the
vision model "routinely takes longer than that on the free tier" and
even mentioning 55s+ response times were observed. The vendor flow's
8-second timeout was simply too short for the same model to ever
finish, so it was aborting almost every time — the request would then
fall back to "publish anyway with vendor's basic fields" (name,
fabric, category, price, images — whatever the vendor typed/uploaded),
but description, origin, occasion tags, meta description, colors, and
all the Product Highlights are ONLY ever filled in by this AI call —
hence every product going live with those boxes empty, exactly like
"Tissue Silk Saree" in your screenshot.

FIX APPLIED
-----------
lib/vendor-ai-listing.ts: timeout increased from 8 seconds to 50
seconds (leaving ~10s of headroom in the 60s function budget for the
DB update + vendor email that run afterwards) — matching the pattern
that already works reliably in your admin panel.

Also corrected the misleading Netlify-based comments in this file and
in app/api/vendor/ai-process/[id]/route.ts to reflect the real hosting
(Vercel) and the real reason products were publishing empty.

IMPORTANT — PLEASE ALSO CHECK
------------------------------
This fix only helps if NVIDIA_API_KEY is actually set as an
Environment Variable in Vercel for the PRODUCTION environment (Project
Settings > Environment Variables). If that key is missing or only set
for Preview/Development, generateVendorListing() returns null
immediately (no error, no log) and every product will keep publishing
with empty AI fields no matter how long the timeout is. Please
double-check this in your Vercel project settings.

WHAT TO EXPECT AFTER THIS FIX
------------------------------
- New vendor submissions from now on should come back with a full
  AI-written description, origin, occasion tags, colors, and all the
  Product Highlights filled in — assuming NVIDIA_API_KEY is set.
- "Tissue Silk Saree" (and anything else already published with empty
  fields) will NOT be retroactively fixed by this change — it already
  went live without AI content. You can either fill those fields in
  manually via the Edit Product modal, or re-trigger AI for it (see
  below).
- If you want to re-run AI enrichment on an already-live product with
  empty fields, the simplest way right now is: open it in the vendor's
  "Edit" flow and save a small change (e.g. re-save the same fabric) —
  this resets it to pending_review and fires AI processing again. Let
  me know if you'd like a dedicated "Re-generate with AI" button added
  to the admin Catalog edit modal instead — that would be quicker for
  fixing already-live listings without going through the vendor.

FILES IN THIS ZIP
-----------------
  lib/vendor-ai-listing.ts               <- the actual fix (8s -> 50s)
  app/api/vendor/ai-process/[id]/route.ts  <- corrected comments only
  app/api/admin/vendor-products/route.ts
  app/api/vendor/products/route.ts
  lib/vendor-api.ts
  components/admin/vendor-submissions-panel.tsx
  lib/cron-jobs.ts

(The last 5 are from the earlier "no manual approve" change, included
again so this zip has everything in one place.)

See all-changes.diff for the exact diff of everything.

HOW TO APPLY
------------
1. Copy these files into your local repo at the same paths.
2. git add -A
3. git commit -m "fix: NVIDIA AI call timeout was 8s (Netlify assumption), raised to 50s for Vercel"
4. git push
5. In Vercel, confirm NVIDIA_API_KEY is set for Production.
