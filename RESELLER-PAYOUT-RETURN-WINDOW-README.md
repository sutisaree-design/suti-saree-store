# Reseller Payout — Wait for the Return Window — Setup Guide

## Problem this solves
Pehle: reseller ka margin `delivered` hote hi "eligible" (ready to pay) ho jaata tha. Agar
customer store ke return window (default 7 din) ke andar return kar deta, aur admin ne us
beech mein margin pay kar diya hota, to admin ko wo paisa reseller se **manually wapas maangna**
padta — jo mushkil hai.

## Rule implemented
> Margin sirf tab "eligible" hota hai jab (a) order deliver ho chuka ho **AND** (b) store ka
> return window (Admin → Marketing → Shipping & Returns Timing) khatam ho chuka ho. Agar is
> beech customer return file kare — chahe abhi approve/refund na hua ho — payout turant "void"
> ho jaata hai.

New `orders.reseller_payout_status` lifecycle:
```
pending_delivery -> in_return_window -> eligible -> paid
                                      \-> void   (RTO / cancelled / refunded / return filed)
```

## Files changed (same paths, overwrite existing ones)
```
supabase/migrations/20260803150000_reseller_payout_return_window.sql   ← NEW migration, run this
                                                                          (after 20260803140000)

lib/cron-jobs.ts                              ← UPDATED (new runResellerPayoutWindowJob)
app/api/cron/daily-jobs/route.ts              ← UPDATED (runs the new job daily)
app/api/cron/reseller-payout-window/route.ts  ← NEW (manual-trigger route, for testing)
lib/reseller-api.ts                           ← UPDATED (new types for the in_return_window stage)
app/api/reseller/route.ts                     ← UPDATED (returns inReturnWindowProfit)
app/api/admin/reseller-payouts/route.ts       ← UPDATED (returns in-return-window bucket)
components/admin/reseller-payouts-panel.tsx   ← UPDATED (new summary card + table column)
app/account/reseller/page.tsx                 ← UPDATED (new card + status label)
RESELLER-PAYOUT-SYSTEM-README.md              ← UPDATED (documents the new rule)
```

## Setup steps
1. Copy all files above into your project at the same paths (overwrite existing ones).
2. Run the **new migration** on Supabase (SQL Editor → paste → Run, or `supabase db push`):
   - `20260803150000_reseller_payout_return_window.sql`
   - This must run **after** `20260803140000_reseller_payout_system.sql` (same as before).
   - It reads `return_window_days` from the same `fulfillment_settings` your customer-facing
     return button already uses (`app/account/orders/[id]/page.tsx`), so the reseller payout
     window always matches what you show customers — change it in one place (Admin →
     Marketing → Shipping & Returns Timing) and both stay in sync.
   - It also **backfills** any order currently sitting at `eligible` but not yet paid: if its
     return window would already be over, it stays `eligible`; otherwise it moves back to
     `in_return_window` so it can't be paid out early.
3. Restart dev server / redeploy.
4. `git add . && git commit -m "Reseller payout: wait for return window before paying" && git push`

## How it works
- **On delivery**: order moves to `in_return_window`, and its window-end time is calculated
  right then (`now() + return_window_days`).
- **Daily cron** (`/api/cron/daily-jobs`, already scheduled in `vercel.json`): calls the new
  `promote_reseller_payouts_after_return_window()` DB function, which flips any order whose
  window has closed over to `eligible`. You can also hit `/api/cron/reseller-payout-window`
  manually any time to test this without waiting for the schedule.
- **If a return is filed** (any status other than `rejected` — `requested`, `approved`,
  `refunded`, or `completed`) for a reseller order that isn't paid yet, a new trigger on the
  `returns` table voids the payout immediately — you don't have to wait for the refund to
  actually go through.
- **Already-paid orders are never touched** — same as before, a return discovered after payout
  is a manual clawback matter.

## Admin & reseller UI
- Admin **Payouts** tab now shows 4 stages instead of 3: *Awaiting delivery*, **Delivered — in
  return window** (new), *Return window passed — ready to pay*, *Already paid*.
- Reseller's `/account/reseller` page shows the same 4 stages, so they can see exactly why a
  delivered order isn't paid yet instead of just "will be paid soon".
