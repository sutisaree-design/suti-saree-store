-- ============================================================
-- Phase 7: Returns/Refunds admin processing + refund tracking
-- ============================================================

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS refund_amount numeric(10, 2);

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Helpful index for the admin panel (filter/sort by status, newest first)
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
