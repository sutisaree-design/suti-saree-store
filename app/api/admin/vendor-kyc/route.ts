import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

const BUCKET = 'vendor-kyc-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 5;

// GET — KYC documents. ?vendor_id=... filters to one vendor (used by
// the "View KYC Documents" toggle on the Vendors panel); with no query
// param, returns every vendor's documents.
export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get('vendor_id');

  const admin = getSupabaseAdmin();

  try {
    let query = admin
      .from('vendor_kyc_documents')
      .select('id, vendor_id, doc_type, original_filename, status, admin_note, uploaded_at, reviewed_at, file_path')
      .order('uploaded_at', { ascending: false });
    if (vendorId) query = query.eq('vendor_id', vendorId);

    const { data: docs, error } = await query;
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
    const message = err instanceof Error ? err.message : 'Failed to load KYC documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — verify or reject a document. { id, action: 'verify' | 'reject', admin_note? }
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const action = body?.action as string | undefined;
  const admin_note = body?.admin_note ? String(body.admin_note) : null;

  if (!id || !action || !['verify', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: updated, error } = await admin
      .from('vendor_kyc_documents')
      .update({
        status: action === 'verify' ? 'verified' : 'rejected',
        admin_note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, vendor_id, doc_type, original_filename, status, admin_note, uploaded_at, reviewed_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ document: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
