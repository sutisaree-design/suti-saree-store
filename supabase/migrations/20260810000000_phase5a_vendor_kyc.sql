-- ---------------------------------------------------------------------
-- Phase 5A — Vendor KYC Document Upload
--
-- Vendor-side upload of PAN card, GST certificate, and bank proof
-- documents. Unlike the Phase 3B/3C fulfillment photos (public bucket,
-- direct browser upload via the anon key), KYC documents are sensitive
-- identity/financial paperwork, so this is deliberately locked down
-- harder:
--
--   1. Storage bucket `vendor-kyc-documents` is PRIVATE (public: false).
--   2. No storage.objects policies are added for `anon` or
--      `authenticated` at all — direct browser upload/read is not
--      possible even with the anon key. Every read and write goes
--      through a server route using the SERVICE ROLE client, which
--      bypasses storage RLS entirely (same reasoning as
--      app/api/admin/fulfillment/upload-photo/route.ts).
--   3. The `vendor_kyc_documents` table also has RLS enabled with NO
--      policies for anon/authenticated — same "server-route-only"
--      pattern. The vendor route (/api/vendor/kyc) checks
--      auth.uid() -> vendors.user_id itself before touching this
--      table with the service-role client; the admin route
--      (/api/admin/vendor-kyc) checks the admin cookie the same way
--      every other admin route does.
--   4. File contents are never made public — vendor/admin views use a
--      short-lived signed URL (storage.createSignedUrl) generated
--      per-request server-side, never a permanent public URL.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

  doc_type text NOT NULL
    CHECK (doc_type IN ('pan_card', 'gst_certificate', 'bank_proof')),

  file_path text NOT NULL,        -- path inside the private bucket, NOT a public URL
  original_filename text,
  file_size_bytes integer,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  admin_note text,
  reviewed_at timestamptz,

  uploaded_at timestamptz NOT NULL DEFAULT now(),

  -- Re-uploading a doc_type replaces the previous row for that vendor
  -- (see the API route's upsert-by-delete-then-insert) rather than
  -- accumulating history, so each vendor has at most one row per type.
  UNIQUE (vendor_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_vendor_kyc_documents_vendor_id ON vendor_kyc_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_kyc_documents_status ON vendor_kyc_documents(status);

ALTER TABLE vendor_kyc_documents ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies for `anon` / `authenticated` — see header
-- comment. Only the service-role client (used exclusively by
-- /api/vendor/kyc and /api/admin/vendor-kyc, both of which enforce
-- their own auth checks) can read or write this table.

-- ============================================================
-- Private storage bucket for the actual files.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-kyc-documents', 'vendor-kyc-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- No INSERT/SELECT policies for anon or authenticated on this bucket —
-- deliberately unlike `order-fulfillment-photos` / `review-images`.
-- All access goes through the service-role client server-side.
