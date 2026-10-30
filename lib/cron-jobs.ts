// ---------------------------------------------------------------------
// Shared cron job logic.
//
// Vercel's Hobby (free) plan only allows 2 cron jobs, and they can only
// run once a day (no hourly crons). This repo has 5 separate jobs, so
// we consolidate them into 2 actual Vercel cron entries (see
// vercel.json) that both run once daily:
//
//   /api/cron/daily-jobs         -> abandoned-carts + email-automation +
//                                    vendor-return-timers + (Mondays only)
//                                    vendor-settlement
//   /api/cron/vendor-order-timeout -> now runs once/day instead of hourly
//
// Each job's logic lives here as a plain function so it can be reused:
//  - by the consolidated daily-jobs route (cron trigger)
//  - by the original /api/cron/<name> routes, which still exist so you
//    can trigger any single job manually (e.g. for testing) without
//    waiting for the schedule.
//
// NOTHING about what each job actually does has changed — this is a
// pure refactor (move code into functions), not a logic change.
// ---------------------------------------------------------------------

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { shipmentLifecycleEmail } from '@/lib/email-templates';
import { getUnshippedItemIndexes } from '@/lib/shipments';
import {
  renderCartRecoveryEmail,
  paymentReminderEmail,
  welcomeSeriesEmail,
  winbackEmail,
  vendorProductLiveEmail,
  vendorProductEditLiveEmail,
} from '@/lib/email-templates';
import { getCartRecoverySequenceSettings } from '@/lib/cart-recovery-settings';
import { createEmailTrackingRecord, instrumentEmailHtml } from '@/lib/email-tracking';
import { publishVendorProductWithAI } from '@/lib/vendor-ai-listing';
import { checkPickupStatusForReturn, getReturnAutomationMode } from '@/lib/return-automation';
import { trackDelhiveryShipment } from '@/lib/delhivery-api';
import { recordReturnRiskIncident } from '@/lib/return-risk-api';
import {
  runWooCommerceDripJob as runWooCommerceDripJobImpl,
  runWooCommerceEnqueueJob as runWooCommerceEnqueueJobImpl,
  runWooCommerceSendJob as runWooCommerceSendJobImpl,
} from '@/lib/woocommerce-automation';
import {
  sendArrivingNotification,
  sendOutForDeliveryNotification,
  sendDeliveredNotification,
} from '@/lib/delivery-notifications';
import {
  sendReviewRequestNotification,
  sendReviewReminderNotification,
  hasOrderBeenReviewed,
} from '@/lib/review-notifications';

// -------------------- WooCommerce imported-customer drip --------------------
// Thin wrapper so this job is listed alongside the others here and picked
// up the same way by app/api/cron/daily-jobs/route.ts. Actual logic (queue
// welcome/follow-up emails, work the queue up to the daily cap) lives in
// lib/woocommerce-automation.ts.
export async function runWooCommerceDripJob() {
  return runWooCommerceDripJobImpl();
}

// Heavy (scans up to 5000+ customer rows) -- called ONCE/DAY from
// app/api/cron/daily-jobs. Do not wire this into the 15-min external
// cron; see the comment on runWooCommerceEnqueueJob in
// lib/woocommerce-automation.ts for why.
export async function runWooCommerceEnqueueJob() {
  return runWooCommerceEnqueueJobImpl();
}

// Cheap (only touches already-queued rows) -- safe to call every 15 min.
// This is what app/api/cron/woocommerce-drip (hit by cron-job.org) uses.
export async function runWooCommerceSendJob(force = false) {
  return runWooCommerceSendJobImpl(force);
}

// ----------------------------- Abandoned carts -----------------------------
// Sends up to 3 recovery emails per cart (a "sequence"), instead of the
// single one-off email this job used to send. Which steps are enabled,
// their delay, and any custom subject/html/coupon per step live in
// `settings.cart_recovery_sequence_settings` -- see
// lib/cart-recovery-settings.ts and Admin -> Abandoned Carts ->
// Sequence Settings. Every send is logged to `abandoned_cart_emails`
// (see migration 20260928010000_cart_recovery_sequence.sql) with a
// tracking token so opens/clicks can be measured.
//
// cart.recovery_stage tracks how many emails have gone out so far (0,
// 1, 2 or 3) -- step N only fires for carts currently at stage N-1.
// recovery_email_sent / recovery_email_sent_at are still kept in sync
// (recovery_email_sent = recovery_stage > 0) for anything else reading
// those columns.
export async function runAbandonedCartsJob() {
  // SECURITY/FIX: abandoned_carts is now locked to service_role only
  // (see 20260826020000_lock_newsletter_abandoned_stock_pii.sql) since
  // no client component ever needed anon access to it. This job — and
  // app/api/cart-track/route.ts — now use the admin client instead.
  const supabase = getSupabaseAdmin();
  const settings = await getCartRecoverySequenceSettings(supabase);

  if (!settings.enabled) {
    return { checked: 0, sent: 0 };
  }

  const { data: carts, error } = await supabase
    .from('abandoned_carts')
    .select('*')
    .lt('recovery_stage', 3)
    .eq('recovered', false)
    .not('email', 'is', null);

  if (error) throw error;

  let checked = 0;
  let sent = 0;
  const now = Date.now();

  for (const cart of carts || []) {
    const stage = cart.recovery_stage || 0;
    const step = settings.steps[stage]; // stage 0 -> step 1, stage 1 -> step 2, stage 2 -> step 3
    if (!step || !step.enabled) continue;

    // Step 1 counts down from the cart going stale; steps 2 & 3 count
    // down from the previous email in the sequence actually going out.
    const anchor = stage === 0 ? cart.last_activity_at : cart.recovery_email_sent_at;
    if (!anchor) continue;
    const dueAt = new Date(anchor).getTime() + step.delay_hours * 60 * 60 * 1000;
    if (dueAt > now) continue;

    checked++;
    const sequenceNumber = stage + 1;
    const { subject, html } = renderCartRecoveryEmail(
      { items: Array.isArray(cart.items) ? cart.items : [], cart_value: cart.cart_value },
      step,
      sequenceNumber
    );

    let finalHtml = html;
    try {
      const token = await createEmailTrackingRecord({
        cartId: cart.id,
        sequenceNumber,
        subject,
        couponCode: step.coupon_code,
      });
      finalHtml = instrumentEmailHtml(html, token);
    } catch (err) {
      console.error('[abandoned-carts] failed to create tracking record:', err);
    }

    const result = await sendEmail({ to: cart.email, subject, html: finalHtml });
    if (result.success) {
      await supabase
        .from('abandoned_carts')
        .update({
          recovery_stage: sequenceNumber,
          recovery_email_sent: true,
          recovery_email_sent_at: new Date().toISOString(),
        })
        .eq('id', cart.id);
      sent++;
    }
  }

  return { checked, sent };
}

