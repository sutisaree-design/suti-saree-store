// Cashfree Payments (PG) server helpers -- REST API version 2023-08-01.
// Docs: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
//
// Env (server only, never NEXT_PUBLIC_):
//   CASHFREE_APP_ID       Client ID  (Cashfree dashboard > Developers > API Keys)
//   CASHFREE_SECRET_KEY   Secret key (also used to verify webhook signatures)
//   CASHFREE_ENV          'production' | 'sandbox'   (default: sandbox -- set production when live)
import crypto from 'crypto';

const API_VERSION = '2023-08-01';

export type CashfreeMode = 'production' | 'sandbox';

export function getCashfreeMode(): CashfreeMode {
  return (process.env.CASHFREE_ENV || '').toLowerCase() === 'production' ? 'production' : 'sandbox';
}

export function isCashfreeConfigured(): boolean {
  return !!process.env.CASHFREE_APP_ID && !!process.env.CASHFREE_SECRET_KEY;
}

function baseUrl() {
  return getCashfreeMode() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function headers(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-version': API_VERSION,
    'x-client-id': process.env.CASHFREE_APP_ID as string,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY as string,
    ...(extra || {}),
  };
}

async function cfFetch<T = any>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; data?: any }> {
  if (!isCashfreeConfigured()) {
    return { ok: false, status: 500, error: 'Cashfree keys not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env' };
  }
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: init?.method || 'GET',
      headers: headers(init?.headers),
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message || `Cashfree request failed (${res.status})`, data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Cashfree request failed' };
  }
}

/** Cashfree customer_phone must be exactly 10 digits. */
export function cashfreePhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? last10 : '9999999999';
}

/** New Cashfree order id for an internal order (<= 50 chars; unique per attempt so a retry/resume never collides). */
export function newCashfreeOrderId(internalOrderId: string): string {
  return `${internalOrderId}_${Date.now().toString(36)}`.slice(0, 50);
}

export interface CreateCashfreeOrderInput {
  cashfreeOrderId: string;
  amountRupees: number;
  internalOrderId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  returnUrl?: string;
  notifyUrl?: string;
  note?: string;
}

export async function createCashfreeOrder(input: CreateCashfreeOrderInput) {
  const customer_details: Record<string, string> = {
    customer_id: input.internalOrderId.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50) || 'guest',
    customer_phone: cashfreePhone(input.customerPhone),
  };
  if (input.customerName) customer_details.customer_name = input.customerName.slice(0, 100);
  if (input.customerEmail) customer_details.customer_email = input.customerEmail;

  const order_meta: Record<string, string> = {};
  if (input.returnUrl) order_meta.return_url = input.returnUrl;
  if (input.notifyUrl) order_meta.notify_url = input.notifyUrl;

  return cfFetch<{
    cf_order_id: string | number;
    order_id: string;
    payment_session_id: string;
    order_status: string;
    order_amount: number;
  }>('/orders', {
    method: 'POST',
    body: {
      order_id: input.cashfreeOrderId,
      order_amount: Number(input.amountRupees.toFixed(2)),
      order_currency: 'INR',
      customer_details,
      order_meta,
      order_note: input.note,
      order_tags: { internal_order_id: input.internalOrderId },
    },
  });
}

export interface CashfreePayment {
  cf_payment_id: string | number;
  payment_status: 'SUCCESS' | 'NOT_ATTEMPTED' | 'FAILED' | 'USER_DROPPED' | 'VOID' | 'CANCELLED' | 'PENDING' | string;
  payment_amount: number;
  payment_currency?: string;
  order_id?: string;
}

/** All payment attempts for a Cashfree order (authoritative server-to-server status check). */
export async function fetchCashfreeOrderPayments(cashfreeOrderId: string) {
  return cfFetch<CashfreePayment[]>(`/orders/${encodeURIComponent(cashfreeOrderId)}/payments`);
}

export async function fetchCashfreeOrder(cashfreeOrderId: string) {
  return cfFetch<{ order_status: string; order_amount: number; payment_session_id?: string }>(
    `/orders/${encodeURIComponent(cashfreeOrderId)}`
  );
}

/** Finds the successful payment for an order, if any. */
export async function findSuccessfulCashfreePayment(
  cashfreeOrderId: string
): Promise<{ ok: true; payment: CashfreePayment | null } | { ok: false; error: string }> {
  const res = await fetchCashfreeOrderPayments(cashfreeOrderId);
  if (!res.ok) return { ok: false, error: res.error };
  const list = Array.isArray(res.data) ? res.data : [];
  return { ok: true, payment: list.find((p) => p.payment_status === 'SUCCESS') || null };
}

/** Refund (full or partial) against a Cashfree ORDER id. refundId makes the call idempotent. */
export async function refundCashfreePayment(
  cashfreeOrderId: string,
  amountRupees: number,
  refundId: string
): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  const res = await cfFetch<{ cf_refund_id: string | number; refund_id: string; refund_status: string }>(
    `/orders/${encodeURIComponent(cashfreeOrderId)}/refunds`,
    {
      method: 'POST',
      body: { refund_amount: Number(amountRupees.toFixed(2)), refund_id: refundId, refund_speed: 'STANDARD' },
      headers: { 'x-idempotency-key': refundId },
    }
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, refundId: String(res.data.cf_refund_id ?? res.data.refund_id ?? refundId) };
}

/**
 * Webhook signature check: base64( HMAC-SHA256( timestamp + rawBody, secretKey ) ).
 * Headers: x-webhook-signature, x-webhook-timestamp.
 */
export function verifyCashfreeWebhook(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret || !signature || !timestamp) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
