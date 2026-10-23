-- ============================================================
-- Return pickup (Delhivery RVP) + refund (Razorpay) automation.
--
-- Flow this supports:
--   1. Customer requests a return/exchange (returns row, status
--      'requested') -> customer + admin get an email.
--   2. Admin approves it -> if automation is 'automatic', a Delhivery
--      reverse-pickup (RVP) shipment is created immediately and the
--      customer is emailed the pickup waybill. In 'manual' mode the
--      admin clicks "Schedule Pickup" themselves from the panel.
--   3. A daily cron polls Delhivery tracking for every return with a
--      pending pickup_waybill. Once Delhivery shows it as delivered
--      back to the warehouse, pickup_status -> 'received' and, for an
--      online-paid order in automatic mode, a Razorpay refund is fired
--      automatically. In manual mode it's flagged pending_manual so
--      the admin can trigger it (or refund by hand) from the panel.
--   4. Every transition emails the customer, and any automation
--      failure emails the admin (store support_email) so nothing gets
--      silently stuck.
-- ============================================================

ALTER TABLE returns
  -- Reverse pickup (Delhivery) tracking
  ADD COLUMN IF NOT EXISTS pickup_status text NOT NULL DEFAULT 'not_scheduled'
    CHECK (pickup_status IN (
      'not_scheduled', 'scheduled', 'picked_up', 'in_transit',
      'received', 'failed'
    )),
  ADD COLUMN IF NOT EXISTS pickup_waybill text,
  ADD COLUMN IF NOT EXISTS pickup_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_error text,
  -- Refund (Razorpay) tracking — separate from returns.status so the
  -- admin panel can show "approved, pickup received, refund pending"
  -- as distinct facts instead of overloading one status column.
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IS NULL OR refund_status IN (
      'not_applicable', 'pending', 'pending_manual', 'processing',
      'refunded', 'failed'
    )),
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text,
  ADD COLUMN IF NOT EXISTS refund_error text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_returns_pickup_status ON returns(pickup_status)
  WHERE pickup_status IN ('scheduled', 'picked_up', 'in_transit');

CREATE INDEX IF NOT EXISTS idx_returns_refund_status ON returns(refund_status)
  WHERE refund_status IN ('pending', 'pending_manual', 'failed');

-- Single master toggle: 'automatic' (default) auto-schedules the
-- reverse pickup on approval and auto-fires the Razorpay refund once
-- the item is back at the warehouse; 'manual' leaves both steps for
-- the admin to trigger by hand from the Returns panel. Not a secret,
-- so — same as `delhivery` / `refund_automation` — it's fine to live
-- in `settings` and be read/written directly from the admin client.
INSERT INTO settings (key, value)
VALUES ('return_automation', jsonb_build_object('mode', 'automatic'))
ON CONFLICT (key) DO NOTHING;