// ------------------------- Payment reminder (abandoned online orders) -------------------------
// Different from runAbandonedCartsJob above: that one fires for carts that
// never reached checkout (no `orders` row yet). This one fires for orders
// that DID get created by place_order_with_items() -- stock reserved,
// address saved, razorpay_order_id issued -- but the customer closed the
// Razorpay popup (or their payment failed) and never retried. Those orders
// sit at status: 'pending' forever with no follow-up otherwise.
export async function runPaymentReminderJob() {
  const supabase = getSupabaseAdmin();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, items, total_amount, online_payment_discount, customer_name, customer_email, created_at, payment_method, advance_amount')
    .eq('status', 'pending')
    .neq('payment_method', 'cod')
    .or('razorpay_order_id.not.is.null,cashfree_order_id.not.is.null')
    .not('customer_email', 'is', null)
    .is('payment_reminder_sent_at', null)
    .lte('created_at', thirtyMinAgo);

  if (error) throw error;

  let sent = 0;
  for (const order of orders || []) {
    const { subject, html } = paymentReminderEmail({
      id: order.id,
      items: Array.isArray(order.items) ? order.items : [],
      total_amount: order.total_amount,
      online_payment_discount: order.online_payment_discount,
      customer_name: order.customer_name,
      payment_method: order.payment_method,
      advance_amount: order.advance_amount,
    });
    const result = await sendEmail({ to: order.customer_email as string, subject, html });
    if (result.success) {
      await supabase
        .from('orders')
        .update({ payment_reminder_sent_at: new Date().toISOString() })
        .eq('id', order.id);
      sent++;
    }
  }

  return { checked: orders?.length || 0, sent };
}

// ----------------------------- Email automation -----------------------------
const DEFAULT_SETTINGS = {
  welcome_enabled: false,
  welcome_delay_hours: 1,
  welcome_coupon_code: 'WELCOME10',
  winback_enabled: false,
  winback_days_inactive: 45,
  winback_coupon_code: 'COMEBACK15',
};

export async function runEmailAutomationJob() {
  // FIX: this background job has no logged-in user/session, so once
  // `orders` SELECT was locked to `TO authenticated` only (see
  // 20260827000000_lock_orders_order_items_pii.sql), the win-back
  // query below silently returned zero rows using the anon client —
  // win-back emails stopped sending with no visible error. A
  // background job should always use the admin client; it never has
  // real user auth context for RLS to check against anyway.
  const supabase = getSupabaseAdmin();
  let welcomeSent = 0;
  let winbackSent = 0;

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'email_automation_settings')
    .maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRow?.value || {}) };

  // ---------------- Welcome series ----------------
  if (settings.welcome_enabled) {
    const admin = getSupabaseAdmin();
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 200 });
    const cutoff = Date.now() - settings.welcome_delay_hours * 60 * 60 * 1000;
    const windowStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const candidates = (userList?.users || []).filter((u) => {
      const createdAt = new Date(u.created_at).getTime();
      return createdAt <= cutoff && createdAt >= windowStart && u.email;
    });

    for (const u of candidates) {
      const email = (u.email || '').toLowerCase();
      const { data: existing } = await supabase
        .from('email_automation_log')
        .select('id')
        .eq('email', email)
        .eq('automation_type', 'welcome')
        .maybeSingle();
      if (existing) continue;

      const { subject, html } = welcomeSeriesEmail({
        full_name: (u.user_metadata as any)?.full_name,
        coupon_code: settings.welcome_coupon_code,
      });
      const result = await sendEmail({ to: email, subject, html });
      if (result.success) {
        await supabase
          .from('email_automation_log')
          .insert({ email, user_id: u.id, automation_type: 'welcome' });
        welcomeSent++;
      }
    }
  }

  // ---------------- Win-back ----------------
  if (settings.winback_enabled) {
    const cutoffDate = new Date(
      Date.now() - settings.winback_days_inactive * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: orders } = await supabase
      .from('orders')
      .select('customer_email, customer_name, user_id, created_at')
      .not('customer_email', 'is', null)
      .order('created_at', { ascending: false });

    const lastOrderByEmail = new Map<string, { date: string; name: string | null; userId: string | null }>();
    for (const o of orders || []) {
      const email = (o.customer_email || '').toLowerCase().trim();
      if (!email || lastOrderByEmail.has(email)) continue;
      lastOrderByEmail.set(email, { date: o.created_at, name: o.customer_name, userId: o.user_id });
    }

    for (const [email, info] of Array.from(lastOrderByEmail)) {
      if (info.date > cutoffDate) continue;

      const { data: existing } = await supabase
        .from('email_automation_log')
        .select('id')
        .eq('email', email)
        .eq('automation_type', 'winback')
        .maybeSingle();
      if (existing) continue;

      const { subject, html } = winbackEmail({
        full_name: info.name || undefined,
        coupon_code: settings.winback_coupon_code,
      });
      const result = await sendEmail({ to: email, subject, html });
      if (result.success) {
        await supabase
          .from('email_automation_log')
          .insert({ email, user_id: info.userId, automation_type: 'winback' });
        winbackSent++;
      }
    }
  }

  return { welcomeSent, winbackSent };
}

