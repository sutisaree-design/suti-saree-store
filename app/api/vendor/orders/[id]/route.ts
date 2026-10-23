import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { triggerCourierPickup } from '@/lib/vendor-courier';

// ---------------------------------------------------------------------
// Phase 3B — Vendor "My Orders" actions.
//
// All writes go through the SERVICE ROLE client (order_items.stage /
// vendor_id / pickup_* are guarded — see guard_order_item_fulfillment_fields
// in the Phase 3A + 3B migrations, which reject any write to these
// columns from a non-service-role connection). Since the service role
// bypasses RLS entirely, EVERY query below explicitly includes
// `.eq('vendor_id', vendor.id)` in its WHERE clause — this is what
// actually prevents one vendor from touching another vendor's order
// item (IDOR), not RLS.
//
// Actions (body: { action, ...}):
//   accept          -> stage 'placed' -> 'vendor_accepted'
//   reject          -> stage 'placed' -> 'cancelled', stock restocked,
//                       customer notified (same pattern as the Phase 3A
//                       accept-timeout cron)
//   request_pickup  -> only sets pickup_requested_at + calls the
//                       triggerCourierPickup() placeholder (no live
//                       courier call yet, per your instructions) —
//                       surfaces as an admin task via
//                       /api/admin/notifications
//   mark_picked_up  -> stage 'vendor_accepted' -> 'picked_from_vendor',
//                       saves { pickup_photo_url } (mandatory)
// ---------------------------------------------------------------------

const VENDOR_ORDER_ITEM_COLUMNS = [
  'id',
  'order_id',
  'product_name',
  'barcode',
  'quantity',
  'price',
  'stage',
  'vendor_accept_deadline',
  'vendor_accepted_at',
  'pickup_requested_at',
  'pickup_photo_url',
  'created_at',
  'products(images)',
].join(', ');

function shapeRow(row: any) {
  return {
    id: row.id,
    order_id: row.order_id,
    product_name: row.product_name,
    product_image: row.products?.images?.[0] ?? null,
    barcode: row.barcode,
    quantity: row.quantity,
    price: row.price,
    stage: row.stage,
    vendor_accept_deadline: row.vendor_accept_deadline,
    vendor_accepted_at: row.vendor_accepted_at,
    pickup_requested_at: row.pickup_requested_at,
    pickup_photo_url: row.pickup_photo_url,
    created_at: row.created_at,
  };
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await authedSupabase
    .from('vendors')
    .select('id, business_name, pickup_address, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (vendorErr) {
    return NextResponse.json({ error: vendorErr.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }
  // Phase 4C off-boarding (point 5c): a suspended vendor can't act on
  // orders either, not just view them.
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;
  const orderItemId = params.id;

  const admin = getSupabaseAdmin();

  try {
    // Ownership check — the .eq('vendor_id', vendor.id) below is what
    // makes this an IDOR-safe lookup, not just the fact that we know the
    // caller is *a* vendor.
    const { data: existing, error: fetchErr } = await admin
      .from('order_items')
      .select('id, order_id, stage, quantity, product_name, vendor_id')
      .eq('id', orderItemId)
      .eq('vendor_id', vendor.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
    }

    if (action === 'accept') {
      if (existing.stage !== 'placed') {
        return NextResponse.json({ error: `Cannot accept an item in stage "${existing.stage}"` }, { status: 400 });
      }
      const { data: updated, error } = await admin
        .from('order_items')
        .update({ stage: 'vendor_accepted', vendor_accepted_at: new Date().toISOString() })
        .eq('id', orderItemId)
        .eq('vendor_id', vendor.id)
        .select(VENDOR_ORDER_ITEM_COLUMNS)
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, order: shapeRow(updated) });
    }

    if (action === 'reject') {
      if (existing.stage !== 'placed') {
        return NextResponse.json({ error: `Cannot reject an item in stage "${existing.stage}"` }, { status: 400 });
      }

      // Restock first (same order as the accept-timeout cron) — if this
      // throws, skip cancelling rather than cancel-without-restocking.
      const { error: restockError } = await admin.rpc('restock_order_item', {
        p_order_item_id: orderItemId,
      });
      if (restockError) throw restockError;

      const { data: updated, error } = await admin
        .from('order_items')
        .update({ stage: 'cancelled' })
        .eq('id', orderItemId)
        .eq('vendor_id', vendor.id)
        .select(VENDOR_ORDER_ITEM_COLUMNS)
        .single();
      if (error) throw error;

      // Customer notify — best-effort, same tone as the timeout cron.
      const { data: order } = await admin
        .from('orders')
        .select('customer_email, customer_name, payment_method')
        .eq('id', existing.order_id)
        .maybeSingle();
      if (order?.customer_email) {
        sendEmail({
          to: order.customer_email,
          subject: `Update on your order — an item was cancelled`,
          html: `<p>Hi ${order.customer_name || ''},</p><p>Unfortunately "${existing.product_name}" (qty ${existing.quantity}) from your order could not be fulfilled and has been cancelled.${
            order.payment_method === 'cod' ? '' : ' Your refund for this item will be processed shortly.'
          }</p><p>We're sorry for the inconvenience.</p>`,
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, order: shapeRow(updated) });
    }

    if (action === 'request_pickup') {
      if (existing.stage !== 'vendor_accepted') {
        return NextResponse.json(
          { error: 'Accept the order before requesting pickup' },
          { status: 400 }
        );
      }

      const { data: updated, error } = await admin
        .from('order_items')
        .update({ pickup_requested_at: new Date().toISOString() })
        .eq('id', orderItemId)
        .eq('vendor_id', vendor.id)
        .select(VENDOR_ORDER_ITEM_COLUMNS)
        .single();
      if (error) throw error;

      // Placeholder only — no live courier call yet (see file header of
      // lib/vendor-courier.ts). This request itself is what makes the
      // task admin-visible, via /api/admin/notifications.
      triggerCourierPickup({
        order_item_id: orderItemId,
        vendor_business_name: vendor.business_name,
        pickup_address: vendor.pickup_address,
        product_name: existing.product_name,
        quantity: existing.quantity,
      }).catch(() => {});

      return NextResponse.json({ success: true, order: shapeRow(updated) });
    }

    if (action === 'mark_picked_up') {
      if (existing.stage !== 'vendor_accepted') {
        return NextResponse.json(
          { error: `Cannot mark picked up from stage "${existing.stage}"` },
          { status: 400 }
        );
      }
      const pickup_photo_url = String(body?.pickup_photo_url || '').trim();
      if (!pickup_photo_url) {
        return NextResponse.json({ error: 'A handoff photo is required' }, { status: 400 });
      }

      const { data: updated, error } = await admin
        .from('order_items')
        .update({ stage: 'picked_from_vendor', pickup_photo_url })
        .eq('id', orderItemId)
        .eq('vendor_id', vendor.id)
        .select(VENDOR_ORDER_ITEM_COLUMNS)
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, order: shapeRow(updated) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update order item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
