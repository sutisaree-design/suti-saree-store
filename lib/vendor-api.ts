// ---------------------------------------------------------------------
// Vendor sourcing (internal — never shown to customers). Phase 1:
// application, admin approve/reject, and the secure bank-detail-change
// request flow.
// ---------------------------------------------------------------------

import { getSupabaseBrowser } from './supabase-browser';

export interface VendorProfile {
  id: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  pan_number: string;
  gst_number: string | null;
  pickup_address: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  expected_category: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  pending_bank_update: {
    bank_account_number: string;
    bank_ifsc: string;
    upi_id: string | null;
    requested_at: string;
  } | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  admin_note: string | null;
  created_at: string;
  /** URL-safe handle for the vendor's public storefront, e.g. /store/aruhi-weaves. */
  storefront_slug: string | null;
  /** Admin-only toggle (Admin > Vendors). When true, the public storefront
   *  page and the "<Vendor>'s Collection" widget on product pages show an
   *  aggregate rating/review summary for this vendor. When false, the
   *  same pages still show the vendor's product listing, just without
   *  that rating block. */
  show_public_rating: boolean;
  /** How many days a returned/RTO unit sits in the warehouse before it's
   *  auto-flagged in Return to Vendor. Vendor-configurable, 15 (default) to
   *  30 — see update_vendor_stock_hold_days(). */
  stock_hold_days: number;
}

export interface VendorApplicationInput {
  business_name: string;
  owner_name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  pan_number: string;
  gst_number?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  expected_category?: string;
}

/** Result of checking whether a prospective business name would collide
 *  with an existing vendor storefront or admin collection (they share the
 *  /collection/[slug] URL space) -- backs the live warning on the
 *  /sell-with-us form. `conflict` is null when the name is free. */
export interface VendorNameConflict {
  name: string;
  slug: string;
  type: 'vendor' | 'collection';
}

export async function checkVendorNameAvailability(name: string): Promise<VendorNameConflict | null> {
  if (!name.trim()) return null;
  try {
    const res = await fetch(`/api/vendor/check-name?name=${encodeURIComponent(name.trim())}`);
    if (!res.ok) return null;
    const body = await res.json();
    return (body.conflict as VendorNameConflict | null) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Vendor-facing (logged-in customer applying / managing their own vendor account)
// ---------------------------------------------------------------------

/** Fetches the current user's vendor profile, or null if they haven't applied yet. */
export async function fetchMyVendorProfile(): Promise<VendorProfile | null> {
  const res = await fetch('/api/vendor', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load vendor profile');
  }
  const body = await res.json();
  return body.vendor as VendorProfile | null;
}

/** Submits a new /sell-with-us application for the logged-in user. */
export async function submitVendorApplication(input: VendorApplicationInput): Promise<VendorProfile> {
  const res = await fetch('/api/vendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to submit application');
  }
  const body = await res.json();
  return body.vendor as VendorProfile;
}

/**
 * Requests a bank-detail change. This never updates bank_account_number
 * directly — it stages the request for admin approval (see the
 * request_vendor_bank_update() RPC in the Phase 1 migration).
 */
export async function requestVendorBankUpdate(
  newAccountNumber: string,
  newIfsc: string,
  newUpiId?: string
): Promise<void> {
  const res = await fetch('/api/vendor/bank-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bank_account_number: newAccountNumber,
      bank_ifsc: newIfsc,
      upi_id: newUpiId || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to request bank detail update');
  }
}

// ---------------------------------------------------------------------
// Admin (Admin > Vendors tab)
// ---------------------------------------------------------------------

export interface AdminVendorRow extends VendorProfile {}

export async function fetchAdminVendors(): Promise<AdminVendorRow[]> {
  const res = await fetch('/api/admin/vendors');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load vendors');
  }
  const body = await res.json();
  return body.vendors as AdminVendorRow[];
}

export async function updateAdminVendorStatus(
  id: string,
  status: 'approved' | 'rejected' | 'suspended' | 'pending',
  admin_note?: string
): Promise<void> {
  const res = await fetch('/api/admin/vendors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, admin_note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update vendor');
  }
}

