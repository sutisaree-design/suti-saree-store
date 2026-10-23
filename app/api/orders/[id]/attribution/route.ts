import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Stores "which traffic source + device did this order come from" on the
// order (orders.attribution, see supabase/migrations/20261013000000_orders_attribution.sql).
//
// Called fire-and-forget by the storefront right after checkout creates the
// order (lib/attribution.ts -> saveOrderAttribution). Trust model is the same
// as the other guest-order routes: the order UUID is the access token. On top
// of that this route
//   - only accepts a whitelisted, length-capped payload (no free-form JSON),
//   - only ever WRITES ONCE (first write wins) and only within 2 hours of the
//     order being created, so it can't be used to rewrite history later,
//   - never errors loudly: attribution is analytics, it must not matter to
//     the customer or to checkout if it can't be saved.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function str(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

function cleanTouch(t: any) {
  if (!t || typeof t !== 'object') return null;
  const channel = str(t.channel, 40);
  const source = str(t.source, 60);
  const medium = str(t.medium, 30);
  if (!channel || !source || !medium) return null;
  const campaign = str(t.campaign, 120);
  const host = str(t.referrer_host, 100);
  const path = str(t.landing_path, 200).split('?')[0].split('#')[0];
  const atMs = Date.parse(str(t.at, 40));
  return {
    channel,
    source,
    medium,
    ...(campaign ? { campaign } : {}),
    ...(host && /^[a-z0-9.\-]+$/i.test(host) ? { referrer_host: host } : {}),
    landing_path: path.startsWith('/') ? path : '/',
    at: new Date(Number.isFinite(atMs) ? atMs : Date.now()).toISOString(),
  };
}

function cleanDevice(d: any) {
  if (!d || typeof d !== 'object') return null;
  const type = d.type === 'Mobile' || d.type === 'Tablet' || d.type === 'Desktop' ? d.type : null;
  if (!type) return null;
  return { type, os: str(d.os, 20) || 'Other', browser: str(d.browser, 30) || 'Other' };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const first = cleanTouch(body?.attribution?.first);
  const last = cleanTouch(body?.attribution?.last);
  const device = cleanDevice(body?.attribution?.device);
  if (!first || !last || !device) {
    return NextResponse.json({ error: 'Invalid attribution.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from('orders')
    .select('id, created_at, attribution')
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    // Most likely the migration adding orders.attribution hasn't been run yet.
    console.warn('[order-attribution] lookup failed (migration not applied?):', error.message);
    return NextResponse.json({ ok: false });
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.attribution) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (Date.now() - new Date(order.created_at).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ ok: false });
  }

  const { error: updateError } = await admin
    .from('orders')
    .update({ attribution: { first, last, device } })
    .eq('id', params.id);

  if (updateError) {
    console.warn('[order-attribution] update failed:', updateError.message);
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}
