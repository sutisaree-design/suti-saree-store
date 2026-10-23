import { NextResponse } from 'next/server';
import {
  runAbandonedCartsJob,
  runPaymentReminderJob,
  runEmailAutomationJob,
  runVendorReturnTimersJob,
  runVendorStockHoldScanJob,
  runVendorSettlementJob,
  runStuckVendorListingsJob,
  runReturnPickupTrackingJob,
  runForwardShipmentTrackingJob,
  runResellerPayoutWindowJob,
  runAffiliatePayoutWindowJob,
  runWooCommerceEnqueueJob,
  runReviewRequestEmailsJob,
  runReviewReminderEmailsJob,
} from '@/lib/cron-jobs';

export const dynamic = 'force-dynamic';
// runStuckVendorListingsJob (one of the jobs run below) now retries AI
// generation for a small batch of recovered products before falling
// back, which can take a while — give this route the full Vercel Hobby
// budget so it isn't killed mid-batch.
export const maxDuration = 60;

// ---------------------------------------------------------------------
// Consolidated daily cron.
//
// Vercel's Hobby (free) plan allows only 2 cron jobs, running once a
// day each. This repo originally had 5 separate crons, so 4 of them
// (all except vendor-order-timeout, which has its own daily cron) are
// combined here and run one after another.
//
// NOTE: WooCommerce Drip's SENDING half (welcome + follow-up emails)
// is intentionally NOT included here. It is triggered separately every
// 15 min by cron-job.org hitting /api/cron/woocommerce-drip. Keeping it
// out of this route prevents the combined job execution from timing out
// cron-job.org's 30s hard limit.
//
// Its ENQUEUE half (scanning the customer list + queueing welcome/
// follow-up rows) IS included below, once/day, since that part is heavy
// (up to 5000+ customer rows read per run) and gains nothing from
// running any more often than daily -- see the comment on
// runWooCommerceEnqueueJob in lib/woocommerce-automation.ts. Running it
// here instead of on every 15-min tick is what stopped this feature
// from burning through the Supabase free-tier egress quota.
//
// Each job is wrapped in try/catch so one failing job doesn't stop the
// others from running. See vercel.json for the schedule and
// lib/cron-jobs.ts for the actual job logic (unchanged from before).
// ---------------------------------------------------------------------
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: Record<string, any> = {};

  try {
    results.abandonedCarts = await runAbandonedCartsJob();
  } catch (err: any) {
    results.abandonedCarts = { error: err?.message || 'Failed' };
  }

  try {
    // Fallback only — for near-real-time reminders, /api/cron/payment-reminders
    // should be hit every 15-30 min by an external scheduler (see that route).
    results.paymentReminders = await runPaymentReminderJob();
  } catch (err: any) {
    results.paymentReminders = { error: err?.message || 'Failed' };
  }

  try {
    results.emailAutomation = await runEmailAutomationJob();
  } catch (err: any) {
    results.emailAutomation = { error: err?.message || 'Failed' };
  }

  try {
    results.wooCommerceEnqueue = await runWooCommerceEnqueueJob();
  } catch (err: any) {
    results.wooCommerceEnqueue = { error: err?.message || 'Failed' };
  }

  try {
    results.vendorReturnTimers = await runVendorReturnTimersJob();
  } catch (err: any) {
    results.vendorReturnTimers = { error: err?.message || 'Failed' };
  }

  try {
    results.vendorStockHoldScan = await runVendorStockHoldScanJob();
  } catch (err: any) {
    results.vendorStockHoldScan = { error: err?.message || 'Failed' };
  }

  try {
    results.stuckVendorListings = await runStuckVendorListingsJob();
  } catch (err: any) {
    results.stuckVendorListings = { error: err?.message || 'Failed' };
  }

  try {
    results.returnPickupTracking = await runReturnPickupTrackingJob();
  } catch (err: any) {
    results.returnPickupTracking = { error: err?.message || 'Failed' };
  }

  try {
    results.forwardShipmentTracking = await runForwardShipmentTrackingJob();
  } catch (err: any) {
    results.forwardShipmentTracking = { error: err?.message || 'Failed' };
  }

  try {
    results.reviewRequestEmails = await runReviewRequestEmailsJob();
  } catch (err: any) {
    results.reviewRequestEmails = { error: err?.message || 'Failed' };
  }

  try {
    results.reviewReminderEmails = await runReviewReminderEmailsJob();
  } catch (err: any) {
    results.reviewReminderEmails = { error: err?.message || 'Failed' };
  }

  try {
    results.resellerPayoutWindow = await runResellerPayoutWindowJob();
  } catch (err: any) {
    results.resellerPayoutWindow = { error: err?.message || 'Failed' };
  }

  try {
    results.affiliatePayoutWindow = await runAffiliatePayoutWindowJob();
  } catch (err: any) {
    results.affiliatePayoutWindow = { error: err?.message || 'Failed' };
  }

  // Weekly settlement: only run it on Mondays so behaviour matches the
  // old "0 3 * * 1" (weekly, Monday) schedule even though this route
  // itself is hit daily.
  const today = new Date().getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  if (today === 1) {
    try {
      results.vendorSettlement = await runVendorSettlementJob();
    } catch (err: any) {
      results.vendorSettlement = { error: err?.message || 'Failed' };
    }
  } else {
    results.vendorSettlement = { skipped: 'not Monday' };
  }

  return NextResponse.json({ success: true, results });
}