/** Admin-only: turn the public rating/review summary on the vendor's
 *  storefront page (and the "<Vendor>'s Collection" widget) on or off.
 *  Doesn't touch approval status or anything else. */
export async function updateAdminVendorShowRating(id: string, show_public_rating: boolean): Promise<void> {
  const res = await fetch('/api/admin/vendors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, show_public_rating }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update vendor');
  }
}

/** Approve or reject a vendor's pending bank-detail change request. */
export async function reviewAdminVendorBankUpdate(id: string, action: 'approve' | 'reject'): Promise<void> {
  const res = await fetch('/api/admin/vendors/bank-update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to review bank update request');
  }
}

// ---------------------------------------------------------------------
// Phase 2 — Vendor Product Listing (vendor-facing)
// ---------------------------------------------------------------------

export type VendorProductApprovalStatus =
  | 'draft'
  | 'pending_review'
  | 'awaiting_stock'
  | 'live'
  | 'rejected';

/** Shape of a product row as returned to the VENDOR who owns it. Only
 *  fields the vendor is allowed to see about their own submission —
 *  this is a distinct, deliberately narrower shape than the admin's
 *  view, and is never used for customer-facing product data. */
export interface VendorProductRow {
  id: string;
  name: string;
  slug: string;
  images: string[];
  fabric: string | null;
  category_name: string | null;
  available_quantity: number;
  vendor_expected_price: number | null;
  ai_suggested_price: number | null;
  final_price: number | null;
  is_dead_stock: boolean;
  approval_status: VendorProductApprovalStatus;
  barcode: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface VendorProductInput {
  name: string;
  images: string[];
  fabric: string;
  category_id?: string | null;
  category_name: string;
  available_quantity: number;
  vendor_expected_price?: number | null;
  is_dead_stock: boolean;
  /** Vendor's acceptance of: "returned 2x -> sent back to me, cost deducted
   *  from my next settlement." Required — the API rejects the listing
   *  without it. See app/api/vendor/products/route.ts. */
  vendor_return_consent: boolean;
}

/** Publishes a new product straight to the live site — no admin review
 *  step. Server sets approval_status = 'live' and auto-generates the
 *  barcode — the vendor never supplies either. */
export async function submitVendorProduct(input: VendorProductInput): Promise<VendorProductRow> {
  const res = await fetch('/api/vendor/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to submit product');
  }
  const body = await res.json();
  return body.product as VendorProductRow;
}

/** All products this vendor has ever submitted, newest first. */
export async function fetchMyVendorProducts(): Promise<VendorProductRow[]> {
  const res = await fetch('/api/vendor/products');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load your products');
  }
  const body = await res.json();
  return body.products as VendorProductRow[];
}

/** Updates basic fields of an existing vendor product (name, fabric, category,
 *  quantity, price, dead-stock flag, images). The server resets the product to
 *  'pending_review' so AI can re-enrich it — callers should fire
 *  triggerVendorAIProcess(id, true) afterwards. */
export async function updateVendorProduct(
  id: string,
  input: Partial<VendorProductInput>
): Promise<VendorProductRow> {
  const res = await fetch(`/api/vendor/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update product');
  }
  const body = await res.json();
  return body.product as VendorProductRow;
}

/** Permanently deletes one of this vendor's own products (and its colour
 *  variations, which cascade-delete in the database). Blocked server-side
 *  if the product has any order still in flight. */
export async function deleteVendorProduct(id: string): Promise<void> {
  const res = await fetch(`/api/vendor/products/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete product');
  }
}

/** Fire-and-forget: tells the server to run AI enrichment for the given
 *  product ID, then publish it live and email the vendor.
 *  Pass isEdit=true when this follows an edit (uses the edit email template).
 *  The promise is intentionally not awaited by callers — use
 *  `.catch(() => {})` to suppress unhandled-rejection warnings.
 *
 *  keepalive:true ensures the request outlives the current page — critical
 *  for the edit flow where router.replace() navigates away before the
 *  response comes back. Without this, the browser cancels the in-flight
 *  request on navigation and the product gets stuck in pending_review. */