// ----------------------------- Vendor order timeout -----------------------------
export async function runVendorOrderTimeoutJob() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  let cancelled = 0;
  const errors: string[] = [];

  const { data: overdueItems, error } = await supabase
    .from('order_items')
    .select('id, order_id, product_name, quantity, vendor_id, price')
    .eq('stage', 'placed')
    .not('vendor_id', 'is', null)
    .not('vendor_accept_deadline', 'is', null)
    .lte('vendor_accept_deadline', nowIso);

  if (error) throw error;

  for (const item of overdueItems ?? []) {
    try {
      const { error: restockError } = await supabase.rpc('restock_order_item', {
        p_order_item_id: item.id,
      });
      if (restockError) throw restockError;

      const { error: updateError } = await supabase
        .from('order_items')
        .update({ stage: 'cancelled' })
        .eq('id', item.id);
      if (updateError) throw updateError;

      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, business_name, email, whatsapp, missed_order_count')
        .eq('id', item.vendor_id)
        .maybeSingle();

      if (vendor) {
        await supabase
          .from('vendors')
          .update({ missed_order_count: (vendor.missed_order_count ?? 0) + 1 })
          .eq('id', vendor.id);

        if (vendor.email) {
          await sendEmail({
            to: vendor.email,
            subject: `Order auto-cancelled — accept window missed`,
            html: `<p>Namaste ${vendor.business_name},</p><p>Order item "${item.product_name}" (qty ${item.quantity}) auto-cancel ho gaya hai kyunki accept-window ke andar accept nahi kiya gaya. Stock wapas add kar diya gaya hai.</p><p>Agar ye baar-baar ho raha hai, kripya apni order-accept response time improve karein.</p>`,
          }).catch(() => {});
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `[vendor-whatsapp placeholder] to ${vendor.whatsapp || 'N/A'}: Order "${item.product_name}" auto-cancelled, accept window missed.`
          );
        }
      }

      const { data: order } = await supabase
        .from('orders')
        .select('customer_email, customer_name, payment_method')
        .eq('id', item.order_id)
        .maybeSingle();

      if (order?.customer_email) {
        await sendEmail({
          to: order.customer_email,
          subject: `Update on your order — an item was cancelled`,
          html: `<p>Hi ${order.customer_name || ''},</p><p>Unfortunately "${item.product_name}" (qty ${item.quantity}) from your order could not be processed in time and has been cancelled.${
            order.payment_method === 'cod'
              ? ''
              : ' Your refund for this item will be processed shortly.'
          }</p><p>We're sorry for the inconvenience.</p>`,
        }).catch(() => {});
      }

      cancelled += 1;
    } catch (itemErr: any) {
      errors.push(`order_item ${item.id}: ${itemErr?.message || itemErr}`);
    }
  }

  return { cancelled, checked: overdueItems?.length ?? 0, errors };
}

// ----------------------------- Vendor return timers -----------------------------
export async function runVendorReturnTimersJob() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('run_return_to_vendor_scan');
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    never_sold_flagged: row?.never_sold_flagged ?? 0,
    cancelled_returned_flagged: row?.cancelled_returned_flagged ?? 0,
  };
}

// ----------------------------- Vendor stock-hold timers -----------------------------
// Opens a hold the moment a unit comes back to the warehouse (return or
// RTO), auto-resolves it if a repeat order for the same product shows
// up, and flags it into Return to Vendor once the vendor's own
// configured hold window (15-30 days) runs out with nothing resold.
// See supabase/migrations/20260912000000_vendor_stock_hold_and_unsold_return.sql
export async function runVendorStockHoldScanJob() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('run_vendor_return_hold_scan');
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    holds_opened: row?.holds_opened ?? 0,
    holds_resolved_resold: row?.holds_resolved_resold ?? 0,
    holds_flagged: row?.holds_flagged ?? 0,
  };
}

