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

// GET — list all homepage tiles (admin panel table)
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('homepage_tiles')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ tiles: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load homepage tiles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — create a new homepage tile
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    position,
    title,
    subtitle,
    badge_text,
    price_label,
    image_url,
    cta_label,
    link_type,
    link_value,
    is_active,
  } = body || {};

  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (link_type !== undefined && !LINK_TYPES.includes(link_type)) {
    return NextResponse.json(
      { error: `link_type must be one of: ${LINK_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  try {
    // New tiles default to the end of the list unless a position is given.
    let nextPosition = position;
    if (nextPosition === undefined || nextPosition === null) {
      const { data: maxRow } = await supabase
        .from('homepage_tiles')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      nextPosition = (maxRow?.position ?? -1) + 1;
    }

    const { error } = await supabase.from('homepage_tiles').insert({
      position: nextPosition,
      title: String(title).trim(),
      subtitle: subtitle ?? null,
      badge_text: badge_text ?? null,
      price_label: price_label ?? null,
      image_url: image_url ?? null,
      cta_label: cta_label && String(cta_label).trim() ? String(cta_label).trim() : 'Shop Now',
      link_type: link_type || 'collection',
      link_value: link_value ?? null,
      is_active: is_active ?? true,
    });
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create homepage tile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
