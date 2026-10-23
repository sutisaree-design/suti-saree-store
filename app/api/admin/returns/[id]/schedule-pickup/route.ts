import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { schedulePickupForReturn } from '@/lib/return-automation';

// Manual trigger — used from the Returns panel when automation mode is
// 'manual' (or as a retry if the automatic attempt failed).
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
    if (!['approved', 'requested'].includes(ret.status)) {
      return NextResponse.json(
        { error: 'Only requested/approved return requests can have a pickup scheduled' },
        { status: 400 }
      );
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

    const result = await schedulePickupForReturn(supabase, ret, order);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to schedule pickup' }, { status: 502 });
    }

    const { data: refreshed } = await supabase.from('returns').select('*').eq('id', params.id).single();
    return NextResponse.json({ success: true, data: refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to schedule pickup';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
