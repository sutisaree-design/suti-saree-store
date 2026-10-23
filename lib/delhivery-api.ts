/**
 * Delhivery courier integration.
 *
 * SECURITY NOTE: The Delhivery API token is a secret and must NEVER be
 * stored in the `settings` table — that table is readable by anyone with
 * the public Supabase anon key (see the `anon_select_settings` RLS
 * policy), so anything saved there is effectively public. The token is
 * read from a server-only environment variable instead:
 *
 *   DELHIVERY_API_TOKEN   — API token from your Delhivery dashboard
 *   DELHIVERY_ENV         — "staging" or "production" (default: "staging")
 *
 * Set these in Vercel → Project → Settings → Environment Variables (and in
 * your local .env for `next dev`). Everything else (pickup warehouse name,
 * address, GST) is NOT secret and is editable from the admin panel.
 *
 * This module is imported only from server-side code (API routes / server
 * components) — never import it from a 'use client' component.
 */

import { getServerSupabase } from './supabase-server';
import { getSupabaseBrowser } from './supabase-browser';

export interface DelhiverySettings {
  enabled: boolean;
  /** Must exactly match the warehouse/pickup location name registered in your Delhivery dashboard (case-sensitive). */
  pickup_location_name: string;
  pickup_pincode: string;
  pickup_phone: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  /** Seller GST TIN — mandatory field in Delhivery's order creation API. */
  seller_gst_tin: string;
}

export const DEFAULT_DELHIVERY_SETTINGS: DelhiverySettings = {
  enabled: false,
  pickup_location_name: '',
  pickup_pincode: '',
  pickup_phone: '',
  pickup_address: '',
  pickup_city: '',
  pickup_state: '',
  seller_gst_tin: '',
};

const SETTINGS_KEY = 'delhivery';

/** Read pickup/warehouse config. Safe to call from client components (no secrets in here). */
export async function fetchDelhiverySettings(): Promise<DelhiverySettings> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_DELHIVERY_SETTINGS;
  return { ...DEFAULT_DELHIVERY_SETTINGS, ...(data.value as Partial<DelhiverySettings>) };
}

export async function saveDelhiverySettings(settings: DelhiverySettings): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: settings }, { onConflict: 'key' });
  if (error) throw error;
}

/** Server-only variant (used inside API routes where we don't have a browser session). */
async function fetchDelhiverySettingsServer(): Promise<DelhiverySettings> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_DELHIVERY_SETTINGS;
  return { ...DEFAULT_DELHIVERY_SETTINGS, ...(data.value as Partial<DelhiverySettings>) };
}

function getEnvironment(): 'staging' | 'production' {
  return process.env.DELHIVERY_ENV === 'production' ? 'production' : 'staging';
}

function getBaseUrl(): string {
  return getEnvironment() === 'production'
    ? 'https://track.delhivery.com'
    : 'https://staging-express.delhivery.com';
}

function getApiToken(): string {
  const token = process.env.DELHIVERY_API_TOKEN;
  if (!token) {
    throw new Error(
      'DELHIVERY_API_TOKEN is not set. Add it in your environment variables (Vercel → Settings → Environment Variables) to enable courier integration.'
    );
  }
  return token;
}