export function triggerVendorAIProcess(id: string, isEdit = false): Promise<Response> {
  const url = `/api/vendor/ai-process/${id}${isEdit ? '?edit=true' : ''}`;
  return fetch(url, { method: 'POST', keepalive: true });
}

/** Fire-and-forget: tells the server to auto-post this (already-created,
 *  already-live) product to Facebook/Instagram/Threads per Admin >
 *  Marketing > Social Auto-Post settings. Used after Admin > Products >
 *  "Add Product", and by the three separate per-platform Share buttons in
 *  the Manage Products catalog — since that insert/click happens directly
 *  from the browser and the Meta access token must never be exposed
 *  client-side. Pass `platform` to target just one of Facebook / Instagram
 *  / Threads (omit to post to every platform enabled in settings, the
 *  original auto-post-on-create behaviour). Callers should `.catch(() => {})`. */
export function triggerSocialAutoPost(
  productId: string,
  force = false,
  platform?: 'facebook' | 'instagram' | 'threads'
): Promise<Response> {
  return fetch('/api/social/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, force, platform }),
    keepalive: true,
  });
}

/** Posts a product's already-generated slideshow video (see
 *  lib/slideshow-video-generator.ts + /api/admin/product-video/upload)
 *  to one platform. Used by the per-platform "Post Video" buttons shown
 *  once Admin > Products > "Generate Video" has produced a video_url. */
export function triggerVideoPublish(
  productId: string,
  platform: 'facebook' | 'instagram' | 'threads'
): Promise<Response> {
  return fetch('/api/social/publish-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, platform }),
  });
}

// ---------------------------------------------------------------------
// Phase 2, Part 5 — Admin "Vendor Submissions" (Admin > Products tab)
// ---------------------------------------------------------------------

/** Full admin-side shape of a vendor-sourced product row — includes the
 *  vendor's own business name (joined server-side) plus every field the
 *  admin is allowed to see/edit. Never reused for customer-facing data. */
export interface AdminVendorProductRow {
  id: string;
  name: string;
  slug: string;
  images: string[];
  fabric: string | null;
  category_name: string | null;
  available_quantity: number;
  quantity_last_updated_at: string;
  vendor_expected_price: number | null;
  ai_suggested_price: number | null;
  final_price: number | null;
  price: number;
  is_dead_stock: boolean;
  approval_status: VendorProductApprovalStatus;
  barcode: string | null;
  rejection_reason: string | null;
  vendor_id: string;
  vendor_edit_count: number | null;
  created_at: string;
  vendors: { business_name: string; email: string | null; whatsapp: string | null; phone: string } | null;
}

/** All vendor-sourced products, optionally filtered by approval_status. */
export async function fetchAdminVendorProducts(
  status?: VendorProductApprovalStatus
): Promise<AdminVendorProductRow[]> {
  const url = status ? `/api/admin/vendor-products?status=${status}` : '/api/admin/vendor-products';
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load vendor submissions');
  }
  const body = await res.json();
  return body.products as AdminVendorProductRow[];
}

/** Edits/confirms the final price without changing approval_status. */
export async function updateAdminVendorProductPrice(
  id: string,
  final_price: number
): Promise<AdminVendorProductRow> {
  const res = await fetch('/api/admin/vendor-products', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'update_price', final_price }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update price');
  }
  const body = await res.json();
  return body.product as AdminVendorProductRow;
}

/** Rejects a submission. reason is mandatory. */
export async function rejectAdminVendorProduct(
  id: string,
  rejection_reason: string
): Promise<AdminVendorProductRow> {
  const res = await fetch('/api/admin/vendor-products', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'reject', rejection_reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to reject product');
  }
  const body = await res.json();
  return body.product as AdminVendorProductRow;
}

