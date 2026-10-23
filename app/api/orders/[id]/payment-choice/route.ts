import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { codRevertedEmail, orderCancelledByCustomerEmail } from '@/lib/email-templates';
import { logPaymentRequestEvent } from '@/lib/order-payment-events';

// Customer-side choice on /checkout/resume/[id] for an order the admin asked
// to pay online ("Request Online Payment"). Besides paying, the customer can:
//   - 'keep_cod' : keep the order as Cash on Delivery (exact inverse of the
//                  admin request: payment_method back to 'cod', the online
//                  payment discount is removed again, total restored).
//   - 'cancel'   : cancel the order (nothing was paid, so nothing to refund).
// Same trust model as the resume page itself: the unguessable order UUID is
// the access token. The action is limited to unpaid, unshipped orders that
// the admin converted from COD, so nothing paid can be touched.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let choice: string | undefined;
  try {
    choice = (await req.json())?.choice;
  } catch {
    // fall through
  }
  if (choice !== 'keep_cod' && choice !== 'cancel') {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, status, payment_method, original_payment_method, total_amount, online_payment_discount, razorpay_payment_id, tracking_number, items, customer_name, customer_email'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.razorpay_payment_id || order.status === 'paid') {
    return NextResponse.json({ error: 'This order has already been paid.' }, { status: 409 });
  }
  if (order.status !== 'pending' || order.tracking_number) {
    return NextResponse.json({ error: 'This order can no longer be changed here. Please contact us.' }, { status: 409 });
  }
  if (order.original_payment_method !== 'cod' || order.payment_method !== 'online') {
    return NextResponse.json({ error: 'This option is not available for this order.' }, { status: 409 });
  }

  const items = Array.isArray(order.items) ? order.items : [];

  if (choice === 'keep_cod') {
    const discount = Number(order.online_payment_discount ?? 0);
    const restoredTotal = Number(order.total_amount) + discount;
    const { data: updated, error: upErr } = await supabase
      .from('orders')
      .update({ payment_method: 'cod', total_amount: restoredTotal, online_payment_discount: 0 })
      .eq('id', order.id)
      .eq('status', 'pending')
      .eq('payment_method', 'online')
      .select('id');
    if (upErr || !updated?.length) {
      return NextResponse.json({ error: 'Could not update your order. Please try again.' }, { status: 500 });
    }

    await logPaymentRequestEvent(order.id, 'reverted_to_cod', {
      meta: { restored_total: restoredTotal, removed_discount: discount, by: 'customer' },
    });

    // The customer explicitly chose COD, so count it as the COD confirmation.
    // Best-effort: fails soft if the cod-confirm migration hasn't been run.
    try {
      await supabase
        .from('orders')
        .update({ cod_confirmed_at: new Date().toISOString(), cod_confirmed_via: 'link' })
        .eq('id', order.id)
        .is('cod_confirmed_at', null);
    } catch {}

    if (order.customer_email) {
      try {
        const { data: storeSetting } = await supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle();
        const { subject, html } = codRevertedEmail({
          id: order.id,
          items,
          total_amount: restoredTotal,
          customer_name: order.customer_name,
          store: (storeSetting?.value as any) || undefined,
        });
        await sendEmail({ to: order.customer_email, subject, html });
      } catch (e) {
        console.error('[payment-choice] email failed:', e);
      }
    }
    return NextResponse.json({ success: true, choice, total_amount: restoredTotal });
  }

  // choice === 'cancel'
  const { data: cancelled, error: cErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');
  if (cErr || !cancelled?.length) {
    return NextResponse.json({ error: 'Could not cancel your order. Please try again.' }, { status: 500 });
  }
  // Shows on the admin's Status History as "Customer cancelled from payment page".
  // (Needs 20261023000000_customer_cancelled_event.sql; fails soft without it.)
  await logPaymentRequestEvent(order.id, 'customer_cancelled', { meta: { by: 'customer' } });
  if (order.customer_email) {
    try {
      const { subject, html } = orderCancelledByCustomerEmail({
        id: order.id,
        customer_name: order.customer_name,
        items,
        total_amount: order.total_amount,
        refund: { status: 'not_applicable' },
      });
      await sendEmail({ to: order.customer_email, subject, html });
    } catch (e) {
      console.error('[payment-choice] cancel email failed:', e);
    }
  }
  return NextResponse.json({ success: true, choice });
}
