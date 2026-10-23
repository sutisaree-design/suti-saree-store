import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logPaymentRequestEvent } from '@/lib/order-payment-events';

// GET /api/track/order-payment/click/<order_payment_request_events row id>
// — this is what the "Pay online to confirm this order" button in the
// email actually points to. Logs a 'link_clicked' event (source: 'email')
// then 302s straight to the real /checkout/resume/[id] page (tagged
// ?src=email so the resume page's own 'page_visited' log carries the same
// source). No auth, same unguessable-uuid model as the open pixel --
// if the id is bad or the order can't be found, it just falls back to
// the site homepage instead of erroring out on the customer.
export async function GET(_req: NextRequest, { params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';

  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return NextResponse.redirect(siteUrl || 'https://example.com');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: sentEvent } = await supabase
      .from('order_payment_request_events')
      .select('order_id')
      .eq('id', eventId)
      .eq('event_type', 'email_sent')
      .maybeSingle();

    if (sentEvent?.order_id) {
      await logPaymentRequestEvent(sentEvent.order_id, 'link_clicked', { source: 'email' });
      return NextResponse.redirect(`${siteUrl}/checkout/resume/${sentEvent.order_id}?src=email`);
    }
  } catch (err) {
    console.error('[track/order-payment/click] failed:', err);
  }

  return NextResponse.redirect(siteUrl || 'https://example.com');
}
