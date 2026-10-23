import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyVendorBankUpdateStatus } from '@/lib/vendor-notifications';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// PUT — approve (apply pending_bank_update to the real bank fields) or
// reject (discard it) a vendor's staged bank-detail change request.
// This is the ONLY place bank_account_number/bank_ifsc are ever written
// after the initial application — always a manual admin action, never
// automatic, per the fraud-prevention requirement.
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  const action = body?.action as string | undefined;

  if (!id || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: vendor, error: fetchErr } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    if (!vendor.pending_bank_update) {
      return NextResponse.json({ error: 'No pending bank update request for this vendor' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      pending_bank_update: null,
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updatePayload.bank_account_number = vendor.pending_bank_update.bank_account_number;
      updatePayload.bank_ifsc = vendor.pending_bank_update.bank_ifsc;
      if (vendor.pending_bank_update.upi_id) {
        updatePayload.upi_id = vendor.pending_bank_update.upi_id;
      }
    }

    const { data: updated, error } = await supabase
      .from('vendors')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    notifyVendorBankUpdateStatus({
      business_name: updated.business_name,
      email: updated.email,
      whatsapp: updated.whatsapp,
      approved: action === 'approve',
    }).catch(() => {});

    return NextResponse.json({ success: true, vendor: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review bank update request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