// ----------------------------- Stuck vendor listings (safety net) -----------------------------
// Vendor products go to 'pending_review' right after creation (or after an
// edit), and are supposed to flip to 'live' once /api/vendor/ai-process/[id]
// finishes. If that route's function gets killed mid-flight (e.g. Vercel
// Hobby's 60s function budget) or the client's fire-and-forget call never
// lands, a product can get stuck in pending_review forever.
//
// This job is the safety net: anything that's been pending_review for
// longer than STUCK_MINUTES gets recovered. It used to just force
// `approval_status: 'live'` with no other changes, which meant a stuck
// listing went live PERMANENTLY with the vendor's raw placeholder
// name/slug and no AI description/highlights — the AI step was simply
// skipped, not retried. It now actually retries AI generation first (via
// the same publishVendorProductWithAI helper the normal ai-process route
// uses), so a listing that got stuck still ends up with its real
// generated title, matching slug, description and highlights — it only
// falls back to a bare publish if the AI call itself genuinely fails
// (e.g. NVIDIA_API_KEY missing, model error).
//
// AI recovery is capped to a small batch per run (STUCK_AI_BATCH_LIMIT) —
// each AI call can take up to ~50s, and this job also runs inline from
// page loads (see app/api/vendor/products/route.ts) and alongside other
// jobs in /api/cron/daily-jobs, both of which need to stay within Vercel's
// function time budget. Anything beyond the batch on a given run still
// gets a bare publish so nothing is ever left stuck indefinitely — it
// will simply get the AI treatment on the NEXT run instead (oldest-first).
const STUCK_MINUTES = 10;
// Lowered from 3 to 1: cron-job.org (the external scheduler hitting
// /api/cron/daily-jobs every 15 min) has a hard 30s request timeout that
// can't be raised. Each AI recovery call can take up to ~50s, so even one
// call risks a timeout there — 3 sequential calls made it near-certain.
// The job itself still isn't lossy: anything beyond this batch falls back
// to a bare publish and gets AI treatment on a later run (oldest-first).
const STUCK_AI_BATCH_LIMIT = 1;

export async function runStuckVendorListingsJob() {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

  const { data: stuckProducts, error } = await supabase
    .from('products')
    .select('id, name, fabric, category_name, images, slug, vendor_id, vendor_edit_count, approval_status_changed_at')
    .eq('approval_status', 'pending_review')
    .lte('approval_status_changed_at', cutoff)
    .order('approval_status_changed_at', { ascending: true });

  if (error) throw error;

  const toRecoverWithAI = (stuckProducts ?? []).slice(0, STUCK_AI_BATCH_LIMIT);
  const toBarePublish = (stuckProducts ?? []).slice(STUCK_AI_BATCH_LIMIT);

  let published = 0;
  const errors: string[] = [];

  // Preload vendor contact info for the batch that's getting the email
  // notification (same notification the normal ai-process route sends).
  const vendorIds = Array.from(new Set(toRecoverWithAI.map((p) => p.vendor_id).filter(Boolean)));
  const vendorMap = new Map<string, { email: string; displayName: string }>();
  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, email, business_name, owner_name')
      .in('id', vendorIds);
    for (const v of vendors ?? []) {
      vendorMap.set(v.id, {
        email: (v.email || '').trim(),
        displayName: v.owner_name || v.business_name || 'Vendor',
      });
    }
  }

  for (const product of toRecoverWithAI) {
    try {
      // A row that's been edited before (vendor_edit_count > 0) is being
      // re-processed as an edit — same rule as the normal ai-process
      // route: keep its existing slug, don't re-run the unique-title check.
      const isEdit = Number(product.vendor_edit_count ?? 0) > 0;
      const { finalName, aiApplied } = await publishVendorProductWithAI(supabase, product, isEdit);
      if (!aiApplied) {
        errors.push(`product ${product.id}: AI unavailable/failed, published with basic fields only`);
      }
      published++;

      const vendorInfo = product.vendor_id ? vendorMap.get(product.vendor_id) : undefined;
      if (vendorInfo?.email) {
        const emailInput = { vendorName: vendorInfo.displayName, productName: finalName || product.name };
        const { subject, html } = isEdit
          ? vendorProductEditLiveEmail(emailInput)
          : vendorProductLiveEmail(emailInput);
        await sendEmail({ to: vendorInfo.email, subject, html }).catch((emailErr) => {
          console.error('[runStuckVendorListingsJob] email send failed for', vendorInfo.email, emailErr);
        });
      }

      // Social posting is no longer automatic — even for listings recovered
      // by this safety-net job. Facebook/Instagram/Threads posting only
      // happens when the admin clicks the Share button on the product.
    } catch (itemErr: any) {
      errors.push(`product ${product.id}: ${itemErr?.message || itemErr}`);
      // Even if the AI-recovery path itself threw, don't leave the row
      // stuck — fall back to a bare publish.
      try {
        await supabase.from('products').update({ approval_status: 'live' }).eq('id', product.id);
        published++;
      } catch (fallbackErr: any) {
        errors.push(`product ${product.id}: fallback publish also failed: ${fallbackErr?.message || fallbackErr}`);
      }
    }
  }

  for (const product of toBarePublish) {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ approval_status: 'live' })
        .eq('id', product.id);
      if (updateError) throw updateError;
      published++;
    } catch (itemErr: any) {
      errors.push(`product ${product.id}: ${itemErr?.message || itemErr}`);
    }
  }

  // 'awaiting_stock' was the old manual-review flow's holding status
  // (Admin > Vendor Submissions > "Approve"). That manual gate has been
  // removed — nothing sets this status anymore — but nothing ever moved
  // 'awaiting_stock' rows to 'live' either, so any product an admin had
  // previously approved under the old flow was stuck there permanently.
  // Publish those immediately (no time threshold needed; this status is
  // fully retired going forward, so anything sitting here is legacy).
  const { data: awaitingStockProducts, error: awaitingErr } = await supabase
    .from('products')
    .select('id, name, vendor_id')
    .eq('approval_status', 'awaiting_stock');

  if (awaitingErr) throw awaitingErr;

  let publishedFromAwaitingStock = 0;
  for (const product of awaitingStockProducts ?? []) {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ approval_status: 'live' })
        .eq('id', product.id);
      if (updateError) throw updateError;
      publishedFromAwaitingStock++;
    } catch (itemErr: any) {
      errors.push(`product ${product.id} (awaiting_stock): ${itemErr?.message || itemErr}`);
    }
  }

  return {
    checked: (stuckProducts?.length ?? 0) + (awaitingStockProducts?.length ?? 0),
    published: published + publishedFromAwaitingStock,
    errors,
  };
}


