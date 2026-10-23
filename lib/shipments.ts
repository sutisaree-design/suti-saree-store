/**
 * Partial / split shipment helpers (shared by server + client code).
 * No server-only imports here so admin UI components can use it too.
 */

export interface OrderShipment {
  id: string;
  order_id: string;
  shipment_no: number;
  waybill: string;
  courier_name: string | null;
  shipping_mode?: string | null;
  weight_grams?: number | null;
  item_indexes: number[];
  items: any[];
  cod_amount: number;
  is_partial: boolean;
  next_shipment_min_days?: number | null;
  next_shipment_max_days?: number | null;
  expected_delivery_date?: string | null;
  delivery_status?: string | null;
  out_for_delivery?: boolean;
  shipped_email_sent_at?: string | null;
  out_for_delivery_email_sent_at?: string | null;
  delivered_email_sent_at?: string | null;
  created_at: string;
}

export const DEFAULT_NEXT_LOT_MIN_DAYS = 4;
export const DEFAULT_NEXT_LOT_MAX_DAYS = 7;

/** Indexes (into order.items) not yet covered by any shipment. */
export function getUnshippedItemIndexes(
  items: any[] | null | undefined,
  shipments: Pick<OrderShipment, 'item_indexes'>[] | null | undefined
): number[] {
  const list = Array.isArray(items) ? items : [];
  const shipped = new Set<number>();
  for (const s of shipments || []) for (const i of s.item_indexes || []) shipped.add(i);
  return list.map((_, i) => i).filter((i) => !shipped.has(i));
}

function lineValue(it: any): number {
  return Number(it?.price || 0) * Number(it?.quantity || 1);
}

/**
 * Splits the cash-to-collect between shipments of a COD order, pro-rata to
 * item value. When this shipment contains ALL the still-unshipped items it
 * gets whatever COD amount is left (so the parts always add up to the order
 * total exactly, including shipping/tax/discount rounding).
 */
export function suggestCodAmount(params: {
  paymentMethod?: string | null;
  totalAmount: number;
  items: any[];
  selectedIndexes: number[];
  existingShipments: Pick<OrderShipment, 'item_indexes' | 'cod_amount'>[];
}): number {
  // 'partial' = advance already paid online, so the courier only collects the balance.
  // Callers pass balance_due as totalAmount for partial orders (see create-shipment).
  if (params.paymentMethod !== 'cod' && params.paymentMethod !== 'partial') return 0;
  const total = Number(params.totalAmount || 0);
  const alreadyAssigned = params.existingShipments.reduce((s, x) => s + Number(x.cod_amount || 0), 0);
  const remainingCod = Math.max(0, total - alreadyAssigned);
  const unshipped = getUnshippedItemIndexes(params.items, params.existingShipments);
  const selected = params.selectedIndexes.filter((i) => unshipped.includes(i));
  if (selected.length === 0) return 0;
  if (selected.length === unshipped.length) return remainingCod; // last lot takes the remainder

  const unshippedValue = unshipped.reduce((s, i) => s + lineValue(params.items[i]), 0);
  const selectedValue = selected.reduce((s, i) => s + lineValue(params.items[i]), 0);
  if (unshippedValue <= 0) return 0;
  return Math.min(remainingCod, Math.round((remainingCod * selectedValue) / unshippedValue));
}

/** Short customer-facing promise, e.g. "within 4 to 7 days". */
export function nextLotPhrase(min?: number | null, max?: number | null): string {
  const lo = Number(min || DEFAULT_NEXT_LOT_MIN_DAYS);
  const hi = Number(max || DEFAULT_NEXT_LOT_MAX_DAYS);
  return lo === hi ? `within ${lo} days` : `within ${lo} to ${hi} days`;
}

export function shipmentLabel(s: Pick<OrderShipment, 'shipment_no'>, total: number): string {
  return total > 1 ? `Shipment ${s.shipment_no} of ${total}` : 'Shipment';
}
