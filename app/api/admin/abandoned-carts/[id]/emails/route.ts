import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: emails, error } = await supabase
      .from('abandoned_cart_emails')
      .select('id, sequence_number, subject, coupon_code, sent_at, opened_at, open_count, clicked_at, click_count, converted, converted_at')
      .eq('cart_id', params.id)
      .order('sequence_number', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ emails: emails || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load email history' }, { status: 500 });
  }
}
