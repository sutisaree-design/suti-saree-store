import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Lets a customer (guest or logged-in) fix their own shipping ADDRESS after
// placing an order, as long as it hasn't shipped yet. Deliberately does NOT
// let them change customer_email or customer_phone here -- those are the
// same fields used to verify who someone is (guest order-confirmation
// links, "log in with this email", the courier's delivery contact), so
// letting a stranger with a leaked confirmation link silently swap them
// would effectively hijack the order's notifications/OTP away from the
// real customer. Email/phone changes stay admin-only (see
// app/api/admin/orders/[id]/route.ts), where a trusted staff member can
// apply judgement. Address-only self-service, by contrast, is low-risk: the
// worst case is a misdelivery the admin can still catch before it ships.
const ADDRESS_FIELDS = ['address', 'address2', 'landmark', 'city', 'state', 'pincode', 'country'] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const admin = getSupabaseAdmin();

  const { data: order, error: fetchError } = await admin
    .from('orders')
    .select('id, user_id, customer_email, status, tracking_number, shipping_address')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  // Same trust model as the self-cancel route: a guest order (no user_id)
  // trusts the order UUID itself as the access token (the confirmation page
  // already shows full address/invoice to anyone with the link, no login).
  // An order tied to an account requires that account's session, or a
  // logged-in user whose email matches the order's guest-checkout email.
  if (order.user_id) {
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to edit this order.' }, { status: 401 });
    }
    const ownsByEmail =
      !!order.customer_email && !!user.email && order.customer_email.toLowerCase() === user.email.toLowerCase();
    if (order.user_id !== user.id && !ownsByEmail) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
  }

  // Once a shipment exists (or the order has otherwise moved past the point
  // of being editable), the label/manifest is already built off the old
  // address -- changing it here would just be misleading. Mirrors the
  // admin-panel gate and the self-cancel route's own shipped check.
  const alreadyShipped =
    !!order.tracking_number || order.status === 'shipped' || order.status === 'delivered' || order.status === 'cancelled';
  if (alreadyShipped) {
    return NextResponse.json(
      { error: 'This order can no longer be edited online. Please contact us for help.' },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const incoming = body?.shipping_address;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Missing shipping address.' }, { status: 400 });
  }

  // Whitelist to the known address fields only -- never trust the request
  // body wholesale (e.g. it must never be able to smuggle in customer_email
  // / customer_phone / status / anything else via this endpoint).
  const nextAddress: Record<string, any> = { ...(order.shipping_address || {}) };
  for (const field of ADDRESS_FIELDS) {
    if (typeof incoming[field] === 'string') {
      nextAddress[field] = incoming[field].trim();
    }
  }

  if (!nextAddress.address || !nextAddress.city || !nextAddress.state || !nextAddress.pincode) {
    return NextResponse.json(
      { error: 'Address, city, state and pincode are required.' },
      { status: 400 }
    );
  }

  const { data, error: updateError } = await admin
    .from('orders')
    .update({ shipping_address: nextAddress })
    .eq('id', order.id)
    .select('id, shipping_address')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update address. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, shipping_address: data?.shipping_address ?? nextAddress });
}
