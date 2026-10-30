import { getSupabaseAdmin } from './supabase-admin';
import {
  normalizePaymentGateways,
  resolveActiveGateway,
  type GatewayId,
  type PaymentGatewaySettings,
} from './payment-gateways';

/** Server-side read (service role). Falls back to defaults (Razorpay on) if the row is missing. */
export async function getPaymentGatewaySettings(): Promise<PaymentGatewaySettings> {
  const { data } = await getSupabaseAdmin()
    .from('settings')
    .select('value')
    .eq('key', 'payment_gateways')
    .maybeSingle();
  return normalizePaymentGateways(data?.value as Partial<PaymentGatewaySettings> | undefined);
}

export async function getActiveGateway(): Promise<GatewayId | null> {
  return resolveActiveGateway(await getPaymentGatewaySettings());
}

/**
 * Is `gateway` allowed to take a NEW payment right now?
 * Used by each gateway's create-order route so a disabled gateway can't be used even by
 * someone calling the API directly.
 */
export async function isGatewayAllowed(gateway: GatewayId): Promise<boolean> {
  const s = await getPaymentGatewaySettings();
  if (!s.online_enabled) return false;
  return gateway === 'razorpay' ? s.razorpay_enabled : s.cashfree_enabled;
}
