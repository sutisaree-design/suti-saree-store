import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Google Merchant Center "Promotions" feed (tab-separated .txt).
//
// Add this URL in Merchant Center -> Marketing -> Promotions ->
// Add promotions -> "Add promotions from a file" -> "Enter a link to your file":
//   https://www.aruhihandlooms.com/api/promotions-feed
//
// ONLY coupons where Admin -> Coupons -> "Google Promotions" toggle is ON
// (show_in_google_promotions = true) are included. On top of that a coupon
// must be active, not expired and not out of usage.
//
// Always dynamic so toggling a coupon in Admin shows up on Google's next
// fetch (Merchant Center re-fetches every 24 hours).
export const dynamic = 'force-dynamic';

interface CouponRow {
  id: string;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  min_order_value: number | null;
  usage_limit: number | null;
  times_used: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string | null;
}

const IST_OFFSET_MIN = 330; // +05:30
const DAY_MS = 86_400_000;
// Coupons with no expiry date run in fixed windows so the dates Google
// already has never change underneath it (see "STABLE DATES" below).
const WINDOW_DAYS = 180; // length of one window (Google max is ~6 months)
const WINDOW_STEP_DAYS = 150; // a new window starts every 150 days (overlap = safe renewal)

// Bump this ONLY if Google ever rejects the feed again and you need to
// force brand-new promotions. It is part of every promotion_id.
const ID_VERSION = 'V2';

// STABLE DATES (fixes "Promotion invalid Update"):
// Merchant Center does not allow the START date of a promotion that has
// already started to change, and it cannot update a stopped promotion.
// The old feed used "start of today" as the start date, so it moved
// forward every day and the second upload was rejected. The start date is
// now derived from the coupon's created_at, which never changes.

const COLUMNS = [
  'promotion_id',
  'product_applicability',
  'offer_type',
  'long_title',
  'promotion_effective_dates',
  'redemption_channel',
  'generic_redemption_code',
  'percent_off',
  'money_off_amount',
  'minimum_purchase_amount',
  'promotion_destination',
];

// Format a Date as ISO-8601 in IST, e.g. 2026-10-08T00:00:00+05:30
function toIst(d: Date): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '') + '+05:30';
}

function clean(v: string): string {
  return v.replace(/[\t\r\n]+/g, ' ').trim();
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, discount_type, discount_value, min_order_value, usage_limit, times_used, expires_at, is_active, created_at')
    .eq('show_in_google_promotions', true)
    .eq('is_active', true);

  if (error) {
    return new Response(`Failed to load coupons: ${error.message}`, { status: 500 });
  }

  const now = new Date();
  // Start of today in IST (promotion must not start in the future relative to feed fetch)
  const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  istNow.setUTCHours(0, 0, 0, 0);
  const startOfToday = new Date(istNow.getTime() - IST_OFFSET_MIN * 60_000);

  const rows: string[] = [COLUMNS.join('\t')];

  for (const c of (data ?? []) as CouponRow[]) {
    const expiresAt = c.expires_at ? new Date(c.expires_at) : null;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) continue; // expired
    if (c.usage_limit != null && (c.times_used ?? 0) >= c.usage_limit) continue; // used up
    if (!c.discount_value || c.discount_value <= 0) continue;

    // Stable start: IST midnight of the day the coupon was created.
    const createdMs = c.created_at ? new Date(c.created_at).getTime() : NaN;
    const createdDay = Number.isNaN(createdMs)
      ? startOfToday
      : (() => {
          const d = new Date(createdMs + IST_OFFSET_MIN * 60_000);
          d.setUTCHours(0, 0, 0, 0);
          return new Date(d.getTime() - IST_OFFSET_MIN * 60_000);
        })();

    let start = createdDay;
    let end: Date;
    let cycle = 0;
    if (expiresAt) {
      end = expiresAt;
    } else {
      const elapsedDays = Math.max(0, Math.floor((startOfToday.getTime() - createdDay.getTime()) / DAY_MS));
      cycle = Math.floor(elapsedDays / WINDOW_STEP_DAYS);
      start = new Date(createdDay.getTime() + cycle * WINDOW_STEP_DAYS * DAY_MS);
      end = new Date(start.getTime() + WINDOW_DAYS * DAY_MS);
    }
    if (end.getTime() <= start.getTime()) continue;
    const code = clean(c.code);
    const minOrder = c.min_order_value && c.min_order_value > 0 ? `${c.min_order_value} INR` : '';

    let title: string;
    let percentOff = '';
    let moneyOff = '';
    if (c.discount_type === 'percentage') {
      percentOff = String(Math.round(c.discount_value));
      title = `${percentOff}% off with code ${code}`;
    } else {
      moneyOff = `${c.discount_value} INR`;
      title = `Rs ${c.discount_value} off with code ${code}`;
    }
    if (c.min_order_value && c.min_order_value > 0) title += ` on orders above Rs ${c.min_order_value}`;

    rows.push(
      [
        `COUPON-${code}-${ID_VERSION}${cycle > 0 ? `-${cycle}` : ''}`.slice(0, 50).replace(/[^A-Za-z0-9_-]/g, '-'),
        'ALL_PRODUCTS',
        'GENERIC_CODE',
        clean(title).slice(0, 60),
        `${toIst(start)}/${toIst(end)}`,
        'ONLINE',
        code,
        percentOff,
        moneyOff,
        minOrder,
        'Shopping_ads,Free_listings',
      ].join('\t')
    );
  }

  return new Response(rows.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
