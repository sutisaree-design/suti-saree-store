import { NextResponse } from 'next/server';
import { runWooCommerceSendJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';
// Send-only now (see comment below) -- 8 emails * ~1.5s each is well under
// 30s, this budget is just headroom for cold starts / a slow ZeptoMail call.
export const maxDuration = 60;

// SEND-ONLY. The heavy enqueue step (scanning the 27k+ customer table)
// now runs once/day from /api/cron/daily-jobs -> runWooCommerceEnqueueJob
// instead of here. This route only works the already-built queue (a
// handful of rows), which is cheap enough to hit every 15 min without
// burning through Supabase's free-tier egress quota the way the old
// combined enqueue+send job did.
//
// Cron-job.org triggers this every 15 min (during the 1hr send window)
// with a Bearer token. Max timeout on cron-job.org is 30s — the function
// itself may run up to 60s, but cron-job.org will mark it "timeout" after
// 30s. That is FINE: Vercel keeps running the function to completion even
// after cron-job.org closes the connection. Emails still get sent.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runWooCommerceSendJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run WooCommerce send job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
