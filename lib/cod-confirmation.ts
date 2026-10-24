import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { toPublicMediaUrl } from './media-url';

// ---------------------------------------------------------------------
// COD one-tap confirmation. Purely additive: it only stamps
// orders.cod_confirmed_at / cod_confirmed_via. It never changes
// orders.status, so shipping / Delhivery / invoices / reports are untouched.
// If the migration (20261022000000_cod_order_confirmation.sql) has not been
// run yet, every function here fails soft (returns null / 'invalid') and the
// rest of order placement keeps working exactly as before.
// ---------------------------------------------------------------------

const TOKEN_TTL_DAYS = 14;

export type CodConfirmVia = 'link' | 'whatsapp_reply' | 'admin';

export function codConfirmUrl(token: string, base?: string): string {
  const site = (base || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  return `${site}/confirm-order/${token}`;
}

/** Returns the order's confirm token (creating one for COD orders). null = not applicable / failed. */
export async function getOrCreateCodConfirmToken(orderId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, payment_method, cod_confirm_token')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !order) return null;
    if (order.payment_method !== 'cod') return null;
    if (order.cod_confirm_token) return order.cod_confirm_token as string;

    const token = randomBytes(24).toString('base64url');
    const { error: upErr } = await supabase
      .from('orders')
      .update({ cod_confirm_token: token, cod_confirm_requested_at: new Date().toISOString() })
      .eq('id', orderId)
      .is('cod_confirm_token', null);
    if (upErr) return null;

    const { data: again } = await supabase.from('orders').select('cod_confirm_token').eq('id', orderId).maybeSingle();
    return (again?.cod_confirm_token as string) ?? null;
  } catch {
    return null;
  }
}

export type CodConfirmItem = {
  name: string;
  imageUrl: string | null;
  size: string | null;
  quantity: number;
  lineTotal: number;
};

export type CodConfirmSummary = {
  id: string;
  shortId: string;
  firstName: string;
  total: number;
  itemNames: string[];
  items: CodConfirmItem[];
  itemCount: number;
};

export type CodConfirmLookup =
  | { state: 'invalid' | 'expired' | 'cancelled' | 'not_cod' }
  | { state: 'ok' | 'confirmed' | 'processing'; summary: CodConfirmSummary };

export async function lookupCodConfirmToken(token: string): Promise<CodConfirmLookup> {
  if (!token || token.length < 20 || token.length > 128) return { state: 'invalid' };
  try {
    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, items, total_amount, status, payment_method, created_at, cod_confirmed_at, customer_name')
      .eq('cod_confirm_token', token)
      .maybeSingle();
    if (error || !order) return { state: 'invalid' };

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const summary: CodConfirmSummary = {
      id: order.id,
      shortId: String(order.id).slice(0, 8).toUpperCase(),
      firstName: String(order.customer_name || '').trim().split(/\s+/)[0] || '',
      total: Number(order.total_amount || 0),
      itemNames: items.slice(0, 3).map((it) => String(it?.product_name || it?.name || 'Your selection')),
      items: items.slice(0, 3).map((it) => {
        const qty = Number(it?.quantity) > 0 ? Number(it.quantity) : 1;
        const rawImage = it?.image_url || it?.image || (Array.isArray(it?.images) ? it.images[0] : null) || null;
        let imageUrl: string | null = null;
        try {
          imageUrl = rawImage ? toPublicMediaUrl(String(rawImage)) || null : null;
        } catch {
          imageUrl = null;
        }
        return {
          name: String(it?.product_name || it?.name || 'Your selection'),
          imageUrl,
          size: it?.size ? String(it.size) : null,
          quantity: qty,
          lineTotal: Number(it?.price || 0) * qty,
        };
      }),
      itemCount: items.length,
    };

    if (order.payment_method !== 'cod') return { state: 'not_cod' };
    if (order.status === 'cancelled' || order.status === 'failed') return { state: 'cancelled' };
    if (order.cod_confirmed_at) return { state: 'confirmed', summary };
    if (order.status !== 'pending') return { state: 'processing', summary };
    const ageDays = (Date.now() - new Date(order.created_at).getTime()) / 86_400_000;
    if (ageDays > TOKEN_TTL_DAYS) return { state: 'expired' };
    return { state: 'ok', summary };
  } catch {
    return { state: 'invalid' };
  }
}

export async function confirmCodOrderByToken(token: string, via: CodConfirmVia): Promise<CodConfirmLookup> {
  const found = await lookupCodConfirmToken(token);
  if (found.state !== 'ok') return found;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('orders')
    .update({ cod_confirmed_at: new Date().toISOString(), cod_confirmed_via: via })
    .eq('id', found.summary.id)
    .is('cod_confirmed_at', null);
  if (error) return { state: 'invalid' };
  return { state: 'confirmed', summary: found.summary };
}

/** Used by the admin button and the WhatsApp reply webhook (no token needed). */
export async function confirmCodOrderById(orderId: string, via: CodConfirmVia): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .update({ cod_confirmed_at: new Date().toISOString(), cod_confirmed_via: via })
    .eq('id', orderId)
    .eq('payment_method', 'cod')
    .eq('status', 'pending')
    .is('cod_confirmed_at', null)
    .select('id');
  return !error && !!data && data.length > 0;
}

/**
 * Link-preview data (WhatsApp / social cards) for /confirm-order/[token].
 * Uses the order's first item so the preview shows the exact saree ordered.
 * Never throws; returns null when nothing sensible can be shown.
 */
export async function getCodConfirmPreview(
  token: string,
): Promise<{ title: string; description: string; imageUrl: string | null } | null> {
  const found = await lookupCodConfirmToken(token);
  if (!('summary' in found)) return null;
  const { summary } = found;
  const first = summary.items?.[0];
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');
  // WhatsApp is unreliable with the stored .webp photos, so use the same
  // JPEG re-encoding route as the payment link's preview (/api/og/pay/[orderId]).
  const imageUrl = first?.imageUrl ? `${site}/api/og/pay/${summary.id}` : null;
  const more = summary.itemCount > 1 ? ` + ${summary.itemCount - 1} more` : '';
  return {
    title: `Confirm your order #${summary.shortId}`,
    description: `${first?.name || 'Your order'}${more} · Cash on Delivery`,
    imageUrl,
  };
}
