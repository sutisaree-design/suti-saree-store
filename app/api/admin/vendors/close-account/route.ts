import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';

// ---------------------------------------------------------------------
// Phase 4C, point 5 — "Close Vendor Account". Deliberately a separate
// route from the existing PUT /api/admin/vendors (which only ever
// flips `status`) since this is a much bigger, one-way action: it
// returns stock immediately (skipping the 90/60-day timers), finalizes
// any pending settlement, and only THEN suspends the vendor. All three
// steps run inside one Postgres function (close_vendor_account(), see
// the Phase 4C migration) so they either all happen or none do.
// ---------------------------------------------------------------------

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: 'Missing vendor id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    const { data: vendor, error: vendorErr } = await admin
      .from('vendors')
      .select('id, business_name, email, whatsapp, status')
      .eq('id', id)
      .maybeSingle();
    if (vendorErr) throw vendorErr;
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    if (vendor.status === 'suspended') {
      return NextResponse.json({ error: 'Vendor account is already closed' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('close_vendor_account', { p_vendor_id: id });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    // Best-effort notification — never block the off-boarding on this.
    // notifyVendorApplicationStatus() only covers approved/rejected, so
    // this sends its own plain email directly (same sendEmail() helper,
    // same "never block on failure" pattern as every other notify call
    // in this codebase).
    if (vendor.email) {
      sendEmail({
        to: vendor.email,
        subject: 'Your vendor account has been closed',
        html: `<p>Namaste ${vendor.business_name},</p><p>Aapka vendor account close kar diya gaya hai. Aapka koi bhi awaiting-stock/live stock aapko return kiya jayega, aur koi bhi pending settlement finalize kar diya gaya hai${
          result?.final_settlement_amount != null ? ` (₹${result.final_settlement_amount})` : ''
        }.</p><p>Kisi bhi sawaal ke liye humse contact karein.</p>`,
      }).catch(() => {});
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[vendor-whatsapp placeholder] to ${vendor.whatsapp || 'N/A'}: Aapka vendor account close kar diya gaya hai.`);
    }

    return NextResponse.json({
      success: true,
      products_flagged: result?.products_flagged ?? 0,
      final_settlement_id: result?.final_settlement_id ?? null,
      final_settlement_amount: result?.final_settlement_amount ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to close vendor account' }, { status: 500 });
  }
}
