// ---------------------------------------------------------------------
// Phase 3C — Admin: Stock Receiving, QC + Tag Removal, Final Pack/Ship
// (admin-facing; the vendor-facing half of this pipeline is Phase 3B,
// in lib/vendor-api.ts).
//
// Unlike the vendor side, the admin panel is allowed to see the
// customer's name/phone/shipping address on these rows — that masking
// rule is specific to the vendor dashboard (Phase 3B), not this one.
// ---------------------------------------------------------------------

export type FulfillmentStage =
  | 'placed'
  | 'vendor_accepted'
  | 'picked_from_vendor'
  | 'received_at_warehouse'
  | 'packed'
  | 'shipped_to_customer'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'quality_hold';

export type FabricCheck = 'yes' | 'no' | 'not_checked';

export interface AdminFulfillmentItem {
  id: string;
  order_id: string;
  product_name: string;
  product_image: string | null;
  barcode: string | null;
  quantity: number;
  price: number;
  stage: FulfillmentStage;
  liability: 'vendor' | 'own' | null;

  vendor_id: string;
  vendor_name: string;

  // Customer info — admin-only, never sent to the vendor-facing route.
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: {
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;

  pickup_photo_url: string | null;

  warehouse_received_photo_url: string | null;
  received_at: string | null;

  qc_defect_found: boolean | null;
  qc_color_match: boolean | null;
  qc_fabric_check: FabricCheck | null;
  qc_tag_removed: boolean | null;
  qc_condition_notes: string | null;
  qc_checked_at: string | null;

  packed_photo_url: string | null;
  packed_at: string | null;

  shipped_courier_name: string | null;
  shipped_tracking_number: string | null;
  shipped_at: string | null;

  created_at: string;
  stage_updated_at: string;
}

/** Every vendor-sourced order item currently at (or past) the pickup
 *  stage — the admin panel groups these into its Receiving / Quality
 *  Check / Quality Hold / Pack / Ship / Shipped tabs client-side. */
export async function fetchAdminFulfillmentQueue(): Promise<AdminFulfillmentItem[]> {
  const res = await fetch('/api/admin/fulfillment');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load the fulfillment queue');
  }
  const body = await res.json();
  return body.items as AdminFulfillmentItem[];
}

/** Uploads a receiving/packing photo via the server (service-role
 *  client — the admin panel has no Supabase Auth session to satisfy
 *  the bucket's `authenticated`-only insert policy, see Phase 3B's
 *  migration) and returns its public URL. Does not save it against any
 *  order item by itself — pass the URL into one of the actions below. */
export async function uploadAdminFulfillmentPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/admin/fulfillment/upload-photo', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to upload photo');
  }
  const body = await res.json();
  return body.url as string;
}

/** Barcode scan (or manual entry) at the warehouse door -> stage
 *  'picked_from_vendor' -> 'received_at_warehouse'. Second photo-proof. */
export async function receiveOrderItem(
  orderItemId: string,
  photo_url: string
): Promise<AdminFulfillmentItem> {
  return fulfillmentAction(orderItemId, { action: 'receive', photo_url });
}

/** Submits the QC checklist for an item already at 'received_at_warehouse'.
 *  Passing fails (defect found, color mismatch, or tag not removed) moves
 *  the item to 'quality_hold' and — if a defect was found — sets
 *  liability = 'vendor' (pickup-leg damage). A clean pass leaves the item
 *  at 'received_at_warehouse', now ready for the Pack step. */
export async function submitQualityCheck(
  orderItemId: string,
  input: {
    defect_found: boolean;
    color_match: boolean;
    fabric_check: FabricCheck;
    tag_removed: boolean;
    condition_notes: string;
  }
): Promise<AdminFulfillmentItem> {
  return fulfillmentAction(orderItemId, { action: 'qc', ...input });
}

/** Manual override to bring an item back out of 'quality_hold' to
 *  'received_at_warehouse' for a re-check. There's no automated "Return
 *  to Vendor" flow yet (that's Phase 4C's stale-inventory/off-boarding
 *  work) — without this, anything held would have no way out at all, so
 *  this exists purely so a hold doesn't permanently strand an item. */
export async function releaseQualityHold(orderItemId: string): Promise<AdminFulfillmentItem> {
  return fulfillmentAction(orderItemId, { action: 'release_hold' });
}

/** Final packing -> stage 'packed'. Third photo-proof. */
export async function packOrderItem(
  orderItemId: string,
  photo_url: string
): Promise<AdminFulfillmentItem> {
  return fulfillmentAction(orderItemId, { action: 'pack', photo_url });
}

/** Records the manually-booked second courier leg (warehouse -> customer)
 *  -> stage 'shipped_to_customer'. Booking itself still happens outside
 *  the app (the courier's own site/app) per your instructions — this
 *  only records what was booked. If liability hasn't already been set to
 *  'vendor' by a failed QC check, it defaults to 'own' here, since any
 *  damage/loss from this point on is a delivery-leg risk. */
export async function shipOrderItem(
  orderItemId: string,
  input: { courier_name: string; tracking_number: string }
): Promise<AdminFulfillmentItem> {
  return fulfillmentAction(orderItemId, { action: 'ship', ...input });
}

async function fulfillmentAction(
  orderItemId: string,
  payload: Record<string, unknown>
): Promise<AdminFulfillmentItem> {
  const res = await fetch(`/api/admin/fulfillment/${orderItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update this item');
  }
  const body = await res.json();
  return body.item as AdminFulfillmentItem;
}
