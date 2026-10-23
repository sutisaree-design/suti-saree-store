import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 5A — Vendor-facing KYC document upload (PAN card, GST
// certificate, bank proof).
//
// The `vendor-kyc-documents` bucket is private and has no storage
// policies for `authenticated` at all (see the Phase 5A migration), so
// unlike the fulfillment-photo upload in lib/vendor-api.ts, the vendor
// CANNOT upload directly from the browser with the anon key. Both
// routes below use the SERVICE ROLE client to actually touch storage
// and the `vendor_kyc_documents` table — but only after independently
// confirming, via the RLS-aware auth client, that the caller owns the
// vendor row they're acting on. This mirrors
// app/api/admin/fulfillment/upload-photo/route.ts's reasoning for why
// a server-side service-role upload is the right call for a
// restricted bucket.
// ---------------------------------------------------------------------

const BUCKET = 'vendor-kyc-documents';
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
const DOC_TYPES = new Set(['pan_card', 'gst_certificate', 'bank_proof']);
const SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutes — just long enough to view/download

/** Confirms the logged-in user has a vendor profile and returns its id.
 *  Uses the RLS-aware client so this can only ever resolve the caller's
 *  OWN vendor row (own_select_vendors policy) — never anyone else's. */
async function getOwnVendorId(): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from('vendors').select('id').maybeSingle();
  return data?.id ?? null;
}

// GET — the logged-in vendor's own KYC documents, each with a
// short-lived signed URL (never a permanent public link).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const vendorId = await getOwnVendorId();
  if (!vendorId) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 404 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: docs, error } = await admin
      .from('vendor_kyc_documents')
      .select('id, doc_type, original_filename, status, admin_note, uploaded_at, file_path')
      .eq('vendor_id', vendorId);
    if (error) throw error;

    const documents = await Promise.all(
      (docs ?? []).map(async (d) => {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(d.file_path, SIGNED_URL_TTL_SECONDS);
        const { file_path, ...rest } = d;
        return { ...rest, url: signed?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your KYC documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — upload (or re-upload) one document. multipart/form-data with
// fields: doc_type, file. Re-uploading a doc_type replaces the
// previous file and resets status back to 'pending' for re-review.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const vendorId = await getOwnVendorId();
  if (!vendorId) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const docType = String(formData.get('doc_type') || '');
    const file = formData.get('file');

    if (!DOC_TYPES.has(docType)) {
      return NextResponse.json(
        { error: 'doc_type must be one of pan_card, gst_certificate, bank_proof' },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File is too large (max 10MB).' }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Please upload a JPG, PNG, WEBP, or PDF file.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Remove any previous file for this vendor+doc_type first (storage
    // objects aren't cleaned up automatically when the row is replaced).
    const { data: existing } = await admin
      .from('vendor_kyc_documents')
      .select('file_path')
      .eq('vendor_id', vendorId)
      .eq('doc_type', docType)
      .maybeSingle();
    if (existing?.file_path) {
      await admin.storage.from(BUCKET).remove([existing.file_path]);
    }

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${vendorId}/${docType}-${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(arrayBuffer), {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
    if (uploadError) throw uploadError;

    const { data: saved, error: upsertError } = await admin
      .from('vendor_kyc_documents')
      .upsert(
        {
          vendor_id: vendorId,
          doc_type: docType,
          file_path: path,
          original_filename: file.name,
          file_size_bytes: file.size,
          status: 'pending',
          admin_note: null,
          reviewed_at: null,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'vendor_id,doc_type' }
      )
      .select('id, doc_type, original_filename, status, admin_note, uploaded_at')
      .single();
    if (upsertError) throw upsertError;

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    return NextResponse.json({ document: { ...saved, url: signed?.signedUrl ?? null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
