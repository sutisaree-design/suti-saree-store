-- Adds a 'reverted_to_cod' event to order_payment_request_events so that
-- Admin > Orders > "Revert to COD" (the undo of "Request Online Payment",
-- see app/api/admin/orders/[id]/revert-to-cod) shows up on the order's
-- Status History timeline with its own date/time.
--
-- The original CHECK constraint (20260922000000_order_payment_request_tracking.sql)
-- was created inline, so Postgres auto-named it
-- order_payment_request_events_event_type_check. Drop it (if present) and
-- re-create it with the extra allowed value.
alter table public.order_payment_request_events
  drop constraint if exists order_payment_request_events_event_type_check;

alter table public.order_payment_request_events
  add constraint order_payment_request_events_event_type_check
  check (event_type in (
    'requested',
    'email_sent',
    'email_send_failed',
    'email_opened',
    'link_clicked',
    'page_visited',
    'payment_attempt_created',
    'payment_verified',
    'payment_failed',
    'reverted_to_cod'
  ));
