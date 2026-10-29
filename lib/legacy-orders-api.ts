import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';

// READ-ONLY access to the imported old-site (WooCommerce) orders.
//
// SECURITY / SAFETY NOTES
// - legacy_wc_* tables are RLS-locked to service_role. This file uses the
//   service-role client, so it must only be called from admin-only API routes
//   that have already run verifyAdminToken() (see app/api/admin/legacy-orders).
// - This module only ever SELECTs (and calls two STABLE SQL functions). It has
//   no insert / update / upsert / delete / email / WhatsApp code on purpose.
//   Legacy orders must never trigger any customer notification.
// - ip_address and user_agent are deliberately never selected.

export type LegacyOrderListRow = {
  id: number;
  status: string;
  total_amount: number;
  date_created_gmt: string | null;
  payment_method: string | null;
  payment_method_title: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  city: string | null;
  state: string | null;
  first_item: string | null;
  first_item_image: string | null;
  item_count: number;
};

export type LegacyOrderListResult = {
  orders: LegacyOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type LegacyStatusStat = { status: string; orders: number; total_value: number };

type AddressRow = {
  order_id: number;
  address_type: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function fullName(a?: AddressRow | null): string {
  if (!a) return '';
  return [a.first_name, a.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}

function pickAddress(rows: AddressRow[], type: 'billing' | 'shipping'): AddressRow | undefined {
  return rows.find((r) => (r.address_type ?? '').toLowerCase() === type);
}

// Old orders do not store product photos. The old WooCommerce product ID is
// mapped to the new product slug via settings.feed_idmap.parents (the same map
// the Google feed uses), then we borrow products.images[0]. SELECT only, and
// best-effort: images are optional and must never break the order view.
async function loadImagesByOldProductId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  oldIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = new Set(oldIds.map((i) => (i ?? '').trim()).filter(Boolean));
  if (wanted.size === 0) return out;

  const { data: mrow, error: mErr } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'feed_idmap')
    .maybeSingle();
  if (mErr) return out;
  const parents: Record<string, unknown> = ((mrow as any)?.value ?? {}).parents ?? {};

  const slugByOldId = new Map<string, string>();
  for (const [slug, oldId] of Object.entries(parents)) {
    const k = String(oldId ?? '').trim();
    if (wanted.has(k) && !slugByOldId.has(k)) slugByOldId.set(k, slug);
  }
  if (slugByOldId.size === 0) return out;

  const { data, error } = await supabase
    .from('products')
    .select('slug, images')
    .in('slug', Array.from(new Set(slugByOldId.values())));
  if (error) return out;

  const imageBySlug = new Map<string, string>();
  for (const p of data ?? []) {
    const imgs = (p as any).images;
    const first = Array.isArray(imgs) && imgs.length > 0 ? String(imgs[0]) : '';
    if (first) imageBySlug.set(String((p as any).slug), first);
  }
  slugByOldId.forEach((slug, oldId) => {
    const img = imageBySlug.get(slug);
    if (img) out.set(oldId, img);
  });
  return out;
}

export async function getLegacyStatusStats(): Promise<LegacyStatusStat[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('legacy_wc_admin_status_stats');
  if (error) throw new Error(`legacy stats failed: ${error.code ?? ''} ${error.message}`);
  return (data ?? []).map((r: any) => ({
    status: String(r.status),
    orders: Number(r.orders),
    total_value: num(r.total_value),
  }));
}

export async function listLegacyOrders(opts: {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<LegacyOrderListResult> {
  const supabase = getSupabaseAdmin();
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const page = Math.max(1, opts.page);

  const { data: idRows, error: idErr } = await supabase.rpc('legacy_wc_admin_search_orders', {
    p_q: opts.q ?? '',
    p_status: opts.status ?? '',
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (idErr) throw new Error(`legacy search failed: ${idErr.code ?? ''} ${idErr.message}`);

  const ids: number[] = (idRows ?? []).map((r: any) => Number(r.order_id));
  const total = idRows && idRows.length > 0 ? Number(idRows[0].total_count) : 0;
  if (ids.length === 0) return { orders: [], total, page, pageSize };

  const [ordersRes, addrRes, itemsRes] = await Promise.all([
    supabase
      .from('legacy_wc_orders')
      .select('id, status, total_amount, date_created_gmt, payment_method, payment_method_title, billing_email')
      .in('id', ids),
    supabase
      .from('legacy_wc_order_addresses')
      .select('order_id, address_type, first_name, last_name, city, state, email, phone')
      .in('order_id', ids),
    supabase
      .from('legacy_wc_order_items')
      .select('order_item_id, order_id, order_item_name')
      .in('order_id', ids)
      .eq('order_item_type', 'line_item')
      .order('order_item_id', { ascending: true }),
  ]);
  if (ordersRes.error) throw new Error(`legacy orders failed: ${ordersRes.error.message}`);
  if (addrRes.error) throw new Error(`legacy addresses failed: ${addrRes.error.message}`);
  if (itemsRes.error) throw new Error(`legacy items failed: ${itemsRes.error.message}`);

  const orderById = new Map<number, any>((ordersRes.data ?? []).map((o: any) => [Number(o.id), o]));
  const addrByOrder = new Map<number, AddressRow[]>();
  for (const a of (addrRes.data ?? []) as AddressRow[]) {
    const k = Number(a.order_id);
    if (!addrByOrder.has(k)) addrByOrder.set(k, []);
    addrByOrder.get(k)!.push(a);
  }
  const itemsByOrder = new Map<number, string[]>();
  const firstItemIdByOrder = new Map<number, number>();
  for (const it of itemsRes.data ?? []) {
    const k = Number((it as any).order_id);
    if (!itemsByOrder.has(k)) itemsByOrder.set(k, []);
    itemsByOrder.get(k)!.push(String((it as any).order_item_name ?? ''));
    if (!firstItemIdByOrder.has(k)) firstItemIdByOrder.set(k, Number((it as any).order_item_id));
  }

  // First item's photo (best effort): old _product_id -> new slug -> images[0]
  const oldIdByItemId = new Map<number, string>();
  const firstIds = Array.from(firstItemIdByOrder.values());
  if (firstIds.length > 0) {
    const { data: codeRows } = await supabase
      .from('legacy_wc_order_itemmeta')
      .select('order_item_id, meta_value')
      .in('order_item_id', firstIds)
      .eq('meta_key', '_product_id');
    for (const r of codeRows ?? []) {
      oldIdByItemId.set(Number((r as any).order_item_id), String((r as any).meta_value ?? '').trim());
    }
  }
  const imageByOldId = await loadImagesByOldProductId(supabase, Array.from(oldIdByItemId.values()));

  const orders: LegacyOrderListRow[] = ids
    .map((id) => {
      const o = orderById.get(id);
      if (!o) return null;
      const addrs = addrByOrder.get(id) ?? [];
      const billing = pickAddress(addrs, 'billing');
      const shipping = pickAddress(addrs, 'shipping');
      const items = itemsByOrder.get(id) ?? [];
      return {
        id,
        status: String(o.status),
        total_amount: num(o.total_amount),
        date_created_gmt: o.date_created_gmt ?? null,
        payment_method: o.payment_method ?? null,
        payment_method_title: o.payment_method_title ?? null,
        customer_name: fullName(billing) || fullName(shipping) || '—',
        customer_phone: billing?.phone || shipping?.phone || null,
        customer_email: billing?.email || o.billing_email || shipping?.email || null,
        city: billing?.city || shipping?.city || null,
        state: billing?.state || shipping?.state || null,
        first_item: items[0] ?? null,
        first_item_image: (() => {
          const fid = firstItemIdByOrder.get(id);
          const oldId = fid != null ? oldIdByItemId.get(fid) : '';
          return oldId ? imageByOldId.get(oldId) ?? null : null;
        })(),
        item_count: items.length,
      } as LegacyOrderListRow;
    })
    .filter((r): r is LegacyOrderListRow => r !== null);

  return { orders, total, page, pageSize };
}

// ---- Detail ---------------------------------------------------------------

// Only these itemmeta keys are ever read (verified against the imported data:
// line_item -> _product_id/_variation_id/_qty/_line_subtotal/_line_total/_line_tax,
// pa_color/pa_size/Product Code; fee -> _line_total/_line_tax;
// shipping -> cost/total_tax/method_id; coupon -> discount_amount;
// tax -> label/tax_amount/shipping_tax_amount/rate_percent).
const META_KEYS = [
  '_product_id',
  '_variation_id',
  '_qty',
  '_line_subtotal',
  '_line_total',
  '_line_tax',
  'pa_color',
  'pa_size',
  'Product Code',
  'cost',
  'total_tax',
  'method_id',
  'discount_amount',
  'label',
  'tax_amount',
  'shipping_tax_amount',
  'rate_percent',
];

export type LegacyOrderDetail = {
  id: number;
  status: string;
  currency: string | null;
  total_amount: number;
  tax_amount: number;
  payment_method: string | null;
  payment_method_title: string | null;
  transaction_id: string | null;
  customer_note: string | null;
  date_created_gmt: string | null;
  date_paid_gmt: string | null;
  date_completed_gmt: string | null;
  shipping_total_amount: number;
  shipping_tax_amount: number;
  discount_total_amount: number;
  billing: AddressRow | null;
  shipping: AddressRow | null;
  items: {
    name: string;
    product_id: string | null;
    variation_id: string | null;
    qty: number;
    subtotal: number;
    total: number;
    tax: number;
    color: string | null;
    size: string | null;
    product_code: string | null;
    image_url: string | null;
  }[];
  fees: { name: string; total: number; tax: number }[];
  shipping_lines: { name: string; method_id: string | null; cost: number; tax: number }[];
  coupons: { code: string; discount: number }[];
  taxes: { label: string; amount: number; shipping_amount: number; rate_percent: number }[];
  refunds: { id: number; total_amount: number; date_created_gmt: string | null }[];
};

export async function getLegacyOrderDetail(id: number): Promise<LegacyOrderDetail | null> {
  const supabase = getSupabaseAdmin();

  const { data: order, error: oErr } = await supabase
    .from('legacy_wc_orders')
    .select(
      'id, status, currency, type, total_amount, tax_amount, payment_method, payment_method_title, transaction_id, customer_note, date_created_gmt, billing_email'
    )
    .eq('id', id)
    .eq('type', 'shop_order')
    .maybeSingle();
  if (oErr) throw new Error(`legacy order failed: ${oErr.message}`);
  if (!order) return null;

  const [opRes, addrRes, itemsRes, refundRes] = await Promise.all([
    supabase
      .from('legacy_wc_order_operational_data')
      .select('date_paid_gmt, date_completed_gmt, shipping_total_amount, shipping_tax_amount, discount_total_amount')
      .eq('order_id', id)
      .maybeSingle(),
    supabase
      .from('legacy_wc_order_addresses')
      .select(
        'order_id, address_type, first_name, last_name, company, address_1, address_2, city, state, postcode, country, email, phone'
      )
      .eq('order_id', id),
    supabase
      .from('legacy_wc_order_items')
      .select('order_item_id, order_item_name, order_item_type')
      .eq('order_id', id)
      .order('order_item_id', { ascending: true }),
    supabase
      .from('legacy_wc_orders')
      .select('id, total_amount, date_created_gmt')
      .eq('parent_order_id', id)
      .eq('type', 'shop_order_refund'),
  ]);
  if (opRes.error) throw new Error(`legacy operational failed: ${opRes.error.message}`);
  if (addrRes.error) throw new Error(`legacy addresses failed: ${addrRes.error.message}`);
  if (itemsRes.error) throw new Error(`legacy items failed: ${itemsRes.error.message}`);
  if (refundRes.error) throw new Error(`legacy refunds failed: ${refundRes.error.message}`);

  const items = itemsRes.data ?? [];
  const itemIds = items.map((i: any) => Number(i.order_item_id));
  const metaByItem = new Map<number, Record<string, string>>();
  if (itemIds.length > 0) {
    const { data: metaRows, error: mErr } = await supabase
      .from('legacy_wc_order_itemmeta')
      .select('order_item_id, meta_key, meta_value')
      .in('order_item_id', itemIds)
      .in('meta_key', META_KEYS);
    if (mErr) throw new Error(`legacy itemmeta failed: ${mErr.message}`);
    for (const m of metaRows ?? []) {
      const k = Number((m as any).order_item_id);
      if (!metaByItem.has(k)) metaByItem.set(k, {});
      metaByItem.get(k)![(m as any).meta_key] = (m as any).meta_value ?? '';
    }
  }

  const addrs = (addrRes.data ?? []) as AddressRow[];
  const op: any = opRes.data ?? {};
  const detail: LegacyOrderDetail = {
    id: Number(order.id),
    status: String(order.status),
    currency: order.currency ?? null,
    total_amount: num(order.total_amount),
    tax_amount: num(order.tax_amount),
    payment_method: order.payment_method ?? null,
    payment_method_title: order.payment_method_title ?? null,
    transaction_id: order.transaction_id ?? null,
    customer_note: order.customer_note ?? null,
    date_created_gmt: order.date_created_gmt ?? null,
    date_paid_gmt: op.date_paid_gmt ?? null,
    date_completed_gmt: op.date_completed_gmt ?? null,
    shipping_total_amount: num(op.shipping_total_amount),
    shipping_tax_amount: num(op.shipping_tax_amount),
    discount_total_amount: num(op.discount_total_amount),
    billing: pickAddress(addrs, 'billing') ?? null,
    shipping: pickAddress(addrs, 'shipping') ?? null,
    items: [],
    fees: [],
    shipping_lines: [],
    coupons: [],
    taxes: [],
    refunds: (refundRes.data ?? []).map((r: any) => ({
      id: Number(r.id),
      total_amount: num(r.total_amount),
      date_created_gmt: r.date_created_gmt ?? null,
    })),
  };

  for (const it of items as any[]) {
    const meta = metaByItem.get(Number(it.order_item_id)) ?? {};
    const name = String(it.order_item_name ?? '');
    switch (it.order_item_type) {
      case 'line_item':
        detail.items.push({
          name,
          product_id: meta['_product_id'] || null,
          variation_id: meta['_variation_id'] && meta['_variation_id'] !== '0' ? meta['_variation_id'] : null,
          qty: num(meta['_qty']),
          subtotal: num(meta['_line_subtotal']),
          total: num(meta['_line_total']),
          tax: num(meta['_line_tax']),
          color: meta['pa_color'] || null,
          size: meta['pa_size'] || null,
          product_code: meta['Product Code'] || null,
          image_url: null,
        });
        break;
      case 'fee':
        detail.fees.push({ name, total: num(meta['_line_total']), tax: num(meta['_line_tax']) });
        break;
      case 'shipping':
        detail.shipping_lines.push({
          name,
          method_id: meta['method_id'] || null,
          cost: num(meta['cost']),
          tax: num(meta['total_tax']),
        });
        break;
      case 'coupon':
        detail.coupons.push({ code: name, discount: num(meta['discount_amount']) });
        break;
      case 'tax':
        detail.taxes.push({
          label: meta['label'] || name,
          amount: num(meta['tax_amount']),
          shipping_amount: num(meta['shipping_tax_amount']),
          rate_percent: num(meta['rate_percent']),
        });
        break;
      default:
        break;
    }
  }

  const imageByOldId = await loadImagesByOldProductId(
    supabase,
    detail.items.map((i) => i.product_id ?? '')
  );
  for (const i of detail.items) {
    i.image_url = i.product_id ? imageByOldId.get(i.product_id.trim()) ?? null : null;
  }

  return detail;
}
