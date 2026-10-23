import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------
// Phase 3B — Vendor "My Orders".
//
// CUSTOMER-DATA MASKING (query-level, not just UI-hide):
// This route selects an EXPLICIT column list from `order_items` only —
// never `select('*')`, never a join into `orders` (which is where
// customer_name/customer_email/customer_phone/shipping_address live).
// order_items itself has no customer column at all, so there is
// nothing to accidentally leak here even if this list is extended later
// — but keep it explicit anyway so that's obvious on every read.
//
// order_items' original anon SELECT policy is fully open (`USING (true)`,
// see the note in the Phase 3A migration), so relying on RLS alone would
// not actually scope this to "this vendor's own rows". We use the
// SERVICE ROLE client instead and filter by vendor_id ourselves — this
// is the "query-level" exclusion your prompt asked for, verified below.
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
  'orders(delivery_status, delivery_status_updated_at)',
].join(', ');

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  // Look up this user's own vendor id via the RLS-authenticated client
  // (own_select_vendors policy already scopes this to their own row).
  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error: vendorErr } = await authedSupabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (vendorErr) {
    return NextResponse.json({ error: vendorErr.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }
  // Phase 4C off-boarding (point 5c): a suspended vendor's dashboard
  // access must actually go away, not just the "Suspend"/"Close Account"
  // button in the admin panel — enforce it here server-side.
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }

  // Now the actual order-item read, via service role, explicitly
  // filtered to this vendor's own id — never the wide-open anon policy.
  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from('order_items')
      .select(VENDOR_ORDER_ITEM_COLUMNS)
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const orders = (data ?? []).map((row: any) => ({
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
      // Live courier status (warehouse -> customer leg) — order-level
      // only, no customer name/phone/address, same masking guarantee as
      // the rest of this route. Null until Admin creates the forward
      // Delhivery shipment for this order.
      delivery_status: row.orders?.delivery_status ?? null,
      delivery_status_updated_at: row.orders?.delivery_status_updated_at ?? null,
    }));

    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your orders';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
