# Affiliate System

A customer-facing referral program, structurally a mirror of the existing
Reseller system but for customers earning a cash commission (instead of
resellers marking up prices). An affiliate never touches pricing — they
just refer people and earn a % of what those people spend.

## How it works

1. **Apply** — a logged-in customer applies from `/account/affiliate`. This
   creates a row in `affiliates` with `status = 'pending'` and a unique,
   auto-generated referral `code`.
2. **Admin approves** — from Admin → Affiliates, the admin approves (or
   rejects/suspends) the application and sets the affiliate's
   `commission_percent` (default 10%).
3. **Referral link** — once approved, the affiliate's dashboard shows a
   shareable link in the form `https://yourstore.com/?aff=CODE`.
4. **Someone clicks it** — `components/affiliate-tracker.tsx` is mounted
   globally (`providers.tsx`) and watches every page for a `?aff=CODE`
   param. When found, it captures the code into the visitor's
   `localStorage` with a **30-day expiry**, overwriting any previously
   stored code.
5. **They place an order** — at checkout, if a non-expired affiliate code
   is sitting in `localStorage`, it's sent along with the order placement
   request. The `place_order_with_items` RPC looks the code up
   **server-side** against an *approved* affiliate (never trusting a
   client-supplied commission amount) and, if valid, stamps the order as
   an affiliate order with a commission computed from the authoritative
   order subtotal.
6. **Commission starts as `pending_delivery`** on the order
   (`affiliate_payout_status`).
7. **Delivery → return window** — once the order is marked delivered, a
   trigger moves the commission to `in_return_window` and stamps
   `affiliate_payout_return_window_ends_at` using the store's configured
   return-window (`settings.fulfillment_settings.return_window_days`,
   same setting the Reseller system uses — defaults to 7 days if unset).
8. **Return window closes → eligible** — a daily cron job promotes any
   order still `in_return_window` whose window has passed into
   `eligible`. If the order is cancelled, refunded, RTO'd, or a return is
   filed *during* the window, the commission is voided instead
   (`affiliate_payout_status = 'void'`) — this happens automatically via
   a DB trigger, not the cron job.
9. **Admin pays out** — from Admin → Affiliate Payouts, the admin marks
   an affiliate's eligible orders as paid (creates an `affiliate_payouts`
   row, same "mark as paid" flow as Reseller payouts).

```
pending_delivery → in_return_window → eligible → paid
                                    \→ void   (cancel / refund / RTO /
                                        return filed during the window)
```

## Config / env vars

No new environment variables are required — the affiliate system reuses
existing infra:

- **Return window length**: `settings.fulfillment_settings.return_window_days`
  (same DB-backed setting the Reseller program uses; defaults to 7 days
  if not set).
- **Cron secret**: if `CRON_SECRET` is already set for the other cron
  routes in this repo, it also protects the new affiliate routes below —
  nothing extra to configure.
- **Supabase**: no new project-level config; everything lives in the
  `20260913000000_affiliate_program.sql` migration (tables, triggers,
  RPC).

## Admin guide

- **Approve / reject applications, set commission %**: Admin panel →
  Affiliates tab (`affiliates-panel.tsx`). Approving unlocks the
  affiliate's referral link; commission % can be edited any time
  (`app/api/admin/affiliates/route.ts`) and only affects *future* orders,
  not ones already placed.
- **Mark payouts as paid**: Admin panel → Affiliate Payouts tab
  (`affiliate-payouts-panel.tsx`), lists affiliates with an
  `eligible`-status balance and lets you mark it paid with a payment
  reference/note (`app/api/admin/affiliate-payouts/route.ts`).
- **Manually run the return-window promotion** (without waiting for the
  scheduled cron), hit:
  `GET /api/cron/affiliate-payout-window` (send `Authorization: Bearer <CRON_SECRET>`
  if `CRON_SECRET` is set).

## Customer (affiliate) guide

- **Share your link**: `/account/affiliate` shows your referral code and
  a ready-to-copy link (`https://yourstore.com/?aff=YOURCODE`). Anyone
  who lands on the site through it and orders within 30 days is
  attributed to you.
- **See earnings**: the same dashboard breaks down your commission by
  stage — pending delivery, in return window, eligible (unpaid), and
  paid — plus a list of your referred orders
  (`GET /api/affiliate/orders`).

## Cron wiring (Part 2 recap)

- `lib/cron-jobs.ts` → `runAffiliatePayoutWindowJob()` (mirrors
  `runResellerPayoutWindowJob`), calls the
  `promote_affiliate_payouts_after_return_window()` RPC.
- Runs daily as part of the consolidated `/api/cron/daily-jobs` route,
  alongside the reseller job and everything else — no separate Vercel
  cron entry needed (Hobby plan is capped at 2 crons total).
- `/api/cron/affiliate-payout-window` exists standalone too, purely for
  manual/testing triggers, same as `/api/cron/reseller-payout-window`.

## Files (reference)

| Path | Purpose |
|---|---|
| `supabase/migrations/20260913000000_affiliate_program.sql` | Tables, triggers, RPC extension |
| `lib/affiliate-api.ts` | Client/admin helpers, localStorage capture |
| `components/affiliate-tracker.tsx` | Global `?aff=CODE` capture |
| `app/api/affiliate/route.ts` | Apply / profile / payout-details |
| `app/api/affiliate/orders/route.ts` | Affiliate's own referred orders |
| `app/api/admin/affiliates/route.ts` | Approve/reject/set commission |
| `app/api/admin/affiliate-payouts/route.ts` | Mark payouts as paid |
| `components/admin/affiliates-panel.tsx` | Admin UI: applications |
| `components/admin/affiliate-payouts-panel.tsx` | Admin UI: payouts |
| `app/account/affiliate/page.tsx` | Customer dashboard |
| `lib/cron-jobs.ts` | `runAffiliatePayoutWindowJob` |
| `app/api/cron/daily-jobs/route.ts` | Consolidated daily cron (wires the job in) |
| `app/api/cron/affiliate-payout-window/route.ts` | Manual-trigger route |
