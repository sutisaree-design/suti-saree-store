import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import {
  TRACKING_PIXEL_PLACEHOLDER,
  UNSUBSCRIBE_LINK_PLACEHOLDER,
  wrapCampaignLinksForClickTracking,
  resolveSourceStorePlaceholders,
  storeDisplayName,
} from '@/lib/campaign-templates';
import { fetchDripSettings } from '@/lib/woocommerce-automation';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// Sends `html` (with an auto-appended unsubscribe/footer line) to every
// selected imported customer, one email at a time via the store's already
// configured provider (Admin -> Settings -> Email Notifications). Every
// send is logged to woocommerce_campaign_sends so the same subject is
// never re-sent to the same person twice.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { customerIds?: string[]; subject?: string; html?: string; scheduleAfterHours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { customerIds, subject, html, scheduleAfterHours } = body;
  if (!customerIds?.length || !subject || !html) {
    return NextResponse.json({ error: 'customerIds, subject and html are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // A schedule was requested ("send after N hours" in the admin panel):
  // don't send anything now — write one queue row per selected customer
  // instead, and let the daily drip cron (lib/woocommerce-automation.ts,
  // wired into /api/cron/daily-jobs) pick them up once due, same as the
  // automated welcome/follow-up steps and subject to the same daily cap.
  // NOTE: the cron only runs once/day, so "after N hours" really means
  // "on the first cron run after N hours have passed", not to-the-minute.
  if (scheduleAfterHours && scheduleAfterHours > 0) {
    const { data: eligible, error: eligErr } = await supabase
      .from('woocommerce_customers')
      .select('id')
      .in('id', customerIds)
      .eq('opted_out', false);
    if (eligErr) return NextResponse.json({ error: eligErr.message }, { status: 500 });

    const scheduledAt = new Date(Date.now() + scheduleAfterHours * 60 * 60 * 1000).toISOString();
    const rows = (eligible ?? []).map((c) => ({
      customer_id: c.id,
      campaign_type: 'manual',
      subject,
      html,
      scheduled_at: scheduledAt,
      status: 'queued',
    }));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('woocommerce_send_queue').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, queued: rows.length, scheduledAt });
  }

  // opted_out = false is enforced here, in the query, not just filtered out
  // in the admin UI — someone who unsubscribed can never be re-included in
  // a send, even if an old customerIds list (e.g. a saved selection) still
  // has them in it.
  const { data: customers, error } = await supabase
    .from('woocommerce_customers')
    .select('id, email, source_store_url')
    .in('id', customerIds)
    .eq('opted_out', false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Global fallback store name (Settings -> WooCommerce drip automation),
  // used only for customers whose own source_store_url is unknown -- each
  // customer's own store (when known) always takes priority. See
  // resolveSourceStorePlaceholders' comment in campaign-templates.ts.
  const { sourceStoreName: globalFallbackStoreName } = await fetchDripSettings(supabase);

  // Don't re-send the same subject to someone already emailed for this campaign.
  const { data: alreadySent } = await supabase
    .from('woocommerce_campaign_sends')
    .select('customer_id')
    .eq('subject', subject)
    .eq('status', 'sent')
    .in('customer_id', customerIds);
  const alreadySentIds = new Set((alreadySent ?? []).map((r) => r.customer_id));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const hasPixelPlaceholder = html.includes(TRACKING_PIXEL_PLACEHOLDER);

  for (const c of customers ?? []) {
    if (!c.email || alreadySentIds.has(c.id)) {
      skipped += 1;
      continue;
    }

    // Each send gets its own row id up front so it can double as a unique,
    // unguessable open-tracking id embedded directly in that recipient's
    // copy of the email (a shared/static pixel would only tell us "someone
    // opened one of the emails", not who).
    const sendId = randomUUID();

    // Insert the row *before* sending: the unsubscribe link embedded in
    // this email points at /api/unsubscribe/<sendId>, so that row has to
    // exist first, or a recipient who clicks it within the first moments
    // after the email lands could hit a "link expired" page instead of
    // actually being unsubscribed.
    await supabase.from('woocommerce_campaign_sends').insert({
      id: sendId,
      customer_id: c.id,
      email: c.email,
      subject,
      status: 'sending',
      automation_step: null, // this route is always a manual/one-off send, never the automated drip
    });

    // Resolve this recipient's own source-store wording first (their own
    // source_store_url, falling back to the global drip-settings name,
    // then to no name at all) -- BEFORE the tracking/unsubscribe
    // placeholders, same ordering as sendQueuedEmail in automation.ts.
    let perRecipientHtml = resolveSourceStorePlaceholders(html, storeDisplayName(c.source_store_url) || globalFallbackStoreName || undefined);
    if (hasPixelPlaceholder) {
      perRecipientHtml = perRecipientHtml.replace(
        TRACKING_PIXEL_PLACEHOLDER,
        `<img src="${siteUrl}/api/track/open/${sendId}" width="1" height="1" alt="" style="display:block; border:0;" />`
      );
    }
    // Rewrite real links so a later click can be tied back to this send —
    // must run before the unsubscribe placeholder is swapped (see
    // wrapCampaignLinksForClickTracking's own comment for why).
    perRecipientHtml = wrapCampaignLinksForClickTracking(perRecipientHtml, sendId, siteUrl);
    perRecipientHtml = perRecipientHtml.split(UNSUBSCRIBE_LINK_PLACEHOLDER).join(`${siteUrl}/api/unsubscribe/${sendId}`);

    const result = await sendEmail({ to: c.email, subject, html: perRecipientHtml });
    const status = result.success ? 'sent' : 'skipped' in result && result.skipped ? 'skipped' : 'failed';
    if (status === 'sent') sent += 1;
    else if (status === 'failed') failed += 1;
    else skipped += 1;

    await supabase
      .from('woocommerce_campaign_sends')
      .update({
        status,
        error: result.success ? null : String((result as any).error ?? ''),
      })
      .eq('id', sendId);

    // Gentle pacing so we don't hammer the email provider's rate limit.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return NextResponse.json({ sent, failed, skipped });
}

// GET /api/admin/woocommerce-import/send-campaign — campaign history grouped
// by subject, with open counts, so the admin can see whether a campaign
// (including one sent from the premium template picker) is actually being
// opened, not just "sent".
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('woocommerce_campaign_sends')
    .select('subject, status, opened_at, clicked_at, sent_at')
    .order('sent_at', { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bySubject = new Map<
    string,
    { subject: string; sent: number; failed: number; skipped: number; opened: number; clicked: number; lastSentAt: string }
  >();

  for (const row of data ?? []) {
    const entry = bySubject.get(row.subject) ?? {
      subject: row.subject,
      sent: 0,
      failed: 0,
      skipped: 0,
      opened: 0,
      clicked: 0,
      lastSentAt: row.sent_at,
    };
    if (row.status === 'sent') entry.sent += 1;
    else if (row.status === 'failed') entry.failed += 1;
    else entry.skipped += 1;
    if (row.opened_at) entry.opened += 1;
    if (row.clicked_at) entry.clicked += 1;
    if (row.sent_at > entry.lastSentAt) entry.lastSentAt = row.sent_at;
    bySubject.set(row.subject, entry);
  }

  const campaigns = Array.from(bySubject.values()).sort(
    (a, b) => new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime()
  );

  return NextResponse.json({ campaigns });
}
