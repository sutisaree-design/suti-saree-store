-- Exchange & return improvements:
-- 1. Structured reason keys (instead of free-text only)
-- 2. Desired size for exchanges
-- 3. Exchange shipping tracking fields

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS reason_key       text,          -- machine-readable reason key
  ADD COLUMN IF NOT EXISTS desired_size     text,          -- exchange: customer-requested size/colour
  ADD COLUMN IF NOT EXISTS exchange_courier text,          -- courier used for new item dispatch
  ADD COLUMN IF NOT EXISTS exchange_tracking_number text,  -- tracking number for new item
  ADD COLUMN IF NOT EXISTS exchange_shipped_at      timestamptz,
  ADD COLUMN IF NOT EXISTS exchange_ready_date      date;  -- estimated ready date if not in stock

COMMENT ON COLUMN returns.reason_key IS 'Predefined reason key selected by customer';
COMMENT ON COLUMN returns.desired_size IS 'For exchanges: size/colour/variant customer wants';
COMMENT ON COLUMN returns.exchange_courier IS 'Courier name for dispatching the exchanged item';
COMMENT ON COLUMN returns.exchange_tracking_number IS 'Tracking number for the exchanged item shipment';
COMMENT ON COLUMN returns.exchange_shipped_at IS 'Timestamp when exchanged item was shipped';
COMMENT ON COLUMN returns.exchange_ready_date IS 'Estimated date stock will be ready (if not immediately available)';
