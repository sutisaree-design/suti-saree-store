import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// SECURITY: replaces the previous client-side
// `supabase.from('orders').update({ status: 'failed' })`, which used
// the anon key and relied on the (now removed) wide-open
// anon_update_orders RLS policy. Only flips 'pending' -> 'failed', so
// it can't be used to stomp a 'paid' order back to 'failed'.
export async function POST(req: NextRequest) {
  try {
    const { internalOrderId } = await req.json();
    if (!internalOrderId || typeof internalOrderId !== 'string') {
      return NextResponse.json({ error: 'internalOrderId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('orders')
      .update({ status: 'failed' })
      .eq('id', internalOrderId)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark order as failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
