import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Toggles the like counter on a product's Reels video. No auth/user
// account required (matches the guest-friendly, localStorage-based
// "have I liked this" tracking on the client — see
// components/product/video-reels.tsx) — this route just needs to move
// the persisted count by exactly one in the requested direction.
//
// Uses the service-role client so anonymous shoppers can like without
// needing a `products` RLS policy that allows public UPDATE (which would
// also let anyone tamper with price/stock/etc via the same table).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const productId = params.id;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  let liked: boolean;
  try {
    const body = await req.json();
    liked = !!body.liked;
  } catch {
    return NextResponse.json({ error: 'Invalid body — expected { liked: boolean }' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Read-modify-write rather than a raw SQL increment expression, since
  // supabase-js's query builder has no first-class "column = column + 1"
  // helper. Fine here: like/unlike clicks are low-frequency, human-paced
  // events (not a hot counter like page views), so the tiny race window
  // between read and write is an acceptable trade-off for staying within
  // plain supabase-js instead of a custom Postgres RPC function.
  const { data: current, error: readError } = await admin
    .from('products')
    .select('video_like_count')
    .eq('id', productId)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: readError?.message ?? 'Product not found' }, { status: 404 });
  }

  const existing = (current.video_like_count as number | null) ?? 0;
  const next = Math.max(0, existing + (liked ? 1 : -1));

  const { error: updateError } = await admin
    .from('products')
    .update({ video_like_count: next })
    .eq('id', productId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ likeCount: next });
}
