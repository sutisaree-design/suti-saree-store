import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 4A — read-only list of vendor_settlements, for testing the
// weekly cron + the clawback trigger before Phase 4B's admin UI exists.
// (Phase 4B adds the "Mark as Paid" button + CSV export around this
// same data — this route and the [id] PATCH route below are what it
// will call.)
// ---------------------------------------------------------------------

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin
      .from('vendor_settlements')
      .select('id, vendor_id, week_start, week_end, total_amount, clawback_deducted, status, payment_reference, paid_date, created_at, vendors(business_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const settlements = (data ?? []).map((row: any) => ({
      id: row.id,
      vendor_id: row.vendor_id,
      vendor_name: row.vendors?.business_name ?? 'Unknown vendor',
      week_start: row.week_start,
      week_end: row.week_end,
      total_amount: row.total_amount,
      clawback_deducted: row.clawback_deducted,
      status: row.status,
      payment_reference: row.payment_reference,
      paid_date: row.paid_date,
      created_at: row.created_at,
    }));

    return NextResponse.json({ settlements });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settlements' }, { status: 500 });
  }
}
