-- Lets an imported customer opt out of future marketing emails by clicking
-- a real unsubscribe link (see app/api/unsubscribe/[sendId]/route.ts).
-- Once opted_out is true, send-campaign excludes them from every future
-- campaign send -- this is enforced server-side in the query itself, not
-- just hidden in the UI, so there's no way to accidentally re-include them.

ALTER TABLE woocommerce_customers
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_woocommerce_customers_opted_out
  ON woocommerce_customers (opted_out);
