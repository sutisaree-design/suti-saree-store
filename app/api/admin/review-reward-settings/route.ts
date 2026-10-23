import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getReviewRewardSettings,
  saveReviewRewardSettings,
  mergeReviewRewardSettings,
} from '@/lib/review-reward-settings';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  return verifyAdminToken(cookie);
}

// GET -- current settings + a small usage summary for the admin panel
export async function GET() {
  const verified = await requireAdmin();
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const settings = await getReviewRewardSettings(supabase);

    const { count: totalIssued } = await supabase
      .from('review_rewards')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({ settings, stats: { totalIssued: totalIssued ?? 0 } });
  } catch (err) {
    console.error('[review-reward-settings GET] error:', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// PUT -- save settings
export async function PUT(req: Request) {
  const verified = await requireAdmin();
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const merged = mergeReviewRewardSettings(body?.settings || body);
    const supabase = getSupabaseAdmin();
    const saved = await saveReviewRewardSettings(supabase, merged);
    return NextResponse.json({ success: true, settings: saved });
  } catch (err) {
    console.error('[review-reward-settings PUT] error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
