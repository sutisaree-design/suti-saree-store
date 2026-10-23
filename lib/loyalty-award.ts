// Loyalty points for a purchase are credited ONLY once the order is
// delivered (this is what the order-confirmation / track pages promise the
// customer). Called from updateOrderStatus() (lib/orders-api.ts) when an
// order becomes 'delivered' -- which both the admin status dropdown and the
// delivery-tracking cron funnel through.
//
// Safe to call more than once: it never double-credits an order.
import { getSupabaseAdmin } from './supabase-admin';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from './loyalty-api';

export async function awardLoyaltyPointsForDeliveredOrder(orderId: string): Promise<{ awarded: number; skipped?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, user_id, status, total_amount, loyalty_points_earned')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) return { awarded: 0, skipped: 'Order not found' };
  if (!order.user_id) return { awarded: 0, skipped: 'Guest order (no account)' };
  if (order.status !== 'delivered') return { awarded: 0, skipped: 'Order is not delivered' };
  // Older orders were credited at placement -- never credit them twice.
  if ((order.loyalty_points_earned ?? 0) > 0) return { awarded: 0, skipped: 'Already credited' };

  const shortId = order.id.slice(0, 8);
  const { data: existing } = await supabase
    .from('loyalty_points_ledger')
    .select('id')
    .eq('order_id', order.id)
    .eq('type', 'earn')
    .eq('reason', `Order #${shortId}`)
    .limit(1);
  if (existing && existing.length > 0) return { awarded: 0, skipped: 'Already credited' };

  const { data: settingsRow } = await supabase.from('settings').select('value').eq('key', 'loyalty_program').maybeSingle();
  const settings: LoyaltySettings = {
    ...DEFAULT_LOYALTY_SETTINGS,
    ...((settingsRow?.value as Partial<LoyaltySettings>) ?? {}),
  };
  if (!settings.enabled) return { awarded: 0, skipped: 'Loyalty program disabled' };

  const points = Math.floor((Number(order.total_amount || 0) * settings.points_per_100_rupees) / 100);
  if (points <= 0) return { awarded: 0, skipped: 'No points for this amount' };

  const { error: ledgerError } = await supabase.from('loyalty_points_ledger').insert({
    user_id: order.user_id,
    order_id: order.id,
    points,
    type: 'earn',
    reason: `Order #${shortId}`,
  });
  if (ledgerError) {
    console.error('[loyalty-award] ledger insert failed:', ledgerError);
    return { awarded: 0, skipped: ledgerError.message };
  }
  await supabase.from('orders').update({ loyalty_points_earned: points }).eq('id', order.id);
  return { awarded: points };
}
