-- Order status history / timeline.
--
-- Every status change on `orders` (pending -> paid -> shipped -> delivered,
-- or -> cancelled/failed) gets logged here with a timestamp, automatically,
-- via a trigger -- NOT by adding logging code to every place that changes
-- `orders.status`. This matters because status gets changed from several
-- different code paths (admin manually changing the dropdown in
-- app/api/admin/orders/[id]/route.ts, the Razorpay verify-payment route
-- flipping pending -> paid, app/api/admin/delhivery/create-shipment
-- flipping paid -> shipped) -- a trigger is the only way to guarantee none
-- of those paths can silently skip logging, now or in the future.

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order_id
  on public.order_status_history(order_id, changed_at);

-- Service-role only (same access model as `orders` itself) -- this is
-- admin-facing history, never read directly by the storefront/anon client.
alter table public.order_status_history enable row level security;

drop policy if exists service_role_all_order_status_history on public.order_status_history;
create policy service_role_all_order_status_history
  on public.order_status_history
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status)
    values (new.id, null, new.status);
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_order_status_change on public.orders;
create trigger trg_log_order_status_change
  after insert or update on public.orders
  for each row
  execute function public.log_order_status_change();

-- Backfill: give every existing order at least one history row (its
-- current status, timestamped at order creation) so the timeline isn't
-- empty for orders placed before this migration ran.
insert into public.order_status_history (order_id, from_status, to_status, changed_at)
select o.id, null, o.status, coalesce(o.created_at, now())
from public.orders o
where not exists (
  select 1 from public.order_status_history h where h.order_id = o.id
);
