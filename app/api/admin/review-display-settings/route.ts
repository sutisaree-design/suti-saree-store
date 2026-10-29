import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mergeReviewDisplaySettings } from '@/lib/review-display-settings';

const KEY = 'review_display_settings';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// GET -- current storefront review display settings
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: mergeReviewDisplaySettings((data?.value as any) ?? null) });
  } catch (err) {
    console.error('[review-display-settings GET] error:', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// PUT -- save settings (values are clamped/sanitised server-side)
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const merged = mergeReviewDisplaySettings(body?.settings || body);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('settings').upsert({ key: KEY, value: merged }, { onConflict: 'key' });
    if (error) throw error;
    return NextResponse.json({ success: true, settings: merged });
  } catch (err) {
    console.error('[review-display-settings PUT] error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
