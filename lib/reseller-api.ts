// ---------------------------------------------------------------------
// Reseller program — lets any logged-in customer (SAME account/email,
// no separate signup) resell products with their own margin. The store
// owner still packs & ships every order (dropship style); the reseller
// just places the order on behalf of their own end-customer and earns
// the difference between the base price and what they charged.
// ---------------------------------------------------------------------

export interface ResellerProfile {
  id: string;
  user_id: string;
  status: 'active' | 'suspended';
  /** Flat rupee amount added on top of the base price, e.g. 100 (not a %). */
  default_markup_amount: number;
  business_name: string | null;
  /** Where the admin should send the reseller's margin once it's eligible. */
  payout_upi_id: string | null;
  payout_account_holder: string | null;
  created_at: string;
}

export interface ResellerEarnings {
  totalOrders: number;
  totalSales: number; // sum of what reseller's customers paid
  totalProfit: number; // reseller's earnings (sales - base cost)
  pendingOrders: number;
  /** Margin on orders not yet delivered — nothing to pay yet. */
  pendingDeliveryProfit: number;
  /** Margin on delivered orders still inside the return window — not payable yet. */
  inReturnWindowProfit: number;
  /** Margin on orders past the return window, owed but not yet paid by the admin. */
  eligibleProfit: number;
  /** Margin the admin has already paid out. */
  paidProfit: number;
}

export interface ResellerOverview {
  profile: ResellerProfile | null;
  earnings: ResellerEarnings;
}

/** Fetches the current user's reseller profile (null if they haven't joined yet). */
export async function fetchMyResellerOverview(): Promise<ResellerOverview> {
  const res = await fetch('/api/reseller');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load reseller data');
  }
  return res.json();
}

/** Joins the reseller program using the SAME logged-in account. */
export async function joinResellerProgram(defaultMarkupAmount = 100): Promise<ResellerProfile> {
  const res = await fetch('/api/reseller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_markup_amount: defaultMarkupAmount }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to join reseller program');
  }
  const body = await res.json();
  return body.profile as ResellerProfile;
}

/** Updates the reseller's default markup amount (flat rupees, not a %). */
export async function updateResellerDefaultMarkup(defaultMarkupAmount: number): Promise<void> {
  const res = await fetch('/api/reseller', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_markup_amount: defaultMarkupAmount }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update default markup');
  }
}

/** Updates where the reseller wants their margin paid out (UPI ID + account holder name). */
export async function updateResellerPayoutDetails(payoutUpiId: string, payoutAccountHolder: string): Promise<void> {
  const res = await fetch('/api/reseller', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payout_upi_id: payoutUpiId, payout_account_holder: payoutAccountHolder }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update payout details');
  }
}

/** Given a base price and a flat rupee markup, returns the price to charge the reseller's own customer. */
export function resellerSellingPrice(basePrice: number, markupAmount: number): number {
  return Math.round(basePrice + markupAmount);
}

// ---------------------------------------------------------------------
// Placing orders on behalf of the reseller's own customers
// ---------------------------------------------------------------------

export interface ResellerOrderItemInput {
  product_id: string;
  quantity: number;
  size?: string | null;
}

export interface PlaceResellerOrderInput {
  items: ResellerOrderItemInput[];
  margin_percent: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  shipping_address: {
    address: string;
    address2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
}

export async function placeResellerOrder(input: PlaceResellerOrderInput): Promise<{ id: string }> {
  const res = await fetch('/api/reseller/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to place order');
  }
  return res.json();
}

export interface ResellerOrderRow {
  id: string;
  items: any[];
  total_amount: number;
  reseller_base_cost: number;
  reseller_profit: number;
  reseller_margin_percent: number;
  status: string;
  delivery_status: string | null;
  /** pending_delivery | in_return_window | eligible | paid | void — see reseller payout system. */
  reseller_payout_status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: any;
  created_at: string;
}

export async function fetchMyResellerOrders(): Promise<ResellerOrderRow[]> {
  const res = await fetch('/api/reseller/orders');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load orders');
  }
  const body = await res.json();
  return body.orders as ResellerOrderRow[];
}

// ---------------------------------------------------------------------
// Admin (Admin > Resellers tab)
// ---------------------------------------------------------------------

export interface AdminResellerRow {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'suspended';
  defaultMarkupAmount: number;
  createdAt: string;
  totalOrders: number;
  totalSales: number;
  totalProfit: number;
}

export interface AdminResellersOverview {
  resellers: AdminResellerRow[];
  totalResellers: number;
  totalOrders: number;
  totalSales: number;
}

export async function fetchAdminResellersOverview(): Promise<AdminResellersOverview> {
  const res = await fetch('/api/admin/resellers');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load resellers');
  }
  return res.json();
}

export async function updateAdminResellerStatus(id: string, status: 'active' | 'suspended'): Promise<void> {
  const res = await fetch('/api/admin/resellers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update reseller');
  }
}

// ---------------------------------------------------------------------
// Admin (Admin > Resellers > Payouts tab) — margin is only payable once
// an order is delivered. See supabase/migrations/20260803140000_reseller_payout_system.sql.
// ---------------------------------------------------------------------

export interface AdminResellerEligibleOrder {
  id: string;
  customerName: string | null;
  totalAmount: number;
  resellerProfit: number;
  deliveredAt: string | null;
  createdAt: string;
}

export interface AdminResellerPayoutRow {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  status: 'active' | 'suspended';
  payoutUpiId: string | null;
  payoutAccountHolder: string | null;
  pendingDeliveryAmount: number;
  pendingDeliveryCount: number;
  inReturnWindowAmount: number;
  inReturnWindowCount: number;
  eligibleAmount: number;
  eligibleOrders: AdminResellerEligibleOrder[];
  paidAmount: number;
  voidAmount: number;
  voidCount: number;
}

export interface AdminPayoutHistoryRow {
  id: string;
  resellerId: string;
  resellerName: string;
  totalAmount: number;
  orderCount: number;
  paymentReference: string | null;
  notes: string | null;
  paidAt: string;
}

export interface AdminResellerPayoutsOverview {
  resellers: AdminResellerPayoutRow[];
  payoutHistory: AdminPayoutHistoryRow[];
  totals: { pendingDelivery: number; inReturnWindow: number; eligible: number; paid: number };
}

export async function fetchAdminResellerPayouts(): Promise<AdminResellerPayoutsOverview> {
  const res = await fetch('/api/admin/reseller-payouts');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load reseller payouts');
  }
  return res.json();
}

export async function markResellerPayoutPaid(
  resellerId: string,
  orderIds: string[],
  paymentReference: string,
  notes?: string
): Promise<void> {
  const res = await fetch('/api/admin/reseller-payouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reseller_id: resellerId, order_ids: orderIds, payment_reference: paymentReference, notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to record payout');
  }
}
