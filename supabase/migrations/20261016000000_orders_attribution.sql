-- Which traffic source and device did each order come from?
--
-- Filled in (best-effort, once, within 2h of the order being placed) by
-- POST /api/orders/[id]/attribution, called from checkout. Shape:
--   {
--     "first":  { "channel": "Instagram",  "source": "instagram", "medium": "social", "campaign": "...", "referrer_host": "...", "landing_path": "/", "at": "<iso>" },
--     "last":   { "channel": "Google Ads", "source": "google",    "medium": "cpc",    ... },
--     "device": { "type": "Mobile", "os": "Android", "browser": "Chrome" }
--   }
-- "first" = very first visit (within 30 days), "last" = most recent non-direct
-- visit before ordering. No IP address, raw user-agent or query string is stored.
--
-- Plain nullable column: existing rows stay NULL (shown as "No source data" in
-- Admin > Orders), no backfill, no default, nothing else touched.
alter table public.orders
  add column if not exists attribution jsonb;

comment on column public.orders.attribution is
  'First-party traffic source + device captured at checkout: {first, last, device}. See lib/attribution.ts.';
