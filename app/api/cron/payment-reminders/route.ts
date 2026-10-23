import { NextResponse } from 'next/server';
import { runPaymentReminderJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Also runs once/day as part of /api/cron/daily-jobs (see vercel.json), but
// that's too slow for this job specifically -- a customer who abandoned
// payment 5 minutes ago shouldn't wait up to 24h for the reminder email.
// Set up an external trigger (e.g. cron-job.org, same as
// /api/cron/woocommerce-drip) to hit this route every 15-30 min with a
// Bearer ${CRON_SECRET} header for near-real-time reminders.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runPaymentReminderJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run payment reminder job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
