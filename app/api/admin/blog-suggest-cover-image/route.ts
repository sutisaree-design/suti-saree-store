import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Manual counterpart to the auto-suggestion in generate-blog-post/route.ts —
// used by the "Suggest image from category" button in the add/edit dialog,
// both for new posts written by hand and for fixing old posts that shipped
// with generic/broken stock-photo URLs (see blog-panel.tsx).
export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const categoryName = (body?.category_name as string | undefined)?.trim() || '';

  if (!categoryName) {
    return NextResponse.json(
      { error: 'Pick a related category first, then suggest an image.' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: productRows, error } = await supabase
    .from('products')
    .select('images')
    .eq('category_name', categoryName)
    .eq('approval_status', 'live')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[blog-suggest-cover-image] query failed:', error);
    return NextResponse.json({ error: 'Could not look up product photos.' }, { status: 500 });
  }

  const withImages = (productRows ?? []).find(
    (p: any) => Array.isArray(p.images) && p.images.length > 0
  );

  if (!withImages) {
    return NextResponse.json(
      { error: `No live product photos found in "${categoryName}".` },
      { status: 404 }
    );
  }

  return NextResponse.json({ image: withImages.images[0] });
}
