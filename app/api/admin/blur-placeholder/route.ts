import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_BLUR_PLACEHOLDER_SETTINGS,
  coerceBlurPlaceholderSettings,
  type BlurPlaceholderSettings,
} from '@/lib/blur-placeholder-flag';

// ---------------------------------------------------------------------
// GET  /api/admin/blur-placeholder  -> current { shimmer_enabled, real_preview_enabled }
// POST /api/admin/blur-placeholder  -> { shimmer_enabled, real_preview_enabled } saves it
//
// Two independent toggles:
//   shimmer_enabled (default true)      = generic animated shimmer shown
//     while a photo loads and no real preview is being used for it.
//   real_preview_enabled (default true) = whenever a real per-image
//     preview has been generated (see the backfill), show it instead of
//     the shimmer. Turning this off doesn't stop generation, only display.
// Both OFF = no placeholder shown, exactly like before this feature existed.
// ---------------------------------------------------------------------

const SETTINGS_KEY = 'blur_placeholder';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const value = coerceBlurPlaceholderSettings(data?.value as Partial<BlurPlaceholderSettings> | undefined);
  return NextResponse.json(value);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<BlurPlaceholderSettings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.shimmer_enabled !== 'boolean' || typeof body.real_preview_enabled !== 'boolean') {
    return NextResponse.json(
      { error: '"shimmer_enabled" and "real_preview_enabled" must both be booleans' },
      { status: 400 }
    );
  }

  const settings: BlurPlaceholderSettings = {
    shimmer_enabled: body.shimmer_enabled,
    real_preview_enabled: body.real_preview_enabled,
  };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: settings }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true, ...settings });
}
