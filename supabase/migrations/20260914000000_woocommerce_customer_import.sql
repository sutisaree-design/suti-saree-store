-- WooCommerce customer import: lets the admin pull customer name/email/phone
-- from an external WooCommerce store (via its REST API) into this store's
-- admin so they can be emailed marketing campaigns from here.
--
-- Access is service-role only (no anon/public policies) -- this table holds
-- personal data (email, phone) imported from another system, so it must only
-- ever be read/written through the admin-authenticated API routes
-- (app/api/admin/woocommerce-import/*), never directly from the browser.

CREATE TABLE IF NOT EXISTS woocommerce_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wc_customer_id text NOT NULL,       -- WooCommerce customer id, or "order:<id>" for guest checkouts
  name text,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'woocommerce',
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wc_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_customers_email ON woocommerce_customers (email);
CREATE INDEX IF NOT EXISTS idx_woocommerce_customers_imported_at ON woocommerce_customers (imported_at DESC);

ALTER TABLE woocommerce_customers ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose: with RLS enabled and zero policies,
-- every non-service-role request is denied by default. Only the
-- getSupabaseAdmin() service-role client (used inside the admin API routes,
-- which check the admin session cookie first) can read or write this table.

-- Optional: track individual campaign sends so the same person isn't
-- re-emailed the same campaign, and so the admin can see delivery counts.
CREATE TABLE IF NOT EXISTS woocommerce_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES woocommerce_customers(id) ON DELETE CASCADE,
  email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL, -- 'sent' | 'failed' | 'skipped'
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE woocommerce_campaign_sends ENABLE ROW LEVEL SECURITY;
