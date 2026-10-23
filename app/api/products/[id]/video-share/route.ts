import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Increments the share counter whenever a shopper taps the share icon on
// a Reels video, regardless of whether they actually complete the native
// share sheet / copy-link afterwards — same "intent counts" convention
// most short-video apps use for their share counters.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const productId = params.id;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: current, error: readError } = await admin
    .from('products')
    .select('video_share_count')
    .eq('id', productId)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: readError?.message ?? 'Product not found' }, { status: 404 });
  }

  const next = ((current.video_share_count as number | null) ?? 0) + 1;

  const { error: updateError } = await admin
    .from('products')
    .update({ video_share_count: next })
    .eq('id', productId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ shareCount: next });
}
