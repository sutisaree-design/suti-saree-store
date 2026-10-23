// ---------------------------------------------------------------------
// WooCommerce imported-customer drip automation (welcome -> follow-up)
// + the shared product-fetch helper used both by the manual "premium
// template" picker's API route and by this automation.
//
// Flow:
//   1. Every non-opted-out imported customer who has never been sent a
//      "welcome" email gets one queued (woocommerce_send_queue).
//   2. Once a customer's welcome email has actually been SENT, they get a
//      "followup" queued `followup_delay_days` after that send.
//   3. A single daily cron tick (see lib/cron-jobs.ts / vercel.json) works
//      the queue oldest-scheduled-first, stopping once it hits the daily
//      send cap -- so a 2000+ contact list drips out over many days
//      instead of going out in one blast.
//   4. The whole thing is a no-op while `enabled` is false (the admin's
//      on/off toggle).
//
// NOTE ON SCHEDULING GRANULARITY: this app's cron only runs once a day
// (see the comment in app/api/cron/daily-jobs/route.ts -- Vercel Hobby
// plan limit), so "send after N hours" (manual schedule) and the daily
// cap both resolve at day granularity: a queued row becomes eligible once
// its scheduled_at has passed, and is actually sent on the next cron run
// after that, capped at `dailySendCap` sends per run/day.
// ---------------------------------------------------------------------

import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail, resolveEmailConfig } from './email';
import {
  buildPremiumCampaignHtml,
  wrapCampaignLinksForClickTracking,
  resolveSourceStorePlaceholders,
  storeDisplayName,
  TRACKING_PIXEL_PLACEHOLDER,
  UNSUBSCRIBE_LINK_PLACEHOLDER,
  type CampaignProduct,
  type CampaignCategory,
  type CampaignCoupon,
  type CampaignTemplateId,
  pickBestCampaignCoupon,
} from './campaign-templates';
import { randomUUID } from 'crypto';

const SETTINGS_KEY = 'woocommerce_drip_automation_settings';

export interface DripStepSettings {
  templateId: CampaignTemplateId;
  subject: string;
  headline: string;
  subheadline: string;
}

export interface WooCommerceDripSettings {
  enabled: boolean;
  dailySendCap: number; // e.g. 50 -- max campaign emails (manual-scheduled + welcome + followup combined) per cron run/day
  followupDelayDays: number; // e.g. 3 -- days after the welcome email is SENT before the followup queues
  followupRequiresOpen: boolean; // if true (default), skip the follow-up entirely for anyone who never opened the welcome email
  sendHourIST: number; // 0-23, preferred IST hour to actually send in. See runWooCommerceDripJob's isWithinPreferredSendWindow.
  sourceStoreName: string;
  welcome: DripStepSettings;
  followup: DripStepSettings;
}

export const DEFAULT_WOOCOMMERCE_DRIP_SETTINGS: WooCommerceDripSettings = {
  enabled: false,
  dailySendCap: 50,
  followupDelayDays: 3,
  followupRequiresOpen: true,
  sendHourIST: 10, // 10 AM IST by default
  sourceStoreName: '',
  welcome: {
    templateId: 'introduction',
    subject: 'Introducing AruhiHandlooms',
    headline: 'Introducing AruhiHandlooms',
    subheadline: '',
  },
  followup: {
    templateId: 'new-arrivals',
    subject: 'Fresh Off The Loom — New Arrivals',
    headline: 'Fresh Off The Loom — New Arrivals',
    subheadline: '',
  },
};

export async function fetchDripSettings(supabase = getSupabaseAdmin()): Promise<WooCommerceDripSettings> {
  const { data } = await supabase.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (!data?.value) return DEFAULT_WOOCOMMERCE_DRIP_SETTINGS;
  const v = data.value as Partial<WooCommerceDripSettings>;
  return {
    ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS,
    ...v,
    welcome: { ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.welcome, ...(v.welcome ?? {}) },
    followup: { ...DEFAULT_WOOCOMMERCE_DRIP_SETTINGS.followup, ...(v.followup ?? {}) },
  };
}

