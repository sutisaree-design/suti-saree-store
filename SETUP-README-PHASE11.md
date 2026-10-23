# Phase 11 — Admin Analytics Dashboard

This phase adds a full analytics + customer-intelligence layer on top of
your existing orders/products data. **No new environment variables are
needed** — everything reuses the same Supabase project.

## 1. Run this SQL first

Open Supabase → SQL Editor → run the file:

```
supabase/migrations/20260720000000_phase11_admin_analytics.sql
```

It only **adds** things — nothing existing is touched:
- `activity_events` table — logs page views, product views, add-to-cart,
  checkout starts and purchases (used for behaviour tracking + conversion rate)
- `wholesale_pricing` table — bulk pricing tiers per product
- `products.low_stock_threshold` column (default 5)
- `orders.session_id` column — links a guest order back to the browsing
  session that placed it

If you use the Supabase CLI instead: `supabase db push` will pick this
file up automatically since it's timestamped after your existing migrations.

## 2. What's new in `/admin`

### Analytics tab (new, opens by default)
- **Sales trend** — daily revenue line chart, last 30 days
- **Top products** — bar chart + ranked list by revenue, with product
  thumbnails and units sold
- **Conversion funnel** — Visited → Viewed a product → Added to cart →
  Started checkout → Purchased, computed from real visitor sessions
  (last 30 days), plus an overall conversion rate card
- **Low stock alerts** — any product at/below its stock threshold

### Customers tab (new)
- One row per customer (matched by account, else by email, else by
  phone), with total orders, total spent, and last order date
- Expand a row to see:
  - **Order history** with product thumbnail, colour and size for every
    item in every order
  - **Pages visited** and a summary of whether they added to cart,
    reached checkout, and whether they ultimately ordered — built from
    the same session that placed (or almost placed) the order, so it
    works for guest checkouts too, not just logged-in accounts

### Orders tab (updated)
- The table now shows a product thumbnail + name in the row itself
- Each order's expanded item list shows the product image and its
  colour/size variation, not just plain text

### Wholesale tab (new)
- Add bulk-pricing tiers per product, e.g. "10+ units → ₹499/unit"
- Grouped by product with the regular price and the % saved at each tier
- (Tiers are stored and manageable now; wiring them into the storefront
  cart price calculation is a follow-up if you want it — ask and I'll add it.)

### Products tab (updated)
- New "Low stock alert at" field per product — the Analytics tab flags
  anything at or below this number

## 3. How behaviour tracking works (and its limits)

There's no staff/customer identity system beyond what already existed
(Supabase Auth for logged-in accounts + guest checkout), so tracking is
stitched together pragmatically rather than inventing a login system
that isn't part of the app:

- Every browser tab gets a random `session_id` (kept in `sessionStorage`,
  so it resets when the tab closes).
- Page views, product views, add-to-cart, and checkout-start events are
  logged with that `session_id` (and `user_id` too, if logged in).
- When an order is placed, the same `session_id` is saved on the order
  row — so Admin > Customers can show "here's what this customer looked
  at before ordering," even for guests who never created an account.
- A customer who only browses and never orders will simply not show up
  in the Customers list yet (which is sourced from orders) — the
  Analytics conversion funnel is where that browsing-without-buying
  behaviour shows up in aggregate.

## 4. Nothing else changes

No new packages were added (recharts was already installed). No env
vars changed. Existing tabs, storefront pages, and checkout flow behave
exactly as before — this phase is additive only.
