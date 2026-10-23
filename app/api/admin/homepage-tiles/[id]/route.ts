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

const LINK_TYPES = ['collection', 'promotion', 'custom_url'];

// PATCH — full edit, or a partial toggle (is_active)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.position !== undefined) update.position = body.position;
  if (body.title !== undefined) update.title = String(body.title).trim();
  if (body.subtitle !== undefined) update.subtitle = body.subtitle;
  if (body.badge_text !== undefined) update.badge_text = body.badge_text;
  if (body.price_label !== undefined) update.price_label = body.price_label;
  if (body.image_url !== undefined) update.image_url = body.image_url;
  if (body.cta_label !== undefined) update.cta_label = String(body.cta_label).trim() || 'Shop Now';
  if (body.link_type !== undefined) {
    if (!LINK_TYPES.includes(body.link_type)) {
      return NextResponse.json(
        { error: `link_type must be one of: ${LINK_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    update.link_type = body.link_type;
  }
  if (body.link_value !== undefined) update.link_value = body.link_value;
  if (body.is_active !== undefined) update.is_active = body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('homepage_tiles').update(update).eq('id', params.id);
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update homepage tile';
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
    const { error } = await supabase.from('homepage_tiles').delete().eq('id', params.id);
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete homepage tile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
