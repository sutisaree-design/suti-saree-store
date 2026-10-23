import { supabase } from './supabase';
import { WholesalePricingTier } from './types';

export async function fetchWholesalePricing(): Promise<WholesalePricingTier[]> {
  const { data, error } = await supabase
    .from('wholesale_pricing')
    .select('*')
    .order('product_id', { ascending: true })
    .order('min_quantity', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WholesalePricingTier[];
}

export interface WholesaleTierInput {
  product_id: string;
  min_quantity: number;
  unit_price: number;
  label: string | null;
}

// SECURITY: create/update/delete moved server-side (were direct anon-key
// writes) — see app/api/admin/wholesale/route.ts and
// app/api/admin/wholesale/[id]/route.ts.

export async function createWholesaleTier(input: WholesaleTierInput) {
  const res = await fetch('/api/admin/wholesale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to create wholesale tier');
}

export async function updateWholesaleTier(id: string, input: WholesaleTierInput) {
  const res = await fetch(`/api/admin/wholesale/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to update wholesale tier');
}

export async function deleteWholesaleTier(id: string) {
  const res = await fetch(`/api/admin/wholesale/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete wholesale tier');
}

/**
 * Given a quantity, returns the best (lowest) unit price the customer
 * qualifies for from a product's wholesale tiers, or null if none apply.
 * Used on the storefront to auto-apply bulk pricing in the cart/product page.
 */
export function bestWholesalePrice(
  tiers: WholesalePricingTier[],
  quantity: number
): number | null {
  const eligible = tiers.filter((t) => quantity >= t.min_quantity);
  if (eligible.length === 0) return null;
  return Math.min(...eligible.map((t) => t.unit_price));
}