// ----------------------------- Vendor settlement (weekly) -----------------------------
export async function runVendorSettlementJob() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('run_weekly_vendor_settlement');
  if (error) throw error;

  return {
    settlements_created: data?.length ?? 0,
    settlements: data ?? [],
  };
}

// ----------------------------- Reseller payout — return window -----------------------------
// A reseller's margin sits in 'in_return_window' from the moment their
// order is delivered until the store's return window closes (see
// supabase/migrations/20260803150000_reseller_payout_return_window.sql)
// — only then does it flip to 'eligible' and become payable. This just
// calls the DB function that does that flip; also callable manually
// from the Supabase SQL editor for testing.
export async function runResellerPayoutWindowJob() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('promote_reseller_payouts_after_return_window');
  if (error) throw error;

  return {
    promoted: data?.length ?? 0,
    order_ids: (data ?? []).map((row: { order_id: string }) => row.order_id),
  };
}

// ----------------------------- Affiliate payout — return window -----------------------------
// Exact mirror of runResellerPayoutWindowJob above, for the customer-
// facing Affiliate program. An affiliate order's commission sits in
// 'in_return_window' from the moment the order is delivered until the
// store's return window closes (see
// supabase/migrations/20260913000000_affiliate_program.sql) — only
// then does it flip to 'eligible' and become payable. This just calls
// the DB function that does that flip; also callable manually from the
// Supabase SQL editor for testing.
export async function runAffiliatePayoutWindowJob() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('promote_affiliate_payouts_after_return_window');
  if (error) throw error;

  return {
    promoted: data?.length ?? 0,
    order_ids: (data ?? []).map((row: { order_id: string }) => row.order_id),
  };
}

// ----------------------------- Return pickup tracking -----------------------------
// Polls Delhivery for every return with a reverse-pickup in flight
// (scheduled/picked_up/in_transit) and, once it shows delivered back
// to the warehouse, marks it received and — in automatic mode — fires
// the Razorpay refund. See lib/return-automation.ts for the per-return
// logic; this job just fans it out across all in-flight returns.
export async function runReturnPickupTrackingJob() {
  const supabase = getSupabaseAdmin();

  const { data: returns, error } = await supabase
    .from('returns')
    .select('*')
    .in('pickup_status', ['scheduled', 'picked_up', 'in_transit'])
    .not('pickup_waybill', 'is', null);
  if (error) throw error;

  if (!returns || returns.length === 0) {
    return { checked: 0, received: 0, refunded: 0, errors: [] as string[] };
  }

  const mode = await getReturnAutomationMode(supabase);
  const orderIds = Array.from(new Set(returns.map((r) => r.order_id)));
  const { data: orders } = await supabase
    .from('orders')
    .select(
      'id, customer_name, customer_email, customer_phone, shipping_address, items, total_amount, payment_method, razorpay_payment_id, payment_gateway, cashfree_order_id'
    )
    .in('id', orderIds);
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));

  let received = 0;
  let refunded = 0;
  const errors: string[] = [];

  for (const ret of returns) {
    const order = ordersById.get(ret.order_id);
    if (!order) {
      errors.push(`return ${ret.id}: order ${ret.order_id} not found`);
      continue;
    }
    try {
      const result = await checkPickupStatusForReturn(supabase, ret, order, mode);
      if (result.pickup_status === 'received') received++;
      if (result.refund_triggered) refunded++;
    } catch (err: any) {
      errors.push(`return ${ret.id}: ${err?.message || err}`);
    }
  }

  return { checked: returns.length, received, refunded, errors };
}

