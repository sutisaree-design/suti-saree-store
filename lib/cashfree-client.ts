'use client';
// Browser-side Cashfree checkout (modal). Shared by the checkout page and the "resume payment"
// button so both behave identically.
//   1. POST /api/cashfree/create-order  -> payment_session_id (amount is looked up server-side)
//   2. Cashfree JS SDK opens the payment modal
//   3. POST /api/cashfree/verify-payment -> server asks Cashfree whether it really succeeded

declare global {
  interface Window {
    Cashfree?: (opts: { mode: 'sandbox' | 'production' }) => {
      checkout: (opts: { paymentSessionId: string; redirectTarget?: '_modal' | '_self' | '_blank' }) => Promise<any>;
    };
  }
}

const SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';
let sdkPromise: Promise<void> | null = null;

export function loadCashfreeScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const done = () => (window.Cashfree ? resolve() : reject(new Error('Cashfree checkout failed to load')));
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('Failed to load Cashfree checkout script')));
      if (window.Cashfree) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error('Failed to load Cashfree checkout script'));
    document.body.appendChild(script);
  }).catch((err) => {
    sdkPromise = null; // allow a retry
    throw err;
  });
  return sdkPromise;
}

/** Runs the whole Cashfree payment for an existing pending order. Resolves only when payment is verified. */
export async function payWithCashfree(internalOrderId: string): Promise<void> {
  const createRes = await fetch('/api/cashfree/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ internalOrderId }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    // stage: 'create' => nothing was charged and no payment was ever started.
    throw Object.assign(new Error(created.error || 'Failed to create payment order'), { stage: 'create' as const });
  }

  await loadCashfreeScript();
  const cashfree = window.Cashfree!({ mode: created.mode === 'production' ? 'production' : 'sandbox' });
  const result = await cashfree.checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' });

  // `error` is set when the customer closes the modal or the payment fails. Even then we still
  // ask the server below -- the payment may actually have gone through (e.g. UPI approved late).
  const modalError: string | undefined = result?.error?.message;

  const verifyRes = await fetch('/api/cashfree/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ internalOrderId }),
  });
  const verified = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !verified.verified) {
    throw new Error(modalError || (verifyRes.status === 402 ? 'Payment cancelled' : verified.error) || 'Payment failed');
  }
}