export interface OrderForShipment {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  payment_method?: string | null;
  /** Partial Pay: what the courier collects on delivery (total minus the advance already paid). */
  balance_due?: number | null;
  items: Array<{ product_name?: string; quantity?: number }>;
  shipping_address?: {
    address?: string;
    address2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
}

/** Package details entered by the admin in the "Create Shipment" popup before manifesting. */
export interface PackageDetails {
  /** Weight in grams. */
  weight_grams: number;
  /** Dimensions in cm. */
  length_cm: number;
  width_cm: number;
  height_cm: number;
  /** Surface is cheaper/slower, Express is pricier/faster — mirrors the Delhivery One "Shipping mode" choice. */
  shipping_mode: 'S' | 'E';
}

export interface RateEstimate {
  mode: 'S' | 'E';
  label: string;
  total_amount: number;
  raw?: unknown;
}

/**
 * Calls Delhivery's Rate Calculator (Invoice/Charges) API to preview the shipping
 * cost for a given weight + mode, the same numbers shown on the Delhivery One
 * "Get AWB Number" screen. Used to power the pre-shipment confirmation popup.
 */
export async function getDelhiveryRateEstimate(params: {
  destination_pincode: string;
  weight_grams: number;
  payment_method?: string | null;
}): Promise<RateEstimate[]> {
  const settings = await fetchDelhiverySettingsServer();
  const token = getApiToken();

  const modes: Array<{ mode: 'S' | 'E'; label: string }> = [
    { mode: 'S', label: 'Surface' },
    { mode: 'E', label: 'Express' },
  ];

  const results = await Promise.all(
    modes.map(async ({ mode, label }) => {
      const qs = new URLSearchParams({
        md: mode,
        ss: 'Delivered',
        pt: params.payment_method === 'cod' || params.payment_method === 'partial' ? 'COD' : 'Pre-paid',
        d_pin: params.destination_pincode,
        o_pin: settings.pickup_pincode,
        cgm: String(params.weight_grams),
      });
      try {
        const res = await fetch(
          `${getBaseUrl()}/api/kinko/v1/invoice/charges/.json?${qs.toString()}`,
          { headers: { Authorization: `Token ${token}` }, cache: 'no-store' }
        );
        const data = await res.json().catch(() => null);
        // Response is typically an array like [{ total_amount, charge_DL, ... }]
        const entry = Array.isArray(data) ? data[0] : data;
        return {
          mode,
          label,
          total_amount: Number(entry?.total_amount ?? 0),
          raw: data,
        };
      } catch {
        return { mode, label, total_amount: 0, raw: null };
      }
    })
  );

  return results;
}

export interface CreateShipmentResult {
  success: boolean;
  waybill?: string;
  remark?: string;
  raw?: unknown;
}

/**
 * Creates (manifests) a shipment on Delhivery for the given order and
 * returns the assigned waybill (tracking) number.
 */
export interface ShipmentOverrides {
  /**
   * Delhivery's `order` reference. Must be unique per live waybill, so a
   * partial shipment uses e.g. `<orderId>-P2`. Defaults to the order id.
   */
  orderRef?: string;
  /** Only these items go in this parcel (partial shipment). Defaults to all items. */
  items?: Array<{ product_name?: string; quantity?: number }>;
  /** Cash Delhivery collects for THIS parcel. Defaults to the full order total for COD. */
  codAmount?: number;
  /** Declared value of THIS parcel. Defaults to the full order total. */
  declaredValue?: number;
}

export async function createDelhiveryShipment(
  order: OrderForShipment,
  packageDetails?: PackageDetails,
  overrides: ShipmentOverrides = {}
): Promise<CreateShipmentResult> {
  const settings = await fetchDelhiverySettingsServer();
  if (!settings.enabled) {
    throw new Error('Delhivery integration is disabled. Enable it in Admin → Settings first.');
  }
  if (!settings.pickup_location_name || !settings.pickup_pincode) {
    throw new Error('Delhivery pickup location is not configured in Admin → Settings.');
  }

  const token = getApiToken();
  const addr = order.shipping_address;
  const shipItems = overrides.items ?? order.items;
  const productDesc = shipItems.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
  // Partial Pay ships as COD for the BALANCE only (the advance was already paid online).
  const isPartial = order.payment_method === 'partial';
  const isCod = order.payment_method === 'cod' || isPartial;
  const codAmount = isCod
    ? Math.max(0, Number(overrides.codAmount ?? (isPartial ? order.balance_due ?? 0 : order.total_amount)))
    : 0;
  const declaredValue = Number(overrides.declaredValue ?? order.total_amount);

  const payload = {
    pickup_location: {
      name: settings.pickup_location_name,
      pin: settings.pickup_pincode,
      add: settings.pickup_address,
      city: settings.pickup_city,
      state: settings.pickup_state,
      phone: settings.pickup_phone,
      country: 'India',
    },
    shipments: [
      {
        name: order.customer_name || 'Customer',
        add: [addr?.address, addr?.address2, addr?.landmark ? `Landmark: ${addr.landmark}` : undefined]
          .filter(Boolean)
          .join(', '),
        city: addr?.city || '',
        state: addr?.state || '',
        country: addr?.country || 'India',
        pin: addr?.pincode || '',
        phone: order.customer_phone || '',
        order: overrides.orderRef || order.id,
        payment_mode: isCod ? 'COD' : 'Prepaid',
        cod_amount: codAmount,
        total_amount: declaredValue,
        products_desc: productDesc || 'Ethnic wear',
        quantity: String(shipItems.reduce((s, i) => s + (i.quantity || 1), 0)),
        seller_gst_tin: settings.seller_gst_tin || undefined,
        hsn_code: '6204', // Women's ethnic wear/garments — adjust per your product HSN if needed
        // Weight/dimensions from the pre-shipment popup. Delhivery uses these to
        // display accurate parcel details in the One panel and to compute the
        // final chargeable (dead vs volumetric) weight.
        weight: packageDetails ? String(packageDetails.weight_grams) : undefined,
        shipment_length: packageDetails ? String(packageDetails.length_cm) : undefined,
        shipment_width: packageDetails ? String(packageDetails.width_cm) : undefined,
        shipment_height: packageDetails ? String(packageDetails.height_cm) : undefined,
      },
    ],
  };

  const res = await fetch(`${getBaseUrl()}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Token ${token}`,
    },
    body: `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error(
      `Delhivery shipment creation failed (HTTP ${res.status}). ${
        data ? JSON.stringify(data) : ''
      }`
    );
  }

  // Delhivery's response shape for a single-package order typically looks like:
  // { success: true, packages: [{ waybill: "...", status: "Success", remarks: [] }] }
  const pkg = Array.isArray(data.packages) ? data.packages[0] : null;
  const waybill = pkg?.waybill;

  if (!data.success || !waybill) {
    const remark = pkg?.remarks?.join?.(', ') || data.rmk || 'Unknown error from Delhivery';
    return { success: false, remark, raw: data };
  }

  return { success: true, waybill, raw: data };
}

export interface OrderForPickup {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: {
    address?: string;
    address2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
  items: Array<{ product_name?: string; quantity?: number }>;
}

// Sensible defaults for a returned clothing parcel so a return can be
// auto-scheduled without waiting on an admin to weigh/measure it first.
// Delhivery re-measures at pickup anyway; these are just the numbers
// the RVP manifest needs to be created.
const DEFAULT_RETURN_PACKAGE: PackageDetails = {
  weight_grams: 500,
  length_cm: 25,
  width_cm: 20,
  height_cm: 6,
  shipping_mode: 'S',
};

/**
 * Creates a Delhivery Reverse Pickup (RVP) — an agent collects the
 * parcel from the CUSTOMER's address and delivers it back to our
 * registered warehouse. Same `/api/cmu/create.json` endpoint as a
 * forward shipment, but payment_mode is "Pickup" and the roles of the
 * main shipment fields vs the `return_*` fields are swapped: the main
 * `name/add/city/state/pin/phone` block is where the parcel is picked
 * UP FROM (the customer), and `return_*` is where it's delivered TO
 * (our warehouse) — per Delhivery's RVP order-creation spec. No
 * separate "pickup request" call is needed; Delhivery auto-schedules
 * the field-executive visit once this manifest is created.
 */
export async function createDelhiveryReversePickup(
  returnId: string,
  order: OrderForPickup,
  packageDetails?: PackageDetails
): Promise<CreateShipmentResult> {
  const settings = await fetchDelhiverySettingsServer();
  if (!settings.enabled) {
    throw new Error('Delhivery integration is disabled. Enable it in Admin → Settings first.');
  }
  if (!settings.pickup_location_name || !settings.pickup_pincode) {
    throw new Error('Delhivery pickup/warehouse location is not configured in Admin → Settings.');
  }

  const token = getApiToken();
  const addr = order.shipping_address;
  const pkg = packageDetails || DEFAULT_RETURN_PACKAGE;
  const productDesc = order.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ') || 'Ethnic wear return';

  const payload = {
    pickup_location: {
      name: settings.pickup_location_name,
      pin: settings.pickup_pincode,
      add: settings.pickup_address,
      city: settings.pickup_city,
      state: settings.pickup_state,
      phone: settings.pickup_phone,
      country: 'India',
    },
    shipments: [
      {
        // Where the parcel is picked up FROM — the customer.
        name: order.customer_name || 'Customer',
        add: [addr?.address, addr?.address2, addr?.landmark ? `Landmark: ${addr.landmark}` : undefined]
          .filter(Boolean)
          .join(', '),
        city: addr?.city || '',
        state: addr?.state || '',
        country: addr?.country || 'India',
        pin: addr?.pincode || '',
        phone: order.customer_phone || '',
        order: `RET-${returnId}`,
        payment_mode: 'Pickup',
        cod_amount: 0,
        total_amount: 0,
        products_desc: productDesc,
        quantity: String(order.items.reduce((s, i) => s + (i.quantity || 1), 0)),
        seller_gst_tin: settings.seller_gst_tin || undefined,
        hsn_code: '6204',
        weight: String(pkg.weight_grams),
        shipment_length: String(pkg.length_cm),
        shipment_width: String(pkg.width_cm),
        shipment_height: String(pkg.height_cm),
        // Where the parcel is delivered TO — our warehouse.
        return_name: settings.pickup_location_name,
        return_add: settings.pickup_address,
        return_city: settings.pickup_city,
        return_state: settings.pickup_state,
        return_pin: settings.pickup_pincode,
        return_phone: settings.pickup_phone,
        return_country: 'India',
      },
    ],
  };

  const res = await fetch(`${getBaseUrl()}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Token ${token}`,
    },
    body: `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error(
      `Delhivery reverse pickup creation failed (HTTP ${res.status}). ${data ? JSON.stringify(data) : ''}`
    );
  }

