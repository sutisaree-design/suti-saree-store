import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';

// ---------------------------------------------------------------------
// Vendor > Settings — right now just the one setting: stock_hold_days
// (how many days a returned/RTO unit sits in the warehouse before it's
// auto-flagged in Return to Vendor). Min 15, max 30, default 15.
//
// GET returns the vendor's current value. PATCH calls the
// update_vendor_stock_hold_days() RPC (see
// supabase/migrations/20260912000000_vendor_stock_hold_and_unsold_return.sql)
// which re-checks auth.uid() + approved status itself and enforces the
// 15-30 range server-side, same trust model as request_vendor_bank_update().
// ---------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data: vendor, error } = await authedSupabase
    .from('vendors')
    .select('stock_hold_days, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }

  return NextResponse.json({ stock_hold_days: vendor.stock_hold_days ?? 15 });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in first' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Number(body?.stock_hold_days);
  if (!Number.isInteger(days) || days < 15 || days > 30) {
    return NextResponse.json({ error: 'Stock hold days must be a whole number between 15 and 30' }, { status: 400 });
  }

  const authedSupabase = await getSupabaseServer();
  const { data, error } = await authedSupabase.rpc('update_vendor_stock_hold_days', { new_days: days });

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to update setting' }, { status: 400 });
  }

  return NextResponse.json({ stock_hold_days: data as number });
}
