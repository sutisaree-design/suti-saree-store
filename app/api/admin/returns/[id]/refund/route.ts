import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { processRefundForReturn } from '@/lib/return-automation';

// Manual "Process Refund Now" — lets the admin force the Razorpay
// refund at any point (e.g. before the pickup tracking shows
// "received", or when automation is set to manual and they've decided
// the item is fine to refund by hand).
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
    if (ret.refund_status === 'refunded') {
      return NextResponse.json({ error: 'This return has already been refunded' }, { status: 400 });
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

    const result = await processRefundForReturn(supabase, ret, order);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Refund failed' }, { status: 502 });
    }
    if (!result.refunded) {
      return NextResponse.json(
        { error: 'This order was not paid online — nothing to refund via Razorpay' },
        { status: 400 }
      );
    }

    const { data: refreshed } = await supabase.from('returns').select('*').eq('id', params.id).single();
    return NextResponse.json({ success: true, data: refreshed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
