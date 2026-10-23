import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// PATCH — persist new `position` values for a set of banners in one
// batch call. Body: { orderedIds: string[] } — index in the array
// becomes the new position.
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { orderedIds } = body || {};

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds must be a non-empty array' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    // Supabase JS has no multi-row batch update, so update each row's
    // position individually and run them concurrently.
    const results = await Promise.all(
      orderedIds.map((id: string, index: number) =>
        supabase.from('hero_banners').update({ position: index }).eq('id', id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reorder hero banners';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
