# Phase 3C — Admin: Stock Receiving, QC + Tag Removal, Final Pack/Ship

Builds on Phase 1, 2A-2E, 3A, 3B (already in this repo). Admin-side
receiving/QC/pack/ship — the vendor-side half (accept/reject, manual
pickup request, first photo-proof) is Phase 3B.

## Stage flow this phase implements

```
picked_from_vendor --[Receive: barcode scan/manual + photo]--> received_at_warehouse
                                                                       |
                                                                [Quality Check]
                                                                /             \
                                                    (pass, tag removed)      (fail)
                                                    received_at_warehouse    quality_hold
                                                           |                     |
                                                        [Pack]            [Release Hold]
                                                           |               (back to re-check)
                                                        packed
                                                           |
                                                        [Ship: manual courier booking,
                                                         record courier+tracking here]
                                                           |
                                                  shipped_to_customer
```

## New files

1. `supabase/migrations/20260807000000_phase3c_admin_fulfillment.sql`
   - Adds to `order_items`: `warehouse_received_photo_url`, `received_at`,
     `qc_defect_found`, `qc_color_match`, `qc_fabric_check`
     (`yes`/`no`/`not_checked`), `qc_tag_removed`, `qc_condition_notes`,
     `qc_checked_at`, `packed_photo_url`, `packed_at`,
     `shipped_courier_name`, `shipped_tracking_number`, `shipped_at`.
   - Extends the Phase 3A/3B guard trigger so only the service-role
     client can write any of these — same protection as `stage`,
     `vendor_id`, etc.
   - **No new storage policy.** The admin panel has no Supabase Auth
     session (it uses its own signed cookie — `lib/admin-auth.ts`), so
     it can't satisfy the `order-fulfillment-photos` bucket's
     `authenticated`-only insert policy from Phase 3B. Rather than widen
     that policy to `anon` (which would let *anyone* with the public
     anon key write to the bucket, not just this app), admin photo
     uploads go through a server route using the **service role**
     client, which bypasses storage RLS entirely and is already gated
     by the same admin-cookie check every other admin route uses. This
     is a narrower, safer trust boundary than an open storage policy.
   - Adds an index for the admin queue's main query.

2. `lib/admin-fulfillment-shared.ts` — server-only helpers shared by the
   two API routes below (explicit column list + row-shaping function),
   kept out of the `route.ts` files since Next.js app-router route files
   may only export HTTP method handlers.

3. `app/api/admin/fulfillment/route.ts` — **GET**. Every vendor-sourced
   order item from `picked_from_vendor` onward (earlier stages are
   Phase 3B's vendor-dashboard concern). Unlike the vendor-facing route,
   this one **does** join in `customer_name`/`customer_phone`/
   `shipping_address` and `vendors.business_name` — that masking rule is
   specific to the vendor dashboard, not the admin panel (Phase 3C point
   4 explicitly needs the customer's address for the final courier leg;
   point 6 explicitly wants the vendor name badge admin-side).

4. `app/api/admin/fulfillment/[id]/route.ts` — **PUT**. Five actions:
   - `receive` — stage `picked_from_vendor` → `received_at_warehouse`,
     requires `{ photo_url }` (2nd photo-proof, after the vendor's
     pickup photo from Phase 3B).
   - `qc` — records the full checklist (`defect_found`, `color_match`,
     `fabric_check`, `tag_removed`, `condition_notes`). **Tag removal is
     enforced as mandatory, not just recorded**: passing requires
     `tag_removed = true` in addition to no defect and a color match; if
     any of those fail, stage moves to `quality_hold`. A defect found
     here sets `liability = 'vendor'` (pickup-leg damage, per the
     written vendor agreement from Phase 0).
   - `release_hold` — stage `quality_hold` → `received_at_warehouse` for
     a re-check. Added because there's no automated "Return to Vendor"
     flow yet (that's Phase 4C's stale-inventory/off-boarding work) —
     without this, a held item would have no way out at all. This is a
     manual override, not something your Phase 3C prompt explicitly
     asked for, so remove/gate it if you'd rather items on hold get
     resolved a different way.
   - `pack` — stage `received_at_warehouse` → `packed`, requires
     `{ photo_url }` (3rd photo-proof). Refuses to proceed server-side
     if `qc_tag_removed` isn't `true`, even if someone tries to call
     this action directly.
   - `ship` — stage `packed` → `shipped_to_customer`, requires
     `{ courier_name, tracking_number }`. **Booking itself stays
     manual** — you book the second courier leg yourself on the
     courier's own site/app (same "manual for now" pattern as Phase 3B's
     pickup leg); this action only records what you booked. If a failed
     QC hasn't already set `liability = 'vendor'`, this defaults it to
     `'own'` — from this point on, damage/loss is a delivery-leg risk,
     per your spec.
   Every branch fetches by `id` first and checks the current `stage`
   before transitioning — an item in the wrong stage gets a 400 with a
   clear message rather than a silent no-op.

