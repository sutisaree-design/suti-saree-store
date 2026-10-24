'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Truck, Search, X, Copy, Check, Trash2, ExternalLink, Wallet, Download, CheckCircle2, XCircle, MessageCircle, Smartphone, Monitor, Tablet } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAdminFocus } from './use-admin-focus';
import OrderTracking from '@/components/order/order-tracking';
import OrderStatusHistory from '@/components/admin/order-status-history';

// Per-status left-border accent so an order's state is readable at a glance
// while scanning the table, without having to read the dropdown text.
const STATUS_BORDER_COLOR: Record<string, string> = {
  pending: 'border-l-amber-400',
  paid: 'border-l-emerald-500',
  shipped: 'border-l-sky-500',
  delivered: 'border-l-green-600',
  cancelled: 'border-l-red-500',
  failed: 'border-l-neutral-500',
};
import DeliveryNotificationTester from '@/components/admin/delivery-notification-tester';
import { getUnshippedItemIndexes, nextLotPhrase, type OrderShipment } from '@/lib/shipments';
import CreateShipmentModal, {
  type CreateShipmentPayload,
} from '@/components/admin/create-shipment-modal';

import CodConfirmationControls from '@/components/admin/cod-confirmation-controls';

type Order = {
  id: string;
  items: any[];
  total_amount: number;
  status: string;
  payment_method?: string;
  // COD one-tap confirmation (see lib/cod-confirmation.ts). Informational
  // only -- never changes order status.
  cod_confirmed_at?: string | null;
  cod_confirmed_via?: string | null;
  // Set once at order-placement time by a DB trigger and never touched
  // again -- survives "Request Online Payment" flipping payment_method
  // 'cod' -> 'online', so the admin can still tell this order was
  // originally COD. See 20260923000000_orders_original_payment_method.sql.
  original_payment_method?: string;
  // Partial Pay (advance online + balance on delivery) -- see lib/partial-pay.ts
  advance_percent?: number | null;
  advance_amount?: number;
  balance_due?: number;
  advance_paid_at?: string | null;
  // Amount shaved off total_amount when "Request Online Payment" (or a
  // normal online checkout) applied the online-payment discount. Combined
  // with total_amount this reconstructs the price the order was ORIGINALLY
  // placed at, i.e. total_amount + online_payment_discount. See
  // app/api/admin/orders/[id]/request-online-payment/route.ts.
  online_payment_discount?: number | null;
  // Full checkout-time price breakdown -- all written by place_order_with_items()
  // at order-placement time (see supabase/migrations/20260913000000_affiliate_program.sql)
  // and already returned by fetchOrders() via `select('*')`, just not surfaced in this UI
  // until now. subtotal is the sum of item prices before any discount/shipping/tax.
  subtotal?: number | null;
  shipping_charge?: number | null;
  gst_amount?: number | null;
  coupon_code?: string | null;
  coupon_discount?: number | null;
  gift_card_code?: string | null;
  gift_card_discount?: number | null;
  loyalty_points_redeemed?: number | null;
  loyalty_discount?: number | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  expected_delivery_date?: string | null;
  // Every parcel this order has been split into (oldest first). Attached by
  // fetchOrders() -> attachShipments(). Empty until the first shipment.
  _shipments?: OrderShipment[];
  // Refund tracking — see lib/orders-api.ts for how these two are kept
  // separate. refund_status is set only by a customer self-CANCELLATION
  // (app/api/orders/[id]/cancel); _return_refund_status is set only when
  // this order has a linked return/exchange whose refund has been
  // initiated (app/api/admin/returns/[id]/refund). An order only ever
  // has one of the two populated in practice (a shipped order can't be
  // self-cancelled, so its only refund path is a return), but both are
  // checked so nothing is missed either way.
  refund_status?: string | null;
  razorpay_refund_id?: string | null;
  // Set once, permanently, the moment Razorpay actually confirms payment
  // (app/api/razorpay/verify-payment) -- never cleared afterwards, even if
  // the order later moves to cancelled/shipped/delivered/returned. This is
  // the one reliable "money actually changed hands" signal; order.status
  // alone isn't, since it keeps moving past 'paid' for every order that
  // progresses normally.
  razorpay_payment_id?: string | null;
  _return_status?: string | null;
  _return_refund_status?: string | null;
  shipping_address?: any;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  created_at?: string;
  // Traffic source + device captured at checkout (lib/attribution.ts,
  // orders.attribution). null/undefined for orders placed before this existed.
  attribution?: OrderAttributionData;
  is_reseller_order?: boolean;
  reseller_base_cost?: number | null;
  reseller_profit?: number | null;
  reseller_brand_name?: string | null;
  // Admin-only hidden sourcing info, attached server-side in lib/orders-api.ts
  // (fetchOrders -> attachItemSources). Keyed by product_id.
  _item_sources?: Record<string, { source_name: string | null; whatsapp_name: string | null; whatsapp_number: string | null; buy_price: number | null }>;
  // Email Log -- when each lifecycle email actually sent (or null if it
  // never has). See supabase/migrations/20260930010000_order_confirmation_email_sent_at.sql,
  // 20260817000000_delivery_lifecycle_emails.sql, and
  // 20260902000000_order_email_log_columns.sql (the last two columns).
  confirmation_email_sent_at?: string | null;
  shipped_email_sent_at?: string | null;
  arriving_email_sent_at?: string | null;
  out_for_delivery_email_sent_at?: string | null;
  delivered_email_sent_at?: string | null;
  // One entry per product that earned a "leave a review" discount coupon
  // (app/api/review-link/[token]/route.ts -> issueReviewReward()). See
  // attachReviewRewards() in lib/orders-api.ts and
  // 20261011000000_review_reward_email_tracking.sql.
  _review_rewards?: {
    id: string;
    product_id: string;
    rating: number;
    email_sent_at: string | null;
    email_error: string | null;
    created_at: string;
    code: string | null;
    discount_type: 'percentage' | 'flat' | null;
    discount_value: number | null;
  }[];
};

// ---- Copy name / mobile / address -----------------------------------------
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall back for browsers/contexts where the async clipboard API is blocked.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function buildCustomerCopyText(order: {
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: any;
}): string {
  const a = order.shipping_address || {};
  const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
  const parts = [
    clean(a.address),
    clean(a.address2),
    a.landmark ? `Landmark: ${clean(a.landmark)}` : '',
    clean(a.city),
    [clean(a.state), clean(a.pincode)].filter(Boolean).join(' - '),
    clean(a.country),
  ].filter(Boolean);
  return [
    `Name: ${clean(order.customer_name)}`,
    `Mobile: ${clean(order.customer_phone)}`,
    `Address: ${parts.join(', ')}`,
  ].join('\n');
}

// ---- Traffic source + device (captured at checkout, see lib/attribution.ts) --
type AttributionTouchData = {
  channel: string;
  source: string;
  medium: string;
  campaign?: string;
  referrer_host?: string;
  landing_path?: string;
  at?: string;
};
type OrderAttributionData = {
  first?: AttributionTouchData;
  last?: AttributionTouchData;
  device?: { type?: string; os?: string; browser?: string };
} | null;

