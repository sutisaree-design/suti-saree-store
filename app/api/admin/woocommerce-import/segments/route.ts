import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export type AudienceSegment = 'cold' | 'warm' | 'hot';

// GET /api/admin/woocommerce-import/segments
//
// Classifies every non-opted-out imported customer into:
//   HOT  - clicked into an email AND (bought something afterwards, or
//          visited more than one page on that visit)
//   WARM - clicked into an email (landed on the site) but didn't buy and
//          only looked at one page
//   COLD - never opened any campaign email, or opened but never clicked
//
// Returns a flat { customerId: segment } map (the panel already has the
// full customer list loaded, so it just needs the label per id) plus
// bucket counts for the summary chips.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: customers, error: custErr } = await supabase
    .from('woocommerce_customers')
    .select('id')
    .eq('opted_out', false)
    .limit(20000);
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });

  const allIds = (customers ?? []).map((c) => c.id);
  const segments: Record<string, AudienceSegment> = {};
  for (const id of allIds) segments[id] = 'cold'; // default: nothing has happened yet

  if (allIds.length === 0) {
    return NextResponse.json({ segments, counts: { cold: 0, warm: 0, hot: 0, total: 0 } });
  }

  // Every send this batch of customers has ever received, in chunks (the
  // customer list can run into the thousands and `.in()` has a practical
  // URL-length limit). Pulled without a status filter (unlike before) so
  // the emailSent/emailOpened/emailClicked/emailFailed flags below can be
  // derived from the same rows instead of a second round-trip.
  const CHUNK = 400;
  const allSendRows: {
    id: string;
    customer_id: string;
    status: string;
    opened_at: string | null;
    clicked_at: string | null;
  }[] = [];
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const slice = allIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('woocommerce_campaign_sends')
      .select('id, customer_id, status, opened_at, clicked_at')
      .in('customer_id', slice);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    allSendRows.push(...((data ?? []) as any));
  }

  // emailSent/emailOpened/emailClicked/emailFailed audience chips -- same
  // delivery/engagement status as the Sent/Opened/Clicked/Failed cards
  // above, just as a per-customer flag so it can filter the customer table
  // the way Purchased/Cart abandoners/etc already do.
  const emailSentCustomers = new Set<string>();
  const emailOpenedCustomers = new Set<string>();
  const emailClickedCustomers = new Set<string>();
  const emailFailedCustomers = new Set<string>();
  for (const row of allSendRows) {
    if (row.status === 'sent') emailSentCustomers.add(row.customer_id);
    if (row.status === 'failed') emailFailedCustomers.add(row.customer_id);
    if (row.opened_at) emailOpenedCustomers.add(row.customer_id);
    if (row.clicked_at) emailClickedCustomers.add(row.customer_id);
  }

  const sendRows = allSendRows.filter((r) => r.status === 'sent');
  const clickedSendIds: string[] = [];
  const sendIdToCustomer = new Map<string, string>();
  for (const row of sendRows) {
    sendIdToCustomer.set(row.id, row.customer_id);
    if (row.clicked_at) {
      clickedSendIds.push(row.id);
      // Clicking at least once promotes cold -> warm; may be upgraded to
      // hot below once we look at what happened after the click.
      segments[row.customer_id] = 'warm';
    }
  }

  // Behaviour flags (separate from cold/warm/hot) -- these power the extra
  // "Purchased" / "Added to cart" / "Wishlist" / "Cart abandoners" audience
  // filters. A customer can be in more than one at once (e.g. added to
  // cart AND purchased), so this is a flags object, not another single label.
  const purchasedCustomers = new Set<string>();
  const addedToCartCustomers = new Set<string>();
  const wishlistedCustomers = new Set<string>();
  const beganCheckoutCustomers = new Set<string>();

  if (clickedSendIds.length > 0) {
    const pageCounts = new Map<string, Set<string>>(); // customer_id -> distinct page_path

    for (let i = 0; i < clickedSendIds.length; i += CHUNK) {
      const slice = clickedSendIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('activity_events')
        .select('campaign_send_id, event_type, page_path')
        .in('campaign_send_id', slice);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const ev of data ?? []) {
        const customerId = sendIdToCustomer.get(ev.campaign_send_id as string);
        if (!customerId) continue;
        if (ev.event_type === 'purchase') purchasedCustomers.add(customerId);
        if (ev.event_type === 'add_to_cart') addedToCartCustomers.add(customerId);
        if (ev.event_type === 'wishlist') wishlistedCustomers.add(customerId);
        if (ev.event_type === 'checkout_start') beganCheckoutCustomers.add(customerId);
        if (ev.event_type === 'page_view' && ev.page_path) {
          if (!pageCounts.has(customerId)) pageCounts.set(customerId, new Set());
          pageCounts.get(customerId)!.add(ev.page_path as string);
        }
      }
    }

    for (const customerId of Object.keys(segments)) {
      if (segments[customerId] !== 'warm') continue;
      const purchased = purchasedCustomers.has(customerId);
      const pagesVisited = pageCounts.get(customerId)?.size ?? 0;
      if (purchased || pagesVisited > 1) {
        segments[customerId] = 'hot';
      }
    }
  }

  // Cart abandoners: started checkout (from a tracked campaign click) but
  // never completed a purchase — the classic "email them a nudge" audience.
  const cartAbandonerCustomers = new Set<string>();
  for (const customerId of Array.from(beganCheckoutCustomers)) {
    if (!purchasedCustomers.has(customerId)) cartAbandonerCustomers.add(customerId);
  }

  // "Not opened" welcome email in the last followupDelayDays -- same
  // people the follow-up automation now skips (see followupRequiresOpen).
  // Independent of clicks, so computed straight from campaign_sends.
  const { data: dripSettingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'woocommerce_drip_automation_settings')
    .maybeSingle();
  const followupDelayDays = Math.max(0, Number((dripSettingsRow?.value as any)?.followupDelayDays) || 3);
  const cutoffIso = new Date(Date.now() - followupDelayDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: notOpenedRows } = await supabase
    .from('woocommerce_campaign_sends')
    .select('customer_id')
    .eq('automation_step', 'welcome')
    .eq('status', 'sent')
    .lte('sent_at', cutoffIso)
    .is('opened_at', null)
    .in('customer_id', allIds);
  const notOpenedCustomers = new Set((notOpenedRows ?? []).map((r) => r.customer_id as string));

  const behaviorFlags: Record<
    string,
    {
      purchased: boolean;
      addedToCart: boolean;
      wishlisted: boolean;
      cartAbandoner: boolean;
      notOpenedWelcome: boolean;
      emailSent: boolean;
      emailOpened: boolean;
      emailClicked: boolean;
      emailFailed: boolean;
    }
  > = {};
  for (const id of allIds) {
    behaviorFlags[id] = {
      purchased: purchasedCustomers.has(id),
      addedToCart: addedToCartCustomers.has(id),
      wishlisted: wishlistedCustomers.has(id),
      cartAbandoner: cartAbandonerCustomers.has(id),
      notOpenedWelcome: notOpenedCustomers.has(id),
      emailSent: emailSentCustomers.has(id),
      emailOpened: emailOpenedCustomers.has(id),
      emailClicked: emailClickedCustomers.has(id),
      emailFailed: emailFailedCustomers.has(id),
    };
  }

  const counts = { cold: 0, warm: 0, hot: 0, total: allIds.length };
  for (const s of Object.values(segments)) counts[s] += 1;
  const behaviorCounts = {
    purchased: purchasedCustomers.size,
    addedToCart: addedToCartCustomers.size,
    wishlisted: wishlistedCustomers.size,
    cartAbandoner: cartAbandonerCustomers.size,
    notOpenedWelcome: notOpenedCustomers.size,
    emailSent: emailSentCustomers.size,
    emailOpened: emailOpenedCustomers.size,
    emailClicked: emailClickedCustomers.size,
    emailFailed: emailFailedCustomers.size,
  };

  return NextResponse.json({ segments, counts, behaviorFlags, behaviorCounts });
}
