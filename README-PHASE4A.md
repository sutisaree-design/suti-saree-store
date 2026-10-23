# Phase 4A — Fee Formula, Settlement Schema, COD Reconciliation, Clawback

Builds on Phase 1, 2A-2E, 3A-3C (already in this repo). Schema +
calculation logic only, as requested — the admin/vendor-facing
settlement screens are Phase 4B.

## What this phase adds

### 1. Migration — `supabase/migrations/20260808000000_phase4a_settlement_schema.sql`

- **Settings** (`settings` table, key `vendor_settlement_settings`):
  `handling_fee_base`, `handling_fee_percent`, `return_window_days`.
  Formula: `fee = handling_fee_base + (sale_price * handling_fee_percent / 100)`.
  `sale_price` = `order_items.price * order_items.quantity` (price is a
  **unit** price in this schema — see `app/checkout/page.tsx`).
- **`order_items`** — new columns: `delivered_at`, `fee_amount`,
  `vendor_payable_amount`, `settlement_id` (FK → `vendor_settlements`).
- **`orders`** — new columns: `cod_collected_by_courier`,
  `cod_remitted_to_us`, `cod_remitted_at`. Reuses the existing
  `payment_method` column (`cod`/other) instead of adding a duplicate
  `payment_mode`.
- **New table `vendor_settlements`**: `vendor_id`, `week_start`,
  `week_end`, `total_amount`, `clawback_deducted`, `status`
  (`pending`/`paid`), `payment_reference`, `paid_date`. RLS: a vendor
  can `SELECT` only their own rows (same pattern as `vendors`, Phase 1)
  — no write policy for `authenticated` at all; only the service role
  writes.
- **New table `vendor_clawbacks`**: tracks refunds/returns against an
  **already-paid** settlement, to be deducted from the vendor's next
  cycle.
- **Trigger `calculate_order_item_settlement_fee()`** — fires the
  instant an `order_item.stage` becomes `'delivered'`. Sets
  `delivered_at`, `fee_amount`, `vendor_payable_amount`. Fee is capped
  at the sale price (payable never goes negative).
- **Trigger `create_vendor_clawback_if_paid()`** on `returns` — when a
  return's `status` moves to `refunded`/`completed` and the linked
  `order_item`'s settlement is already `'paid'`, inserts a pending
  `vendor_clawbacks` row. If the settlement isn't paid yet, no clawback
  row is created (the item just never got settled in the first place).
- **`run_weekly_vendor_settlement(week_start, week_end)`** — the actual
  grouping logic, callable manually from the Supabase SQL editor for
  testing (`select * from run_weekly_vendor_settlement();`) without
  waiting a week. Per vendor: sums every `delivered`, unsettled item
  whose `delivered_at + return_window_days` has passed **and**, for COD
  orders, whose `orders.cod_remitted_to_us = true`; deducts any pending
  clawback; creates one `vendor_settlements` row; stamps
  `order_items.settlement_id`; marks the clawback rows `applied`.
- Extends the Phase 3A/3C fulfillment guard trigger to also protect the
  four new `order_items` columns, and adds a matching guard on `orders`
  for the three new COD columns (that table's anon UPDATE policy is
  fully open, same standing gap flagged in the Phase 3A migration).

### 2. `app/api/admin/fulfillment/[id]/route.ts` — new `deliver` action

Nothing in the app previously ever moved an item's `stage` to
`'delivered'` (it existed in the CHECK constraint since Phase 3A but
was unreachable). Added: `action: 'deliver'`,
`shipped_to_customer → delivered`. This is what fires the fee-calc
trigger above — test it with:

```bash
curl -X PUT https://your-app/api/admin/fulfillment/<order_item_id> \
  -H "Cookie: <your admin session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"action":"deliver"}'
```

### 3. `app/api/cron/vendor-settlement/route.ts` + `vercel.json`

New weekly cron (Monday 03:00 UTC — `vercel.json` → `crons`), same
`CRON_SECRET` bearer-token check as `vendor-order-timeout`. Just calls
`run_weekly_vendor_settlement()` via RPC and returns what it created.

### 4. `app/api/admin/orders/[id]/cod/route.ts` — new, backend only

`PATCH { cod_collected_by_courier?, cod_remitted_to_us? }`. No UI yet
(Phase 4B) — use this to flag a COD order manually while testing, or
point a future courier-remittance webhook at it.

### 5. `app/api/admin/settlements/route.ts` (GET, list) + `[id]/route.ts` (PATCH, mark paid)

Added now (not strictly asked for in 4A) purely so the clawback flow is
testable end-to-end before Phase 4B builds the real "Mark as Paid"
button/CSV export UI around this exact same data. `PATCH { payment_reference, paid_date? }` sets `status → 'paid'`.

### 6. `lib/settings-api.ts` — `HandlingFeeSettings` + fetch/save + `calculateHandlingFee()`

Same pattern as the file's existing `StoreInfo`/`EmailSettings` etc.
Phase 4B's settings form just needs to call `fetchHandlingFeeSettings`/
`saveHandlingFeeSettings` — no new plumbing.

### 7. `lib/admin-fulfillment-shared.ts`

Added `delivered_at`, `fee_amount`, `vendor_payable_amount`,
`settlement_id` to the admin fulfillment queue's column list + shaped
row, so the existing `/api/admin/fulfillment` GET already returns them
(no panel UI change needed to *see* the values via the API/devtools).

## How to test this phase

1. Run the migration (`supabase db push` or paste the SQL file into the
   Supabase SQL editor).
2. Get an `order_items` row to `stage = 'shipped_to_customer'` (via the
   existing Phase 3C actions: `receive` → `qc` → `pack` → `ship`).
3. Call the new `deliver` action (see above). Check the row —
   `fee_amount` / `vendor_payable_amount` / `delivered_at` should now
   be filled in.
4. In the Supabase SQL editor, temporarily lower `return_window_days`
   to `0` in `settings.vendor_settlement_settings` (or just wait), then
   run: `select * from run_weekly_vendor_settlement();` — you should
   get back one row per vendor with unsettled delivered items.
5. `GET /api/admin/settlements` (admin cookie) to see it.
6. `PATCH /api/admin/settlements/<id>` with a `payment_reference` to
   mark it paid.
7. Create a `returns` row against one of the now-settled `order_items`
   (or update an existing one) and flip its `status` to `refunded` —
   check `vendor_clawbacks` for a new `pending` row.
8. Re-run `run_weekly_vendor_settlement()` for that vendor once they
   have a new delivered+unsettled item — the clawback should be
   deducted (`clawback_deducted` on the new settlement row) and marked
   `applied`.

## Known follow-ups (flagged, not fixed here — out of Phase 4A's scope)

- `sale_price` is treated as `price * quantity` (line total). If you
  intended the formula to apply per-unit instead, change one line in
  `calculate_order_item_settlement_fee()`.
- No courier-remittance webhook exists yet — `cod_remitted_to_us` is
  set manually via the new route until you wire one.
- This phase deliberately doesn't touch any UI — Phase 4B builds the
  vendor "Earnings" tab and admin "Vendor Settlements" panel around the
  exact routes/tables added here.
