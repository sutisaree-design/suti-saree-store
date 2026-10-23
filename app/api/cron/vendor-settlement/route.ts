import { NextResponse } from 'next/server';
import { runVendorSettlementJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';

// Not directly scheduled by Vercel anymore (Hobby plan only allows 2
// crons) — this job now runs as part of /api/cron/daily-jobs (only on
// Mondays, to keep the original "weekly" behaviour). This route is
// kept so it can still be triggered manually/for testing.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runVendorSettlementJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Settlement run failed' }, { status: 500 });
  }
}
