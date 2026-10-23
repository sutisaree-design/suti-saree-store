import { NextResponse } from 'next/server';
import { runStuckVendorListingsJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';
// The safety net now retries AI generation (up to ~50s per item) for a
// small batch of recovered products before falling back — needs Vercel
// Hobby's full 60s budget.
export const maxDuration = 60;

// Standalone route for the stuck-vendor-listings safety net (see
// lib/cron-jobs.ts::runStuckVendorListingsJob for what it does and why).
//
// This job also runs once a day as part of /api/cron/daily-jobs, but a
// once-daily cadence isn't great for this specific job — a vendor
// product shouldn't have to wait up to 24 hours to get unstuck. If you
// want it running more often, point an external scheduler (e.g.
// cron-job.org, which is free) at this route every 5-10 minutes. Same
// CRON_SECRET bearer check as the other /api/cron/* routes in this repo.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runStuckVendorListingsJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cron failed' }, { status: 500 });
  }
}
