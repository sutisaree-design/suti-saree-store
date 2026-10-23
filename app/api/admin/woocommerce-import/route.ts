import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Give this route as much wall-clock time as the platform allows (Vercel
// Pro/Enterprise honour this up to their plan's cap; Hobby ignores it and
// stays capped at 10s -- which is exactly why the import is now chunked +
// resumable below instead of relying on one call finishing everything).
export const maxDuration = 60;

// SECURITY: this route touches another store's WooCommerce Consumer
// Key/Secret and writes personal data (email/phone) into our DB. It must
// only ever run server-side, gated by the admin session cookie -- never
// call the WooCommerce API or the woocommerce_customers table from a
// client component directly.

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  try {
    // Supabase/PostgREST caps unpaginated selects at a default of 1000 rows
    // (project setting "max rows"), regardless of how many rows actually
    // exist. Without an explicit .range() the UI silently showed "1000"
    // even after every order in the store had genuinely been scanned and
    // upserted -- the data was already correct in the DB, just truncated
    // on the way out. 20,000 comfortably covers any realistic store size;
    // if that's ever not enough, switch this to real cursor pagination.
    // Only select the columns the admin panel actually renders. The table
    // has extra WooCommerce billing/address columns imported for record-
    // keeping that the UI never reads -- select('*') was shipping all of
    // that (per row, x up to 20,000 rows, on every panel load) as pure
    // wasted egress. This trims the payload significantly.
    const { data, error } = await supabase
      .from('woocommerce_customers')
      .select(
        'id, wc_customer_id, name, email, phone, source, source_store_url, imported_at, opted_out, opted_out_at'
      )
      .order('imported_at', { ascending: false })
      .range(0, 19999);
    if (error) throw error;

    // Fetch latest email activity per customer from campaign sends table
    const customerIds = (data ?? []).map((c) => c.id);
    let emailMap = new Map<string, { lastSentAt: string | null; lastOpenedAt: string | null; lastClickedAt: string | null }>();
    if (customerIds.length > 0) {
      // Get the most recent send record per customer
      const { data: sends } = await supabase
        .from('woocommerce_campaign_sends')
        .select('customer_id, sent_at, opened_at, clicked_at')
        .in('customer_id', customerIds)
        .order('sent_at', { ascending: false });

      for (const row of sends ?? []) {
        if (!row.customer_id) continue;
        if (!emailMap.has(row.customer_id)) {
          emailMap.set(row.customer_id, {
            lastSentAt: row.sent_at ?? null,
            lastOpenedAt: row.opened_at ?? null,
            lastClickedAt: row.clicked_at ?? null,
          });
        } else {
          // Already have a more recent sent_at; but check if this row has open/click we haven't captured
          const existing = emailMap.get(row.customer_id)!;
          if (!existing.lastOpenedAt && row.opened_at) existing.lastOpenedAt = row.opened_at;
          if (!existing.lastClickedAt && row.clicked_at) existing.lastClickedAt = row.clicked_at;
        }
      }
    }

    const customers = (data ?? []).map((c) => ({
      ...c,
      last_sent_at: emailMap.get(c.id)?.lastSentAt ?? null,
      last_opened_at: emailMap.get(c.id)?.lastOpenedAt ?? null,
      last_clicked_at: emailMap.get(c.id)?.lastClickedAt ?? null,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load customers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type WooOrder = {
  id: number;
  billing?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  customer_id?: number;
  date_created?: string;
};

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

async function wooFetch(path: string, creds: { storeUrl: string; consumerKey: string; consumerSecret: string }) {
  const base = normalizeUrl(creds.storeUrl);
  const url = `${base}${path}`;

  // Use HTTP Basic Auth (recommended by WooCommerce for HTTPS stores) instead
  // of ?consumer_key=&consumer_secret= in the query string -- some
  // Cloudflare / WAF rules flag secrets-in-the-URL as suspicious and block
  // the request with a "Just a moment..." challenge page before it ever
  // reaches WordPress. A normal browser-like User-Agent avoids the same
  // bot-protection filters that a bare server-to-server request would trip.
  const basicAuth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64');

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const isCloudflareChallenge = body.includes('Just a moment') || body.includes('cf-browser-verification');
    if (isCloudflareChallenge) {
      throw new Error(
        `Cloudflare ne is request ko block kar diya (site "${base}" Cloudflare ke peeche hai). ` +
          `Cloudflare dashboard me /wp-json/wc/* path ke liye Bot Fight Mode/WAF me exception banani hogi.`
      );
    }
    throw new Error(`WooCommerce API error (${res.status}): ${body.slice(0, 300) || res.statusText}`);
  }
  // WooCommerce sends the true total order count on every /orders response
  // via this header, independent of pagination -- capturing it lets us
  // detect a WAF/security-plugin cutting pagination short and silently
  // returning an empty/short page instead of an error (see POST handler).
  const totalHeader = res.headers.get('X-WP-Total');
  const wpTotal = totalHeader ? parseInt(totalHeader, 10) : null;
  const data = await res.json();
  return { data, wpTotal: Number.isFinite(wpTotal) ? wpTotal : null };
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storeUrl?: string; consumerKey?: string; consumerSecret?: string; reset?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const storeUrl = body.storeUrl?.trim();
  const consumerKey = body.consumerKey?.trim();
  const consumerSecret = body.consumerSecret?.trim();

  if (!storeUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: 'storeUrl, consumerKey and consumerSecret are all required' },
      { status: 400 }
    );
  }

  const creds = { storeUrl, consumerKey, consumerSecret };
  const supabase = getSupabaseAdmin();
  const reset = body.reset === true;

  // ---- Resume support --------------------------------------------------
  // Fetching every order page from another site (through Cloudflare) is
  // slow, and serverless functions have a hard execution time limit
  // (10-60s depending on host/plan). Doing all 20-30+ pages in one request
  // was silently getting killed mid-way, leaving an incomplete import with
  // no clear error. Instead: process a small chunk of pages per call, save
  // how far we got in the `settings` table, and let the browser call this
  // route again automatically until every page is done.
  const CURSOR_KEY = 'woocommerce_import_cursor';
  // Confirmed: this deploys to Vercel Hobby, not Netlify (an old, unused
  // netlify.toml in the repo caused an earlier wrong guess here). On Hobby,
  // maxDuration=60 above genuinely applies (Vercel raised Hobby's ceiling
  // to 60s in 2024), so a single call has up to ~60s of wall-clock time.
  // Still keeping PAGES_PER_CALL modest -- a slow/Cloudflare-protected
  // external store can easily take several seconds per page, and staying
  // well under the ceiling leaves headroom for slow pages instead of
  // cutting it close every call. Bump this back up if imports feel slower
  // than necessary; 60s / ~2-4s per page comfortably supports higher than 3.
  const PAGES_PER_CALL = 3;

  let startPage = 1;
  let scannedSoFar = 0; // cumulative across all resumed chunks for this import run
  let expectedTotal: number | null = null; // WooCommerce's own claimed order count (X-WP-Total)
  if (!reset) {
    const { data: cursorRow } = await supabase.from('settings').select('value').eq('key', CURSOR_KEY).maybeSingle();
    const cursor = cursorRow?.value as
      | { storeUrl?: string; page?: number; scannedSoFar?: number; expectedTotal?: number | null }
      | undefined;
    if (cursor?.storeUrl === storeUrl && cursor.page) {
      startPage = cursor.page;
      scannedSoFar = cursor.scannedSoFar ?? 0;
      expectedTotal = cursor.expectedTotal ?? null;
    }
  }

  // Only pull from REAL orders -- never from /wp-json/wc/v3/customers.
  // The customers endpoint returns every *registered* WordPress user with
  // the customer role, which on many stores includes hundreds/thousands of
  // bot spam sign-ups that never bought anything. Building the list from
  // orders instead means every row here is someone who actually checked
  // out -- exactly what the site's own admin "Customers" tab does too.
  //
  // Keyed by email (not order id / customer id), so the same person is
  // never duplicated across pages or across repeated/resumed imports.
  const byEmail = new Map<
    string,
    { name: string | null; email: string; phone: string | null; latestOrderId: number }
  >();

  try {
    let page = startPage;
    let pagesThisCall = 0;
    let done = false;
    let ordersScanned = 0;

    while (pagesThisCall < PAGES_PER_CALL) {
      const { data: orders, wpTotal } = (await wooFetch(
        `/wp-json/wc/v3/orders?per_page=100&page=${page}`,
        creds
      )) as { data: WooOrder[]; wpTotal: number | null };
      pagesThisCall += 1;
      if (page === 1 && wpTotal !== null) expectedTotal = wpTotal;
      if (!Array.isArray(orders) || orders.length === 0) {
        done = true;
        break;
      }
      ordersScanned += orders.length;

      for (const o of orders) {
        const email = (o.billing?.email || '').trim().toLowerCase();
        if (!email) continue;
        const name = [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ').trim() || null;
        const phone = o.billing?.phone?.trim() || null;

        const existing = byEmail.get(email);
        if (existing) {
          // Keep the most complete info seen for this email across all their orders.
          if (!existing.name && name) existing.name = name;
          if (!existing.phone && phone) existing.phone = phone;
        } else {
          byEmail.set(email, { name, email, phone, latestOrderId: o.id });
        }
      }

      if (orders.length < 100) {
        done = true;
        break;
      }
      page += 1;
      if (page > 1000) {
        done = true; // safety cap: 100,000 orders
        break;
      }
    }

    const normalizedStoreUrl = normalizeUrl(storeUrl);

    // A customer's source_store_url should reflect the store they were
    // FIRST imported from, not whichever store happens to be imported
    // most recently. Without this, re-importing Store A after Store B
    // (e.g. the admin re-syncing Store A) would silently flip a Store B
    // customer's attributed store back to A if the same email somehow
    // exists in both -- and even for the normal case (re-importing the
    // same store), it avoids an unnecessary write. So: look up which of
    // this batch's emails already have a store on file, and only fill in
    // source_store_url for emails that don't yet have one.
    const emails = Array.from(byEmail.keys());
    const existingStoreByEmail = new Map<string, string | null>();
    const LOOKUP_BATCH = 500;
    for (let i = 0; i < emails.length; i += LOOKUP_BATCH) {
      const chunk = emails.slice(i, i + LOOKUP_BATCH);
      const { data: existingRows, error: lookupErr } = await supabase
        .from('woocommerce_customers')
        .select('email, source_store_url')
        .in('email', chunk);
      if (lookupErr) throw lookupErr;
      for (const row of existingRows ?? []) {
        existingStoreByEmail.set(row.email as string, (row.source_store_url as string | null) ?? null);
      }
    }

    const rows = Array.from(byEmail.values()).map((r) => ({
      wc_customer_id: `order:${r.latestOrderId}`,
      name: r.name,
      email: r.email,
      phone: r.phone,
      source: 'woocommerce',
      source_store_url: existingStoreByEmail.get(r.email) || normalizedStoreUrl,
      updated_at: new Date().toISOString(),
    }));

    // Upsert whatever we found this call, deduped on email (fixes the
    // "same email twice" bug -- re-importing/resuming updates the existing
    // row for that email instead of creating a second one).
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase.from('woocommerce_customers').upsert(chunk, { onConflict: 'email' });
      if (error) throw error;
    }

    const totalScannedAllTime = scannedSoFar + ordersScanned;

    if (done) {
      // Import finished -- clear the cursor so the next click starts fresh.
      await supabase.from('settings').delete().eq('key', CURSOR_KEY);
    } else {
      await supabase.from('settings').upsert(
        { key: CURSOR_KEY, value: { storeUrl, page, scannedSoFar: totalScannedAllTime, expectedTotal } },
        { onConflict: 'key' }
      );
    }

    // WooCommerce told us up front (via X-WP-Total on page 1) how many
    // orders exist. If pagination says "done" but we scanned meaningfully
    // fewer orders than that, some WAF/security-plugin/host almost
    // certainly cut the REST API off silently (returned an empty/short
    // page with a normal 200 instead of an error) rather than the store
    // genuinely running out of orders. A small buffer (10) allows for
    // trashed/in-between orders that legitimately don't show up.
    let warning: string | null = null;
    if (done && expectedTotal !== null && totalScannedAllTime < expectedTotal - 10) {
      warning =
        `WooCommerce ne bataya tha store me ${expectedTotal} orders hain, lekin sirf ${totalScannedAllTime} hi scan ho paaye ` +
        `import "complete" hone se pehle. Iska matlab REST API pagination beech me hi kisi WAF/security plugin/hosting rate-limit ` +
        `ki wajah se chup-chaap ruk gayi -- store me genuinely utne orders kam nahi hain. WordPress admin -> ` +
        `security/firewall plugin (Wordfence, etc.) ya hosting provider se REST API ke liye rate-limit/pagination cap check karo.`;
    }

    return NextResponse.json({
      done,
      imported: rows.length,
      ordersScanned,
      nextPage: done ? null : page,
      totalScannedAllTime,
      expectedTotal,
      warning,
    });
  } catch (err) {
    // Supabase's PostgrestError (and most other thrown error shapes) is a
    // plain object, NOT an instance of the built-in Error class -- so
    // `err instanceof Error` was always false for DB errors and silently
    // fell back to a hardcoded, meaningless "Import failed" string. Pull
    // `.message` off whatever shape we got instead, so the real reason
    // (bad credentials, Cloudflare block, a Postgres constraint error, etc.)
    // actually reaches the admin.
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Import failed';
    console.error('[woocommerce-import] failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