export async function saveDripSettings(settings: WooCommerceDripSettings, supabase = getSupabaseAdmin()) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Shared product/category fetch for building a premium template's HTML.
// Trimmed version of the logic in
// app/api/admin/woocommerce-import/featured-products/route.ts (kept in
// sync manually since one runs from a browser-triggered API route and the
// other from the server-only cron -- duplicating ~30 lines here is safer
// than routing the cron through an HTTP call to itself).
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// The one coupon (if any) to headline in an automated campaign email:
// must be active AND flagged "Show on Product Page" in Admin > Coupons,
// same eligibility as lib/coupons-api.ts's fetchProductPageCoupons (not
// expired, not past its usage limit), picked with the same
// percentage-preferred/highest-value ranking as the homepage banner.
// Queried directly with the service-role admin client (rather than
// reusing coupons-api.ts, which is a 'use client' module built for the
// browser) since this runs from the server-only cron job.
// ---------------------------------------------------------------------
export async function fetchTopCampaignCoupon(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<CampaignCoupon | null> {
  const { data } = await supabase
    .from('coupons')
    .select('code, discount_type, discount_value, min_order_value, usage_limit, times_used, expires_at')
    .eq('is_active', true)
    .eq('show_on_product_page', true);

  const now = Date.now();
  const eligible = (data ?? []).filter(
    (c: any) =>
      (!c.expires_at || new Date(c.expires_at).getTime() > now) &&
      (c.usage_limit === null || c.times_used < c.usage_limit)
  );
  return pickBestCampaignCoupon(eligible as CampaignCoupon[]);
}

export async function fetchCampaignProductsAndCategories(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  siteUrl: string,
  limit = 6
): Promise<{ products: CampaignProduct[]; categories: CampaignCategory[] }> {
  const PRODUCT_COLUMNS = 'id, name, slug, price, mrp, images, category_name, featured, in_stock';

  const { data: featured } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('featured', true)
    .eq('in_stock', true)
    .not('images', 'eq', '{}')
    .order('updated_at', { ascending: false })
    .limit(limit);
  let products: any[] = featured ?? [];

  if (products.length < limit) {
    const have = new Set(products.map((p) => p.id));
    const { data: fillIn } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('in_stock', true)
      .not('images', 'eq', '{}')
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    for (const p of fillIn ?? []) {
      if (products.length >= limit) break;
      if (!have.has(p.id)) {
        products.push(p);
        have.add(p.id);
      }
    }
  }

  const { data: categoryRows } = await supabase.from('categories').select('id, name, slug').order('name', { ascending: true });
  const categories: CampaignCategory[] = [];
  for (const c of categoryRows ?? []) {
    const { data: catProducts } = await supabase
      .from('products')
      .select('images, featured')
      .eq('category_name', c.name)
      .eq('in_stock', true)
      .not('images', 'eq', '{}')
      .order('featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    const thumb = catProducts?.[0]?.images?.[0] ?? null;
    if (thumb) categories.push({ name: c.name, slug: c.slug, image: thumb, url: `${siteUrl}/category/${c.slug}` });
  }

  const result: CampaignProduct[] = products.slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    mrp: p.mrp,
    image: p.images?.[0] || null,
    category_name: p.category_name,
    url: `${siteUrl}/product/${p.slug}`,
  }));

  return { products: result, categories };
}

// ---------------------------------------------------------------------
// Actually sends one queued row: inserts the woocommerce_campaign_sends
// row up front (so the unsubscribe/click links embedded in the email are
// valid the instant it lands), wraps tracking, sends, then updates status.
// Mirrors app/api/admin/woocommerce-import/send-campaign/route.ts's
// per-recipient logic.
// ---------------------------------------------------------------------
async function sendQueuedEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  queueRow: { id: string; customer_id: string; subject: string; html: string | null; campaign_type: string },
  customerEmail: string,
  siteUrl: string,
  sourceStoreUrl: string | null,
  globalFallbackStoreName: string,
  emailConfig: Awaited<ReturnType<typeof resolveEmailConfig>>
): Promise<'sent' | 'failed' | 'skipped'> {
  const sendId = randomUUID();
  const automationStep = queueRow.campaign_type === 'manual' ? null : queueRow.campaign_type;

  await supabase.from('woocommerce_campaign_sends').insert({
    id: sendId,
    customer_id: queueRow.customer_id,
    email: customerEmail,
    subject: queueRow.subject,
    status: 'sending',
    automation_step: automationStep,
  });

  // The html built when this row was queued is store-agnostic (holds
  // SOURCE_STORE_* placeholders, not a baked-in name) -- resolve them now,
  // per this specific recipient: their own source_store_url first, falling
  // back to the global drip-settings name, then to no name at all.
  let html = resolveSourceStorePlaceholders(queueRow.html ?? '', storeDisplayName(sourceStoreUrl) || globalFallbackStoreName || undefined);
  html = html.replace(
    TRACKING_PIXEL_PLACEHOLDER,
    `<img src="${siteUrl}/api/track/open/${sendId}" width="1" height="1" alt="" style="display:block; border:0;" />`
  );
  html = wrapCampaignLinksForClickTracking(html, sendId, siteUrl);
  html = html.split(UNSUBSCRIBE_LINK_PLACEHOLDER).join(`${siteUrl}/api/unsubscribe/${sendId}`);

  const result = await sendEmail({ to: customerEmail, subject: queueRow.subject, html }, emailConfig);
  const status: 'sent' | 'failed' | 'skipped' = result.success
    ? 'sent'
    : 'skipped' in result && result.skipped
      ? 'skipped'
      : 'failed';

  await supabase
    .from('woocommerce_campaign_sends')
    .update({ status, error: result.success ? null : String((result as any).error ?? '') })
    .eq('id', sendId);

  await supabase
    .from('woocommerce_send_queue')
    .update({ status, send_id: sendId })
    .eq('id', queueRow.id);

  return status;
}

