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

// PATCH — full edit, or a partial toggle (is_active)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.position !== undefined) update.position = body.position;
  if (body.image_url !== undefined) {
    if (!body.image_url || !String(body.image_url).trim()) {
      return NextResponse.json({ error: 'image_url cannot be empty' }, { status: 400 });
    }
    update.image_url = String(body.image_url).trim();
  }
  if (body.link_url !== undefined) {
    update.link_url = body.link_url && String(body.link_url).trim() ? String(body.link_url).trim() : null;
  }
  if (body.is_active !== undefined) update.is_active = body.is_active;
  if (body.media_type !== undefined) {
    if (body.media_type !== 'image' && body.media_type !== 'video') {
      return NextResponse.json({ error: "media_type must be 'image' or 'video'" }, { status: 400 });
    }
    update.media_type = body.media_type;
  }
  if (body.poster_url !== undefined) {
    update.poster_url = body.poster_url && String(body.poster_url).trim() ? String(body.poster_url).trim() : null;
  }
  if (body.mobile_image_url !== undefined) {
    update.mobile_image_url =
      body.mobile_image_url && String(body.mobile_image_url).trim() ? String(body.mobile_image_url).trim() : null;
  }
  if (body.mobile_media_type !== undefined) {
    if (body.mobile_media_type !== null && body.mobile_media_type !== 'image' && body.mobile_media_type !== 'video') {
      return NextResponse.json({ error: "mobile_media_type must be 'image', 'video', or null" }, { status: 400 });
    }
    update.mobile_media_type = body.mobile_media_type;
  }
  if (body.mobile_poster_url !== undefined) {
    update.mobile_poster_url =
      body.mobile_poster_url && String(body.mobile_poster_url).trim() ? String(body.mobile_poster_url).trim() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('hero_banners').update(update).eq('id', params.id);
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update hero banner';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('hero_banners').delete().eq('id', params.id);
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete hero banner';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
