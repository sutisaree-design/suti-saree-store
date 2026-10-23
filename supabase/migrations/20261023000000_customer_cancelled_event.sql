-- Adds a 'customer_cancelled' event to order_payment_request_events so that
-- when a customer cancels from the "Complete your payment" page
-- (app/api/orders/[id]/payment-choice) it shows on the admin's Status History
-- as "Customer cancelled (from payment page)". Safe to deploy before running:
-- without it the event insert just fails soft and the cancel still works.
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
    'reverted_to_cod',
    'customer_cancelled'
  ));