// ---------------------------------------------------------------------
// Is "now" within +/-1 hour (IST) of the admin's chosen send hour?
//
// Vercel's own cron only guarantees firing SOMEWHERE inside the scheduled
// UTC hour (Hobby plan), never to the minute -- so a tight window here
// would fight the platform. +/-1hr absorbs that slack while still keeping
// sends roughly anchored to the hour the admin picked (e.g. 10 AM IST),
// instead of whatever time vercel.json's cron happens to be set to.
//
// `force` bypasses this (used by the "Run Now" button in admin, where the
// person explicitly asked for it to send immediately regardless of hour).
// ---------------------------------------------------------------------
function isWithinPreferredSendWindow(sendHourIST: number): boolean {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC -> IST (UTC+5:30)
  const currentHour = istNow.getUTCHours();
  const diff = Math.min(
    Math.abs(currentHour - sendHourIST),
    24 - Math.abs(currentHour - sendHourIST) // wrap around midnight
  );
  return diff <= 1;
}

// ---------------------------------------------------------------------
// STEP A -- ENQUEUE ONLY (no sending).
//
// Scans up to 5000 customer rows plus two up-to-5000-row .in() lookups.
// That's fine to run ONCE A DAY (called from app/api/cron/daily-jobs,
// itself only triggered once/day -- Vercel Hobby's cron limit) but it
// must NOT be called from the 15-min external cron (woocommerce-drip
// route) any more. It used to be: every 15-min tick re-ran this full
// scan (96x/day), and almost every one of those found nothing new to
// queue (the skip-if-already-queued check just discarded the read) --
// pure wasted Supabase egress/bandwidth against the free-tier quota.
// Splitting the rare, heavy "enqueue" step from the frequent, cheap
// "send" step (STEP B below) is the fix.
// ---------------------------------------------------------------------
export async function runWooCommerceEnqueueJob() {
  const supabase = getSupabaseAdmin();
  const settings = await fetchDripSettings(supabase);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

  if (!settings.enabled) {
    return { skipped: true, reason: 'automation is off', welcomeQueued: 0, followupQueued: 0 };
  }

  // --- 1. Enqueue welcome emails for customers who don't have one yet ---
  const { data: candidates } = await supabase
    .from('woocommerce_customers')
    .select('id')
    .eq('opted_out', false)
    .order('imported_at', { ascending: true })
    .limit(5000);

  const candidateIds = (candidates ?? []).map((c) => c.id);
  let welcomeQueued = 0;
  if (candidateIds.length > 0) {
    const { data: alreadySent } = await supabase
      .from('woocommerce_campaign_sends')
      .select('customer_id')
      .eq('automation_step', 'welcome')
      .in('customer_id', candidateIds);
    const { data: alreadyQueued } = await supabase
      .from('woocommerce_send_queue')
      .select('customer_id')
      .eq('campaign_type', 'welcome')
      .in('status', ['queued', 'sent'])
      .in('customer_id', candidateIds);
    const skip = new Set([...(alreadySent ?? []), ...(alreadyQueued ?? [])].map((r: any) => r.customer_id));
    const needWelcome = candidateIds.filter((id) => !skip.has(id));

    if (needWelcome.length > 0) {
      const { products, categories } = await fetchCampaignProductsAndCategories(supabase, siteUrl, 6);
      const coupon = await fetchTopCampaignCoupon(supabase);
      // Built ONCE, store-agnostic (holds SOURCE_STORE_* placeholders) --
      // the store each customer actually came from is resolved per
      // recipient at actual send time (sendQueuedEmail), not baked in
      // here. See resolveSourceStorePlaceholders' comment for why.
      const html = buildPremiumCampaignHtml({
        templateId: settings.welcome.templateId,
        headline: settings.welcome.headline,
        subheadline: settings.welcome.subheadline || undefined,
        products,
        categories,
        coupon,
      });
      const rows = needWelcome.map((customer_id) => ({
        customer_id,
        campaign_type: 'welcome',
        subject: settings.welcome.subject,
        html,
        scheduled_at: new Date().toISOString(),
        status: 'queued',
      }));
      // Insert in chunks so one giant list doesn't hit a payload limit.
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('woocommerce_send_queue').insert(rows.slice(i, i + 500));
      }
      welcomeQueued = rows.length;
    }
  }

  // --- 2. Enqueue follow-ups for customers whose welcome was sent long enough ago ---
  // Only for people who actually OPENED the welcome email (settings.followupRequiresOpen,
  // on by default) — blindly following up with non-openers is what drives spam
  // complaints/unsubscribes. Anyone who hasn't opened by the cutoff simply never
  // gets a follow-up queued; they still show up in the admin's "Not Opened"
  // audience filter (computed live in the segments endpoint from opened_at) so
  // they can be re-targeted manually with a different subject/channel instead.
  const delayMs = Math.max(0, Number(settings.followupDelayDays) || 0) * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(Date.now() - delayMs).toISOString();
  let dueWelcomeQuery = supabase
    .from('woocommerce_campaign_sends')
    .select('customer_id, sent_at, email, opened_at')
    .eq('automation_step', 'welcome')
    .eq('status', 'sent')
    .lte('sent_at', cutoffIso)
    .limit(5000);
  if (settings.followupRequiresOpen) {
    dueWelcomeQuery = dueWelcomeQuery.not('opened_at', 'is', null);
  }
  const { data: dueWelcomeSends } = await dueWelcomeQuery;

  let followupQueued = 0;
  if (dueWelcomeSends && dueWelcomeSends.length > 0) {
    const dueIds = dueWelcomeSends.map((r) => r.customer_id);
    const { data: alreadySentF } = await supabase
      .from('woocommerce_campaign_sends')
      .select('customer_id')
      .eq('automation_step', 'followup')
      .in('customer_id', dueIds);
    const { data: alreadyQueuedF } = await supabase
      .from('woocommerce_send_queue')
      .select('customer_id')
      .eq('campaign_type', 'followup')
      .in('status', ['queued', 'sent'])
      .in('customer_id', dueIds);
    const { data: optedOutRows } = await supabase.from('woocommerce_customers').select('id').eq('opted_out', true).in('id', dueIds);
    const skip = new Set(
      [...(alreadySentF ?? []), ...(alreadyQueuedF ?? []), ...(optedOutRows ?? []).map((r: any) => ({ customer_id: r.id }))].map(
        (r: any) => r.customer_id
      )
    );
    const needFollowup = dueWelcomeSends.filter((r) => !skip.has(r.customer_id));

    if (needFollowup.length > 0) {
      const { products, categories } = await fetchCampaignProductsAndCategories(supabase, siteUrl, 6);
      const coupon = await fetchTopCampaignCoupon(supabase);
      // Same store-agnostic build as the welcome step above -- resolved
      // per recipient at actual send time.
      const html = buildPremiumCampaignHtml({
        templateId: settings.followup.templateId,
        headline: settings.followup.headline,
        subheadline: settings.followup.subheadline || undefined,
        products,
        categories,
        coupon,
      });
      const rows = needFollowup.map((r) => ({
        customer_id: r.customer_id,
        campaign_type: 'followup',
        subject: settings.followup.subject,
        html,
        scheduled_at: new Date().toISOString(),
        status: 'queued',
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('woocommerce_send_queue').insert(rows.slice(i, i + 500));
      }
      followupQueued = rows.length;
    }
  }

  return { welcomeQueued, followupQueued };
}

// ---------------------------------------------------------------------
// STEP B -- WORK THE QUEUE (send only).
//
// Only reads/writes a handful of already-queued rows -- never touches
// the 27k+ row customer table. Safe (and intended) to hit every 15 min:
// this is what app/api/cron/woocommerce-drip/route.ts calls, triggered
// by cron-job.org. Running it often costs almost nothing against
// Supabase's free-tier egress, unlike STEP A above.
//
// `force`: skip the preferred-send-hour check (used by the admin's "Run
// Now" button, which means "send immediately, I know what I'm doing").
// ---------------------------------------------------------------------
export async function runWooCommerceSendJob(force = false) {
  const supabase = getSupabaseAdmin();
  const settings = await fetchDripSettings(supabase);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

  if (!settings.enabled) {
    return { skipped: true, reason: 'automation is off' };
  }

  const dailyCap = Math.max(1, Number(settings.dailySendCap) || 50);
  const welcomeQueued = 0;
  const followupQueued = 0;

  // --- 3. How much of today's cap is already used (manual immediate sends included) ---
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from('woocommerce_campaign_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', todayStart.toISOString())
    .in('status', ['sent', 'failed']);

  let remaining = dailyCap - (sentToday ?? 0);
  if (remaining <= 0) {
    return { welcomeQueued, followupQueued, sent: 0, failed: 0, skipped: 0, reason: 'daily cap already reached' };
  }

  // Enqueueing above always runs (so the queue keeps filling up correctly
  // no matter when cron fires) -- but actually SENDING only happens near
  // the admin's chosen IST hour, unless this is a forced "Run Now".
  const preferredHour = Math.min(23, Math.max(0, Math.round(Number(settings.sendHourIST) ?? 10)));
  if (!force && !isWithinPreferredSendWindow(preferredHour)) {
    return {
      welcomeQueued,
      followupQueued,
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: `waiting for preferred send hour (${preferredHour}:00 IST, +/-1hr window)`,
    };
  }

  // --- 4. Work the queue, oldest-scheduled-first ("top of the list"), due rows only ---
  // Cap how many emails a SINGLE invocation sends, regardless of how large
  // `remaining` (the full daily cap minus what's already gone out today) is.
  // This route is hit every 15 min by cron-job.org which has a hard 30s
  // timeout. The enqueue step (DB reads for 27k+ customers) takes ~5-15s,
  // leaving ~15s for actual sends. At ~1.5s per send (DB lookup + email API
  // + 150ms pacing), 8 sends = ~12s — safely under 30s even with cold-start.
  // Over a 1hr send window (4 runs of 8 = 32 emails/hr) this easily clears
  // a 300/day cap spread across multiple hours.
  // Note: Vercel continues running even after cron-job.org closes the
  // connection at 30s — emails in-flight will still complete. But keeping
  // the run short means cron-job.org marks it "success" not "timeout".
  const MAX_SEND_PER_RUN = 8;
  const sendBudget = Math.min(remaining, MAX_SEND_PER_RUN);
  const { data: due } = sendBudget > 0
    ? await supabase
        .from('woocommerce_send_queue')
        .select('id, customer_id, subject, html, campaign_type')
        .eq('status', 'queued')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(sendBudget)
    : { data: [] as any[] };

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  if (due && due.length > 0) {
    // Resolved once for the whole batch -- was previously re-fetched from
    // the `settings` table inside sendEmail() for every single recipient.
    const emailConfig = await resolveEmailConfig();

    for (const row of due) {
      const { data: customer } = await supabase
        .from('woocommerce_customers')
        .select('email, opted_out, source_store_url')
        .eq('id', row.customer_id)
        .maybeSingle();

      if (!customer?.email || customer.opted_out) {
        await supabase.from('woocommerce_send_queue').update({ status: 'skipped' }).eq('id', row.id);
        skipped += 1;
        continue;
      }

      const status = await sendQueuedEmail(
        supabase,
        row as any,
        customer.email,
        siteUrl,
        customer.source_store_url ?? null,
        settings.sourceStoreName,
        emailConfig
      );
      if (status === 'sent') sent += 1;
      else if (status === 'failed') failed += 1;
      else skipped += 1;

      // Gentle pacing, same as the manual send-campaign route.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return { welcomeQueued, followupQueued, sent, failed, skipped };
}

// ---------------------------------------------------------------------
// Combined convenience wrapper: enqueue THEN send, in one call. Kept for
// the admin's "Run Now" button (see
// app/api/admin/woocommerce-import/automation/route.ts) where a full
// immediate cycle is wanted on demand.
//
// NEITHER cron route uses this any more -- app/api/cron/daily-jobs calls
// runWooCommerceEnqueueJob() once/day, and app/api/cron/woocommerce-drip
// (hit every 15 min by cron-job.org) calls runWooCommerceSendJob(). See
// the comments on those two functions above for why they were split.
// ---------------------------------------------------------------------
export async function runWooCommerceDripJob(force = false) {
  const enqueueResult = await runWooCommerceEnqueueJob();
  const sendResult = await runWooCommerceSendJob(force);
  const { welcomeQueued: _wq, followupQueued: _fq, ...sendRest } = sendResult as Record<string, unknown>;
  return {
    welcomeQueued: (enqueueResult as any).welcomeQueued ?? 0,
    followupQueued: (enqueueResult as any).followupQueued ?? 0,
    ...sendRest,
  };
}
