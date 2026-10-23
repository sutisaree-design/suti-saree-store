import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/product-social-status
 *
 * Returns:
 *   - statusById: { [product_id]: string | null } — the `social_posted_at`
 *     timestamp (or null if never auto/manually posted, on ANY platform)
 *     for every live product.
 *   - postIdsById: { [product_id]: Record<string, string> } — that
 *     product's `social_post_ids` (facebook_post_id / instagram_media_id /
 *     threads_post_id), used to decide per-platform, independently,
 *     whether each of the three Share buttons in the Manage Products
 *     catalog should show "Share" or "✓ Posted" (with a guarded "Share
 *     again" option).
 */
export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('products')
      .select('id, social_posted_at, social_post_ids')
      .eq('approval_status', 'live');
    if (error) throw error;

    const statusById: Record<string, string | null> = {};
    const postIdsById: Record<string, Record<string, string>> = {};
    for (const row of data ?? []) {
      statusById[row.id] = row.social_posted_at ?? null;
      postIdsById[row.id] = (row.social_post_ids as Record<string, string> | null) ?? {};
    }

    return NextResponse.json({ statusById, postIdsById });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load social status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
