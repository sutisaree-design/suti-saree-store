# Phase 3B — Vendor Dashboard: Masked Orders, Accept/Reject, Manual Courier Trigger

Builds on Phase 1, 2A-2E, 3A (already in this repo). Only vendor-facing
order UI, as scoped — no admin-side receiving/QC/pack-ship (that's 3C).

## New files

1. `supabase/migrations/20260806000000_phase3b_vendor_order_dashboard.sql`
   - Adds `order_items.pickup_requested_at` and `order_items.pickup_photo_url`.
   - Extends the Phase 3A guard trigger so only the service-role client
     can write these two new columns (same protection as `stage`, `vendor_id`, etc.).
   - Creates a public storage bucket `order-fulfillment-photos` (same
     pattern as the existing `review-images` bucket) for the vendor's
     pickup-handoff photo.
   - Adds an index for the vendor order-list query.

2. `lib/vendor-courier.ts` — `triggerCourierPickup()` placeholder.
   Intentionally a no-op (just logs in dev) — wire a real
   Shiprocket/Delhivery pickup-booking call here later. Every call site
   already calls it, so this is a one-file change when you're ready.

3. `app/api/vendor/orders/route.ts` — **GET**. Returns only the logged-in
   vendor's own order items. Selects an explicit column list from
   `order_items` only (never `select('*')`, never joins `orders`, so
   there is no customer name/phone/address column reachable from this
   query at all) and filters `.eq('vendor_id', vendor.id)` using the
   service-role client — this is the "query-level exclusion" you asked
   for, not just a UI hide.

4. `app/api/vendor/orders/[id]/route.ts` — **PUT**. Four actions:
   - `accept` — stage `placed` → `vendor_accepted`
   - `reject` — stage `placed` → `cancelled`, stock restocked (reuses
     the same `restock_order_item` RPC as the Phase 3A timeout cron),
     customer emailed
   - `request_pickup` — only stamps `pickup_requested_at` + calls the
     `triggerCourierPickup()` placeholder (no live courier call). This
     is what makes the task admin-visible (see notifications, below).
   - `mark_picked_up` — stage `vendor_accepted` → `picked_from_vendor`,
     saves the vendor's handoff photo URL (mandatory)
   Every query in this route includes `.eq('vendor_id', vendor.id)` —
   since it uses the service-role client (required by the guard
   trigger), that explicit filter is what actually blocks one vendor
   from touching another vendor's order item (IDOR), not RLS.

5. `app/vendor/dashboard/orders/page.tsx` — the "My Orders" UI. Product
   name/barcode/qty/price, "Ship to: {warehouse address}" (pulled from
   the Delhivery settings already configured in your admin panel —
   `lib/delhivery-api.ts` → `fetchDelhiverySettings()` — with no
   customer field anywhere on the page), Accept/Reject buttons, a
   "Request Pickup" button once accepted, and a photo-upload control
   that appears once pickup is requested (uploads to the new storage
   bucket, then calls `mark_picked_up`).

## Modified files

6. `lib/vendor-api.ts` — appended the Phase 3B section: `VendorOrderItemRow`
   type + `fetchMyVendorOrders`, `acceptVendorOrderItem`,
   `rejectVendorOrderItem`, `requestVendorPickup`, `markVendorPickedUp`,
   `uploadPickupProofPhoto`. Nothing existing in this file was touched.

7. `app/vendor/layout.tsx` — added a small "Dashboard / Add Product / My
   Orders" nav so the new page is reachable.

8. `app/api/admin/notifications/route.ts` +
   `components/admin/notification-bell.tsx` — added a `vendor_pickup`
   notification type so a vendor's "Request Pickup" tap shows up in your
   existing admin notification bell (section: Vendors), same aggregation
   pattern as the other notification types already there.

9. **`app/checkout/page.tsx`** — the one change outside strict Phase 3B
   scope, but necessary for this to be testable at all: the Phase 3A
   migration built `place_order_with_items()` (the atomic RPC that
   populates `order_items.vendor_id`/`stage`/`barcode`) but nothing
   called it yet — checkout was still doing a raw `.from('orders').insert(...)`,
   so `order_items` would stay empty forever and the new vendor "My
   Orders" page would always show nothing. I swapped just that one
   insert call for the RPC call; every other line in checkout (Razorpay
   flow, coupons, gift cards, loyalty, reseller, `decrementStockForOrder`
   for the legacy display-stock system, redirects, tracking) is
   untouched.
   **Behavior change to be aware of:** previously, checkout never
   blocked an order even if stock was 0 for a vendor-sourced item (the
   old decrement was fire-and-forget). Now, if a vendor-sourced item's
   `available_quantity` has hit 0, `place_order_with_items()` raises
   `INSUFFICIENT_STOCK` and the **whole order** (all items in that cart)
   is rejected — the checkout page catches this and shows "Sorry, one of
   the items in your cart just sold out." This is the race-condition
   protection Phase 3A was built for, but please re-test a normal
   checkout (COD and Razorpay) end-to-end after deploying, since this is
   live customer-facing code.

## Manual steps after `supabase db push` (or pasting the migration into the SQL editor)

- Nothing else required in the Supabase dashboard — the storage bucket
  and its policies are created by the migration itself.
- Make sure your Delhivery pickup address is filled in under
  **Admin → Settings → Delhivery** (or wherever that panel lives in your
  admin) — that's what "Ship to" on the vendor's order card reads. If
  it's blank, the card shows "Warehouse address not configured yet"
  instead of an address.

## How to test

1. As a customer, place a COD order for a product whose `vendor_id` is
   set (i.e. one submitted through `/sell-with-us` → `/vendor/dashboard/add-product`
   and approved). Confirm the order still completes normally.
2. Log in as that vendor → `/vendor/dashboard/orders`. The new order
   item should appear with a "New — Awaiting Your Response" badge and an
   accept-window countdown.
3. Open browser devtools → Network tab → inspect the response of
   `GET /api/vendor/orders`. Confirm no `customer_name`/`customer_email`/
   `customer_phone`/`shipping_address` field appears anywhere in the
   JSON.
4. Click **Accept** → badge moves to "Accepted — Arrange Pickup", a
   **Request Pickup** button appears.
5. Click **Request Pickup** → button is replaced by the photo-upload
   control. Check the admin notification bell — a "Vendor requested
   pickup" entry should now be there.
6. Upload a photo → stage moves to "Picked Up by Courier".
7. IDOR check: log in as a *different* vendor and try
   `PUT /api/vendor/orders/<the-first-vendor's-order-item-id>` with
   `{"action":"accept"}` — should get a 404 ("Order item not found"),
   not a 200.
8. Race-condition check (already covered by Phase 3A, re-verify here):
   two browser tabs/sessions try to buy the last unit of the same
   vendor variant at the same time — only one should succeed, the other
   should see the "just sold out" toast.