// ---------------------------------------------------------------------
// Phase 3B — Vendor "My Orders" dashboard (vendor-facing)
//
// NOTE ON CUSTOMER-DATA MASKING: every field below comes from
// `order_items` only — no customer name/phone/address column exists on
// this table at all, and the /api/vendor/orders route explicitly lists
// which columns it selects (never `select('*')`) and filters by this
// vendor's own vendor_id server-side, on top of whatever RLS is in
// place. See that route's comments for the full reasoning.
// ---------------------------------------------------------------------

export type VendorOrderItemStage =
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

export interface VendorOrderItemRow {
  id: string;
  order_id: string;
  product_name: string;
  product_image: string | null;
  barcode: string | null;
  quantity: number;
  price: number;
  stage: VendorOrderItemStage;
  vendor_accept_deadline: string | null;
  vendor_accepted_at: string | null;
  pickup_requested_at: string | null;
  pickup_photo_url: string | null;
  created_at: string;
  /** Live Delhivery courier status for the warehouse -> customer leg —
   *  'in_transit' | 'delivered' | 'rto_initiated' | 'rto_delivered' | null
   *  (null until Admin books the forward shipment). */
  delivery_status: string | null;
  delivery_status_updated_at: string | null;
}

/** Every order item ever placed against this vendor's products — never
 *  includes the customer's name, phone, or address. */
export async function fetchMyVendorOrders(): Promise<VendorOrderItemRow[]> {
  const res = await fetch('/api/vendor/orders');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load your orders');
  }
  const body = await res.json();
  return body.orders as VendorOrderItemRow[];
}

export interface VendorReturnRiskStats {
  total_items: number;
  return_count: number;
  rto_count: number;
  return_rate_percent: number | null;
  rto_rate_percent: number | null;
}

/** This vendor's own aggregate return + RTO rate — no customer data,
 *  see app/api/vendor/return-risk/route.ts. */
export async function fetchMyReturnRiskStats(): Promise<VendorReturnRiskStats> {
  const res = await fetch('/api/vendor/return-risk');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load return/RTO stats');
  }
  return res.json();
}

/** Vendor accepts an order item -> stage 'vendor_accepted'. */
export async function acceptVendorOrderItem(orderItemId: string): Promise<VendorOrderItemRow> {
  return vendorOrderAction(orderItemId, { action: 'accept' });
}

/** Vendor rejects an order item -> stage 'cancelled', stock restocked, customer notified. */
export async function rejectVendorOrderItem(orderItemId: string): Promise<VendorOrderItemRow> {
  return vendorOrderAction(orderItemId, { action: 'reject' });
}

/** Vendor requests pickup — only creates an admin-visible task, no live courier call yet. */
export async function requestVendorPickup(orderItemId: string): Promise<VendorOrderItemRow> {
  return vendorOrderAction(orderItemId, { action: 'request_pickup' });
}

/** Vendor marks the item handed off to courier + attaches the handoff photo -> stage 'picked_from_vendor'. */
export async function markVendorPickedUp(
  orderItemId: string,
  pickup_photo_url: string
): Promise<VendorOrderItemRow> {
  return vendorOrderAction(orderItemId, { action: 'mark_picked_up', pickup_photo_url });
}

