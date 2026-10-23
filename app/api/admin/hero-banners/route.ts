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

// GET — list all hero banners (admin panel table)
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from('hero_banners')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ banners: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load hero banners';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — create a new hero banner
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { position, image_url, link_url, is_active, media_type, poster_url, mobile_image_url, mobile_media_type, mobile_poster_url } = body || {};

  if (!image_url || !String(image_url).trim()) {
    return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
  }
  if (media_type !== undefined && media_type !== 'image' && media_type !== 'video') {
    return NextResponse.json({ error: "media_type must be 'image' or 'video'" }, { status: 400 });
  }
  if (mobile_media_type !== undefined && mobile_media_type !== null && mobile_media_type !== 'image' && mobile_media_type !== 'video') {
    return NextResponse.json({ error: "mobile_media_type must be 'image', 'video', or null" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  try {
    // New banners default to the end of the list unless a position is given.
    let nextPosition = position;
    if (nextPosition === undefined || nextPosition === null) {
      const { data: maxRow } = await supabase
        .from('hero_banners')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      nextPosition = (maxRow?.position ?? -1) + 1;
    }

    const { error } = await supabase.from('hero_banners').insert({
      position: nextPosition,
      image_url: String(image_url).trim(),
      link_url: link_url && String(link_url).trim() ? String(link_url).trim() : null,
      is_active: is_active ?? true,
      media_type: media_type === 'video' ? 'video' : 'image',
      poster_url: poster_url && String(poster_url).trim() ? String(poster_url).trim() : null,
      mobile_image_url: mobile_image_url && String(mobile_image_url).trim() ? String(mobile_image_url).trim() : null,
      mobile_media_type: mobile_media_type === 'video' ? 'video' : mobile_media_type === 'image' ? 'image' : null,
      mobile_poster_url: mobile_poster_url && String(mobile_poster_url).trim() ? String(mobile_poster_url).trim() : null,
    });
    if (error) throw error;
    revalidatePath('/');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create hero banner';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
