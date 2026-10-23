import { NextResponse } from 'next/server';
import { getCurrentUser, getSupabaseServer } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { computeVendorPriceBreakdown } from '@/lib/vendor-pricing';
import { fetchShippingSettings } from '@/lib/pincode-api';

// Fields the vendor is allowed to see about their own product
const VENDOR_PRODUCT_COLUMNS = [
  'id', 'name', 'slug', 'images', 'fabric', 'category_name', 'category_id',
  'available_quantity', 'vendor_expected_price', 'ai_suggested_price',
  'final_price', 'is_dead_stock', 'approval_status', 'barcode',
  'rejection_reason', 'created_at',
].join(', ');

/**
 * PATCH /api/vendor/products/[id]
 *
 * Allows an approved vendor to edit their own product's basic fields.
 * Sets approval_status back to 'pending_review' so the AI re-processes it —
 * the client is expected to fire /api/vendor/ai-process/[id] (fire-and-forget)
 * after this call to trigger background AI enrichment.
 *
 * The product slug is NEVER changed here — this preserves the product URL.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please log in first' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const productId = params.id;

  const supabase = await getSupabaseServer();
  const admin = getSupabaseAdmin();

  // Verify the calling user is an approved vendor
  const { data: vendor, error: vendorErr } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (vendorErr || !vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }
  if (vendor.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved vendors can edit products' }, { status: 403 });
  }

  // Make sure this product belongs to this vendor
  const { data: existing, error: fetchErr } = await admin
    .from('products')
    .select('id, vendor_id, approval_status, vendor_edit_count')
    .eq('id', productId)
    .eq('vendor_id', vendor.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  if (existing.approval_status === 'awaiting_stock') {
    return NextResponse.json(
      { error: 'This product is awaiting stock pickup and cannot be edited right now. Contact us if you need help.' },
      { status: 409 }
    );
  }

  // Parse and validate editable fields
  const name = body?.name != null ? String(body.name).trim() : undefined;
  const fabric = body?.fabric != null ? String(body.fabric).trim() : undefined;
  const category_name = body?.category_name != null ? String(body.category_name).trim() : undefined;
  const category_id = body?.category_id !== undefined ? (body.category_id ? String(body.category_id) : null) : undefined;
  const available_quantity = body?.available_quantity != null ? Number(body.available_quantity) : undefined;
  const is_dead_stock = body?.is_dead_stock != null ? Boolean(body.is_dead_stock) : undefined;
  const vendor_expected_price =
    body?.vendor_expected_price === '' || body?.vendor_expected_price === null || body?.vendor_expected_price === undefined
      ? undefined
      : body?.vendor_expected_price === 'clear'
      ? null
      : Number(body.vendor_expected_price);
  const images = Array.isArray(body?.images)
    ? body.images.filter((u: unknown) => typeof u === 'string' && u)
    : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 });
  }
  if (images !== undefined && images.length === 0) {
    return NextResponse.json({ error: 'At least one product photo is required' }, { status: 400 });
  }
  if (available_quantity !== undefined && (!Number.isFinite(available_quantity) || available_quantity < 0)) {
    return NextResponse.json({ error: 'Quantity must be a non-negative number' }, { status: 400 });
  }

  // Build the update patch — only include fields that were provided
  const patch: Record<string, unknown> = {
    // Always reset to pending_review so AI re-enriches the listing.
    // The /api/vendor/ai-process/[id] route will flip it back to 'live'.
    approval_status: 'pending_review',
    // Increment edit count — used in admin panel to track how many times
    // this vendor has re-submitted the listing.
    vendor_edit_count: existing.vendor_edit_count != null
      ? existing.vendor_edit_count + 1
      : 1,
  };
  if (name !== undefined) patch.name = name;
  if (fabric !== undefined) patch.fabric = fabric;
  if (category_name !== undefined) patch.category_name = category_name;
  if (category_id !== undefined) patch.category_id = category_id;
  if (available_quantity !== undefined) {
    patch.available_quantity = available_quantity;
    patch.stock_quantity = available_quantity;
    patch.in_stock = available_quantity > 0;
  }
  if (is_dead_stock !== undefined) patch.is_dead_stock = is_dead_stock;
  if (images !== undefined) patch.images = images;

  // The vendor's price is their ASKING/COST price, never the live
  // website price directly — see lib/vendor-pricing.ts. Whenever it
  // changes we recompute `price`/`final_price` the same way the
  // create route (app/api/vendor/products/route.ts POST) does, so an
  // edit doesn't leave the website showing a stale or unmarked-up
  // number. Previously this route saved vendor_expected_price but
  // never touched price/final_price at all — that bug is fixed here.
  if (vendor_expected_price !== undefined) {
    patch.vendor_expected_price = vendor_expected_price;
    if (vendor_expected_price != null) {
      const shippingSettings = await fetchShippingSettings();
      const breakdown = computeVendorPriceBreakdown(vendor_expected_price, shippingSettings);
      patch.price = Math.max(0, breakdown.websitePrice);
      patch.final_price = Math.max(0, breakdown.websitePrice);
    }
    // If the vendor clears their price (vendor_expected_price === null),
    // we deliberately leave the existing price/final_price untouched —
    // there's nothing new to mark up from, and zeroing out a live
    // product's price would be worse than just keeping the last one.
  }

  const { data: updated, error: updateErr } = await admin
    .from('products')
    .update(patch)
    .eq('id', productId)
    .select(VENDOR_PRODUCT_COLUMNS)
    .single();

  if (updateErr) {
    const message = updateErr instanceof Error ? updateErr.message : 'Failed to update product';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ product: updated });
}

// Order-item stages that mean an order for this product is still being
// fulfilled — a product must not be deleted while one of these is open,
// since the vendor still owes that order a pickup/handover.
const IN_FLIGHT_STAGES = [
  'placed',
  'vendor_accepted',
  'picked_from_vendor',
  'received_at_warehouse',
  'packed',
  'shipped_to_customer',
  'quality_hold',
];

/**
 * DELETE /api/vendor/products/[id]
 *
 * Permanently removes one of this vendor's own products. Colour variations
 * (product_variants) cascade-delete automatically at the DB level.
 * order_items.product_id is ON DELETE SET NULL, so past order history is
 * preserved (order_items keeps its own product_name copy) — but we still
 * refuse to delete while an order for this product is actively in flight,
 * since the vendor still needs to hand that stock over.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please log in first' }, { status: 401 });

  const productId = params.id;
  const supabase = await getSupabaseServer();
  const admin = getSupabaseAdmin();

  const { data: vendor, error: vendorErr } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (vendorErr || !vendor) {
    return NextResponse.json({ error: 'No vendor profile found for this account' }, { status: 403 });
  }
  if (vendor.status === 'suspended') {
    return NextResponse.json({ error: 'Your vendor account has been suspended' }, { status: 403 });
  }

  // Make sure this product actually belongs to this vendor
  const { data: existing, error: fetchErr } = await admin
    .from('products')
    .select('id, vendor_id, approval_status')
    .eq('id', productId)
    .eq('vendor_id', vendor.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  if (existing.approval_status === 'awaiting_stock') {
    return NextResponse.json(
      { error: 'This product is awaiting stock pickup and cannot be deleted right now. Contact us if you need help.' },
      { status: 409 }
    );
  }

  // Refuse to delete while an order for this product is still being fulfilled.
  const { count: inFlightCount, error: orderCheckErr } = await admin
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .in('stage', IN_FLIGHT_STAGES);

  if (orderCheckErr) {
    return NextResponse.json({ error: orderCheckErr.message }, { status: 500 });
  }
  if (inFlightCount && inFlightCount > 0) {
    return NextResponse.json(
      { error: 'This product has an order still being fulfilled and cannot be deleted until it completes.' },
      { status: 409 }
    );
  }

  const { error: deleteErr } = await admin.from('products').delete().eq('id', productId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
