// Shared helper for the order_payment_request_events table (see the
// 20260922000000_order_payment_request_tracking.sql migration for what
// each event_type means). Kept in one place so every touch-point --
// admin route, tracking-pixel/click routes, the resume page, and the
// razorpay routes -- logs the exact same shape.

import { getSupabaseAdmin } from './supabase-admin';

export type PaymentRequestEventType =
  | 'requested'
  | 'email_sent'
  | 'email_send_failed'
  | 'link_clicked'
  | 'page_visited'
  | 'payment_attempt_created'
  | 'payment_verified'
  | 'payment_failed'
  | 'reverted_to_cod'
  | 'customer_cancelled';

export type PaymentRequestSource = 'email' | 'account';

// Best-effort everywhere it's called: a failure here must never break the
// email send / payment flow it's attached to, so every call site wraps
// this in its own try/catch (or this function swallows the error itself
// and just console.errors, matching the rest of the codebase's pattern
// for non-critical logging).
export async function logPaymentRequestEvent(
  orderId: string,
  eventType: PaymentRequestEventType,
  opts: { source?: PaymentRequestSource; meta?: Record<string, any> } = {}
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('order_payment_request_events')
      .insert({ order_id: orderId, event_type: eventType, source: opts.source ?? null, meta: opts.meta ?? null })
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[order-payment-events] insert failed:', error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error('[order-payment-events] insert threw:', err);
    return null;
  }
}

// Payment-attempt/verify/fail events only matter for orders that actually
// went through the "Request Online Payment" flow -- gate on that instead
// of logging every ordinary online checkout into this table.
export async function isInPaymentRequestFlow(orderId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('order_payment_request_events')
      .select('id')
      .eq('order_id', orderId)
      .eq('event_type', 'requested')
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error('[order-payment-events] existence check threw:', err);
    return false;
  }
}

export async function getPaymentRequestEvents(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('order_payment_request_events')
    .select('id, event_type, source, opened_at, open_count, meta, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
