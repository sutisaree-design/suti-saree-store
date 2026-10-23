# Affiliate System — Manual Testing Checklist

Run these in order against a staging/dev environment (or prod carefully,
using a throwaway account).

1. **Apply** — log in as Customer A, go to `/account/affiliate`, click
   Apply. Confirm a row appears in Supabase `affiliates` with
   `status = 'pending'` and a generated `code`.
2. **Approve** — log in as admin → Affiliates tab → approve Customer A's
   application, set commission to e.g. 15%. Confirm `status = 'approved'`
   and `commission_percent = 15` in the DB.
3. **Get the link** — reload `/account/affiliate` as Customer A. Confirm
   the referral link now shows (`?aff=CODE`) instead of the "apply"
   state.
4. **Click the link as someone else** — open an incognito window, visit
   the referral link. Check the browser's `localStorage` (DevTools →
   Application) for the captured code/expiry key.
5. **Place an order** — as a *different* logged-in customer (or guest) in
   that incognito session, place an order through checkout. Confirm in
   Supabase `orders` that the new order has `is_affiliate_order = true`,
   `affiliate_id` set to Customer A's affiliate row, and
   `affiliate_payout_status = 'pending_delivery'`.
6. **Check commission math** — confirm `affiliate_commission_amount` on
   that order equals ~15% of the order subtotal (not the client-sent
   value — it should match even if you try tampering with the request).
7. **Mark the order delivered** (Admin → Orders, or however delivery
   status is normally updated). Confirm `affiliate_payout_status` flips
   to `in_return_window` and `affiliate_payout_return_window_ends_at` is
   set (~7 days out, or whatever `return_window_days` is configured to).
8. **Run the cron manually** — hit
   `GET /api/cron/affiliate-payout-window` (with the `CRON_SECRET`
   bearer token if set). Since the return window hasn't closed yet,
   confirm the response shows `promoted: 0` and the order is still
   `in_return_window`.
9. **Force-close the window** — in Supabase, manually set that order's
   `affiliate_payout_return_window_ends_at` to a past timestamp, then hit
   the cron route again. Confirm the response now shows the order's ID
   under `order_ids` and the order's `affiliate_payout_status` in the DB
   is `eligible`.
10. **Payout** — as admin, go to Affiliate Payouts tab, find Customer A
    with an eligible balance, mark it paid. Confirm a new row appears in
    `affiliate_payouts` and the order's `affiliate_payout_status` becomes
    `paid`. Reload Customer A's `/account/affiliate` dashboard and
    confirm the earnings breakdown reflects the paid amount.

**Bonus (void path)**: repeat steps 5–7, then file a return on that order
before the window closes (or mark it RTO/cancelled/refunded). Confirm
`affiliate_payout_status` flips straight to `void` instead of ever
reaching `eligible`.
