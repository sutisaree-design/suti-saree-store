import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkPickupStatusForReturn, getReturnAutomationMode } from '@/lib/return-automation';

// Lets the admin force an immediate Delhivery tracking check for one
// return instead of waiting for the daily cron — same logic the cron
// uses, just scoped to a single row.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: ret, error: retError } = await supabase
      .from('returns')
      .select('*')
      .eq('id', params.id)
      .single();
    if (retError || !ret) {
      return NextResponse.json({ error: 'Return request not found' }, { status: 404 });
    }
    if (!ret.pickup_waybill) {
      return NextResponse.json({ error: 'No pickup has been scheduled for this return yet' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, customer_name, customer_email, customer_phone, shipping_address, items, total_amount, payment_method, razorpay_payment_id'
      )
      .eq('id', ret.order_id)
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const mode = await getReturnAutomationMode(supabase);
    const result = await checkPickupStatusForReturn(supabase, ret, order, mode);

    const { data: refreshed } = await supabase.from('returns').select('*').eq('id', params.id).single();
    return NextResponse.json({ success: true, ...result, data: refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check pickup status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
