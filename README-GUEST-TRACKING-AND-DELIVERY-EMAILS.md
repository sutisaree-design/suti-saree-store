# Guest order tracking + automatic delivery-lifecycle emails + admin test panel

## How to apply
Copy every file in this zip into your repo at the same path (they'll
overwrite the 4 existing files and add 6 new ones). Then:

1. Run the new migration on your Supabase project (SQL editor, or however
   you normally run migrations — it's plain `ALTER TABLE ... ADD COLUMN IF
   NOT EXISTS`, so it's safe to run even if some columns already exist):
   `supabase/migrations/20260817000000_delivery_lifecycle_emails.sql`
2. `git add -A && git commit -m "Guest tracking page + auto delivery emails + admin test panel" && git push`
3. Redeploy (Netlify/Vercel will pick it up from the push).

No new env vars needed — it reuses your existing Delhivery + email-provider
setup.

## 1. Guest checkout → no more login/signup wall
**Root cause:** the "Track this order" button linked to `/account/orders/[id]`,
which your `middleware.ts` redirects to `/login` for anyone without a
session. Guest checkouts have no session, so guests were being sent to
login/signup instead of a tracking page.

**Fix:** new public page `app/track/[id]/id` — no login required (same
trust model your `/order-confirmation/[id]` page and self-cancel already
use: the order UUID itself is the access token). Shows a status stepper
(Placed → Confirmed → Shipped → Out for Delivery → Delivered), live courier
tracking, expected delivery date, and order summary.

- `order-confirmation/[id]` page's "Track this order" button now points
  here instead of the account-only page.
- Every order email (confirmation, shipped, status-change, tracking
  summary) now links here too, so a guest can always get back to tracking
  from their inbox with zero login.

## 2. Fully automatic delivery emails
Your existing `runForwardShipmentTrackingJob` cron (polls Delhivery every
~15 min via `/api/cron/forward-shipment-tracking`) now also sends, with no
admin action required:

1. **"Arriving [date]"** — the moment the courier's tracking response first
   reveals an expected delivery date.
2. **"Out for delivery"** — the moment Delhivery's status first shows "out
   for delivery". This is the closest real, same-day signal a courier API
   gives — there's no live per-shipment ETA to hang an exact "30 minutes
   before" trigger on, so this is the honest, practical stand-in for it.
   In practice it usually goes out within ~15 minutes of the courier
   updating status, hours (not days) before the parcel actually arrives.
3. **"Delivered!"** — the moment the courier confirms delivery. Previously
   this only fired if an admin *manually* flipped the status dropdown to
   "delivered"; now the cron job does it automatically too, through the
   exact same `updateOrderStatus()` path (so there's still only one
   delivered-email code path, whether it's triggered by the courier or by
   an admin).

Each of these is deduped (`arriving_email_sent_at` /
`out_for_delivery_email_sent_at` columns + the existing status-change
dedupe for "delivered"), so re-running the cron job never double-sends.

Shipped emails already worked automatically (`orderShippedEmail`, sent the
moment a Delhivery waybill is created) — untouched.

## 3. Admin "Test Notifications" panel
Admin → Orders → expand any order row → new **"Test Notifications"** box:

- **Preview** buttons (Shipped / Arriving / Out for Delivery / Delivered) —
  opens the exact HTML the customer would receive in a new tab. No DB
  writes, no email sent — click as many times as you want to check the
  design.
- **Send test** — sends a real copy of any of those emails to an address
  you type in (e.g. your own inbox), so you can check actual rendering in
  Gmail/Outlook.
- **Simulate real flow** — an expected-delivery-date picker + buttons to
  actually fire "Out for Delivery now" / "Delivered now" on that specific
  order. These call the exact same functions the cron job uses, so it's a
  true end-to-end test — but they DO email the order's real
  `customer_email` and update its real status, so use a test order if you
  don't want to touch a live customer's order.

## 4. "Track Order" link in the footer
Footer → Help column now has a **"Track Order"** link at the top, pointing
to a new `app/track/page.tsx` — a simple lookup page (Order ID + the email
used at checkout). It reuses the exact same lookup logic your chat widget's
"Track my order" already uses (`/api/chat/order-lookup`), so:
- Logged-in shoppers just see their own recent orders (no typing needed).
- Guests enter Order ID + checkout email; on a match it takes them straight
  to `/track/[id]`.

This is what someone lands on if they don't have the order-confirmation
email handy and just clicks "Track Order" from anywhere on the site.

## 5. "Log in with this email" from the tracking page
On `/track/[id]`, if the order has a customer email, there's now a card:
**"Log in with [email]"** — clicking it goes to `/login?next=/account/orders/[id]&email=...`,
which:
- Prefills the email and jumps straight to the **Email OTP** tab (a guest
  checkout has no password, so OTP — which auto-creates the account on
  first use — is the method that actually works for them).
- After verifying the code, lands them on `/account/orders/[id]` — the
  fuller account order-detail view (return requests, cancel/help, delivered
  review, etc.), which already grants access whenever the logged-in user's
  email matches `order.customer_email` (this matching already existed in
  your codebase — `ownsByEmail` in `app/account/orders/[id]/page.tsx` —
  no changes needed there).

## Files changed/added
- `app/track/[id]/page.tsx` — new, public tracking page for a specific order; now includes the "Log in with this email" card
- `app/track/page.tsx` — new, public Order ID + email lookup page (footer links here)
- `app/login/page.tsx` — accepts `?email=` to prefill + auto-select OTP login
- `components/footer.tsx` — new "Track Order" link in the Help column
- `app/order-confirmation/[id]/page.tsx` — "Track this order" now points to `/track/[id]`
- `lib/email-templates.ts` — new `orderArrivingEmail` / `orderOutForDeliveryEmail` templates; existing templates now link to `/track/[id]`
- `lib/delivery-notifications.ts` — new, shared send-logic used by both the cron job and the admin test panel
- `lib/cron-jobs.ts` — `runForwardShipmentTrackingJob` now fires the arriving / out-for-delivery / delivered emails automatically
- `app/api/admin/orders/[id]/preview-email/route.ts` — new, preview/test-send any lifecycle email
- `app/api/admin/orders/[id]/delivery-test/route.ts` — new, simulate the real flow on a specific order
- `components/admin/delivery-notification-tester.tsx` — new, the admin UI panel
- `components/admin/orders-panel.tsx` — renders the panel inside each expanded order row
- `supabase/migrations/20260817000000_delivery_lifecycle_emails.sql` — new columns
