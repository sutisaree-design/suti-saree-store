-- ---------------------------------------------------------------------
-- Phase 1 — Vendor Foundation (internal sourcing, NOT a marketplace)
--
-- Vendors are never shown on the customer-facing site. This table only
-- powers /sell-with-us (application), the admin "Vendors" panel, and
-- (from Phase 2 onward) the vendor's own product-listing dashboard.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  business_name text NOT NULL,
  owner_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text,
  email text,
  pan_number text NOT NULL,
  gst_number text,
  pickup_address text NOT NULL,
  expected_category text,

  bank_account_number text,
  bank_ifsc text,

  -- Set only via the request_vendor_bank_update() RPC below (never
  -- written directly by the vendor) and applied/cleared only by the
  -- admin (service role) — see /api/admin/vendors/bank-update.
  pending_bank_update jsonb,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  admin_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- A vendor may only ever read their OWN row.
DROP POLICY IF EXISTS "own_select_vendors" ON vendors;
CREATE POLICY "own_select_vendors" ON vendors FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- A vendor may apply exactly once (unique user_id above enforces this),
-- and can only ever insert a PENDING application for themselves — they
-- cannot insert a row with status already 'approved', nor set bank
-- fields at signup time (kept null until admin/KYC review, Phase 5).
DROP POLICY IF EXISTS "own_insert_vendors" ON vendors;
CREATE POLICY "own_insert_vendors" ON vendors FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND bank_account_number IS NULL
    AND bank_ifsc IS NULL
    AND pending_bank_update IS NULL
  );

-- IMPORTANT: no UPDATE or DELETE policy for `authenticated` at all.
-- This is intentional: vendors must NEVER be able to directly change
-- their own status, bank details, or admin_note, even by calling the
-- table API directly (bypassing our own frontend). The only two ways
-- a vendor row can change after creation are:
--   1. request_vendor_bank_update() below — writes ONLY to the
--      pending_bank_update staging field.
--   2. The admin panel, which uses the SERVICE ROLE key (bypasses RLS
--      entirely) via /api/admin/vendors and /api/admin/vendors/bank-update.

-- ---------------------------------------------------------------------
-- request_vendor_bank_update — the ONLY way an approved vendor can ever
-- affect their bank details. It never touches bank_account_number /
-- bank_ifsc directly; it only stages the request in pending_bank_update
-- for an admin to manually review and approve. SECURITY DEFINER so it
-- can update the row despite there being no vendor UPDATE policy, but
-- it re-checks auth.uid() itself so it can't be used to touch anyone
-- else's row or any other column.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_vendor_bank_update(
  new_account_number text,
  new_ifsc text
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
        'requested_at', now()
      ),
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- Let logged-in customers call the RPC (it enforces its own auth check above).
GRANT EXECUTE ON FUNCTION request_vendor_bank_update(text, text) TO authenticated;
