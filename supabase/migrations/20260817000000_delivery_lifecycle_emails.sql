-- Delivery lifecycle emails (arriving-soon / out-for-delivery / delivered)
--
-- Adds the columns runForwardShipmentTrackingJob (lib/cron-jobs.ts) needs to
-- know (a) when a shipment's expected delivery date becomes known/changes,
-- and (b) whether each lifecycle email has already been sent, so the cron
-- job (which polls every ~15 min) never sends the same email twice.
--
-- No RLS changes needed -- these are only ever read/written via the
-- service-role client (getSupabaseAdmin), same as delivery_status etc.
-- added in 20260911000000_return_rto_risk_tracking.sql.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS out_for_delivery boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS arriving_email_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS out_for_delivery_email_sent_at timestamptz;
