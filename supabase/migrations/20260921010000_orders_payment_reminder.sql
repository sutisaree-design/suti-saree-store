-- Tracks whether a "complete your payment" reminder email has been sent
-- for this order, so the cron job never emails the same customer twice
-- for the same abandoned online payment.
--
-- This is deliberately separate from `abandoned_carts`: that table tracks
-- carts that never even reached checkout (no `orders` row exists yet).
-- This column instead targets orders that DID get created (stock/address
-- already committed via place_order_with_items) but where the Razorpay
-- popup was closed/abandoned before payment completed -- status stays
-- 'pending' forever with no follow-up otherwise.
alter table public.orders
  add column if not exists payment_reminder_sent_at timestamptz;

comment on column public.orders.payment_reminder_sent_at is
  'When the "complete your payment" reminder email was sent for this pending online order. NULL = not sent yet.';
