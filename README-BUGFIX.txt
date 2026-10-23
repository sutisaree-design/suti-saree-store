BUG: Vendor products stuck forever on "Processing..." / never going live
==========================================================================

ROOT CAUSE
----------
Your site is deployed on Netlify (aruhihandlooms.com). But the cron
schedule for this repo's background jobs is defined only in vercel.json:

  {
    "crons": [
      { "path": "/api/cron/daily-jobs", "schedule": "0 21 * * *" },
      { "path": "/api/cron/vendor-order-timeout", "schedule": "30 21 * * *" }
    ]
  }

vercel.json is a Vercel-only config file. Netlify does not read it at
all, so on your actual hosting these cron routes NEVER run automatically
-- not once a day, not ever, unless something else calls them.

Normal flow:
  1. Vendor submits a product -> saved as approval_status = 'pending_review'
     ("Processing...").
  2. Browser fires a background request to
     /api/vendor/ai-process/[id] which calls the AI, fills in the
     listing, and flips the product to 'live', then emails the vendor.
  3. If step 2 ever fails partway (slow/timed-out AI call, function
     killed by Netlify's ~10s limit, network drop, tab closed too fast,
     etc.) the product is supposed to be rescued by a safety-net job,
     runStuckVendorListingsJob(), which force-publishes anything stuck
     in pending_review for more than 10 minutes.
  4. That safety-net job only runs via the /api/cron/stuck-vendor-listings
     and /api/cron/daily-jobs routes -- and since Netlify never calls
     either of those on a schedule, step 3 never actually happened in
     production. Any product whose AI call hiccuped stayed stuck in
     "Processing..." permanently, exactly like in your screenshots.

FIX APPLIED
-----------
Rather than depend on a platform-specific cron (which needs separate
setup on Netlify), I made the fix self-healing: the safety-net job
(runStuckVendorListingsJob) now also runs inline, every time either
product list is loaded:

  - app/api/vendor/products/route.ts   (vendor's own "Products" tab)
  - app/api/admin/vendor-products/route.ts   (admin's "Manage Products")

So the moment you or a vendor opens either page, any product that's
been sitting in pending_review for 10+ minutes gets force-published
immediately -- no external cron dependency at all. It's a single
cheap, indexed DB query, so it adds no noticeable delay to the page.

FILES CHANGED
-------------
  app/api/vendor/products/route.ts
  app/api/admin/vendor-products/route.ts

See bugfix-stuck-listings.diff for the exact diff.

OPTIONAL EXTRA (recommended, not required)
-------------------------------------------
For belt-and-suspenders coverage even when nobody has the dashboard
open, point a free external scheduler (e.g. cron-job.org) at these
routes every 5-10 minutes, using the same CRON_SECRET bearer token
already used by your other /api/cron/* routes:

  GET https://aruhihandlooms.com/api/cron/stuck-vendor-listings
  Header: Authorization: Bearer <your CRON_SECRET>

HOW TO APPLY
------------
1. Copy the two changed files from this zip into your local repo,
   overwriting the existing ones at the same paths.
2. git add -A
3. git commit -m "fix: self-heal stuck vendor listings (Netlify doesn't run vercel.json crons)"
4. git push
