import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateReviewToken } from '@/lib/review-link-tokens';
import { getReviewRewardSettings } from '@/lib/review-reward-settings';

// Used by Admin > Orders > "Send delivery message on WhatsApp" (delivered
// orders). Returns the customer's secret, login-free review link
// (/review/[token] -- the same one the "Rate & Review" email uses; the token
// is reused if one already exists) plus the store's current review-reward
// setting, so the WhatsApp message can say "unlock X off".
// Admin-only: the link is a credential for reviewing this order.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase.from('orders').select('id').eq('id', params.id).maybeSingle();
    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const token = await getOrCreateReviewToken(order.id);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
    const settings = await getReviewRewardSettings(supabase);

    return NextResponse.json({
      url: `${siteUrl}/review/${token}`,
      reward: {
        enabled: settings.enabled,
        discountType: settings.discountType,
        discountValue: settings.discountValue,
      },
    });
  } catch (err) {
    console.error('[admin review-link] failed:', err);
    return NextResponse.json({ error: 'Could not create the review link' }, { status: 500 });
  }
}
