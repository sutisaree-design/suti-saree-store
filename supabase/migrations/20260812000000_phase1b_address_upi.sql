-- ---------------------------------------------------------------------
-- Phase 1B — Structured pickup address + UPI ID
--
-- 1. Adds structured address columns (line1/line2/city/state/pincode)
--    alongside the existing `pickup_address` text column. We keep
--    `pickup_address` as-is (still NOT NULL) because it's already read
--    by lib/vendor-courier.ts, lib/delhivery-api.ts, the admin
--    fulfillment/notifications routes, etc. The application layer now
--    composes `pickup_address` from the structured fields on submit,
--    so every existing consumer keeps working unchanged.
--
-- 2. Adds `upi_id`, and extends the bank-detail-change-request flow
--    (request_vendor_bank_update RPC) to optionally stage a UPI ID
--    change through the SAME pending_bank_update / admin-approval
--    pattern as bank_account_number/bank_ifsc — deliberately NOT a
--    separate verification flow.
-- ---------------------------------------------------------------------

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS upi_id text;

-- Replace request_vendor_bank_update to also accept an optional UPI ID.
-- Existing callers that only pass account+IFSC keep working (new_upi_id
-- defaults to NULL, which means "not changing UPI as part of this request").
CREATE OR REPLACE FUNCTION request_vendor_bank_update(
  new_account_number text,
  new_ifsc text,
  new_upi_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM vendors WHERE user_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'No vendor profile found for this account';
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved vendors can request a bank detail change';
  END IF;

  UPDATE vendors
  SET pending_bank_update = jsonb_build_object(
        'bank_account_number', new_account_number,
        'bank_ifsc', new_ifsc,
        'upi_id', new_upi_id,
        'requested_at', now()
      ),
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION request_vendor_bank_update(text, text, text) TO authenticated;
