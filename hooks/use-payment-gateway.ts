'use client';
import { useEffect, useState } from 'react';
import type { GatewayId } from '@/lib/payment-gateways';

export interface PaymentGatewayState {
  /** Which gateway takes new online payments; null = online payments are switched off (COD only). */
  active: GatewayId | null;
  label: string | null;
  /** false until the first response arrives -- avoids flashing COD-only UI on page load. */
  loaded: boolean;
}

// Reads Admin > Settings > Payment Gateways through the public /api/payment-gateways route.
export function usePaymentGateway(): PaymentGatewayState {
  const [state, setState] = useState<PaymentGatewayState>({ active: 'razorpay', label: 'Razorpay', loaded: false });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/payment-gateways', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d) => !cancelled && setState({ active: d.active ?? null, label: d.label ?? null, loaded: true }))
      // If the lookup fails keep the previous default (Razorpay) rather than blocking checkout.
      .catch(() => !cancelled && setState((s) => ({ ...s, loaded: true })));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
