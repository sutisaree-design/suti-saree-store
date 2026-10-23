# Phase 4B — Vendor Earnings Tab + Admin Settlements Panel

Builds on Phase 1, 2A-2E, 3A-3C, 4A (already in this repo). **UI only —
no new calculation logic.** Every number shown here was already
computed by Phase 4A's DB trigger (`calculate_order_item_settlement_fee`)
and weekly cron (`run_weekly_vendor_settlement`); this phase just reads
and displays it, and adds the "Mark as Paid" action Phase 4A's route
already supported.

## New files

1. **`app/api/vendor/earnings/route.ts`** — GET. Aggregates the
   logged-in vendor's own `order_items`/`vendor_settlements`/
   `vendor_clawbacks` rows (service-role client, filtered by their
   `vendor_id`, same masking discipline as `/api/vendor/orders`) into:
   - `summary`: `total_sales`, `total_fee`, `total_payable`,
     `total_paid`, `total_pending_settlement`, `total_unsettled`,
     `clawback_pending`
   - `settlements`: full weekly history array

2. **`app/vendor/dashboard/earnings/page.tsx`** — the vendor "Earnings"
   tab. Summary cards (sales / fee / payable / awaiting settlement /
   paid out / settled-but-unpaid), a red clawback-pending card only
   when `clawback_pending > 0`, and the weekly settlement history table
   (week, amount, clawback deducted, status badge, payment ref, paid
   date).

3. **`components/admin/vendor-settlements-panel.tsx`** — Admin >
   Vendor Settlements. Pending/Paid/All tabs, a table across every
   vendor (vendor name, week, amount, clawback, status, payment ref,
   paid date), a **Mark as Paid** button per pending row (opens a
   dialog for `payment_reference` + `paid_date`, calls the existing
   `PATCH /api/admin/settlements/[id]` route from Phase 4A), and a
   **CSV export** button for whichever tab is active (same
   export-to-blob pattern as `marketing-panel.tsx`'s subscriber export).

## Modified files

- **`lib/vendor-api.ts`** — added `VendorSettlementRow` /
  `VendorEarningsSummary` types + `fetchMyVendorEarnings()`,
  `fetchAdminSettlements()`, `markSettlementPaid()`. All three just
  wrap the routes above / Phase 4A's existing admin settlements routes
  — no new logic.
- **`app/vendor/layout.tsx`** — added an "Earnings" link to the vendor
  dashboard nav.
- **`components/admin/admin-shell.tsx`** — added `'vendor-settlements'`
  to `AdminSection` + a "Vendor Settlements" nav item (Sourcing group,
  `Landmark` icon) next to "Vendors" and "Stock Receiving".
- **`app/admin/page.tsx`** — imported and registered
  `VendorSettlementsPanel` in the `PANELS` map.

## How to test

1. Log in as a vendor with at least one `delivered` order item (see
   Phase 4A's README for how to get one there) → visit
   `/vendor/dashboard/earnings` → the summary cards and history table
   should populate.
2. In the admin panel, open **Vendor Settlements** (Sourcing group in
   the sidebar) → switch between Pending/Paid/All tabs.
3. Click **Mark as Paid** on a pending row, enter a payment reference,
   confirm → row should move to the Paid tab and the vendor's Earnings
   page should now show it as Paid.
4. Click **Export CSV** on either panel → check the downloaded file.
5. If you triggered a clawback in Phase 4A's testing steps, confirm the
   vendor's Earnings page shows the red "Clawback Pending" card.

## Known follow-ups (out of scope here)

- No pagination on either table yet — fine at current vendor volumes,
  worth adding if `vendor_settlements` grows large.
- The admin panel filters/exports client-side against the full list
  returned by `GET /api/admin/settlements` (Phase 4A) — if that list
  grows very large, move filtering server-side.