// ----------------------- Forward shipment live tracking -----------------------
// Polls Delhivery for every order that has a forward-leg waybill
// (orders.tracking_number, set by Admin -> "Create Shipment") and isn't
// already in a terminal state, then writes the plain-language status
// into orders.delivery_status so both the Admin panel and the Vendor
// dashboard (app/api/vendor/orders — order-level only, no customer
// data) can show a live "where is it" badge without either of them
// calling Delhivery directly.
//
// The FIRST time a shipment's status reads as RTO (Delhivery couldn't
// deliver and is sending it back), this also records a return-risk
// incident against the customer's phone (lib/return-risk-api.ts) — the
// `delivery_status !== 'rto_initiated' && delivery_status !== 'rto_delivered'`
// guard below makes sure that only happens once per order, not on every
// daily poll while the RTO parcel is still in transit back.
export async function runForwardShipmentTrackingJob() {
  const supabase = getSupabaseAdmin();

  // Orders that went out as several parcels (order_shipments) are tracked
  // parcel-by-parcel below. Ordinary single-parcel orders keep the original
  // order-level flow, completely unchanged.
  const splitResult = await runSplitShipmentTracking().catch((err: any) => ({
    checked: 0,
    delivered: 0,
    rto: 0,
    errors: [`split-shipments: ${err?.message || err}`],
    splitOrderIds: new Set<string>(),
  }));

  const { data: allTracked, error } = await supabase
    .from('orders')
    .select(
      'id, customer_phone, tracking_number, status, delivery_status, expected_delivery_date, arriving_email_sent_at, out_for_delivery_email_sent_at'
    )
    .not('tracking_number', 'is', null);
  if (error) throw error;

  // Filtered in JS, not SQL: a plain `.not('delivery_status', 'in', ...)`
  // would also exclude every row where delivery_status is still NULL
  // (SQL's `NULL NOT IN (...)` is NULL, not true) — which is exactly the
  // freshly-shipped orders this job most needs to check.
  const orders = (allTracked || []).filter(
    (o) =>
      o.delivery_status !== 'delivered' &&
      o.delivery_status !== 'rto_delivered' &&
      !splitResult.splitOrderIds.has(o.id)
  );

  if (orders.length === 0) {
    return {
      checked: splitResult.checked,
      delivered: splitResult.delivered,
      rto: splitResult.rto,
      errors: splitResult.errors,
    };
  }

  let delivered = splitResult.delivered;
  let rto = splitResult.rto;
  const errors: string[] = [...splitResult.errors];

  for (const order of orders) {
    try {
      const tracking = await trackDelhiveryShipment(order.tracking_number as string);
      await supabase
        .from('orders')
        .update({ delivery_last_checked_at: new Date().toISOString() })
        .eq('id', order.id);

      // Arriving email: fires once, the first time we learn (or the
      // courier revises) the expected delivery date -- independent of
      // whatever delivery_status ends up being below.
      if (tracking.expectedDeliveryDate && !order.arriving_email_sent_at) {
        sendArrivingNotification(order.id, { expectedDeliveryDate: tracking.expectedDeliveryDate }).catch(
          (err) => errors.push(`order ${order.id} arriving-email: ${err?.message || err}`)
        );
      }

      if (!tracking.tracked || !tracking.currentStatus) continue;

      const statusText = tracking.currentStatus.toLowerCase();
      let nextStatus = order.delivery_status;

      if (statusText.includes('rto')) {
        // Delhivery shows a distinct "RTO Delivered" once it's actually
        // back at our warehouse, vs just "RTO Initiated"/"in transit" —
        // either way it's already a lost/returned forward shipment.
        nextStatus = statusText.includes('deliver') ? 'rto_delivered' : 'rto_initiated';
      } else if (statusText.includes('deliver')) {
        nextStatus = 'delivered';
      } else if (statusText.includes('out for delivery')) {
        nextStatus = 'in_transit';
        // Closest same-day, near-real-time signal the courier gives us --
        // this is the practical stand-in for "shortly before it arrives"
        // (see lib/delivery-notifications.ts for why an exact 30-min
        // countdown isn't possible from courier polling data).
        if (!order.out_for_delivery_email_sent_at) {
          sendOutForDeliveryNotification(order.id).catch((err) =>
            errors.push(`order ${order.id} out-for-delivery-email: ${err?.message || err}`)
          );
        }
      } else if (statusText.includes('transit') || statusText.includes('dispatch') || statusText.includes('pending')) {
        nextStatus = 'in_transit';
      }

      if (nextStatus === order.delivery_status) continue;

      await supabase
        .from('orders')
        .update({ delivery_status: nextStatus, delivery_status_updated_at: new Date().toISOString() })
        .eq('id', order.id);

      const wasAlreadyRto = order.delivery_status === 'rto_initiated' || order.delivery_status === 'rto_delivered';
      if ((nextStatus === 'rto_initiated' || nextStatus === 'rto_delivered') && !wasAlreadyRto) {
        rto++;
        recordReturnRiskIncident(supabase, order.customer_phone, 'rto').catch(() => {});
      }
      if (nextStatus === 'delivered') {
        delivered++;
        // Flips order.status -> 'delivered' too (it only lived in
        // delivery_status until now) and sends the "Delivered!" email via
        // the exact same path as the admin manually picking "delivered"
        // from the Orders dropdown -- so there's only one delivered-email
        // code path total, automatic or manual.
        if (order.status !== 'delivered') {
          sendDeliveredNotification(order.id).catch((err) =>
            errors.push(`order ${order.id} delivered-email: ${err?.message || err}`)
          );
        }
      }
    } catch (err: any) {
      errors.push(`order ${order.id}: ${err?.message || err}`);
    }
  }

  return { checked: orders.length + splitResult.checked, delivered, rto, errors };
}

