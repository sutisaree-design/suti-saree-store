import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';

// POST — request a bank-detail change. This NEVER writes to
// bank_account_number/bank_ifsc directly. It calls the
// request_vendor_bank_update() Postgres function (SECURITY DEFINER),
// which only stages the change in pending_bank_update and re-verifies
// auth.uid() + that the vendor is approved. An admin must manually
// approve it (see /api/admin/vendors/bank-update) before it takes effect.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const bank_account_number = String(body?.bank_account_number || '').trim();
  const bank_ifsc = String(body?.bank_ifsc || '').trim().toUpperCase();
  const upi_id = body?.upi_id ? String(body.upi_id).trim() : null;

  if (!bank_account_number || !bank_ifsc) {
    return NextResponse.json({ error: 'bank_account_number and bank_ifsc are required' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();

  try {
    const { error } = await supabase.rpc('request_vendor_bank_update', {
      new_account_number: bank_account_number,
      new_ifsc: bank_ifsc,
      new_upi_id: upi_id,
    });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to request bank detail update';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
