import { NextResponse } from 'next/server';
import { runForwardShipmentTrackingJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';

// Not directly scheduled by Vercel (Hobby plan only allows 2 crons) —
// this job runs as part of /api/cron/daily-jobs. This route is kept so
// it can still be triggered manually/for testing (e.g. right after
// creating a shipment, to see the live status without waiting a day).
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runForwardShipmentTrackingJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Forward shipment tracking scan failed' }, { status: 500 });
  }
}
