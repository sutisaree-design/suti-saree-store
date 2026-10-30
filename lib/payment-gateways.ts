// Payment gateway on/off settings (Admin > Settings > Payment Gateways).
// Stored in settings.key = 'payment_gateways'. Public-read (checkout needs to know whether to
// show "Pay Online"), admin-write only via /api/admin/settings/payment-gateways.
//
// Rules (single source of truth -- used by the API routes AND the storefront):
//   * online_enabled = false  -> ALL online payments off (Razorpay + Cashfree). COD only.
//   * otherwise the active gateway is the one that is enabled; if both are enabled,
//     `default_gateway` wins; if neither is enabled there is no online payment.

export type GatewayId = 'razorpay' | 'cashfree';

export interface PaymentGatewaySettings {
  /** Master switch: turn every online payment gateway off at once. */
  online_enabled: boolean;
  razorpay_enabled: boolean;
  cashfree_enabled: boolean;
  /** Used when both gateways are enabled. */
  default_gateway: GatewayId;
}

export const DEFAULT_PAYMENT_GATEWAY_SETTINGS: PaymentGatewaySettings = {
  online_enabled: true,
  razorpay_enabled: true,
  cashfree_enabled: false,
  default_gateway: 'razorpay',
};

export const GATEWAY_LABEL: Record<GatewayId, string> = {
  razorpay: 'Razorpay',
  cashfree: 'Cashfree',
};

export function normalizePaymentGateways(
  raw: Partial<PaymentGatewaySettings> | null | undefined
): PaymentGatewaySettings {
  const v = { ...DEFAULT_PAYMENT_GATEWAY_SETTINGS, ...(raw || {}) };
  return {
    online_enabled: v.online_enabled !== false,
    razorpay_enabled: v.razorpay_enabled !== false,
    cashfree_enabled: !!v.cashfree_enabled,
    default_gateway: v.default_gateway === 'cashfree' ? 'cashfree' : 'razorpay',
  };
}

/** Which gateway should take a NEW online payment right now (null = online payments are off). */
export function resolveActiveGateway(s: PaymentGatewaySettings): GatewayId | null {
  if (!s.online_enabled) return null;
  const { razorpay_enabled: rz, cashfree_enabled: cf } = s;
  if (rz && cf) return s.default_gateway;
  if (rz) return 'razorpay';
  if (cf) return 'cashfree';
  return null;
}