// ----------------------- Split (partial) shipment tracking -----------------------
// An order is "split" when it has more than one parcel, or its only parcel
// was created as partial (other items still to come). Each parcel has its own
// waybill + status row in order_shipments. The order itself is only marked
// delivered once EVERY item has shipped AND every parcel is delivered.
async function runSplitShipmentTracking() {
  const supabase = getSupabaseAdmin();
  const empty = { checked: 0, delivered: 0, rto: 0, errors: [] as string[], splitOrderIds: new Set<string>() };

  const { data: allShipments, error } = await supabase
    .from('order_shipments')
    .select('*')
    .order('shipment_no', { ascending: true });
  // Table missing (migration not applied yet) -> behave exactly like before.
  if (error || !allShipments) return empty;

  const byOrder = new Map<string, any[]>();
  for (const sh of allShipments) {
    const list = byOrder.get(sh.order_id) ?? [];
    list.push(sh);
    byOrder.set(sh.order_id, list);
  }

  const splitOrderIds = new Set<string>();
  byOrder.forEach((list, orderId) => {
    if (list.length > 1 || list.some((x) => x.is_partial)) splitOrderIds.add(orderId);
  });
  if (splitOrderIds.size === 0) return empty;

  const ids = Array.from(splitOrderIds);
  const { data: orderRows } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_email, customer_name, status, items, delivery_status')
    .in('id', ids);
  const orderById = new Map<string, any>((orderRows || []).map((o: any) => [o.id, o]));

  let checked = 0;
  let delivered = 0;
  let rto = 0;
  const errors: string[] = [];

  for (const orderId of ids) {
    const order = orderById.get(orderId);
    if (!order || ['cancelled', 'failed'].includes(order.status)) continue;
    const shipments = byOrder.get(orderId) ?? [];
    const remainingCount = getUnshippedItemIndexes(order.items, shipments).length;

    for (const sh of shipments) {
      if (sh.delivery_status === 'delivered' || sh.delivery_status === 'rto_delivered') continue;
      checked++;
      try {
        const tracking = await trackDelhiveryShipment(sh.waybill);
        const prevStatus: string | null = sh.delivery_status ?? null;
        const patch: Record<string, any> = { delivery_last_checked_at: new Date().toISOString() };

        if (tracking.expectedDeliveryDate) {
          const d = new Date(tracking.expectedDeliveryDate);
          if (!isNaN(d.getTime())) patch.expected_delivery_date = d.toISOString().slice(0, 10);
        }

        let nextStatus: string | null = sh.delivery_status;
        let isOfd = false;
        if (tracking.tracked && tracking.currentStatus) {
          const t = tracking.currentStatus.toLowerCase();
          if (t.includes('rto')) nextStatus = t.includes('deliver') ? 'rto_delivered' : 'rto_initiated';
          else if (t.includes('deliver')) nextStatus = 'delivered';
          else if (t.includes('out for delivery')) {
            nextStatus = 'in_transit';
            isOfd = true;
          } else if (t.includes('transit') || t.includes('dispatch') || t.includes('pending')) nextStatus = 'in_transit';
        }
        if (nextStatus !== sh.delivery_status) {
          patch.delivery_status = nextStatus;
          patch.delivery_status_updated_at = new Date().toISOString();
        }
        if (isOfd) patch.out_for_delivery = true;
        await supabase.from('order_shipments').update(patch).eq('id', sh.id);
        Object.assign(sh, patch);

        const emailCtx = {
          id: order.id,
          customer_name: order.customer_name,
          shipment_no: sh.shipment_no,
          waybill: sh.waybill,
          courier_name: sh.courier_name,
          shipped_items: Array.isArray(sh.items) ? sh.items : [],
          remaining_count: remainingCount,
          next_min_days: sh.next_shipment_min_days,
          next_max_days: sh.next_shipment_max_days,
        };

        if (isOfd && !sh.out_for_delivery_email_sent_at && order.customer_email) {
          const { subject, html } = shipmentLifecycleEmail({ ...emailCtx, kind: 'out_for_delivery' });
          const sent = await sendEmail({ to: order.customer_email, subject, html }).catch(() => null);
          if (sent?.success) {
            const at = new Date().toISOString();
            await supabase.from('order_shipments').update({ out_for_delivery_email_sent_at: at }).eq('id', sh.id);
            sh.out_for_delivery_email_sent_at = at;
          }
        }

        const isRtoNow = nextStatus === 'rto_initiated' || nextStatus === 'rto_delivered';
        const wasRto = prevStatus === 'rto_initiated' || prevStatus === 'rto_delivered';
        const becameRto = isRtoNow && !wasRto;
        if (becameRto) {
          rto++;
          recordReturnRiskIncident(supabase, order.customer_phone, 'rto').catch(() => {});
        }

        if (nextStatus === 'delivered') {
          delivered++;
          const allShipped = remainingCount === 0;
          const allDelivered = shipments.every((x) => x.delivery_status === 'delivered');
          if (allShipped && allDelivered) {
            // Last parcel in: whole order is delivered. Same path the
            // single-parcel flow uses (flips status + sends "Delivered!").
            await supabase
              .from('orders')
              .update({ delivery_status: 'delivered', delivery_status_updated_at: new Date().toISOString() })
              .eq('id', order.id);
            if (order.status !== 'delivered') {
              await sendDeliveredNotification(order.id).catch((err) =>
                errors.push(`order ${order.id} delivered-email: ${err?.message || err}`)
              );
            }
            await supabase
              .from('order_shipments')
              .update({ delivered_email_sent_at: new Date().toISOString() })
              .eq('id', sh.id);
          } else if (!sh.delivered_email_sent_at && order.customer_email) {
            const { subject, html } = shipmentLifecycleEmail({ ...emailCtx, kind: 'delivered' });
            const sent = await sendEmail({ to: order.customer_email, subject, html }).catch(() => null);
            if (sent?.success) {
              await supabase
                .from('order_shipments')
                .update({ delivered_email_sent_at: new Date().toISOString() })
                .eq('id', sh.id);
            }
          }
        }
      } catch (err: any) {
        errors.push(`order ${orderId} shipment ${sh.waybill}: ${err?.message || err}`);
      }
    }

    // Whole order bounced back only when every parcel did.
    if (
      remainingCount === 0 &&
      shipments.length > 0 &&
      shipments.every((x) => x.delivery_status === 'rto_initiated' || x.delivery_status === 'rto_delivered') &&
      order.delivery_status !== 'rto_initiated' &&
      order.delivery_status !== 'rto_delivered'
    ) {
      await supabase
        .from('orders')
        .update({
          delivery_status: shipments.every((x) => x.delivery_status === 'rto_delivered') ? 'rto_delivered' : 'rto_initiated',
          delivery_status_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    }
  }

  return { checked, delivered, rto, errors, splitOrderIds };
}

// -------------------- Review-request emails --------------------
// Straight after unboxing is the worst moment to ask "how is it?" -- the
// customer hasn't worn/used the thing yet -- so this waits a few days
// after "Delivered" before asking. Tune freely; these are calendar days,
// not a strict SLA.
const REVIEW_REQUEST_DELAY_DAYS = 4;
const REVIEW_REMINDER_DELAY_DAYS = 7; // measured from when the request went out, not from delivery.

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Run once daily (see app/api/cron/daily-jobs/route.ts). Finds every
// delivered order whose "Delivered" email went out REVIEW_REQUEST_DELAY_DAYS+
// ago and that hasn't had a review-request email yet, and sends one. Ordering
// off delivered_email_sent_at (not just status='delivered') means an order
// only enters this funnel once the delivered-lifecycle email has actually
// fired, keeping this in step with the rest of the lifecycle-email log.
export async function runReviewRequestEmailsJob() {
  const supabase = getSupabaseAdmin();
  const cutoff = daysAgoIso(REVIEW_REQUEST_DELAY_DAYS);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'delivered')
    .is('review_request_email_sent_at', null)
    .not('delivered_email_sent_at', 'is', null)
    .lte('delivered_email_sent_at', cutoff);
  if (error) throw error;

  let sent = 0;
  const errors: string[] = [];
  for (const order of orders || []) {
    try {
      const result = await sendReviewRequestNotification(order.id);
      if (result.sent) sent++;
    } catch (err: any) {
      errors.push(`order ${order.id}: ${err?.message || err}`);
    }
  }

  return { checked: (orders || []).length, sent, errors };
}

// Run once daily, same cron. Finds every order whose review-request email
// went out REVIEW_REMINDER_DELAY_DAYS+ ago, hasn't had a reminder yet, and
// -- the whole point of a reminder -- where the customer still hasn't
// actually left a review. sendReviewReminderNotification() re-checks
// hasOrderBeenReviewed() itself right before sending (a review could land
// between this query and that send), this pre-filter just keeps the loop
// from doing pointless work on orders that are obviously already reviewed.
export async function runReviewReminderEmailsJob() {
  const supabase = getSupabaseAdmin();
  const cutoff = daysAgoIso(REVIEW_REMINDER_DELAY_DAYS);

  const { data: candidates, error } = await supabase
    .from('orders')
    .select('id, user_id, items')
    .eq('status', 'delivered')
    .is('review_reminder_email_sent_at', null)
    .not('review_request_email_sent_at', 'is', null)
    .lte('review_request_email_sent_at', cutoff);
  if (error) throw error;

  let sent = 0;
  let skippedAlreadyReviewed = 0;
  const errors: string[] = [];
  for (const order of candidates || []) {
    try {
      if (await hasOrderBeenReviewed(order)) {
        skippedAlreadyReviewed++;
        continue;
      }
      const result = await sendReviewReminderNotification(order.id);
      if (result.sent) sent++;
    } catch (err: any) {
      errors.push(`order ${order.id}: ${err?.message || err}`);
    }
  }

  return { checked: (candidates || []).length, sent, skippedAlreadyReviewed, errors };
}