async function vendorOrderAction(
  orderItemId: string,
  payload: Record<string, unknown>
): Promise<VendorOrderItemRow> {
  const res = await fetch(`/api/vendor/orders/${orderItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update order');
  }
  const body = await res.json();
  return body.order as VendorOrderItemRow;
}

/** Uploads the pickup-handoff photo to the public `order-fulfillment-photos`
 *  bucket (same simple pattern as uploadReviewPhoto/uploadProductImage) and
 *  returns its public URL. Does NOT save it against the order item — call
 *  markVendorPickedUp() with the returned URL to do that. */
export async function uploadPickupProofPhoto(file: File): Promise<string> {
  const supabase = getSupabaseBrowser();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage
    .from('order-fulfillment-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('order-fulfillment-photos').getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------
// Phase 4B — Settlements/Earnings UI. Pure display of what Phase 4A's
// triggers + weekly cron already calculated — no new math here.
// ---------------------------------------------------------------------

export interface VendorSettlementRow {
  id: string;
  vendor_id?: string;
  vendor_name?: string; // present only on the admin-facing fetch
  week_start: string;
  week_end: string;
  total_amount: number;
  clawback_deducted: number;
  status: 'pending' | 'paid';
  payment_reference: string | null;
  paid_date: string | null;
  created_at: string;
}

export interface VendorEarningsSummary {
  total_sales: number;
  total_fee: number;
  total_payable: number;
  total_paid: number;
  total_pending_settlement: number;
  total_unsettled: number;
  clawback_pending: number;
}

/** Vendor-facing (their own dashboard "Earnings" tab). */
export async function fetchMyVendorEarnings(): Promise<{
  summary: VendorEarningsSummary;
  settlements: VendorSettlementRow[];
}> {
  const res = await fetch('/api/vendor/earnings');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load your earnings');
  }
  return res.json();
}

/** Admin-facing (Admin > Vendor Settlements). Every settlement, every vendor. */
export async function fetchAdminSettlements(): Promise<VendorSettlementRow[]> {
  const res = await fetch('/api/admin/settlements');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load settlements');
  }
  const body = await res.json();
  return body.settlements as VendorSettlementRow[];
}

/** Marks a settlement 'paid'. payment_reference is mandatory (matches the DB route). */
export async function markSettlementPaid(
  id: string,
  payment_reference: string,
  paid_date?: string
): Promise<VendorSettlementRow> {
  const res = await fetch(`/api/admin/settlements/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_reference, paid_date }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to mark settlement as paid');
  }
  const body = await res.json();
  return body.settlement as VendorSettlementRow;
}

// ---------------------------------------------------------------------
// Phase 4C — Return Timers, Restock Alerts, Vendor Performance,
// Stale Inventory, Off-boarding (Admin "Vendor Ops" panel).
// ---------------------------------------------------------------------

export interface ReturnToVendorRow {
  id: string;
  vendor_id: string;
  business_name: string;
  product_id: string | null;
  product_name: string;
  order_item_id: string | null;
  quantity: number | null;
  reason:
    | 'never_sold_90d'
    | 'cancelled_returned_60d'
    | 'offboarding'
    | 'returned_2x_consent'
    | 'unsold_after_return';
  note: string | null;
  created_at: string;
  /** Only set for reason='unsold_after_return' — the vendor's hold deadline
   *  that was already crossed when this row got created. */
  hold_deadline: string | null;
}

export interface StockHoldRow {
  id: string;
  vendor_id: string;
  business_name: string;
  stock_hold_days_setting: number;
  product_id: string | null;
  product_name: string;
  order_item_id: string;
  source: 'return' | 'rto';
  returned_at: string;
  hold_days: number;
  hold_deadline: string;
  status: 'holding' | 'resold' | 'flagged' | 'returned';
}

export interface RestockSuggestionRow {
  product_id: string;
  product_name: string;
  vendor_id: string;
  business_name: string;
  available_quantity: number;
  sold_last_30d: number;
  sell_through_percent: number;
}

export interface VendorPerformanceRow {
  vendor_id: string;
  business_name: string;
  total_items: number;
  delivered_count: number;
  cancelled_count: number;
  returned_count: number;
  sell_through_rate: number | null;
  cancellation_rate: number | null;
  return_rate: number | null;
  avg_accept_time_minutes: number | null;
  received_count: number;
  quality_hold_count: number;
  quality_check_fail_rate: number | null;
  missed_order_count: number;
}

export interface StaleInventoryRow {
  product_id: string;
  product_name: string;
  vendor_id: string;
  business_name: string;
  available_quantity: number;
  quantity_last_updated_at: string;
  days_stale: number;
}

