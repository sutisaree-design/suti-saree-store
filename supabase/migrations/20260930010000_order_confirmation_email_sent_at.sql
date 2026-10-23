-- New-order confirmation email to the customer (app/api/order-confirm/
-- route.ts) had been working fine, but was accidentally wiped out along
-- with the admin new-order notification, gift card redemption, loyalty
-- points, and referral rewards when that file got overwritten by an older
-- draft on 19 Aug 2026 (see the comment block at the top of route.ts for
-- the full story). This migration restores what that file needs: an
-- idempotency guard for the customer email.
--
-- /api/order-confirm is called once from app/checkout/page.tsx right after
-- a COD order is placed, and again right after an online payment is
-- verified -- but it's a fire-and-forget `fetch(...).catch(() => {})` call,
-- so it can legitimately be retried by the browser (flaky network, user
-- double-tapping "Place order", etc). This column makes the email send
-- idempotent so a retry never results in the customer getting the same
-- "order confirmed" email twice. (The admin notification, gift card,
-- loyalty, and referral logic all already have their own natural
-- idempotency -- existing ledger/transaction rows, or an `enabled`
-- settings flag -- so they don't need a column of their own.)
alter table public.orders
  add column if not exists confirmation_email_sent_at timestamptz;
