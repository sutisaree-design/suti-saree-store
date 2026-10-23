// Partial Pay: customer pays a % online (Razorpay) as an advance, the rest on delivery.
// Settings live in settings.key = 'partial_pay' (public-read, admin-write via
// /api/admin/settings/partial-pay). The advance AMOUNT is always computed server-side by the
// orders_apply_partial_pay() trigger -- the helpers here are only for display / validation.

import { supabase } from './supabase';

export interface PartialPaySettings {
  enabled: boolean;
  /** Advance % taken online (1-99). */
  percent: number;
  /** Only offer Partial Pay when order total >= this (0 = no minimum). */
  min_order_value: number;
  /** Only offer Partial Pay when order total <= this (0 = no maximum). */
  max_order_value: number;
  /** Customer-facing title. */
  label: string;
  /** If a customer self-cancels before dispatch, refund the advance (RTO / refused delivery never refunds it). */
  refund_advance_on_cancel: boolean;
}

export const DEFAULT_PARTIAL_PAY_SETTINGS: PartialPaySettings = {
  enabled: false,
  percent: 50,
  min_order_value: 0,
  max_order_value: 0,
  label: 'Partial Pay',
  refund_advance_on_cancel: true,
};

export function normalizePartialPay(raw: Partial<PartialPaySettings> | null | undefined): PartialPaySettings {
  const v = { ...DEFAULT_PARTIAL_PAY_SETTINGS, ...(raw || {}) };
  return {
    enabled: !!v.enabled,
    percent: Math.min(99, Math.max(1, Number(v.percent) || 50)),
    min_order_value: Math.max(0, Math.round(Number(v.min_order_value) || 0)),
    max_order_value: Math.max(0, Math.round(Number(v.max_order_value) || 0)),
    label: String(v.label || DEFAULT_PARTIAL_PAY_SETTINGS.label).slice(0, 40),
    refund_advance_on_cancel: v.refund_advance_on_cancel !== false,
  };
}

/** Same maths as the DB trigger: advance = round(total x percent / 100), kept within 1..total-1. */
export function computeAdvance(total: number, percent: number): { advance: number; balance: number } {
  const t = Math.max(0, Math.round(total));
  if (t < 2) return { advance: t, balance: 0 };
  const advance = Math.min(Math.max(Math.round((t * percent) / 100), 1), t - 1);
  return { advance, balance: t - advance };
}

export function isPartialPayEligible(s: PartialPaySettings, total: number): boolean {
  if (!s.enabled) return false;
  if (total < Math.max(2, s.min_order_value)) return false;
  if (s.max_order_value > 0 && total > s.max_order_value) return false;
  return true;
}

/** Browser/anon read (the checkout page). */
export async function fetchPartialPaySettings(): Promise<PartialPaySettings> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'partial_pay').maybeSingle();
  if (error || !data) return DEFAULT_PARTIAL_PAY_SETTINGS;
  return normalizePartialPay(data.value as Partial<PartialPaySettings>);
}
