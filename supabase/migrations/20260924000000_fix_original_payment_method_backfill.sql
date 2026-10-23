-- Fixes a bad backfill from 20260923000000_orders_original_payment_method.sql.
--
-- That migration's backfill did:
--   update orders set original_payment_method = payment_method
--   where original_payment_method is null;
--
-- ...which is correct for orders that were still COD (or still online)
-- at the time it ran, but WRONG for any order that had already gone
-- through Admin > "Request Online Payment" *before* this migration
-- existed -- for those, payment_method was already flipped to 'online'
-- by then, so the backfill copied the current (wrong) value instead of
-- the true original ('cod'), and Status History showed "Order placed
-- (Prepaid)" for an order that was actually placed as COD.
--
-- order_payment_request_events has a 'requested' row for every order
-- that ever went through that conversion flow -- and the flow's own API
-- route only ever runs on an order that is (at click time) payment_method
-- = 'cod' (see app/api/admin/orders/[id]/request-online-payment), so the
-- mere existence of a 'requested' row proves the order was originally
-- COD, regardless of what original_payment_method currently says.
update public.orders o
set original_payment_method = 'cod'
where o.original_payment_method is distinct from 'cod'
  and exists (
    select 1
    from public.order_payment_request_events e
    where e.order_id = o.id
      and e.event_type = 'requested'
  );
