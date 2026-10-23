-- Tracking for the Admin > Orders > "Request Online Payment" flow
-- (COD order gets converted to online-only + customer is emailed a
-- resume-payment link -- see app/api/admin/orders/[id]/request-online-payment).
--
-- Before this, there was NO way to answer "customer ne payment try kiya ya
-- nahi, kab, email se ya account se" -- the admin route just fired an email
-- and flipped payment_method, nothing was ever logged. This table gives
-- each step of that journey its own timestamped row:
--
--   requested                -> admin clicked the button (this order entered
--                                the flow)
--   email_sent                -> the "pay online" email actually went out
--   email_send_failed         -> it didn't (provider error)
--   email_opened               -> tracking pixel fired (best-effort --
--                                many mail clients block images)
--   link_clicked                -> customer clicked the button inside the
--                                email (source = 'email')
--   page_visited               -> customer landed on /checkout/resume/[id]
--                                (source = 'email' | 'account')
--   payment_attempt_created    -> Razorpay order created for a retry
--                                (source = 'email' | 'account' | null)
--   payment_verified            -> that attempt succeeded
--   payment_failed              -> that attempt's signature check failed
--
-- Only ever written by server-side/service-role code (admin route, the two
-- /api/track/order-payment/* pixel+redirect routes, the resume page, and
-- the razorpay create-order/verify-payment routes) -- same locked-down
-- pattern as order_status_history.
create table if not exists public.order_payment_request_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in (
    'requested',
    'email_sent',
    'email_send_failed',
    'email_opened',
    'link_clicked',
    'page_visited',
    'payment_attempt_created',
    'payment_verified',
    'payment_failed'
  )),
  source text check (source in ('email', 'account')),
  -- First-open time / open count, mirroring the existing campaign pixel
  -- pattern (20260805000000_campaign_open_tracking.sql) -- kept on the
  -- row itself rather than as separate repeated 'email_opened' inserts,
  -- so "opened at X, seen N times" is a single lookup.
  opened_at timestamptz,
  open_count integer not null default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_payment_request_events_order_id
  on public.order_payment_request_events(order_id, created_at);

alter table public.order_payment_request_events enable row level security;

drop policy if exists service_role_all_order_payment_request_events on public.order_payment_request_events;
create policy service_role_all_order_payment_request_events
  on public.order_payment_request_events
  for all
  to service_role
  using (true)
  with check (true);