function mediumTone(medium?: string): string {
  switch (medium) {
    case 'cpc':
    case 'paid_social':
      return 'bg-amber-100 text-amber-800';
    case 'organic':
      return 'bg-green-100 text-green-800';
    case 'ai':
      return 'bg-violet-100 text-violet-800';
    case 'social':
      return 'bg-sky-100 text-sky-800';
    case 'email':
      return 'bg-teal-100 text-teal-800';
    case 'referral':
      return 'bg-slate-200 text-slate-800';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function DeviceGlyph({ type }: { type?: string }) {
  if (type === 'Mobile') return <Smartphone className="h-3 w-3" />;
  if (type === 'Tablet') return <Tablet className="h-3 w-3" />;
  return <Monitor className="h-3 w-3" />;
}

// Small badge under the order date in the main table row.
function SourceChip({ attribution }: { attribution?: OrderAttributionData }) {
  const last = attribution?.last;
  if (!last) return null;
  const d = attribution?.device;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mediumTone(last.medium)}`}>
        {last.channel}
      </span>
      {d?.type && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`${d.type} · ${d.os ?? ''} · ${d.browser ?? ''}`}>
          <DeviceGlyph type={d.type} />
          {d.os && d.os !== 'Other' ? d.os : d.type}
        </span>
      )}
    </div>
  );
}

// Full detail strip at the top of an expanded order.
function TrafficSourceBar({ attribution }: { attribution?: OrderAttributionData }) {
  const last = attribution?.last;
  const first = attribution?.first;
  if (!last) {
    return (
      <div className="mb-3 rounded-lg border border-dashed border-border/60 bg-white px-4 py-2 text-xs text-muted-foreground">
        Traffic source: no data (order placed before source tracking was added, or the visitor blocked storage).
      </div>
    );
  }
  const d = attribution?.device;
  const showFirst = !!first && (first.channel !== last.channel || (first.campaign || '') !== (last.campaign || ''));
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-white px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Came from</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${mediumTone(last.medium)}`}>{last.channel}</span>
        {last.campaign && <span className="text-muted-foreground">campaign: <span className="font-medium text-foreground">{last.campaign}</span></span>}
      </div>
      {showFirst && first && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">First visit via</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${mediumTone(first.medium)}`}>{first.channel}</span>
        </div>
      )}
      {d?.type && (
        <div className="flex items-center gap-1.5">
          <DeviceGlyph type={d.type} />
          <span className="font-medium">{[d.type, d.os && d.os !== 'Other' ? d.os : null, d.browser && d.browser !== 'Other' ? d.browser : null].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      {last.referrer_host && (
        <div className="text-muted-foreground">via <span className="font-medium text-foreground">{last.referrer_host}</span></div>
      )}
      {last.landing_path && (
        <div className="text-muted-foreground">landed on <span className="font-mono text-foreground">{last.landing_path}</span></div>
      )}
    </div>
  );
}

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      if (res.ok) {
        const body = await res.json();
        setOrders(body.orders || []);
      } else if (res.status === 401) {
        toast.error('Unauthorized');
      } else {
        toast.error('Failed to load orders');
      }
    } catch (err) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Bell deep link: narrow the list to exactly the clicked order (search
  // matches on order id) and highlight its row. "Reset" shows everything again.
  const focusId = useAdminFocus(!loading && orders.length > 0);
  useEffect(() => {
    if (!focusId) return;
    setSearchQuery(focusId);
    setStatusFilter('all');
    setPaymentFilter('all');
  }, [focusId]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesQuery =
        !q ||
        o.id.toLowerCase().includes(q) ||
        (o.customer_name ?? '').toLowerCase().includes(q) ||
        (o.customer_email ?? '').toLowerCase().includes(q) ||
        (o.customer_phone ?? '').toLowerCase().includes(q) ||
        o.items.some((it: any) => (it.product_name ?? '').toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchesPayment =
        paymentFilter === 'all' ||
        (paymentFilter === 'cod'
          ? o.payment_method === 'cod'
          : paymentFilter === 'partial'
            ? o.payment_method === 'partial'
            : o.payment_method !== 'cod' && o.payment_method !== 'partial');

      return matchesQuery && matchesStatus && matchesPayment;
    });
  }, [orders, searchQuery, statusFilter, paymentFilter]);

  const totalOrders = orders.length;
  // Sum of every order's total, regardless of status -- this is the figure
  // the admin actually wants when they ask "total price" for the order list.
  const totalOrderValue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const revenue = orders
    .filter((o) => ['paid', 'shipped', 'delivered'].includes(o.status))
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const filtersActive = !!searchQuery || statusFilter !== 'all' || paymentFilter !== 'all';
  const filteredTotal = filteredOrders.reduce((s, o) => s + (o.total_amount || 0), 0);

  const [creatingShipmentFor, setCreatingShipmentFor] = useState<string | null>(null);
  const [shipmentModalOrderId, setShipmentModalOrderId] = useState<string | null>(null);
  const [pendingStatusAfterShip, setPendingStatusAfterShip] = useState<string | null>(null);

  const createShipment = async (id: string, packageDetails?: CreateShipmentPayload): Promise<boolean> => {
    setCreatingShipmentFor(id);
    try {
      const res = await fetch('/api/admin/delhivery/create-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, ...(packageDetails || {}) }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success) {
        const shippedOrder = orders.find((o) => o.id === id);
        const waUrl =
          shippedOrder && body.shipment
            ? buildParcelWhatsAppUrl(shippedOrder, body.shipment, [
                ...(shippedOrder._shipments || []),
                body.shipment,
              ])
            : null;
        toast.success(
          body.partial
            ? `Parcel ${body.shipment?.shipment_no ?? ''} shipped — waybill ${body.waybill}. ${body.remaining_count} item(s) still to ship; customer emailed.`
            : `Shipment created — waybill ${body.waybill}`,
          waUrl
            ? {
                duration: 15000,
                action: { label: 'Send on WhatsApp', onClick: () => window.open(waUrl, '_blank', 'noopener,noreferrer') },
              }
            : undefined
        );
        await load();
        return true;
      }
      // body may be null if a proxy replaced the response with a non-JSON
      // error page (e.g. a real 5xx from the platform, not from our API).
      toast.error(body?.error || `Failed to create Delhivery shipment (HTTP ${res.status})`);
      return false;
    } catch (err) {
      toast.error('Failed to create Delhivery shipment');
      return false;
    } finally {
      setCreatingShipmentFor(null);
    }
  };

  // Opens the box/weight/mode popup instead of hitting the Delhivery API directly.
  const openShipmentModal = (id: string) => setShipmentModalOrderId(id);

  const confirmShipmentFromModal = async (payload: CreateShipmentPayload) => {
    if (!shipmentModalOrderId) return;
    const ok = await createShipment(shipmentModalOrderId, payload);
    if (ok) {
      setShipmentModalOrderId(null);
      setPendingStatusAfterShip(null);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    // Moving an order to "shipped" first opens the box/weight/mode popup so the
    // admin can review before Delhivery actually manifests (and charges) it.
    const order = orders.find((o) => o.id === id);
    if (status === 'shipped' && order && !order.tracking_number) {
      setPendingStatusAfterShip(status);
      openShipmentModal(id);
      return;
    }

    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success('Status updated');
        await load();
      } else {
        toast.error('Failed to update status');
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Lets the admin fix a customer's email / phone / shipping address on an
  // order before it ships -- e.g. the customer messaged asking for a
  // corrected pincode or a typo'd phone number. Only meant to be used while
  // the order hasn't been handed to Delhivery yet (see the `tracking_number`
  // gate in the row UI below), so shipments always go out to the address the
  // admin most recently confirmed.
  const [savingDetailsFor, setSavingDetailsFor] = useState<string | null>(null);
  const updateOrderDetails = async (
    id: string,
    details: {
      customer_email?: string;
      customer_phone?: string;
      shipping_address?: Record<string, any>;
    }
  ) => {
    setSavingDetailsFor(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      if (res.ok) {
        toast.success('Order details updated');
        await load();
        return true;
      }
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Failed to update order details');
      return false;
    } catch (err) {
      toast.error('Failed to update order details');
      return false;
    } finally {
      setSavingDetailsFor(null);
    }
  };

  // Converts a COD order (item not kept ready-made -> needs prep time) to
  // "pay online first": flips payment_method, emails the customer an
  // apology + a link to pay. See app/api/admin/orders/[id]/request-online-payment.
  const [requestingOnlinePaymentFor, setRequestingOnlinePaymentFor] = useState<string | null>(null);
  const requestOnlinePayment = async (id: string) => {
    setRequestingOnlinePaymentFor(id);
    // Open the WhatsApp tab synchronously (inside the click) so popup
    // blockers allow it; it is pointed at the message once the API replies.
    const target = orders.find((o) => o.id === id);
    const digits = target ? getWhatsAppDigits(target) : null;
    const win = digits ? window.open('', '_blank') : null;
    try {
      const res = await fetch(`/api/admin/orders/${id}/request-online-payment`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        if (digits && body.payUrl && target) {
          const text = buildPaymentWhatsAppText({
            firstName: (target.customer_name || '').trim().split(/\s+/)[0],
            shortId: id.slice(0, 8).toUpperCase(),
            payUrl: body.payUrl,
            onlineTotal: Number(body.onlineTotal || 0),
            codTotal: Number(body.codTotal || 0),
          });
          const wa = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
          if (win) win.location.href = wa;
          else window.open(wa, '_blank');
        } else {
          win?.close();
        }
        if (body.emailed) {
          toast.success(
            digits
              ? 'Converted to online payment — email sent. Press Send in WhatsApp to message the customer too.'
              : 'Order converted to online payment — email sent to the customer'
          );
        } else {
          toast.warning(
            'Order converted, but the email failed to send — use the WhatsApp message or "Send test" from Test Notifications'
          );
        }
        await load();
      } else {
        win?.close();
        toast.error(body.error || 'Failed to request online payment');
      }
    } catch {
      win?.close();
      toast.error('Failed to request online payment');
    } finally {
      setRequestingOnlinePaymentFor(null);
    }
  };

  // Undo of "Request Online Payment": puts an unpaid, originally-COD order
  // back to COD (restores the COD price) so it can be shipped via Delhivery
  // as a normal COD parcel. See app/api/admin/orders/[id]/revert-to-cod.
  const [revertingToCodFor, setRevertingToCodFor] = useState<string | null>(null);
  // Orders reverted during this session -> their row shows the dedicated
  // "reverted to COD" WhatsApp message instead of the generic COD-confirmed one.
  const [revertedIds, setRevertedIds] = useState<Set<string>>(new Set());
  const revertToCod = async (id: string) => {
    if (
      !window.confirm(
        'Revert this order to COD? The online-payment discount will be removed, the customer will pay the original COD price on delivery, and an email telling them no online payment is needed will be sent.'
      )
    ) {
      return;
    }
    setRevertingToCodFor(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/revert-to-cod`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setRevertedIds((prev) => new Set(prev).add(id));
        if (body.emailed) {
          toast.success('Order reverted to COD — customer emailed. Send the WhatsApp message too, then create the shipment.');
        } else {
          toast.warning('Order reverted to COD, but the email could not be sent — use the WhatsApp message button.');
        }
        await load();
      } else {
        toast.error(body.error || 'Failed to revert to COD');
      }
    } catch {
      toast.error('Failed to revert to COD');
    } finally {
      setRevertingToCodFor(null);
    }
  };

  // ---- Select rows + bulk delete ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));
  const someVisibleSelected = filteredOrders.some((o) => selectedIds.has(o.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredOrders.forEach((o) => next.delete(o.id));
      } else {
        filteredOrders.forEach((o) => next.add(o.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const deleteSelectedOrders = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${ids.length} order${ids.length === 1 ? '' : 's'} deleted`);
        clearSelection();
        setConfirmBulkDelete(false);
        await load();
      } else {
        toast.error(body.error || 'Failed to delete orders');
      }
    } catch (err) {
      toast.error('Failed to delete orders');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Total Orders</p>
          <p className="mt-2 text-lg font-semibold sm:text-2xl">
            {filtersActive ? `${filteredOrders.length} / ${totalOrders}` : totalOrders}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Total Order Value</p>
          <p className="mt-2 truncate text-lg font-semibold sm:text-2xl">
            {formatINR(filtersActive ? filteredTotal : totalOrderValue)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Revenue (paid/shipped/delivered)</p>
          <p className="mt-2 truncate text-lg font-semibold sm:text-2xl">{formatINR(revenue)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="mt-2 text-lg font-semibold sm:text-2xl">{pendingCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order ID, customer, product…"
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SelectRoot value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'failed'].map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>

          <SelectRoot value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Payments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="cod">COD</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="partial">Partial Pay</SelectItem>
            </SelectContent>
          </SelectRoot>

          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setPaymentFilter('all');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <p className="text-sm font-medium">
            {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full min-w-[900px] table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label="Select all orders"
                />
              </th>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ship</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No orders match your search or filters.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  selected={selectedIds.has(o.id)}
                  onToggleSelect={toggleSelectOne}
                  onChangeStatus={updateStatus}
                  onCreateShipment={openShipmentModal}
                  creatingShipment={creatingShipmentFor === o.id}
                  onRequestOnlinePayment={requestOnlinePayment}
                  onRevertToCod={revertToCod}
                  revertingToCod={revertingToCodFor === o.id}
                  justRevertedToCod={revertedIds.has(o.id)}
                  requestingOnlinePayment={requestingOnlinePaymentFor === o.id}
                  onUpdateDetails={updateOrderDetails}
                  savingDetails={savingDetailsFor === o.id}
                  onReload={load}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateShipmentModal
        open={!!shipmentModalOrderId}
        onOpenChange={(open) => {
          if (!open) {
            setShipmentModalOrderId(null);
            setPendingStatusAfterShip(null);
          }
        }}
        destinationPincode={orders.find((o) => o.id === shipmentModalOrderId)?.shipping_address?.pincode}
        paymentMethod={orders.find((o) => o.id === shipmentModalOrderId)?.payment_method}
        awaitingOnlinePayment={(() => {
          const mo = orders.find((o) => o.id === shipmentModalOrderId);
          if (mo?.payment_method === 'partial') return !mo.advance_paid_at;
          return !!mo && mo.payment_method !== 'cod' && !mo.razorpay_payment_id && mo.status !== 'paid';
        })()}
        items={orders.find((o) => o.id === shipmentModalOrderId)?.items ?? []}
        shipments={orders.find((o) => o.id === shipmentModalOrderId)?._shipments ?? []}
        totalAmount={(() => {
          const mo = orders.find((o) => o.id === shipmentModalOrderId);
          // Partial Pay: the courier only collects the balance.
          return Number(mo?.payment_method === 'partial' ? mo.balance_due || 0 : mo?.total_amount || 0);
        })()}
        confirming={creatingShipmentFor === shipmentModalOrderId}
        onConfirm={confirmShipmentFromModal}
      />

      {/* Bulk delete confirm */}
      <Dialog open={confirmBulkDelete} onOpenChange={(open) => !open && setConfirmBulkDelete(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              Delete {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected order{selectedIds.size === 1 ? '' : 's'} will be
              permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={deleteSelectedOrders}
              className="gap-1.5"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Resolves what (if anything) the Refund badge under an order's Status
// dropdown should show. Checks the return-linked refund first — if this
// order has a linked return/exchange, THAT refund is the one currently
// relevant regardless of what (if anything) orders.refund_status says —
// then falls back to the cancellation refund. Returns null when there's
// genuinely nothing to show (COD order, order never paid online, or a
// return that hasn't reached the refund stage yet).
// ---- WhatsApp "pay online" request ----------------------------------------
// One-click WhatsApp version of the "Request Online Payment" email. Uses a
// wa.me click-to-chat link: it opens WhatsApp (app or web) on the customer's
// chat with the message already typed -- admin only has to press Send.
// Payment link = same /checkout/resume/[id] page the email points to, so the
// amount shown to the customer (already discounted) is identical.
//
// The message explains WHY online payment is being asked for (made to order,
// high demand, prepaid orders first, COD after, 4-7 day processing time), shows product / colour / size, the
// COD-vs-online price difference, and the returns/refund assurance.
// KEEP the returns wording in sync with /legal/refund-policy (7-day returns,
// 48-hour damaged-item claims, 5-7 business day refunds).
// Edit the wording in the `lines` array below.
//
// NOTE: wa.me links can only carry text (no attachments or buttons). The
// product photo therefore rides on the PAYMENT LINK's preview card instead:
// WhatsApp previews the first link in a message, and /checkout/resume/[id]
// publishes og:title/description/image (photo served from our own domain, see
// app/checkout/resume/[id]/page.tsx and app/api/og/pay/[id]/route.ts). Keep
// the payment link as the ONLY link in this message so its card is the one shown.
const STORE_NAME = 'Sutisaree';
// Made-to-order processing time quoted to the customer (before dispatch).
const PROCESSING_TIME = '4-7 days';

// Customer phone -> WhatsApp number (digits only, with country code), or
// null when the number on the order isn't usable.
function getWhatsAppDigits(order: Order): string | null {
  let digits = String(order.customer_phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`; // India country code
  return digits.length < 11 ? null : digits;
}

// Short, polite "please pay online" message. Deliberately brief so the
// customer understands the ask at a glance; the payment link is the ONLY link
// so WhatsApp's preview card (saree photo + amount) is the one shown.
function buildPaymentWhatsAppText(p: {
  firstName: string;
  shortId: string;
  payUrl: string;
  onlineTotal: number;
  codTotal: number;
}): string {
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const saving = Math.max(0, p.codTotal - p.onlineTotal);
  return [
    `Dear${p.firstName ? ` ${p.firstName}` : ''},`,
    '',
    `Warm greetings from *${STORE_NAME}* 🌸`,
    '',
    `Thank you for choosing us. Your order *#${p.shortId}* is handcrafted especially for you, and we would be truly grateful if you could complete the payment online instead of Cash on Delivery.`,
    '',
    `*Amount: ${inr(p.onlineTotal)}*${saving > 0 ? `  _(a special saving of ${inr(saving)} for you)_` : ''}`,
    '',
    `Your secure payment link 👇`,
    p.payUrl,
    '',
    `Once the payment is received, we begin preparing your piece right away. Your payment is fully protected, with 7-day returns and a full refund should anything go amiss.`,
    '',
    `Prefer not to pay online? On the same page you may also choose to keep Cash on Delivery (${inr(p.codTotal)}) or cancel the order. (Prepaid orders are dispatched first, so Cash on Delivery may take a little longer.)`,
    '',
    `With gratitude,`,
    `*Team ${STORE_NAME}*`,
  ].join('\n');
}

function buildPaymentWhatsAppUrl(order: Order): string | null {
  const digits = getWhatsAppDigits(order);
  if (!digits) return null;
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  const onlineTotal = Number(order.total_amount || 0);
  if (order.payment_method === 'partial') {
    const advance = Number(order.advance_amount || 0);
    const balance = Math.max(0, onlineTotal - advance);
    const inrP = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const partialText = [
      `Dear${(order.customer_name || '').trim().split(/\s+/)[0] ? ` ${(order.customer_name || '').trim().split(/\s+/)[0]}` : ''},`,
      '',
      `Warm greetings from *${STORE_NAME}* 🌸`,
      '',
      `Your order *#${order.id.slice(0, 8).toUpperCase()}* is saved. To confirm it, please pay the advance of *${inrP(advance)}* online. The remaining *${inrP(balance)}* you pay when the order is delivered.`,
      '',
      `Your secure payment link 👇`,
      `${siteUrl}/checkout/resume/${order.id}`,
      '',
      `With gratitude,`,
      `*Team ${STORE_NAME}*`,
    ].join('\n');
    return `https://wa.me/${digits}?text=${encodeURIComponent(partialText)}`;
  }
  const text = buildPaymentWhatsAppText({
    firstName: (order.customer_name || '').trim().split(/\s+/)[0],
    shortId: order.id.slice(0, 8).toUpperCase(),
    payUrl: `${siteUrl}/checkout/resume/${order.id}`,
    onlineTotal,
    codTotal: onlineTotal + Number(order.online_payment_discount ?? 0),
  });
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ---- WhatsApp "payment received" confirmation ------------------------------
// Sent AFTER the customer has paid (order status 'paid'). Many customers never
// open their email, so this puts the good news where they'll actually see it:
// payment received, order confirmed, what happens next, how to track it.
// Same made-to-order processing time as the payment-request message above.
function buildPaidConfirmationWhatsAppUrl(order: Order): string | null {
  const digits = getWhatsAppDigits(order);
  if (!digits) return null;

  const shortId = order.id.slice(0, 8).toUpperCase();
  const first = (order.customer_name || '').trim().split(/\s+/)[0];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const isPartialOrder = order.payment_method === 'partial';
  const paid = isPartialOrder ? Number(order.advance_amount || 0) : Number(order.total_amount || 0);
  const discount = Number(order.online_payment_discount ?? 0);
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  const trackLink = `${siteUrl}/track/${order.id}`;

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map((it) => {
    const name = it.product_name || it.name || 'Your selection';
    const qty = Number(it.quantity ?? 1);
    const extras = [it.color ? `Color: ${it.color}` : '', it.size ? `Size: ${it.size}` : '', qty > 1 ? `Qty: ${qty}` : '']
      .filter(Boolean)
      .join('  ·  ');
    return `*${name}*${extras ? `\n${extras}` : ''}`;
  });

  const lines = [
    `Dear${first ? ` ${first}` : ''},`,
    '',
    isPartialOrder
      ? `Thank you! We have received your advance of *${inr(paid)}* for order *#${shortId}*. Your order is confirmed. ✅`
      : `Thank you! We have received your payment of *${inr(paid)}* for order *#${shortId}*. Your order is confirmed. ✅`,
    ...(isPartialOrder
      ? [`The remaining *${inr(Number(order.balance_due || 0))}* is payable on delivery (cash or UPI). Please keep it ready.`]
      : []),
    ...(discount > 0 ? [`You saved ${inr(discount)} by paying online.`] : []),
    '',
    `*Your order*`,
    ...itemLines,
    '',
    `*What happens next*`,
    `Our team will now start preparing your order. Processing takes ${PROCESSING_TIME}, then we dispatch it. We will email you every update until it reaches your hands.`,
    '',
    `*Track your order anytime*`,
    `Log in with the same email you ordered with (OTP or Google login) to see your order status, or open your order directly:`,
    trackLink,
    '',
    `Thank you for your trust and patience.`,
    '',
    `Warm regards,`,
    `*Team ${STORE_NAME}*`,
  ];
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// ---- WhatsApp update for ONE parcel of a split order ---------------------
// `allShipments` = every parcel of the order INCLUDING `shipment`, so the
// message can list what is still unshipped and promise the next lot.
function buildParcelWhatsAppUrl(
  order: Order,
  shipment: OrderShipment,
  allShipments: OrderShipment[]
): string | null {
  const digits = getWhatsAppDigits(order);
  if (!digits) return null;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  const trackLink = `${siteUrl}/track/${order.id}`;
  const shortId = order.id.slice(0, 8).toUpperCase();
  const first = (order.customer_name || '').trim().split(/\s+/)[0];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const lines = (list: any[]) =>
    list.map((it) => {
      const name = it.product_name || it.name || 'Your selection';
      const qty = Number(it.quantity ?? 1);
      const extras = [it.color ? `Color: ${it.color}` : '', it.size ? `Size: ${it.size}` : '', qty > 1 ? `Qty: ${qty}` : '']
        .filter(Boolean)
        .join('  ·  ');
      return `*${name}*${extras ? `\n${extras}` : ''}`;
    });

  const allItems: any[] = Array.isArray(order.items) ? order.items : [];
  const remaining = getUnshippedItemIndexes(allItems, allShipments).map((i) => allItems[i]);
  const shippedItems: any[] = Array.isArray(shipment.items) ? shipment.items : [];
  const when = nextLotPhrase(shipment.next_shipment_min_days, shipment.next_shipment_max_days);

  const body = [
    `Dear${first ? ` ${first}` : ''},`,
    '',
    remaining.length > 0
      ? `Good news! *Part of your order #${shortId}* has been shipped.`
      : `Good news! The *rest of your order #${shortId}* has been shipped.`,
    '',
    `*In this parcel (Parcel ${shipment.shipment_no})*`,
    ...lines(shippedItems),
    '',
    `*Shipment details*`,
    `Courier: ${shipment.courier_name || 'Delhivery'}`,
    `Tracking number: ${shipment.waybill}`,
    ...(Number(shipment.cod_amount) > 0
      ? ['', `Cash on Delivery for this parcel: please keep *${inr(Number(shipment.cod_amount))}* ready.`]
      : []),
    '',
    ...(remaining.length > 0
      ? [
          `*Your remaining item${remaining.length > 1 ? 's' : ''}*`,
          ...lines(remaining),
          `${remaining.length > 1 ? 'These are' : 'This is'} being prepared in our next lot and will ship *${when}*. We will message you its tracking number the moment it leaves us. No extra charge and nothing for you to do. 🙏`,
          '',
        ]
      : []),
    `*Track every parcel anytime*`,
    trackLink,
    '',
    `Thank you for your patience.`,
    '',
    `Warm regards,`,
    `*Team ${STORE_NAME}*`,
  ];

  return `https://wa.me/${digits}?text=${encodeURIComponent(body.join('\n'))}`;
}

function WhatsAppLinkButton({
  url,
  label,
  title,
  className = '',
}: {
  url: string | null;
  label: string;
  title: string;
  className?: string;
}) {
  if (!url) {
    return (
      <span className="mt-1.5 block text-[10px] text-red-600">No valid phone number for WhatsApp</span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`inline-flex w-fit items-center gap-1 rounded-md bg-[#25D366] px-2 py-1 text-[11px] font-medium leading-tight text-white hover:bg-[#1ebe57] ${className}`}
    >
      <MessageCircle className="h-3 w-3" />
      {label}
    </a>
  );
}

// Pending online-payment request -> "please pay online" message.
function WhatsAppPaymentButton({ order, className = '' }: { order: Order; className?: string }) {
  return (
    <WhatsAppLinkButton
      url={buildPaymentWhatsAppUrl(order)}
      label="Send on WhatsApp"
      title="Open WhatsApp with the online-payment request message ready to send"
      className={className}
    />
  );
}

// Paid order -> "payment received, order confirmed" message.
function WhatsAppPaidConfirmationButton({ order, className = '' }: { order: Order; className?: string }) {
  return (
    <WhatsAppLinkButton
      url={buildPaidConfirmationWhatsAppUrl(order)}
      label="Send payment confirmation on WhatsApp"
      title="Open WhatsApp with the payment-received confirmation message ready to send"
      className={className}
    />
  );
}

// ---- WhatsApp messages for EVERY other order status ------------------------
// Added on top of the two messages above (payment request + payment received),
// which are unchanged. Same one-click wa.me approach: opens the customer's
// chat with a polite, ready-typed message -- admin only presses Send.
//   cod_confirmed    -> COD order received / confirmed
//   payment_reminder -> online payment still pending (abandoned checkout)
//   shipped          -> order dispatched (+ courier / tracking)
//   delivered        -> delivered, thank-you, returns window
//   cancelled        -> order cancelled (+ refund note if it was paid online)
//   failed           -> payment failed, retry link
// Keep the returns/refund wording in sync with /legal/refund-policy.
// Each message carries at most ONE link so WhatsApp shows a clean preview.
type StatusWhatsAppKind =
  | 'cod_confirmed'
  | 'cod_reverted'
  | 'payment_reminder'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed';

const STATUS_WA_META: Record<StatusWhatsAppKind, { label: string; title: string }> = {
  cod_confirmed: {
    label: 'Send order confirmation on WhatsApp',
    title: 'Open WhatsApp with the COD order-confirmed message ready to send',
  },
  cod_reverted: {
    label: 'Tell customer: COD, no online payment needed',
    title: 'Open WhatsApp with the "no online payment needed, shipping as COD" message ready to send',
  },
  payment_reminder: {
    label: 'Send payment reminder on WhatsApp',
    title: 'Open WhatsApp with a polite payment reminder ready to send',
  },
  shipped: {
    label: 'Send shipping update on WhatsApp',
    title: 'Open WhatsApp with the order-shipped message ready to send',
  },
  delivered: {
    label: 'Send delivery message on WhatsApp',
    title: 'Open WhatsApp with the order-delivered thank-you message ready to send',
  },
  cancelled: {
    label: 'Send cancellation message on WhatsApp',
    title: 'Open WhatsApp with the order-cancelled message ready to send',
  },
  failed: {
    label: 'Send payment-failed message on WhatsApp',
    title: 'Open WhatsApp with the payment-failed / retry message ready to send',
  },
};

// `extra` is only used by the delivered message: the secret login-free review
// link (minted server-side by /api/admin/orders/[id]/review-link) and, when the
// store's review reward is switched on, a short "X off" phrase.
function buildStatusWhatsAppUrl(
  order: Order,
  kind: StatusWhatsAppKind,
  extra: { reviewLink?: string; rewardText?: string } = {}
): string | null {
  const digits = getWhatsAppDigits(order);
  if (!digits) return null;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  const trackLink = `${siteUrl}/track/${order.id}`;
  const payLink = `${siteUrl}/checkout/resume/${order.id}`;
  const shortId = order.id.slice(0, 8).toUpperCase();
  const first = (order.customer_name || '').trim().split(/\s+/)[0];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const total = Number(order.total_amount || 0);

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map((it) => {
    const name = it.product_name || it.name || 'Your selection';
    const qty = Number(it.quantity ?? 1);
    const extras = [it.color ? `Color: ${it.color}` : '', it.size ? `Size: ${it.size}` : '', qty > 1 ? `Qty: ${qty}` : '']
      .filter(Boolean)
      .join('  ·  ');
    return `*${name}*${extras ? `\n${extras}` : ''}`;
  });

  const greeting = [`Dear${first ? ` ${first}` : ''},`, ''];
  const signoff = ['', `Warm regards,`, `*Team ${STORE_NAME}*`];
  let body: string[] = [];

  if (kind === 'cod_confirmed') {
    body = [
      `Thank you for shopping with *${STORE_NAME}*. We have received your order *#${shortId}* and it is confirmed. ✅`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      `*Payment*`,
      `Cash on Delivery: *${inr(total)}*. Please keep this amount ready at the time of delivery.`,
      '',
      `*What happens next*`,
      `Our team will prepare your order. Processing takes ${PROCESSING_TIME}, then we dispatch it. We will email you every update until it reaches your hands.`,
      '',
      `*Track your order anytime*`,
      trackLink,
      '',
      `Thank you for your trust and patience.`,
    ];
  } else if (kind === 'cod_reverted') {
    body = [
      `Earlier we had requested online payment for your order *#${shortId}*. Good news: *you no longer need to pay online.* We are shipping it as *Cash on Delivery*, as you originally placed it. Please ignore the earlier payment link, and we apologise for the confusion. 🙏`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      `*Payment*`,
      `Cash on Delivery: *${inr(total)}*. Please keep this amount ready at the time of delivery.`,
      '',
      `*Track your order anytime*`,
      trackLink,
      '',
      `Thank you for your trust and patience.`,
    ];
  } else if (kind === 'payment_reminder') {
    body = [
      `Thank you for choosing *${STORE_NAME}*. This is a gentle reminder that the online payment for your order *#${shortId}* is still pending.`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      `*Amount payable: ${inr(total)}*`,
      '',
      `You can complete your payment securely here:`,
      payLink,
      '',
      `If you have already paid or need any help, please just reply to this message and we will be happy to assist you.`,
      '',
      `Thank you for your patience.`,
    ];
  } else if (kind === 'shipped') {
    const expected = order.expected_delivery_date
      ? new Date(order.expected_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    body = [
      `Good news! Your order *#${shortId}* has been shipped.`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      ...(order.courier_name || order.tracking_number
        ? [
            `*Shipment details*`,
            ...(order.courier_name ? [`Courier: ${order.courier_name}`] : []),
            ...(order.tracking_number ? [`Tracking number: ${order.tracking_number}`] : []),
            ...(expected ? [`Expected delivery: ${expected}`] : []),
            '',
          ]
        : []),
      ...(order.payment_method === 'cod' ? [`Cash on Delivery: please keep *${inr(total)}* ready at the time of delivery.`, ''] : []),
      ...(order.payment_method === 'partial' && Number(order.balance_due) > 0
        ? [`Partial Pay: you have already paid the advance. Please keep the balance of *${inr(Number(order.balance_due))}* ready (cash or UPI) at the time of delivery.`, '']
        : []),
      `*Track your order anytime*`,
      trackLink,
      '',
      `Thank you for your patience. We hope you love it!`,
    ];
  } else if (kind === 'delivered') {
    body = [
      `We are happy to let you know that your order *#${shortId}* has been delivered.`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      `Thank you for choosing *${STORE_NAME}*. We hope you love your purchase.`,
      '',
      ...(extra.reviewLink
        ? [
            `*How did we do?*`,
            `Your feedback means a lot to us and helps other customers choose with confidence. It takes less than a minute${
              extra.rewardText ? `, and you will unlock ${extra.rewardText} on your next order` : ''
            }:`,
            extra.reviewLink,
            '',
          ]
        : []),
      `If anything is not right, please reply here and we will help you. We offer 7-day returns & exchanges, and damaged or wrong items can be reported within 48 hours for a free replacement or full refund.`,
      '',
      `Thank you for your trust.`,
    ];
  } else if (kind === 'cancelled') {
    const wasPaid = !!order.razorpay_payment_id;
    const refunded = order.refund_status === 'refunded';
    body = [
      `This is to let you know that your order *#${shortId}* has been cancelled.`,
      '',
      `*Order*`,
      ...itemLines,
      '',
      ...(wasPaid
        ? [
            refunded
              ? `*Refund*\nYour payment of ${inr(total)} has been refunded to your original payment method. It may take 5-7 business days to reflect in your account.`
              : `*Refund*\nYour payment of ${inr(total)} will be refunded to your original payment method within 5-7 business days.`,
            '',
          ]
        : []),
      `We are sorry we could not fulfil this order. If you would like to order again or need any help, please just reply to this message. We would be glad to assist you.`,
      '',
      `*Order details*`,
      trackLink,
      '',
      `Thank you for your understanding.`,
    ];
  } else {
    body = [
      `We noticed that the payment for your order *#${shortId}* did not go through, so the order is not confirmed yet.`,
      '',
      `*Your order*`,
      ...itemLines,
      '',
      `*Amount payable: ${inr(total)}*`,
      '',
      `If any amount was deducted from your account, it is usually returned automatically by your bank within 5-7 business days. You can retry your payment securely here:`,
      payLink,
      '',
      `If you need any help, please just reply to this message and we will be happy to assist you.`,
      '',
      `Thank you for your patience.`,
    ];
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent([...greeting, ...body, ...signoff].join('\n'))}`;
}

// Delivered -> thank-you message WITH the customer's secret review link. The
// link is minted server-side (needs the service-role DB), so the click first
// asks /api/admin/orders/[id]/review-link for it, then opens WhatsApp. The
// tab is opened synchronously on click so popup blockers allow it.
function WhatsAppDeliveredButton({ order, className = '' }: { order: Order; className?: string }) {
  const [busy, setBusy] = useState(false);
  if (!getWhatsAppDigits(order)) {
    return <span className="mt-1.5 block text-[10px] text-red-600">No valid phone number for WhatsApp</span>;
  }
  const onClick = async () => {
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/review-link`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Could not create the review link');
      const r = json.reward;
      const rewardText =
        r?.enabled && Number(r.discountValue) > 0
          ? r.discountType === 'percentage'
            ? `${r.discountValue}% off`
            : `₹${r.discountValue} off`
          : '';
      const url = buildStatusWhatsAppUrl(order, 'delivered', { reviewLink: json.url, rewardText });
      if (!url) throw new Error('No valid phone number for WhatsApp');
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : 'Could not open WhatsApp');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={STATUS_WA_META.delivered.title}
      className={`inline-flex w-fit items-center gap-1 rounded-md bg-[#25D366] px-2 py-1 text-[11px] font-medium leading-tight text-white hover:bg-[#1ebe57] disabled:opacity-70 ${className}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
      {STATUS_WA_META.delivered.label}
    </button>
  );
}

function WhatsAppStatusButton({
  order,
  kind,
  className = '',
}: {
  order: Order;
  kind: StatusWhatsAppKind;
  className?: string;
}) {
  return (
    <WhatsAppLinkButton
      url={buildStatusWhatsAppUrl(order, kind)}
      label={STATUS_WA_META[kind].label}
      title={STATUS_WA_META[kind].title}
      className={className}
    />
  );
}

function getRefundBadge(order: Order): { label: string; className: string } | null {
  const status = order._return_status ? order._return_refund_status : order.refund_status;
  if (!status || status === 'not_applicable') return null;

  const STYLES: Record<string, { label: string; className: string }> = {
    refunded: { label: 'Refund: Refunded', className: 'bg-emerald-100 text-emerald-700' },
    processing: { label: 'Refund: Processing', className: 'bg-blue-100 text-blue-700' },
    pending: { label: 'Refund: Pending', className: 'bg-amber-100 text-amber-700' },
    pending_manual: { label: 'Refund: Manual Pending', className: 'bg-amber-100 text-amber-700' },
    failed: { label: 'Refund: Failed', className: 'bg-red-100 text-red-700' },
  };
  return STYLES[status] ?? { label: `Refund: ${status}`, className: 'bg-muted text-muted-foreground' };
}

// Product-column thumbnails: one image per line item (up to 3, then a "+N"
// tile) so a multi-saree order is obvious at a glance without opening it.
// Every thumbnail carries its own quantity badge when qty > 1.
function OrderItemThumbs({ items }: { items: any[] }) {
  const list = Array.isArray(items) ? items : [];
  const MAX = 3;
  const shown = list.slice(0, MAX);
  const extra = list.length - shown.length;
  const box = 'h-9 w-9 flex-shrink-0 rounded-md border border-border/60 object-cover';
  if (shown.length === 0) {
    return <div className={`${box} bg-muted`} />;
  }
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {shown.map((it, idx) => {
        const qty = Number(it?.quantity ?? 1);
        return (
          <div key={idx} className="relative" title={`${it?.product_name || 'Item'}${qty > 1 ? ` × ${qty}` : ''}`}>
            {it?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.image_url}
                alt={it.product_name || 'Item'}
                className={box}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`${it?.image_url ? 'hidden ' : ''}${box} bg-muted`} />
            {qty > 1 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                ×{qty}
              </span>
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted text-[11px] font-semibold text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  selected,
  onToggleSelect,
  onChangeStatus,
  onCreateShipment,
  creatingShipment,
  onRequestOnlinePayment,
  onRevertToCod,
  revertingToCod,
  justRevertedToCod,
  requestingOnlinePayment,
  onUpdateDetails,
  savingDetails,
  onReload,
}: {
  order: Order;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onChangeStatus: (id: string, status: string) => void;
  onCreateShipment: (id: string) => void;
  creatingShipment: boolean;
  onRequestOnlinePayment: (id: string) => void;
  onRevertToCod: (id: string) => void;
  revertingToCod: boolean;
  justRevertedToCod: boolean;
  requestingOnlinePayment: boolean;
  onUpdateDetails: (
    id: string,
    details: { customer_email?: string; customer_phone?: string; shipping_address?: Record<string, any> }
  ) => Promise<boolean>;
  savingDetails: boolean;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const remainingToShip =
    (order._shipments?.length ?? 0) > 0 ? getUnshippedItemIndexes(order.items, order._shipments).length : 0;
  const isSplitOrder = (order._shipments?.length ?? 0) > 1 || !!order._shipments?.some((x) => x.is_partial);
  // Contact/address edit mode -- only offered while the order hasn't shipped
  // yet (see `canEditDetails` below), so admins can't quietly change the
  // destination on a package that's already with the courier.
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState({
    customer_email: order.customer_email || '',
    customer_phone: order.customer_phone || '',
    address: order.shipping_address?.address || '',
    address2: order.shipping_address?.address2 || '',
    landmark: order.shipping_address?.landmark || '',
    city: order.shipping_address?.city || '',
    state: order.shipping_address?.state || '',
    pincode: order.shipping_address?.pincode || '',
    country: order.shipping_address?.country || '',
  });
  const canEditDetails = !order.tracking_number && order.status !== 'shipped' && order.status !== 'delivered';

  const startEditingDetails = () => {
    setDetailsDraft({
      customer_email: order.customer_email || '',
      customer_phone: order.customer_phone || '',
      address: order.shipping_address?.address || '',
      address2: order.shipping_address?.address2 || '',
      landmark: order.shipping_address?.landmark || '',
      city: order.shipping_address?.city || '',
      state: order.shipping_address?.state || '',
      pincode: order.shipping_address?.pincode || '',
      country: order.shipping_address?.country || '',
    });
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    const ok = await onUpdateDetails(order.id, {
      customer_email: detailsDraft.customer_email.trim(),
      customer_phone: detailsDraft.customer_phone.trim(),
      shipping_address: {
        ...(order.shipping_address || {}),
        address: detailsDraft.address.trim(),
        address2: detailsDraft.address2.trim(),
        landmark: detailsDraft.landmark.trim(),
        city: detailsDraft.city.trim(),
        state: detailsDraft.state.trim(),
        pincode: detailsDraft.pincode.trim(),
        country: detailsDraft.country.trim(),
      },
    });
    if (ok) setEditingDetails(false);
  };
  const shortId = order.id.slice(0, 8).toUpperCase();
  const refundBadge = getRefundBadge(order);

  // True once "Request Online Payment" has been used on this order (or it
  // was a normal online checkout that got the discount) -- lets the admin
  // see, at a glance, that today's total_amount is a DISCOUNTED price and
  // what the order was originally placed at, instead of just seeing ₹387
  // with no context for where the ₹399 the customer actually agreed to went.
  const discountAmt = Number(order.online_payment_discount ?? 0);
  const wasConvertedFromCod =
    order.payment_method !== 'cod' && order.original_payment_method === 'cod';
  const originalOrderTotal = order.total_amount + discountAmt;
  const showPriceBreakdown = discountAmt > 0;

  // Full checkout-style price breakdown (product subtotal, coupon, gift card,
  // loyalty points, shipping, GST, online-payment discount) so the admin can
  // see exactly how total_amount was arrived at -- same numbers the customer
  // saw on the checkout page, not just the final total. All of these were
  // already being fetched (fetchOrders() does select('*')), just never
  // rendered here before.
  const couponDiscountAmt = Number(order.coupon_discount ?? 0);
  const giftCardDiscountAmt = Number(order.gift_card_discount ?? 0);
  const loyaltyDiscountAmt = Number(order.loyalty_discount ?? 0);
  const shippingAmt = Number(order.shipping_charge ?? 0);
  const gstAmt = Number(order.gst_amount ?? 0);
  const hasFullBreakdown = order.subtotal != null;
  const isCod = order.payment_method === 'cod';
  // payment_method flips to 'online' the moment "Request Online Payment" is
  // clicked, well before the customer actually pays, so payment_method
  // alone can't tell us whether money has actually changed hands.
  //
  // order.status ALSO isn't reliable for that on its own: it correctly
  // reads 'paid' right after checkout, but then keeps moving forward for
  // every order that progresses normally (paid -> shipped -> delivered) or
  // gets cancelled/returned afterwards (paid -> cancelled). Checking
  // `status !== 'paid'` alone made a cancelled-after-being-paid order (or
  // any shipped/delivered online order) wrongly show "Awaiting payment --
  // not paid yet", even though the customer's money was already captured.
  //
  // razorpay_payment_id is written once by verify-payment the moment
  // Razorpay actually confirms the charge, and is never cleared again
  // afterwards -- so it's the one signal that reliably answers "did this
  // order ever actually get paid", independent of where its status has
  // moved on to since.
  const wasEverPaidOnline = !!order.razorpay_payment_id || order.status === 'paid';
  const isAwaitingOnlinePayment = !isCod && !wasEverPaidOnline;
  // Reseller orders: total_amount is always the STORE'S cost price (what
  // place_order_with_items() computes from subtotal/discounts -- see
  // reseller_base_cost: isResale ? total : null in app/checkout/page.tsx).
  // reseller_profit is the extra margin the reseller charged their own end
  // customer on top of that, which the admin owes back to the reseller --
  // it is never part of total_amount and is never collected from anyone
  // here, so it has to be called out separately or it looks like it vanished.
  const resellerMargin = Number(order.reseller_profit ?? 0);
  const resellerSellingPrice = Number(order.reseller_base_cost ?? order.total_amount) + resellerMargin;

  const [copiedDetails, setCopiedDetails] = useState(false);
  // One click copies exactly what's needed to paste into a courier form /
  // WhatsApp: name, mobile and the full address on one line.
  const copyCustomerDetails = async () => {
    const text = buildCustomerCopyText(order);
    const ok = await copyText(text);
    if (ok) {
      setCopiedDetails(true);
      toast.success('Name, mobile & address copied');
      setTimeout(() => setCopiedDetails(false), 1800);
    } else {
      toast.error('Could not copy — please select the text manually');
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available -- ignore
    }
  };

  return (
    <>
      <tr
        data-focus-id={order.id}
        className={`border-t border-l-4 ${STATUS_BORDER_COLOR[order.status] || 'border-l-transparent'} ${
          selected ? 'bg-destructive/5' : order.status === 'cancelled' ? 'bg-red-50/50' : ''
        }`}
      >
        <td className="px-4 py-3 align-top">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(order.id)}
            aria-label={`Select order ${order.id}`}
          />
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold" title={order.id}>
              #{shortId}
            </span>
            <button
              type="button"
              onClick={copyId}
              aria-label="Copy order ID"
              className="text-muted-foreground hover:text-primary"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          <div className="text-sm font-medium">{order.customer_name || 'Guest'}</div>
          {order.customer_email && (
            <div className="text-xs text-muted-foreground">{order.customer_email}</div>
          )}
          {order.customer_phone && (
            <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
          )}
          {!order.customer_email && !order.customer_phone && (
            <div className="text-xs text-muted-foreground">—</div>
          )}
          {order.is_reseller_order && (
            <div className="mt-1 flex flex-col gap-0.5">
              <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Resale{order.reseller_brand_name ? ` · ${order.reseller_brand_name}` : ''}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {typeof order.reseller_base_cost === 'number'
                  ? `${formatINR(order.reseller_base_cost)} → ${formatINR(order.total_amount)}`
                  : null}
                {typeof order.reseller_profit === 'number' ? (
                  <span className="font-semibold text-green-600"> · +{formatINR(order.reseller_profit)} profit</span>
                ) : null}
              </span>
            </div>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-2">
            <OrderItemThumbs items={order.items} />
            <div className="text-xs">
              {order.items[0]?.slug ? (
                <Link
                  href={`/product/${order.items[0].slug}`}
                  target="_blank"
                  className="flex max-w-[9rem] items-center gap-1 truncate font-medium hover:underline"
                  title="Open the exact colour/variation ordered"
                >
                  <span className="truncate">{order.items[0]?.product_name || '—'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <div className="max-w-[9rem] truncate font-medium">{order.items[0]?.product_name || '—'}</div>
              )}
              {order.items.length > 1 && (
                <div className="font-medium text-primary">
                  {order.items.length} items in this order
                </div>
              )}
              {order.items[0]?.product_id && order._item_sources?.[order.items[0].product_id]?.source_name && (
                <div
                  className="mt-0.5 w-fit rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                  title="Admin-only sourcing info — never shown to the customer"
                >
                  Source: {order._item_sources[order.items[0].product_id].source_name}
                  {order._item_sources[order.items[0].product_id].whatsapp_number
                    ? ` · ${order._item_sources[order.items[0].product_id].whatsapp_number}`
                    : ''}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <div>{order.created_at ? new Date(order.created_at).toLocaleString() : ''}</div>
          <SourceChip attribution={order.attribution} />
        </td>
        <td className="px-4 py-3 align-top text-sm font-medium">
          {showPriceBreakdown ? (
            <div
              className="flex flex-col leading-tight"
              title={`Ordered at ${formatINR(originalOrderTotal)} (COD price) · ${formatINR(
                discountAmt
              )} online-payment discount applied when payment was requested`}
            >
              <span className="text-[11px] font-normal text-muted-foreground line-through">
                {formatINR(originalOrderTotal)}
              </span>
              <span>{formatINR(order.total_amount || 0)}</span>
            </div>
          ) : (
            formatINR(order.total_amount || 0)
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              order.payment_method === 'cod'
                ? 'bg-amber-100 text-amber-800'
                : order.payment_method === 'partial'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {order.payment_method === 'cod' ? 'COD' : order.payment_method === 'partial' ? 'Partial' : 'Online'}
          </span>
          {order.payment_method === 'partial' && (
            <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
              {order.advance_paid_at ? (
                <>
                  Advance paid {formatINR(order.advance_amount || 0)}
                  <br />
                  <span className="font-semibold text-foreground">Collect {formatINR(order.balance_due || 0)} on delivery</span>
                </>
              ) : (
                <>Advance {formatINR(order.advance_amount || 0)} not paid yet</>
              )}
            </div>
          )}
          {wasConvertedFromCod && (
            <span
              className="ml-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
              title={`Placed as Cash on Delivery at ${formatINR(
                originalOrderTotal
              )}, then converted to online payment via 'Request Online Payment'${
                showPriceBreakdown ? ` (${formatINR(discountAmt)} online discount applied)` : ''
              }`}
            >
              was COD{showPriceBreakdown ? ` · ${formatINR(originalOrderTotal)}` : ''}
            </span>
          )}
          {order.payment_method === 'cod' && order.status === 'pending' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={requestingOnlinePayment}
              onClick={() => onRequestOnlinePayment(order.id)}
              className="mt-1.5 block h-auto w-fit gap-1 px-2 py-1 text-[11px] leading-tight"
              title="Converts to online payment, emails the customer and opens a short WhatsApp message — ask them to pay online instead of COD"
            >
              {requestingOnlinePayment ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wallet className="h-3 w-3" />
              )}
              Request Online Payment
            </Button>
          )}
          {/* Already converted to online + still unpaid -> let the admin
              nudge the customer on WhatsApp too, one click. */}
          {wasConvertedFromCod && isAwaitingOnlinePayment && order.status === 'pending' && (
            <div className="mt-1.5">
              <WhatsAppPaymentButton order={order} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={revertingToCod}
                onClick={() => onRevertToCod(order.id)}
                className="mt-1.5 block h-auto w-fit gap-1 px-2 py-1 text-[11px] leading-tight"
                title="Customer didn't pay online — put this order back to COD so it can be shipped as COD"
              >
                {revertingToCod ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} Revert to COD
              </Button>
            </div>
          )}
          {/* Customer has paid -> reassure them on WhatsApp too (many people
              never open the confirmation email). Disappears once the order
              moves on from 'paid' (shipped, delivered, ...). */}
          {order.status === 'paid' && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Prepaid · ship first
              </span>
              <WhatsAppPaidConfirmationButton order={order} />
            </div>
          )}
          {/* Every other status gets its own polite WhatsApp message too.
              (pending+converted-from-COD and paid are handled just above.) */}
          {order.status === 'pending' && isCod && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {justRevertedToCod ? (
                <WhatsAppStatusButton order={order} kind="cod_reverted" />
              ) : (
                <>
                  <CodConfirmationControls
                    orderId={order.id}
                    whatsappDigits={getWhatsAppDigits(order)}
                    firstName={(order.customer_name || '').trim().split(/\s+/)[0]}
                    shortId={order.id.slice(0, 8).toUpperCase()}
                    total={Number(order.total_amount || 0)}
                    storeName={STORE_NAME}
                    confirmedAt={order.cod_confirmed_at}
                    confirmedVia={order.cod_confirmed_via}
                    onChanged={onReload}
                  />
                  {order.cod_confirmed_at && <WhatsAppStatusButton order={order} kind="cod_confirmed" />}
                </>
              )}
            </div>
          )}
          {order.status === 'pending' && !isCod && !wasConvertedFromCod && isAwaitingOnlinePayment && (
            <div className="mt-1.5">
              <WhatsAppStatusButton order={order} kind="payment_reminder" />
            </div>
          )}
          {order.status === 'shipped' && !isSplitOrder && (
            <div className="mt-1.5">
              <WhatsAppStatusButton order={order} kind="shipped" />
            </div>
          )}
          {/* Split order: one WhatsApp message per parcel, each mentioning
              what is still to come and the "next lot in 4-7 days" promise. */}
          {isSplitOrder && order.status !== 'cancelled' && order.status !== 'failed' && (
            <div className="mt-1.5 flex flex-col gap-1">
              {order._shipments!.map((sh) => (
                <WhatsAppLinkButton
                  key={sh.id}
                  url={buildParcelWhatsAppUrl(order, sh, order._shipments!)}
                  label={`Send parcel ${sh.shipment_no} update on WhatsApp`}
                  title="Open WhatsApp with this parcel's shipping update (and what's still to come) ready to send"
                />
              ))}
            </div>
          )}
          {order.status === 'delivered' && (
            <div className="mt-1.5">
              <WhatsAppDeliveredButton order={order} />
            </div>
          )}
          {order.status === 'cancelled' && (
            <div className="mt-1.5">
              <WhatsAppStatusButton order={order} kind="cancelled" />
            </div>
          )}
          {order.status === 'failed' && (
            <div className="mt-1.5">
              <WhatsAppStatusButton order={order} kind="failed" />
            </div>
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          {/* An online order stuck at "pending" almost always means the
              Razorpay popup was closed/abandoned before payment finished —
              that's a different situation from a COD order sitting
              "pending" (which is completely normal, since COD is only
              collected at delivery). Flag it clearly instead of leaving
              both looking identical in a plain dropdown. */}
          {order.status === 'pending' && order.payment_method !== 'cod' && (
            <div className="mb-1 w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
              Payment Pending
            </div>
          )}
          {order.status === 'paid' && (
            <div className="mb-1 w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Paid
            </div>
          )}
          <select
            value={order.status}
            onChange={(e) => onChangeStatus(order.id, e.target.value)}
            className={`rounded border-2 px-2 py-1 text-sm ${
              STATUS_BORDER_COLOR[order.status]?.replace('border-l-', 'border-') || 'border-input'
            }`}
          >
            {['pending','paid','shipped','delivered','cancelled','failed'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {refundBadge && (
            <div className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${refundBadge.className}`}>
              {refundBadge.label}
            </div>
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          {order.tracking_number || (order._shipments?.length ?? 0) > 0 ? (
            <div className="flex flex-col items-start gap-1.5">
              {(order._shipments?.length ?? 0) > 0 ? (
                order._shipments!.map((sh) => (
                  <div key={sh.id} className="flex items-center gap-1.5 text-xs">
                    <Truck className="h-3.5 w-3.5 text-secondary" />
                    {(order._shipments!.length > 1 || sh.is_partial) && (
                      <span className="rounded bg-muted px-1 text-[10px] font-semibold">P{sh.shipment_no}</span>
                    )}
                    <span className="font-medium">{sh.waybill}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5 text-xs">
                  <Truck className="h-3.5 w-3.5 text-secondary" />
                  <span className="font-medium">{order.tracking_number}</span>
                </div>
              )}
              {remainingToShip > 0 && !['cancelled', 'delivered', 'failed'].includes(order.status) && (
                <>
                  <span className="text-[11px] font-medium text-amber-700">
                    {remainingToShip} item{remainingToShip > 1 ? 's' : ''} not shipped yet
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingShipment}
                    onClick={() => onCreateShipment(order.id)}
                    className="h-auto gap-1.5 px-2 py-1 text-[11px]"
                  >
                    {creatingShipment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                    Ship remaining items
                  </Button>
                </>
              )}
            </div>
          ) : order.status === 'cancelled' ? (
            // Cancelled orders never ship -- showing "Create Shipment" here
            // was misleading, so replace it with a plain status note.
            <span className="text-xs font-medium text-red-600">Order cancelled</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={creatingShipment}
              onClick={() => onCreateShipment(order.id)}
              className="gap-1.5"
            >
              {creatingShipment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
              Create Shipment
            </Button>
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <div className="flex flex-col items-start gap-1.5">
            <Button size="sm" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'View'}</Button>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <a href={`/api/invoice/${order.id}`} download>
                <Download className="h-3.5 w-3.5" /> Invoice
              </a>
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={10} className="px-4 py-3">
            <TrafficSourceBar attribution={order.attribution} />
            {/* Price breakdown sits on the left; Items fills the empty space
                to its right instead of being pushed below as an under-used
                full-width row. */}
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
              <div>
                {hasFullBreakdown && (
                  <div className="mb-3 max-w-md rounded-lg border border-border/60 bg-white px-4 py-3">
                    <h4 className="mb-2 text-sm font-semibold">Price breakdown</h4>
                    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="text-right tabular-nums">{formatINR(order.subtotal || 0)}</span>
                      {couponDiscountAmt > 0 && (
                        <>
                          <span className="text-green-700">
                            Coupon discount{order.coupon_code ? ` (${order.coupon_code})` : ''}
                          </span>
                          <span className="text-right tabular-nums text-green-700">-{formatINR(couponDiscountAmt)}</span>
                        </>
                      )}
                      {giftCardDiscountAmt > 0 && (
                        <>
                          <span className="text-green-700">
                            Gift card{order.gift_card_code ? ` (${order.gift_card_code})` : ''}
                          </span>
                          <span className="text-right tabular-nums text-green-700">-{formatINR(giftCardDiscountAmt)}</span>
                        </>
                      )}
                      {loyaltyDiscountAmt > 0 && (
                        <>
                          <span className="text-green-700">
                            Loyalty points
                            {order.loyalty_points_redeemed ? ` (${order.loyalty_points_redeemed} pts)` : ''}
                          </span>
                          <span className="text-right tabular-nums text-green-700">-{formatINR(loyaltyDiscountAmt)}</span>
                        </>
                      )}
                      {discountAmt > 0 && (
                        <>
                          <span className="text-green-700">Online payment discount</span>
                          <span className="text-right tabular-nums text-green-700">-{formatINR(discountAmt)}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="text-right tabular-nums">{shippingAmt > 0 ? formatINR(shippingAmt) : 'Free'}</span>
                      <span className="text-muted-foreground">Tax (GST, included)</span>
                      <span className="text-right tabular-nums">{formatINR(gstAmt)}</span>
                      <span className="border-t pt-1 font-semibold">Total</span>
                      <span className="border-t pt-1 text-right font-semibold tabular-nums">
                        {formatINR(order.total_amount || 0)}
                      </span>
                    </div>
                    {/* Unambiguous callout: exactly what changes hands and when,
                        so the admin never has to guess whether this order's
                        total_amount is a COD-collect figure or an already-paid
                        figure. */}
                    <div
                      className={`mt-3 rounded-md px-3 py-2 text-sm font-semibold ${
                        isCod
                          ? 'bg-amber-50 text-amber-900'
                          : isAwaitingOnlinePayment
                            ? 'bg-red-50 text-red-800'
                            : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {isCod
                        ? `Collect ${formatINR(order.total_amount || 0)} from customer on delivery (COD)`
                        : isAwaitingOnlinePayment
                          ? `Awaiting ${formatINR(order.total_amount || 0)} online payment from customer — not paid yet`
                          : `${formatINR(order.total_amount || 0)} already paid online by customer`}
                    </div>
                    {order.is_reseller_order && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                        <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
                          Reseller settlement{order.reseller_brand_name ? ` — ${order.reseller_brand_name}` : ''}
                        </h5>
                        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">
                            Reseller sold this to their customer for
                          </span>
                          <span className="text-right tabular-nums">{formatINR(resellerSellingPrice)}</span>
                          <span className="text-muted-foreground">
                            Store's cost (what's shown above as Total)
                          </span>
                          <span className="text-right tabular-nums">{formatINR(order.total_amount || 0)}</span>
                          <span className="font-semibold text-amber-900">Margin you owe the reseller</span>
                          <span className="text-right font-semibold tabular-nums text-amber-900">
                            {formatINR(resellerMargin)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-amber-700">
                          The {formatINR(order.total_amount || 0)} above is only the store's cost price — it does
                          NOT include the reseller's margin. Pay the reseller {formatINR(resellerMargin)} separately;
                          that amount is never collected from the end customer through this order.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {showPriceBreakdown && (
                  <div className="mb-3 max-w-md rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                    <h4 className="mb-1.5 text-sm font-semibold text-amber-900">Payment breakdown</h4>
                    <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                      <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                        <span className="text-muted-foreground">Ordered at (COD price)</span>
                        <span className="font-medium line-through decoration-muted-foreground/60">
                          {formatINR(originalOrderTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                        <span className="text-muted-foreground">Online payment discount</span>
                        <span className="font-medium text-green-700">-{formatINR(discountAmt)}</span>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                        <span className="text-muted-foreground">Now charging customer</span>
                        <span className="font-bold text-amber-900">{formatINR(order.total_amount)}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      This order was placed as COD at {formatINR(originalOrderTotal)}. When online payment
                      was requested, the standard online-payment discount was applied — the customer only
                      owes {formatINR(order.total_amount)} now, not the original {formatINR(originalOrderTotal)}.
                    </p>
                    {isAwaitingOnlinePayment && order.status === 'pending' && (
                      <div className="mt-2">
                        <WhatsAppPaymentButton order={order} />
                      </div>
                    )}
                    {order.status === 'paid' && (
                      <div className="mt-2">
                        <WhatsAppPaidConfirmationButton order={order} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Items</h4>
                  <ul className="space-y-2 text-sm">
                    {order.items.map((it: any, idx: number) => (
                      <li key={idx} className="flex items-center gap-3">
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image_url}
                            alt={it.product_name}
                            className="h-12 w-12 flex-shrink-0 rounded-md border border-border/60 object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        {it.image_url ? (
                          <div className="hidden h-12 w-12 flex-shrink-0 rounded-md border border-border/60 bg-muted" />
                        ) : (
                          <div className="h-12 w-12 flex-shrink-0 rounded-md border border-border/60 bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          {it.slug ? (
                            <Link
                              href={`/product/${it.slug}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 font-medium hover:underline"
                              title="Open the exact colour/variation ordered"
                            >
                              {it.product_name}
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                          ) : (
                            <div className="font-medium">{it.product_name}</div>
                          )}
                          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {it.color && (
                              <span className="rounded-full bg-muted px-2 py-0.5">Color: {it.color}</span>
                            )}
                            {it.size && (
                              <span className="rounded-full bg-muted px-2 py-0.5">Size: {it.size}</span>
                            )}
                          </div>
                        </div>
                        <div className="whitespace-nowrap text-sm">{formatINR(it.price)} x {it.quantity}</div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Contact &amp; Shipping</h4>
                    <div className="flex items-center gap-2">
                      {!editingDetails && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={copyCustomerDetails}
                          title="Copy name, mobile number and full address"
                        >
                          {copiedDetails ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedDetails ? 'Copied' : 'Copy details'}
                        </Button>
                      )}
                      {!editingDetails && canEditDetails && (
                        <Button type="button" variant="outline" size="sm" onClick={startEditingDetails}>
                          Edit
                        </Button>
                      )}
                    </div>
                    {!editingDetails && !canEditDetails && (
                      <span
                        className="text-[11px] text-muted-foreground"
                        title="Locked once a shipment has been created for this order"
                      >
                        Locked (already shipped)
                      </span>
                    )}
                  </div>

                  {editingDetails ? (
                    <div className="space-y-2 rounded-md border border-border/60 p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Email</label>
                          <Input
                            value={detailsDraft.customer_email}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, customer_email: e.target.value }))}
                            placeholder="customer@example.com"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Phone</label>
                          <Input
                            value={detailsDraft.customer_phone}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, customer_phone: e.target.value }))}
                            placeholder="+91..."
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Address</label>
                        <Input
                          value={detailsDraft.address}
                          onChange={(e) => setDetailsDraft((d) => ({ ...d, address: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Address line 2</label>
                        <Input
                          value={detailsDraft.address2}
                          onChange={(e) => setDetailsDraft((d) => ({ ...d, address2: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Landmark</label>
                          <Input
                            value={detailsDraft.landmark}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, landmark: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">City</label>
                          <Input
                            value={detailsDraft.city}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, city: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">State</label>
                          <Input
                            value={detailsDraft.state}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, state: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Pincode</label>
                          <Input
                            value={detailsDraft.pincode}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, pincode: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Country</label>
                          <Input
                            value={detailsDraft.country}
                            onChange={(e) => setDetailsDraft((d) => ({ ...d, country: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDetails(false)}
                          disabled={savingDetails}
                        >
                          Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={saveDetails} disabled={savingDetails}>
                          {savingDetails ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Save changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <div className="mb-1 space-y-0.5">
                        {order.customer_email && <div>Email: {order.customer_email}</div>}
                        {order.customer_phone && <div>Phone: {order.customer_phone}</div>}
                      </div>
                      {order.shipping_address ? (
                        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(order.shipping_address, null, 2)}</pre>
                      ) : (
                        '—'
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Status History</h4>
                <OrderStatusHistory orderId={order.id} />
              </div>
            </div>
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Email Log</h4>
              <EmailLog order={order} />
            </div>
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Live Tracking</h4>
              <OrderTracking
                orderId={order.id}
                initialTrackingNumber={order.tracking_number}
                initialCourierName={order.courier_name}
              />
            </div>
            <div className="mt-4">
              <DeliveryNotificationTester
                orderId={order.id}
                customerEmail={order.customer_email}
                initialExpectedDate={order.expected_delivery_date}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Shows, at a glance, which of the five lifecycle emails have actually gone
// out to the customer for THIS order and when — answers "did the customer
// get an email about X". Purely a display of the *_sent_at columns already
// written by order-confirm, delhivery/create-shipment, updateOrderStatus,
// and delivery-notifications.ts; never sends anything itself (see the
// "Test Notifications" panel below for that).
function EmailLog({ order }: { order: Order }) {
  const rows: { label: string; sentAt?: string | null; note?: string; error?: string | null }[] = [
    { label: 'Order Confirmed', sentAt: order.confirmation_email_sent_at },
    { label: 'Shipped', sentAt: order.shipped_email_sent_at },
    {
      label: 'Arriving Soon',
      sentAt: order.arriving_email_sent_at,
      note: order.expected_delivery_date
        ? `Expected: ${new Date(order.expected_delivery_date).toLocaleDateString('en-IN')}`
        : undefined,
    },
    { label: 'Out for Delivery', sentAt: order.out_for_delivery_email_sent_at },
    { label: 'Delivered', sentAt: order.delivered_email_sent_at },
  ];

  // One row per product that has earned a review-reward coupon -- a
  // single order can have more than one (one per reviewed product),
  // unlike the five lifecycle rows above which only ever fire once each.
  // Product name comes from this order's own `items` array (already
  // loaded, keyed by product_id) rather than a fresh products lookup.
  const items = Array.isArray((order as any).items) ? (order as any).items : [];
  const nameByProductId = new Map(items.map((it: any) => [it.product_id, it.product_name || it.name]));
  for (const reward of order._review_rewards ?? []) {
    const productName = nameByProductId.get(reward.product_id) || 'Item';
    const discountLabel =
      reward.discount_type === 'percentage'
        ? `${reward.discount_value}% off`
        : reward.discount_type === 'flat'
        ? `₹${reward.discount_value} off`
        : null;
    rows.push({
      label: `Review Reward — ${productName}`,
      sentAt: reward.email_sent_at,
      error: reward.email_error,
      note: [reward.code, discountLabel].filter(Boolean).join(' · ') || undefined,
    });
  }

  if (!order.customer_email && !(order._review_rewards ?? []).length) {
    return <p className="text-sm text-muted-foreground">No customer email on this order — nothing has been sent.</p>;
  }

  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Sent to: <span className="font-medium text-foreground">{order.customer_email || 'no email on this order'}</span>
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              {row.sentAt ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : row.error ? (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className={row.sentAt ? 'text-foreground' : 'text-muted-foreground'}>{row.label}</span>
              {row.note && <span className="text-xs text-muted-foreground">({row.note})</span>}
            </div>
            <span className={`text-xs ${row.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {row.sentAt
                ? new Date(row.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                : row.error
                ? row.error
                : 'Not sent yet'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
