import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getCartRecoverySequenceSettings,
  mergeCartRecoverySequenceSettings,
} from '@/lib/cart-recovery-settings';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  return verifyAdminToken(cookie);
}

export async function GET() {
  const verified = await requireAdmin();
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getCartRecoverySequenceSettings(getSupabaseAdmin());
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const verified = await requireAdmin();
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const settings = mergeCartRecoverySequenceSettings(body?.settings || body);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'cart_recovery_sequence_settings', value: settings }, { onConflict: 'key' });
    if (error) throw error;

    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
