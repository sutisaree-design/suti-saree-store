import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Body: { payment_reference: string, paid_date?: string (YYYY-MM-DD) }
// Sets status -> 'paid'. Once this is 'paid', any later refund/return
// against an item in this settlement creates a vendor_clawbacks row
// (Phase 4A point 5 trigger) deducted from the vendor's NEXT settlement.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payment_reference = String(body?.payment_reference || '').trim();
  if (!payment_reference) {
    return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
  }
  const paid_date = body?.paid_date || new Date().toISOString().slice(0, 10);

  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin
      .from('vendor_settlements')
      .update({ status: 'paid', payment_reference, paid_date })
      .eq('id', params.id)
      .select('id, vendor_id, status, payment_reference, paid_date')
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, settlement: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to mark settlement as paid' }, { status: 500 });
  }
}
