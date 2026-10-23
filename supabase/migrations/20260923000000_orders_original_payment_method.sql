-- Admin > Orders > "Request Online Payment" flips payment_method
-- 'cod' -> 'online' directly on the order row (see
-- app/api/admin/orders/[id]/request-online-payment) so the customer's
-- normal Razorpay resume-payment flow works. Problem: that overwrite
-- destroys the fact the order was originally COD -- the admin has no way
-- to look at a "pending, Online" order later and tell "yeh COD tha jo
-- humne online mein convert kiya" vs "yeh customer ne khud online choose
-- kiya tha".
--
-- This column records the payment_method value at order-placement time
-- and is never touched again after that first write, so it survives any
-- later conversion.
alter table public.orders
  add column if not exists original_payment_method text;

-- Set automatically on insert via trigger (same pattern as
-- log_order_status_change() below) rather than from application code --
-- orders get created from several different paths (checkout page,
-- WooCommerce import, admin-created orders, etc.) and a trigger is the
-- only way to guarantee none of them can skip setting this.
create or replace function public.set_order_original_payment_method()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.original_payment_method is null then
    new.original_payment_method := new.payment_method;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_order_original_payment_method on public.orders;
create trigger trg_set_order_original_payment_method
  before insert on public.orders
  for each row
  execute function public.set_order_original_payment_method();

-- Backfill: for every existing order, whatever payment_method is *right
-- now* is also what it was originally, since the "Request Online
-- Payment" conversion is the only thing that ever changes payment_method
-- after order creation and (before this migration) never recorded the
-- before-value anywhere else.
update public.orders
  set original_payment_method = payment_method
  where original_payment_method is null;
