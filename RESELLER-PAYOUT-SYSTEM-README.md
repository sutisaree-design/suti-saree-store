# Reseller Payout System — Setup Guide

## Problem this solves
Reseller ka margin (profit) order place hote hi calculate ho jaata tha, lekin:
- Ye pata nahi tha ki **kab pay karna hai** (turant? delivery ke baad?)
- Admin ke paas koi **payout management screen** nahi thi

## Rule implemented
> Reseller ka margin sirf tab "payable" hota hai jab uska order **actually deliver** ho jaaye
> **AND** store ka return window (Admin → Marketing → Shipping & Returns Timing → Return window
> days) khatam ho jaaye. Isse pehle koi bhi margin "ready to pay" nahi dikhega — agar customer
> return kar deta hai to koi clawback ki zaroorat hi nahi padegi, kyunki payout kabhi generate
> hi nahi hua tha.
>
> _(See `RESELLER-PAYOUT-RETURN-WINDOW-README.md` for the follow-up change that added this
> return-window wait — this file describes the original delivery-only version plus the update.)_

Har reseller order ka ek naya status hota hai — `orders.reseller_payout_status`:
```
pending_delivery -> in_return_window -> eligible -> paid
                                      \-> void   (agar RTO / cancelled / refunded / return file ho jaaye)
```
Delivery hote hi order `in_return_window` mein chala jaata hai (ek **database trigger** se,
automatically). Return window khatam hone ke baad ek **daily cron job**
(`runResellerPayoutWindowJob`) use `eligible` mein promote kar deta hai — tabhi wo admin ke
"Pay Now" screen mein aata hai. Agar shipment RTO ho jaaye, order cancel ho jaaye, refund ho
jaaye, ya customer koi return file kare (chahe abhi approve na hua ho), wahi order turant
"void" ho jaata hai — us order ka margin kabhi paid nahi hoga.

Ek baar jab kisi order ka payout "paid" mark ho jaata hai, trigger use kabhi dobara nahi chhedta —
agar baad mein return/refund ho, wo ek manual clawback matter ban jaata hai (jaisa vendor
settlements mein already hai).

## Files changed (same paths, overwrite existing ones)
```
supabase/migrations/20260803140000_reseller_payout_system.sql   ← NEW migration, run this

app/api/reseller/route.ts                        ← UPDATED (payout-stage earnings + UPI save)
app/api/reseller/orders/route.ts                 ← UPDATED (returns payout status per order)
app/api/admin/reseller-payouts/route.ts          ← NEW (admin: view + mark paid)
lib/reseller-api.ts                              ← UPDATED (new types/functions)
components/admin/resellers-panel.tsx             ← UPDATED (added "Payouts" tab)
components/admin/reseller-payouts-panel.tsx      ← NEW (Pay Now UI + history)
app/account/reseller/page.tsx                    ← UPDATED (payout status + UPI ID form)
```

## Setup steps
1. Copy all files above into your project at the same paths (overwrite existing ones).
2. Run the **new migration** on Supabase (SQL Editor → paste → Run, or `supabase db push`):
   - `20260803140000_reseller_payout_system.sql`
   - Isse pehle `20260728000000_reseller_program.sql`, `20260729000000_reseller_brand_name.sql`,
     aur `20260730000000_reseller_price_markup.sql` already applied hone chahiye.
   - Migration khud existing reseller orders ka `reseller_payout_status` bhi backfill kar deta hai
     (unke current delivery/status ke hisaab se), so purane orders bhi turant sahi bucket mein
     dikhenge.
3. Restart dev server / redeploy.
4. `git add . && git commit -m "Reseller payout system: pay only after delivery + admin UI" && git push`

## How it works — Admin side
Admin panel → **Resellers** → naya **"Payouts"** tab:
- 3 summary cards: *Awaiting delivery* (abhi payable nahi), *Delivered — ready to pay*, *Already paid*.
- Har reseller ke liye "Pay Now" button — sirf tabhi enabled jab unke paas koi "ready to pay" order ho.
- "Pay Now" click karne par ek modal khulta hai jisme:
  - Reseller ka UPI ID (agar unhone set kiya hai) dikhta hai.
  - Un sab delivered/eligible orders ki checklist, jise aap select/deselect kar sakte hain.
  - Payment reference (UTR / transaction ID) daalna zaroori hai.
  - "Mark ₹X as Paid" — is se ek `reseller_payouts` record ban jaata hai aur wo orders "paid" ho
    jaate hain (dobara pay nahi ho sakte).
- Neeche **Payout History** table — sab past payouts, kis reseller ko, kitna, kab, kis reference se.

## How it works — Reseller side (`/account/reseller`)
- 3 naye cards: *Awaiting delivery*, *Delivered — will be paid soon*, *Already paid to you*.
- Ek naya form: **"Where should we pay you?"** — reseller apna UPI ID + account holder name save
  kar sakta hai, jo admin ko payout modal mein dikhta hai.
- Har order ke saamne ab ek payout badge bhi dikhta hai: *Awaiting delivery* / *Ready — will be
  paid soon* / *Paid* / *Not payable (RTO/cancelled)*.

## Notes
- Trigger sirf `is_reseller_order = true` wale orders ko touch karta hai — normal orders untouched.
- Delivery signal wahi column use karta hai jo aapka existing Delhivery tracking cron
  (`runForwardShipmentTrackingJob` in `lib/cron-jobs.ts`) already bharta hai — koi naya cron/webhook
  setup nahi karna.
- Payout record (`reseller_payouts`) admin API se hi likha jaata hai (service role) — resellers
  isse edit nahi kar sakte, sirf apna history dekh sakte hain.
