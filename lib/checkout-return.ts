/**
 * Deterministic "where did the shopper come from" tracking for /checkout.
 *
 * The header's mobile back button used to rely on browser history
 * (router.back() / history.back()) to return from checkout to whatever
 * page sent the shopper there. That depends on the history stack having
 * exactly the entries we expect — and in practice it doesn't always:
 * prefetched routes, redirects, and how the page was originally opened
 * can all add or collapse entries, which is what caused "back" to
 * sometimes need two taps instead of one.
 *
 * Instead, every place that sends the shopper to /checkout calls
 * markCheckoutEntry() right before navigating, which remembers the exact
 * page we're leaving. The header's back button then reads it and does a
 * direct router.push() to that exact page — no history stack involved,
 * so it always takes exactly one tap.
 *
 * Buy Now is a special case: backing out of a Buy Now checkout should
 * drop the item into the real cart and pop open the side cart drawer
 * (instead of just landing back on the product page with the item gone),
 * so nothing the shopper picked gets lost. markCheckoutEntry({ fromBuyNow:
 * true }) records that; the header checks the flag and reacts accordingly.
 */

const CHECKOUT_RETURN_KEY = 'saaj-checkout-return-v1';
const CHECKOUT_RETURN_BUY_NOW_KEY = 'saaj-checkout-return-buy-now-v1';

/** Call right before navigating to /checkout, from the page being left. */
export function markCheckoutEntry(options?: { fromBuyNow?: boolean }) {
  if (typeof window === 'undefined') return;
  try {
    const path = window.location.pathname + window.location.search;
    if (path.startsWith('/checkout')) return; // don't overwrite with itself
    sessionStorage.setItem(CHECKOUT_RETURN_KEY, path);
    if (options?.fromBuyNow) {
      sessionStorage.setItem(CHECKOUT_RETURN_BUY_NOW_KEY, '1');
    } else {
      sessionStorage.removeItem(CHECKOUT_RETURN_BUY_NOW_KEY);
    }
  } catch {
    // ignore
  }
}

/** Read (without clearing) the page to return to from /checkout, if known. */
export function getCheckoutReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(CHECKOUT_RETURN_KEY);
  } catch {
    return null;
  }
}

/** Whether the current /checkout visit was entered via Buy Now. */
export function isCheckoutReturnFromBuyNow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(CHECKOUT_RETURN_BUY_NOW_KEY) === '1';
  } catch {
    return false;
  }
}

/** Call once the Buy Now return flag has been acted on, so it isn't reused. */
export function clearCheckoutReturnBuyNowFlag() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CHECKOUT_RETURN_BUY_NOW_KEY);
  } catch {
    // ignore
  }
}
