-- ============================================================
-- Hidden Product Sourcing (admin-only, never customer-facing)
--
-- Purpose: let the admin privately track WHERE a product was sourced
-- from (e.g. a WhatsApp supplier contact) and its buy/cost price, so
-- that later — when an order comes in for that product — the admin can
-- look up which supplier it came from. None of this is ever meant to
-- be visible on the storefront, in the Google Merchant Center feed, or
-- to any bot/crawler.
--
-- Security model: both tables have RLS ENABLED with ZERO policies for
-- `anon` / `authenticated`. In Postgres/Supabase, enabling RLS with no
-- matching policy means every row is denied to those roles — only the
-- `service_role` key (used exclusively by getSupabaseAdmin() on the
-- server, inside /api/admin/* routes that already gate on the admin
-- session cookie) can read or write these tables at all. There is no
-- public SELECT policy, unlike `products` — so even a fully public
-- anon-key query against these two tables returns nothing.
-- ============================================================

-- 1. product_sources — the supplier/contact directory itself
CREATE TABLE IF NOT EXISTS product_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  whatsapp_name text,
  whatsapp_number text,
  -- Manually editable "sourced on" date/time (admin types it in — not
  -- forced to the row's real created_at, since the admin may be
  -- backfilling an older source).
  source_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_sources ENABLE ROW LEVEL SECURITY;
-- Deliberately no CREATE POLICY here for anon/authenticated — see note above.

CREATE INDEX IF NOT EXISTS idx_product_sources_name ON product_sources (lower(name));
CREATE INDEX IF NOT EXISTS idx_product_sources_source_date ON product_sources (source_date DESC);

COMMENT ON TABLE product_sources IS
  'Admin-only supplier directory (WhatsApp contact + name + sourcing date). RLS has zero anon/authenticated policies by design — service_role (admin API routes) only. Never expose in customer-facing queries, sitemap, robots-indexable pages, or the Google Merchant Center feed.';

-- 2. product_sourcing — links one product to one source + its buy price
CREATE TABLE IF NOT EXISTS product_sourcing (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  product_source_id uuid REFERENCES product_sources(id) ON DELETE SET NULL,
  buy_price numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_sourcing ENABLE ROW LEVEL SECURITY;
-- Deliberately no CREATE POLICY here either — service_role only.

CREATE INDEX IF NOT EXISTS idx_product_sourcing_source_id ON product_sourcing (product_source_id);

COMMENT ON TABLE product_sourcing IS
  'Admin-only: which product_sources row a product was bought from, and at what buy price. RLS has zero anon/authenticated policies by design. Joined server-side (service_role) into the admin Products form, the Product Sources panel, and the admin Orders panel — never into any customer-facing or SEO/feed query.';