async function fetchVendorOps<T>(type: string): Promise<T[]> {
  const res = await fetch(`/api/admin/vendor-ops?type=${type}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load data');
  }
  const body = await res.json();
  return body.rows as T[];
}

export const fetchReturnToVendorQueue = () => fetchVendorOps<ReturnToVendorRow>('return-to-vendor');
export const fetchRestockSuggestions = () => fetchVendorOps<RestockSuggestionRow>('restock');
export const fetchVendorPerformance = () => fetchVendorOps<VendorPerformanceRow>('performance');
export const fetchStaleInventory = () => fetchVendorOps<StaleInventoryRow>('stale');
export const fetchStockHoldTimers = () => fetchVendorOps<StockHoldRow>('stock-holds');

// ---------------------------------------------------------------------
// Vendor's own "stock hold days" setting (Vendor > Settings) — how long
// a returned/RTO unit of theirs sits in the warehouse before it's
// auto-flagged in Return to Vendor. Min 15, max 30.
// ---------------------------------------------------------------------

export async function fetchMyStockHoldDays(): Promise<number> {
  const res = await fetch('/api/vendor/settings');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load settings');
  }
  const body = await res.json();
  return body.stock_hold_days as number;
}

export async function updateMyStockHoldDays(days: number): Promise<number> {
  const res = await fetch('/api/vendor/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_hold_days: days }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update settings');
  }
  const body = await res.json();
  return body.stock_hold_days as number;
}

/** Vendor's own active/overdue stock-hold timers (My Orders / Add Product page). */
export async function fetchMyStockHoldTimers(): Promise<StockHoldRow[]> {
  const res = await fetch('/api/vendor/stock-holds');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load stock hold timers');
  }
  const body = await res.json();
  return body.rows as StockHoldRow[];
}

/** Marks a Return-to-Vendor queue row as physically returned. */
export async function markReturnToVendorResolved(id: string): Promise<void> {
  const res = await fetch('/api/admin/vendor-ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update queue row');
  }
}

/** Full off-boarding: return stock immediately, finalize settlement, suspend. */
export async function closeVendorAccount(id: string): Promise<{
  products_flagged: number;
  final_settlement_id: string | null;
  final_settlement_amount: number | null;
}> {
  const res = await fetch('/api/admin/vendors/close-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to close vendor account');
  }
  return res.json();
}

// ---------------------------------------------------------------------
// Phase 5A — Vendor KYC Documents (PAN card, GST certificate, bank
// proof). Files live in the PRIVATE `vendor-kyc-documents` bucket —
// every URL below is a short-lived signed URL minted server-side by
// /api/vendor/kyc or /api/admin/vendor-kyc, never a permanent public
// link. Uploads also go through those routes (not direct browser
// storage access like uploadPickupProofPhoto above) since the bucket
// has no policies for the anon/authenticated roles.
// ---------------------------------------------------------------------

export type VendorKycDocType = 'pan_card' | 'gst_certificate' | 'bank_proof';
export type VendorKycStatus = 'pending' | 'verified' | 'rejected';

export interface VendorKycDocument {
  id: string;
  vendor_id?: string; // present only on the admin-facing fetch
  doc_type: VendorKycDocType;
  original_filename: string | null;
  status: VendorKycStatus;
  admin_note: string | null;
  uploaded_at: string;
  reviewed_at?: string | null;
  url: string | null; // signed URL, valid ~5 minutes
}

/** Vendor-facing: this vendor's own KYC documents. */
export async function fetchMyVendorKyc(): Promise<VendorKycDocument[]> {
  const res = await fetch('/api/vendor/kyc');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load your KYC documents');
  }
  const body = await res.json();
  return body.documents as VendorKycDocument[];
}

/** Vendor-facing: upload (or re-upload) one KYC document. Re-uploading
 *  replaces the previous file and resets its status to 'pending'. */
export async function uploadVendorKycDocument(
  doc_type: VendorKycDocType,
  file: File
): Promise<VendorKycDocument> {
  const formData = new FormData();
  formData.append('doc_type', doc_type);
  formData.append('file', file);

  const res = await fetch('/api/vendor/kyc', { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to upload document');
  }
  const body = await res.json();
  return body.document as VendorKycDocument;
}

/** Admin-facing: KYC documents for one vendor, or every vendor if omitted. */
export async function fetchAdminVendorKyc(vendorId?: string): Promise<VendorKycDocument[]> {
  const url = vendorId ? `/api/admin/vendor-kyc?vendor_id=${vendorId}` : '/api/admin/vendor-kyc';
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load KYC documents');
  }
  const body = await res.json();
  return body.documents as VendorKycDocument[];
}

/** Admin-facing: verify or reject one document. */
export async function reviewAdminVendorKyc(
  id: string,
  action: 'verify' | 'reject',
  admin_note?: string
): Promise<VendorKycDocument> {
  const res = await fetch('/api/admin/vendor-kyc', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action, admin_note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to review document');
  }
  const body = await res.json();
  return body.document as VendorKycDocument;
}


// ---------------------------------------------------------------------
// Phase 5B — Admin Monthly Reporting. Vendor-wise sales/fee/payable/
// paid/pending for one calendar month, built from the same order_items
// + vendor_settlements data as the Phase 4A/4B settlement flow (no new
// tables). CSV/PDF export hit the same route with ?format=csv|pdf and
// are downloaded directly rather than parsed as JSON.
// ---------------------------------------------------------------------

export interface VendorMonthlyReportRow {
  vendor_id: string;
  vendor_name: string;
  total_sales: number;
  fee_collected: number;
  payable_total: number;
  paid_amount: number;
  pending_amount: number;
}

/** month is "YYYY-MM"; omit for the current calendar month. */
export async function fetchAdminVendorMonthlyReport(
  month?: string
): Promise<{ month_label: string; rows: VendorMonthlyReportRow[] }> {
  const url = month
    ? `/api/admin/vendor-monthly-report?month=${month}`
    : '/api/admin/vendor-monthly-report';
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load the monthly report');
  }
  return res.json();
}

/** Triggers a browser download for the CSV or PDF export of a given month. */
export function downloadAdminVendorMonthlyReport(month: string, format: 'csv' | 'pdf') {
  const url = `/api/admin/vendor-monthly-report?month=${month}&format=${format}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ------------------------------------------------------------------ */
/* Vendor colour/size variants (add-ons to an already-live product)   */
/* ------------------------------------------------------------------ */

export interface VendorVariantSize {
  id: string;
  size: string;
  stock_quantity: number;
  sku: string | null;
}

export interface VendorVariant {
  id: string;
  product_id: string;
  color: string;
  slug: string;
  images: string[];
  price_override: number | null;
  sku: string | null;
  is_default: boolean;
  created_at: string;
  sizes: VendorVariantSize[];
}

/** Bulk variant-count lookup for the vendor's whole product list (one call, not N). */
export async function fetchMyVendorVariantCounts(): Promise<Record<string, number>> {
  const res = await fetch('/api/vendor/variants/counts');
  if (!res.ok) return {};
  const data = await res.json();
  return data.counts ?? {};
}

export async function fetchMyVendorVariants(productId: string): Promise<VendorVariant[]> {
  const res = await fetch(`/api/vendor/variants?product_id=${productId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load variants');
  }
  const data = await res.json();
  return data.variants ?? [];
}

export interface CreateVendorVariantInput {
  product_id: string;
  color: string;
  images: string[];
  price_override?: number | null;
  sizes: { size: string; stock_quantity: number }[];
}

export async function createVendorVariant(input: CreateVendorVariantInput): Promise<VendorVariant> {
  const res = await fetch('/api/vendor/variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add variant');
  return data.variant;
}

export interface UpdateVendorVariantInput {
  color?: string;
  images?: string[];
  price_override?: number | null;
  sizes?: { size: string; stock_quantity: number }[];
}

export async function updateVendorVariant(id: string, input: UpdateVendorVariantInput): Promise<VendorVariant> {
  const res = await fetch(`/api/vendor/variants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update variant');
  return data.variant;
}

export async function deleteVendorVariant(id: string): Promise<void> {
  const res = await fetch(`/api/vendor/variants/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete variant');
  }
}
