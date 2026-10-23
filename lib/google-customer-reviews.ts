// Google Customer Reviews (GCR) helpers -- shared by the survey opt-in on
// the order-confirmation page and the site-wide badge.
//
// Merchant Center -> Settings -> Add-ons -> Google Customer Reviews.

export const GCR_MERCHANT_ID = Number(process.env.NEXT_PUBLIC_GCR_MERCHANT_ID || '5830177505');

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD in India time (what Google expects for estimated_delivery_date). */
function toIstDateString(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Estimated delivery date for the GCR survey (when Google should email the
 * customer). Uses the same Admin > Marketing > Shipping & Returns timing the
 * rest of the site shows: dispatch max + "rest of India" delivery max.
 * Never returns a date in the past -- falls back to tomorrow.
 */
export function estimateDeliveryDate(
  orderCreatedAt: string | Date,
  dispatchDaysMax: number,
  deliveryDaysMax: number,
): string {
  const created = new Date(orderCreatedAt).getTime();
  const days = Math.max(1, Math.round((dispatchDaysMax || 0) + (deliveryDaysMax || 0)));
  const estimated = created + days * DAY_MS;
  const tomorrow = Date.now() + DAY_MS;
  return toIstDateString(Math.max(estimated, tomorrow));
}

/** Google wants a 2-letter ISO country code. Store is India-only today. */
export function toCountryCode(country?: string | null): string {
  const c = (country ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return 'IN';
}
