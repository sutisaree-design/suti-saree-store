import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Category add/rename/delete changes the home page category tiles, the
// /category/[slug] pages, and the /shop filters. Admin writes are rare, so
// purging these few paths costs next to nothing on Vercel's ISR quota.
function revalidateCategories() {
  revalidatePath('/');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/shop');
  revalidatePath('/search');
}


// SECURITY: see app/api/admin/categories/route.ts for the full writeup.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateCategories();
  return NextResponse.json({ category: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('categories').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateCategories();
  return NextResponse.json({ success: true });
}
