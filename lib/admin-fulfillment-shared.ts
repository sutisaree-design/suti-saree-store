import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';

export async function requireAdmin(): Promise<boolean> {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

// Admin is allowed to see customer_name/customer_phone/shipping_address
// here (unlike the vendor-facing columns list in app/api/vendor/orders/
// route.ts) — this whole panel is admin-only, and Phase 3C point 4
// explicitly needs the customer's address for the final courier leg.
export const ADMIN_FULFILLMENT_COLUMNS = [
  'id',
  'order_id',
  'product_name',
  'barcode',
  'quantity',
  'price',
  'stage',
  'liability',
  'vendor_id',
  'pickup_photo_url',
  'warehouse_received_photo_url',
  'received_at',
  'qc_defect_found',
  'qc_color_match',
  'qc_fabric_check',
  'qc_tag_removed',
  'qc_condition_notes',
  'qc_checked_at',
  'packed_photo_url',
  'packed_at',
  'shipped_courier_name',
  'shipped_tracking_number',
  'shipped_at',
  'delivered_at',
  'fee_amount',
  'vendor_payable_amount',
  'settlement_id',
  'created_at',
  'stage_updated_at',
  'products(images)',
  'vendors(business_name)',
  'orders(customer_name, customer_phone, shipping_address)',
].join(', ');

export function shapeAdminFulfillmentRow(row: any) {
  return {
    id: row.id,
    order_id: row.order_id,
    product_name: row.product_name,
    product_image: row.products?.images?.[0] ?? null,
    barcode: row.barcode,
    quantity: row.quantity,
    price: row.price,
    stage: row.stage,
    liability: row.liability,

    vendor_id: row.vendor_id,
    vendor_name: row.vendors?.business_name ?? 'Unknown vendor',

    customer_name: row.orders?.customer_name ?? null,
    customer_phone: row.orders?.customer_phone ?? null,
    shipping_address: row.orders?.shipping_address ?? null,

    pickup_photo_url: row.pickup_photo_url,

    warehouse_received_photo_url: row.warehouse_received_photo_url,
    received_at: row.received_at,

    qc_defect_found: row.qc_defect_found,
    qc_color_match: row.qc_color_match,
    qc_fabric_check: row.qc_fabric_check,
    qc_tag_removed: row.qc_tag_removed,
    qc_condition_notes: row.qc_condition_notes,
    qc_checked_at: row.qc_checked_at,

    packed_photo_url: row.packed_photo_url,
    packed_at: row.packed_at,

    shipped_courier_name: row.shipped_courier_name,
    shipped_tracking_number: row.shipped_tracking_number,
    shipped_at: row.shipped_at,

    delivered_at: row.delivered_at,
    fee_amount: row.fee_amount,
    vendor_payable_amount: row.vendor_payable_amount,
    settlement_id: row.settlement_id,

    created_at: row.created_at,
    stage_updated_at: row.stage_updated_at,
  };
}
