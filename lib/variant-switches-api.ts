export interface VariantSwitchColor {
  toColor: string;
  count: number;
}

export interface VariantSwitchProductRow {
  productId: string;
  productName: string;
  productSlug: string | null;
  totalSwitches: number;
  colors: VariantSwitchColor[];
}

export interface VariantSwitchesData {
  byProduct: VariantSwitchProductRow[];
  topProducts: VariantSwitchProductRow[];
  totalSwitches: number;
  rangeDays: number;
}

export async function fetchVariantSwitches(days = 30): Promise<VariantSwitchesData> {
  const res = await fetch(`/api/admin/variant-switches?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load variant switch insights');
  }
  return res.json();
}
