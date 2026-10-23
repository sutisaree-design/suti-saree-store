import { NextResponse } from 'next/server';
import { runVendorReturnTimersJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';

// Not directly scheduled by Vercel anymore (Hobby plan only allows 2
// crons) — this job now runs as part of /api/cron/daily-jobs. This
// route is kept so it can still be triggered manually/for testing.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runVendorReturnTimersJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Return-timer scan failed' }, { status: 500 });
  }
}