  const pkgResult = Array.isArray(data.packages) ? data.packages[0] : null;
  const waybill = pkgResult?.waybill;

  if (!data.success || !waybill) {
    const remark = pkgResult?.remarks?.join?.(', ') || data.rmk || 'Unknown error from Delhivery';
    return { success: false, remark, raw: data };
  }

  return { success: true, waybill, raw: data };
}

export interface TrackingScan {
  status: string;
  location?: string;
  dateTime?: string;
  instructions?: string;
}

export interface TrackingResult {
  tracked: boolean;
  waybill?: string;
  courier?: string;
  currentStatus?: string;
  currentLocation?: string;
  expectedDeliveryDate?: string;
  scans: TrackingScan[];
  error?: string;
}

/** Fetches live tracking info for a waybill from Delhivery. */
export async function trackDelhiveryShipment(waybill: string): Promise<TrackingResult> {
  try {
    const token = getApiToken();
    const res = await fetch(
      `${getBaseUrl()}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`,
      {
        headers: { Authorization: `Token ${token}` },
        // Tracking data changes often — don't let Next.js cache it.
        cache: 'no-store',
      }
    );
    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      return { tracked: false, scans: [], error: `Tracking lookup failed (HTTP ${res.status})` };
    }

    // Delhivery's tracking JSON typically nests data as:
    // { ShipmentData: [{ Shipment: { Status: {...}, Scans: [{ ScanDetail: {...} }], ExpectedDeliveryDate } }] }
    const shipment = data?.ShipmentData?.[0]?.Shipment;
    if (!shipment) {
      return { tracked: false, scans: [], error: 'No shipment data found for this waybill yet' };
    }

    const scans: TrackingScan[] = Array.isArray(shipment.Scans)
      ? shipment.Scans.map((s: any) => ({
          status: s?.ScanDetail?.Scan || s?.ScanDetail?.ScanType || 'Update',
          location: s?.ScanDetail?.ScannedLocation,
          dateTime: s?.ScanDetail?.ScanDateTime,
          instructions: s?.ScanDetail?.Instructions,
        })).reverse() // most recent first
      : [];

    return {
      tracked: true,
      waybill,
      courier: 'Delhivery',
      currentStatus: shipment.Status?.Status,
      currentLocation: shipment.Status?.StatusLocation,
      expectedDeliveryDate: shipment.ExpectedDeliveryDate,
      scans,
    };
  } catch (err) {
    return {
      tracked: false,
      scans: [],
      error: err instanceof Error ? err.message : 'Failed to fetch tracking info',
    };
  }
}
