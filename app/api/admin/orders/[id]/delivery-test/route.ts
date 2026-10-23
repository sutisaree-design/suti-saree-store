import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  sendArrivingNotification,
  sendOutForDeliveryNotification,
  sendDeliveredNotification,
} from '@/lib/delivery-notifications';
import {
  sendReviewRequestNotification,
  sendReviewReminderNotification,
} from '@/lib/review-notifications';

// Admin > Orders "Test" panel. Unlike preview-email (which never touches
// the DB or the real customer), these actions are the REAL thing -- they
// update the order and email whatever address is actually on it -- so you
// can walk a real (or test) order through arriving -> out-for-delivery ->
// delivered exactly like the cron job would, on your own schedule, with
// `force: true` letting you resend a step that already went out.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    if (action === 'set_expected_date') {
      if (!body?.date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('orders')
        .update({ expected_delivery_date: body.date })
        .eq('id', params.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'send_arriving') {
      const result = await sendArrivingNotification(params.id, {
        expectedDeliveryDate: body?.date,
        force: !!body?.force,
      });
      return NextResponse.json(result);
    }

    if (action === 'send_out_for_delivery') {
      const result = await sendOutForDeliveryNotification(params.id, { force: !!body?.force });
      return NextResponse.json(result);
    }

    if (action === 'send_delivered') {
      const result = await sendDeliveredNotification(params.id, { force: !!body?.force });
      return NextResponse.json(result);
    }

    if (action === 'send_review_request') {
      const result = await sendReviewRequestNotification(params.id, { force: !!body?.force });
      return NextResponse.json(result);
    }

    if (action === 'send_review_reminder') {
      const result = await sendReviewReminderNotification(params.id, { force: !!body?.force });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