5. `app/api/admin/fulfillment/upload-photo/route.ts` — **POST**
   (multipart/form-data, field `file`). Admin-cookie-gated, uploads via
   the service-role client to the existing `order-fulfillment-photos`
   bucket under an `admin/` prefix, returns the public URL. Used by all
   three admin-side photo-proof steps (receiving, packing).

6. `lib/admin-fulfillment-api.ts` — client-side wrapper: types +
   `fetchAdminFulfillmentQueue()`, `uploadAdminFulfillmentPhoto()`,
   `receiveOrderItem()`, `submitQualityCheck()`, `releaseQualityHold()`,
   `packOrderItem()`, `shipOrderItem()`.

7. `components/admin/fulfillment-panel.tsx` — the "Stock Receiving" UI,
   registered in `admin-shell.tsx`/`app/admin/page.tsx` under a new
   **Sourcing → Stock Receiving** nav item (next to Vendors). Six tabs,
   each showing only the items relevant to that step:
   - **Receiving** — a barcode-scan input (native `BarcodeDetector` API
     via the phone's camera, when the browser supports it — Chrome/
     Edge/Android; **no hardware scanner assumed**) with a manual
     text-entry fallback always available (for Safari/Firefox or a
     failed camera permission). Scanning/typing a barcode finds the
     matching item awaiting receipt and scrolls to it; uploading its
     photo completes the receive action. No new npm dependency added —
     deliberately used the built-in browser API instead of pulling in
     e.g. QuaggaJS, to keep this a drop-in file-replace for you.
   - **Quality Check** — the checklist (defect, color match, fabric
     spot-check, mandatory tag-removed, notes), with a live "this will
     move to Quality Hold" warning before submitting if any check would
     fail.
   - **Quality Hold** — shows why each item is held + a "Release Hold"
     button to send it back for a re-check.
   - **Pack** — photo upload only (QC pass + tag removal already
     confirmed to get here).
   - **Ship** — shows the customer's name/phone/address (admin-only —
     this is the one screen in the whole vendor pipeline allowed to see
     it) plus courier-name/tracking-number fields for you to fill in
     after booking manually.
   - **Shipped** — read-only reference list with courier + tracking info
     and the final liability assignment.

## Invoice/packing-slip masking (point 5) — already satisfied, no change needed

Checked `lib/invoice-pdf.ts` directly: it builds the PDF from only
`product_name`/`size`/`quantity`/`price` per line plus the store's own
name/GSTIN (`StoreInfo`) — there's no vendor field anywhere in it to
begin with, so there was nothing to strip or mask.

## To test

1. Run the migration.
2. Get an order item to `picked_from_vendor` (accept it as a vendor in
   Phase 3B's dashboard, then upload its pickup-handoff photo).
3. In Admin → Stock Receiving → **Receiving**, scan/type its barcode (or
   just find its card) and upload a receiving photo.
4. In **Quality Check**, try submitting with "Vendor tag removed?" set
   to **No** — confirm it lands in **Quality Hold** and shows there.
   Release the hold, then resubmit with everything passing — confirm it
   now appears under **Pack**.
5. Upload a packed photo — confirm it moves to **Ship**, showing the
   customer's address.
6. Enter a courier name + tracking number — confirm it moves to
   **Shipped** and shows `liability: own` (unless you triggered a defect
   earlier, in which case it should already say `vendor`).

`npx tsc --noEmit` and `next lint` both pass clean on every new/changed
file as of this build.
