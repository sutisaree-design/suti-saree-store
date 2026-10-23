import { NextResponse } from 'next/server';
import { runVendorOrderTimeoutJob } from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';

// Vercel Cron (see vercel.json) hits this once a day now — Hobby plan
// doesn't allow hourly crons. (Was hourly before; see git history if
// you upgrade to Pro and want the old cadence back.) Same CRON_SECRET
// bearer check as the other /api/cron/* routes in this repo.
//
// What it does (Phase 3A, item 4 — VENDOR ACCEPT TIMEOUT):
// Finds order_items still in stage 'placed' whose vendor_accept_deadline
// has passed, restocks them, cancels them, and notifies vendor + customer.
// Logic itself is unchanged — see lib/cron-jobs.ts::runVendorOrderTimeoutJob.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runVendorOrderTimeoutJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Cron failed' }, { status: 500 });
  }
}
