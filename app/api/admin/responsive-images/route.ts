import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_RESPONSIVE_IMAGES_SETTINGS, type ResponsiveImagesSettings } from '@/lib/responsive-images-flag';

// ---------------------------------------------------------------------
// GET  /api/admin/responsive-images  -> current { enabled }
// POST /api/admin/responsive-images  -> { enabled: boolean } saves it
//
// OFF (default) = every image resolves to its original URL, exactly the
// same as before this feature existed — zero risk.
// ON = the custom image loader starts requesting -sm/-md variants for
// small widths. This is safe to flip at any time (backfilled or not):
// the /media/ proxy falls back to the original file for any image that
// doesn't have a variant yet, so nothing ever breaks or shows blank.
// ---------------------------------------------------------------------

const SETTINGS_KEY = 'responsive_images';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const value = { ...DEFAULT_RESPONSIVE_IMAGES_SETTINGS, ...((data?.value as Partial<ResponsiveImagesSettings>) || {}) };
  return NextResponse.json(value);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: '"enabled" must be a boolean' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: { enabled: body.enabled } }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true, enabled: body.enabled });
}
