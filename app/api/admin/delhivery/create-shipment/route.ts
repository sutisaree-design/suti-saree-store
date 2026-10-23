import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createDelhiveryShipment } from '@/lib/delhivery-api';
import { sendEmail } from '@/lib/email';
import { orderShippedEmail, orderPartialShippedEmail } from '@/lib/email-templates';
import {
  getUnshippedItemIndexes,
  suggestCodAmount,
  DEFAULT_NEXT_LOT_MIN_DAYS,
  DEFAULT_NEXT_LOT_MAX_DAYS,
} from '@/lib/shipments';

export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const orderId = body?.orderId;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  const packageDetails =
    body?.weight_grams && body?.length_cm && body?.width_cm && body?.height_cm
      ? {
          weight_grams: Number(body.weight_grams),
          length_cm: Number(body.length_cm),
          width_cm: Number(body.width_cm),
          height_cm: Number(body.height_cm),
          shipping_mode: body.shipping_mode === 'E' ? ('E' as const) : ('S' as const),
        }
      : undefined;

  // Partial shipment inputs (all optional -- omitted = ship every remaining item).
  const requestedIndexes: number[] | null = Array.isArray(body?.itemIndexes)
    ? body.itemIndexes.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0)
    : null;
  const nextMinDays = Math.max(1, Math.round(Number(body?.nextMinDays) || DEFAULT_NEXT_LOT_MIN_DAYS));
  const nextMaxDays = Math.max(nextMinDays, Math.round(Number(body?.nextMaxDays) || DEFAULT_NEXT_LOT_MAX_DAYS));

  const supabase = getSupabaseAdmin();

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: existingShipments, error: shipmentsError } = await supabase
      .from('order_shipments')
      .select('shipment_no, item_indexes, cod_amount')
      .eq('order_id', orderId)
      .order('shipment_no', { ascending: true });
    if (shipmentsError) throw shipmentsError;
    const prior = existingShipments ?? [];

    const orderItems: any[] = Array.isArray(order.items) ? order.items : [];
    const unshipped = getUnshippedItemIndexes(orderItems, prior);

    // Legacy safety net: an order with a waybill but no shipment row (the
    // migration back-fills these, so this should never happen).
    if (order.tracking_number && prior.length === 0) {
      return NextResponse.json(
        { error: `Order already has a tracking number (${order.tracking_number})` },
        { status: 400 }
      );
    }
    if (unshipped.length === 0) {
      return NextResponse.json({ error: 'All items of this order are already shipped.' }, { status: 400 });
    }

    const selected = (requestedIndexes ?? unshipped).filter((i, pos, arr) => arr.indexOf(i) === pos);
    if (selected.length === 0 || selected.some((i) => !unshipped.includes(i))) {
      return NextResponse.json(
        { error: 'Pick at least one item that has not been shipped yet.' },
        { status: 400 }
      );
    }

    const isPartial = selected.length < unshipped.length;
    const isFirst = prior.length === 0;
    const shipmentNo = prior.reduce((m, x) => Math.max(m, x.shipment_no), 0) + 1;
    const shipItems = selected.map((i) => orderItems[i]);
    const remainingIndexes = unshipped.filter((i) => !selected.includes(i));

    // Guard: an online order whose payment hasn't been captured would go to
    // Delhivery as Prepaid (cod_amount 0) and the courier would collect no
    // money. Typical case: "Request Online Payment" was clicked but the
    // customer never paid. Admin must either wait for payment or use
    // "Revert to COD" first.
    const isPartialOrder = order.payment_method === 'partial';
    if (isPartialOrder && !order.advance_paid_at) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This is a Partial Pay order but the advance has not been paid yet — Delhivery would collect the wrong amount. Wait for the customer to pay the advance.',
        },
        { status: 200 }
      );
    }
    // Amount the courier may collect in total: full total for COD, only the balance for Partial Pay.
    const collectibleTotal = isPartialOrder ? Number(order.balance_due || 0) : Number(order.total_amount || 0);

    if (order.payment_method !== 'cod' && !isPartialOrder && !order.razorpay_payment_id && order.status !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This order is marked online but unpaid — Delhivery would not collect any cash. Click "Revert to COD" on the order first (or wait for the customer to pay).',
        },
        { status: 200 }
      );
    }

    // COD: split the cash between parcels. Admin may override the suggestion.
    const suggestedCod = suggestCodAmount({
      paymentMethod: order.payment_method,
      totalAmount: collectibleTotal,
      items: orderItems,
      selectedIndexes: selected,
      existingShipments: prior,
    });
    const priorCod = prior.reduce((sum, x) => sum + Number(x.cod_amount || 0), 0);
    const maxCod = Math.max(0, collectibleTotal - priorCod);
    const codAmount =
      order.payment_method === 'cod' || isPartialOrder
        ? body?.codAmount !== undefined && body?.codAmount !== null && body?.codAmount !== ''
          ? Math.min(maxCod, Math.max(0, Math.round(Number(body.codAmount) || 0)))
          : suggestedCod
        : 0;

    // Declared value: whole order for a single parcel, otherwise pro-rata to item value.
    const lineVal = (it: any) => Number(it?.price || 0) * Number(it?.quantity || 1);
    const allVal = orderItems.reduce((sum, it) => sum + lineVal(it), 0);
    const selVal = shipItems.reduce((sum, it) => sum + lineVal(it), 0);
    const declaredValue =
      isFirst && !isPartial
        ? Number(order.total_amount)
        : allVal > 0
          ? Math.max(1, Math.round((Number(order.total_amount) * selVal) / allVal))
          : Number(order.total_amount);

    // Delhivery rejects a re-used `order` reference, so every parcel after
    // (or alongside) the first needs its own suffix. A normal single-parcel
    // order keeps the plain order id exactly as before.
    const orderRef = isFirst && !isPartial ? order.id : `${order.id}-P${shipmentNo}`;

    const result = await createDelhiveryShipment(
      {
        id: order.id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        balance_due: order.balance_due,
        items: orderItems,
        shipping_address: order.shipping_address,
      },
      packageDetails,
      { orderRef, items: shipItems, codAmount, declaredValue }
    );

    if (!result.success || !result.waybill) {
      const reason = result.remark || 'Delhivery did not return a waybill';
      // Log the real reason server-side so it shows up in Vercel's Logs tab
      // even if a proxy in front of the app (e.g. Cloudflare) ever rewrites
      // a non-2xx response body before it reaches the browser.
      console.error(`[delhivery/create-shipment] rejected for order ${orderId}: ${reason}`, result.raw);
      // Deliberately 200 (not 502/4xx): some CDNs/proxies replace 5xx response
      // bodies with their own generic error page, which would hide this
      // message from the admin. A 200 status is never intercepted, and the
      // frontend checks `success` in the body instead of the HTTP status.
      return NextResponse.json({ success: false, error: reason }, { status: 200 });
    }

    // Bump status forward to 'shipped' unless it's already further along
    // (delivered/cancelled) or explicitly still awaiting payment collection.
    const nextStatus = ['pending', 'paid'].includes(order.status) ? 'shipped' : order.status;

    const { data: insertedShipment, error: insertError } = await supabase
      .from('order_shipments')
      .insert({
        order_id: orderId,
        shipment_no: shipmentNo,
        waybill: result.waybill,
        courier_name: 'Delhivery',
        shipping_mode: packageDetails?.shipping_mode ?? 'S',
        weight_grams: packageDetails?.weight_grams ?? null,
        length_cm: packageDetails?.length_cm ?? null,
        width_cm: packageDetails?.width_cm ?? null,
        height_cm: packageDetails?.height_cm ?? null,
        item_indexes: selected,
        items: shipItems,
        cod_amount: codAmount,
        is_partial: isPartial,
        next_shipment_min_days: isPartial ? nextMinDays : null,
        next_shipment_max_days: isPartial ? nextMaxDays : null,
      })
      .select('*')
      .single();
    if (insertError) {
      // The waybill already exists at Delhivery -- surface it so it can be fixed by hand.
      console.error(`[delhivery/create-shipment] waybill ${result.waybill} created but not saved for order ${orderId}`, insertError);
      throw new Error(`Waybill ${result.waybill} was created at Delhivery but could not be saved: ${insertError.message}`);
    }

    // orders.tracking_number keeps pointing at the FIRST parcel so everything
    // that only knows about one waybill (vendor dashboard, returns, invoice,
    // cancel gating) keeps working. Later parcels live in order_shipments.
    const orderUpdate: Record<string, any> = { status: nextStatus };
    if (isFirst) {
      orderUpdate.tracking_number = result.waybill;
      orderUpdate.courier_name = 'Delhivery';
    }
    const { error: updateError } = await supabase.from('orders').update(orderUpdate).eq('id', orderId);
    if (updateError) throw updateError;

    if (order.customer_email) {
      const { subject, html } =
        isFirst && !isPartial
          ? orderShippedEmail({
              id: order.id,
              customer_name: order.customer_name,
              tracking_number: result.waybill,
              courier_name: 'Delhivery',
              balance_due: isPartialOrder ? codAmount : undefined,
            })
          : orderPartialShippedEmail({
              id: order.id,
              customer_name: order.customer_name,
              shipment_no: shipmentNo,
              waybill: result.waybill,
              courier_name: 'Delhivery',
              shipped_items: shipItems,
              remaining_items: remainingIndexes.map((i) => orderItems[i]),
              next_min_days: nextMinDays,
              next_max_days: nextMaxDays,
              cod_amount: codAmount,
            });
      // Best-effort -- a failed email shouldn't undo the shipment creation.
      sendEmail({ to: order.customer_email, subject, html })
        .then(async (sent) => {
          if (!sent.success) return;
          const nowIso = new Date().toISOString();
          await supabase.from('order_shipments').update({ shipped_email_sent_at: nowIso }).eq('id', insertedShipment.id);
          if (isFirst) await supabase.from('orders').update({ shipped_email_sent_at: nowIso }).eq('id', orderId);
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      waybill: result.waybill,
      status: nextStatus,
      shipment: insertedShipment,
      partial: isPartial,
      remaining_count: remainingIndexes.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create shipment';
    console.error(`[delhivery/create-shipment] threw for order ${orderId}:`, err);
    // Same reasoning as above — 200 status so proxies never swallow the body.
    return NextResponse.json({ success: false, error: message }, { status: 200 });
  }
}
