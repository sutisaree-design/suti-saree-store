CHANGE: Fully automatic publishing — no manual admin approval
================================================================

WHAT YOU ASKED FOR
-------------------
"AI generate karega to automatic live ho jaega, mujhe manually approve
nahi karna. AI vendor ka diya hua detail use karke poora listing
generate karega aur khud live kar dega."

WHAT WAS ACTUALLY HAPPENING (root cause of "maroon cotton saree"
stuck forever at "Awaiting Stock Pickup")
------------------------------------------------------------------
The codebase had TWO different, conflicting systems both acting on the
same vendor product:

  1. NEW flow (already correct, no changes needed):
     vendor submits -> approval_status = 'pending_review' ->
     /api/vendor/ai-process/[id] runs the AI in the background ->
     approval_status = 'live' automatically. No human step at all.

  2. OLD leftover flow: the Admin > Vendor Submissions > "Pending
     Review" tab had an "Approve" button. Clicking it moved the
     product to approval_status = 'awaiting_stock' -- but NOTHING
     anywhere in the codebase ever moved 'awaiting_stock' back to
     'live'. So any product an admin manually "approved" this way got
     permanently stuck, exactly like "maroon cotton saree" in your
     screenshots.

Since you confirmed you want NO manual step at all, I removed system
#2 entirely and let system #1 (already fully automatic) be the only
path to "live".

WHAT CHANGED
------------
1. lib/cron-jobs.ts
   runStuckVendorListingsJob() now ALSO force-publishes any product
   still sitting in 'awaiting_stock' (immediately, not just the ones
   stuck in 'pending_review' for 10+ minutes). This clears out
   "maroon cotton saree" and any other product left over from the old
   manual-approve flow the moment this job runs (which, per the
   earlier fix, now happens automatically whenever the vendor or admin
   products page is loaded).

2. app/api/admin/vendor-products/route.ts
   Removed the 'approve' PUT action entirely (it used to set
   approval_status = 'awaiting_stock'). Only 'update_price' and
   'reject' remain. Nothing can dead-end a product anymore.

3. lib/vendor-api.ts
   Removed the now-unused approveAdminVendorProduct() client function.

4. components/admin/vendor-submissions-panel.tsx
   - Removed the "Approve" button from the Pending Review tab.
   - Pending Review now just shows an info note: "AI is generating
     this listing now — it'll go live automatically within a minute
     or two, no action needed here."
   - "Reject" is kept as a manual safety valve (e.g. if a vendor
     uploads something inappropriate) and now works from ANY status,
     including on already-live products (in case you need to pull one
     down after the fact) — it wasn't possible to reject a live
     product before.
   - Default tab changed from "Pending Review" to "Live", since
     Pending Review is now just a few-seconds-long transient state,
     not something you need to check routinely.
   - Tab/status labels updated to make the automatic flow clear:
     "Pending Review" -> "Processing (AI)", "Awaiting Stock" ->
     "Awaiting Stock (legacy)".

5. app/api/vendor/products/route.ts (from the earlier fix, included
   here again for a single consistent package)
   Runs the stuck-listing safety net inline whenever the vendor loads
   their Products tab.

RESULT
------
- Vendor submits a product -> AI fills in the full listing -> product
  goes live automatically. No admin click required, ever.
- Any product that was stuck in 'awaiting_stock' from the old manual
  flow (like "maroon cotton saree") will flip to 'live' the next time
  anyone opens the vendor Products page or the admin Manage
  Products / Vendor Submissions page.
- Admin retains only a "Reject" action as a manual override, usable at
  any stage, including after a product has already gone live.

FILES IN THIS ZIP
-----------------
  lib/cron-jobs.ts
  app/api/admin/vendor-products/route.ts
  app/api/vendor/products/route.ts
  lib/vendor-api.ts
  components/admin/vendor-submissions-panel.tsx

See all-changes.diff for the exact diff of everything above.

HOW TO APPLY
------------
1. Copy these files into your local repo at the same paths,
   overwriting the existing ones.
2. git add -A
3. git commit -m "feat: fully automatic vendor listing publish, remove manual approve gate"
4. git push
