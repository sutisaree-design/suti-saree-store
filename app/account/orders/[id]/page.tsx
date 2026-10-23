import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { PackageCheck, CreditCard, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import { formatINR } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ReturnRequestButton from '@/components/account/return-request-button';
import { toPublicMediaUrl } from '@/lib/media-url';
import CancelOrHelp from '@/components/order/cancel-or-help';
import OrderTracking from '@/components/order/order-tracking';
import DeliveredItemReview from '@/components/account/delivered-item-review';
import EditAddressButton from '@/components/order/edit-address-button';
import { fetchFulfillmentSettings } from '@/lib/marketing-api';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUnshippedItemIndexes } from '@/lib/shipments';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();
  // Same number as Admin > Marketing > Shipping & Returns Timing, so a
  // customer is never told "X-day returns" on one page and denied a
  // return under a different window on this one.
  const { return_window_days: RETURN_WINDOW_DAYS, cancellation_window_hours: CANCELLATION_WINDOW_HOURS } =
    await fetchFulfillmentSettings();

  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();
  const ownsByEmail =
    !!order?.customer_email && !!user?.email && order.customer_email.toLowerCase() === user.email.toLowerCase();
  if (!order || (order.user_id !== user!.id && !ownsByEmail)) {
    notFound();
  }

  const { data: returns } = await supabase
    .from('returns')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  const items = Array.isArray(order.items) ? order.items : [];
  // Ownership was verified above, so reading this order's parcels with the
  // service client is safe (order_shipments has no customer RLS policy).
  const { data: shipmentRows } = await getSupabaseAdmin()
    .from('order_shipments')
    .select('item_indexes')
    .eq('order_id', order.id);
  const isPartlyShipped =
    (shipmentRows?.length ?? 0) > 0 &&
    getUnshippedItemIndexes(items, shipmentRows ?? []).length > 0 &&
    order.status === 'shipped';
  const daysSinceOrder =
    (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const eligibleForReturn =
    order.status === 'delivered' && daysSinceOrder <= RETURN_WINDOW_DAYS && !returns?.length;

  const hoursSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);

  // Same gate the address API route enforces server-side -- kept in sync so
  // the Edit Address button simply doesn't render once it would fail anyway.
  const canEditAddress =
    !order.tracking_number &&
    order.status !== 'shipped' &&
    order.status !== 'delivered' &&
    order.status !== 'cancelled';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary">
            Order #{order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed on {new Date(order.created_at).toLocaleDateString('en-IN')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge className="bg-muted text-foreground">{isPartlyShipped ? 'partly shipped' : order.status}</Badge>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={`/api/invoice/${order.id}`} download>
              <Download className="h-3.5 w-3.5" /> Download Invoice
            </a>
          </Button>
          <CancelOrHelp
            orderId={order.id}
            orderShortId={order.id.slice(0, 8).toUpperCase()}
            status={order.status}
            trackingNumber={order.tracking_number}
            hoursSinceOrder={hoursSinceOrder}
            cancellationWindowHours={CANCELLATION_WINDOW_HOURS}
          />
        </div>
      </div>

      <div className="mt-4">
        <OrderTracking
          orderId={order.id}
          initialTrackingNumber={order.tracking_number}
          initialCourierName={order.courier_name}
        />
      </div>

      {/* Covers both: an ordinary online order the customer abandoned
          mid-checkout, and one Admin flipped from COD -> online via
          "Request Online Payment" -- either way, still 'pending' +
          payment_method 'online' means nothing's been charged yet and
          /checkout/resume/[id] can pick it back up. ?src=account lets
          the admin-side timeline tell this apart from the email link. */}
      {order.status === 'pending' && order.payment_method !== 'cod' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3 text-sm text-amber-900">
            <CreditCard className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Payment pending</p>
              {/* Only shown for orders Admin converted from COD -> online
                  via "Request Online Payment" (original_payment_method
                  stays 'cod' forever even after payment_method flips —
                  see 20260923000000_orders_original_payment_method.sql).
                  An ordinary online order the customer just abandoned
                  mid-checkout never had this, so it doesn't get this
                  explanation. */}
              {order.original_payment_method === 'cod' ? (
                <>
                  <p className="mt-1 text-amber-800/80">
                    Due to high demand on this order, we're currently shipping it on a prepaid basis
                    only — we'll begin preparing and shipping it as soon as payment is received. Thank
                    you so much for your patience and understanding.
                  </p>
                  <p className="mt-2 text-amber-800/80">
                    Your payment is fully protected — if anything about this order doesn't work out,
                    you'll receive a full refund of{' '}
                    <span className="font-semibold text-amber-900">{formatINR(order.total_amount)}</span>,
                    covered under our{' '}
                    <Link href="/legal/refund-policy" className="font-medium text-amber-900 underline underline-offset-2">
                      Refund &amp; Cancellation Policy
                    </Link>
                    , and we're always here if you have questions.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-amber-800/80">Nothing's been charged yet — complete the payment to confirm this order.</p>
              )}
            </div>
          </div>
          <Button asChild size="sm">
            <Link href={`/checkout/resume/${order.id}?src=account`}>Complete Payment</Link>
          </Button>
        </div>
      )}

      {order.status === 'paid' && (
        <div className="mt-4 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <PackageCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <p className="font-medium">Payment received — your order is being prepared</p>
            <p className="mt-1 text-emerald-800/80">
              Sorry for the inconvenience — a few of our pieces are made/kept ready only once an order
              comes in, so preparing this one for shipment may take a little extra time. We'll email you
              the moment it ships.
            </p>
          </div>
        </div>
      )}

      <Separator className="my-6" />

      <h2 className="font-serif text-lg font-semibold">Items</h2>
      <div className="mt-3 divide-y divide-border/60">
        {items.map((item: any, i: number) => (
          <div key={i} className="py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {item.slug ? (
                  <Link href={`/product/${item.slug}`} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted block">
                    <Image
                      src={toPublicMediaUrl(item.image_url) || 'https://placehold.co/80x80?text=No+Image'}
                      alt={item.product_name || 'Product'}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </Link>
                ) : (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
                    <Image
                      src={toPublicMediaUrl(item.image_url) || 'https://placehold.co/80x80?text=No+Image'}
                      alt={item.product_name || 'Product'}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div>
                  {item.slug ? (
                    <Link href={`/product/${item.slug}`} className="font-medium hover:underline">
                      {item.product_name}
                    </Link>
                  ) : (
                    <p className="font-medium">{item.product_name}</p>
                  )}
                  <p className="text-muted-foreground">
                    Size: {item.size} &middot; Qty: {item.quantity}
                  </p>
                </div>
              </div>
              <p className="font-medium">{formatINR(item.price * item.quantity)}</p>
            </div>
            {order.status === 'delivered' && item.product_id && (
              <DeliveredItemReview productId={item.product_id} productName={item.product_name} />
            )}
          </div>
        ))}
      </div>

      <Separator className="my-6" />

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-lg font-semibold">Shipping Address</h2>
            <EditAddressButton
              orderId={order.id}
              currentAddress={order.shipping_address}
              canEdit={canEditAddress}
            />
          </div>
          {order.shipping_address && (
            <p className="mt-2 text-sm text-muted-foreground">
              {order.customer_name}
              <br />
              {order.shipping_address.address}
              {order.shipping_address.address2 ? `, ${order.shipping_address.address2}` : ''}
              {order.shipping_address.landmark ? ` (Near ${order.shipping_address.landmark})` : ''}
              <br />
              {order.shipping_address.city}, {order.shipping_address.state} -{' '}
              {order.shipping_address.pincode}
              <br />
              Phone: {order.customer_phone}
            </p>
          )}
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold">Order Summary</h2>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatINR(order.subtotal ?? order.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>{order.shipping_charge ? formatINR(order.shipping_charge) : 'Free'}</span>
            </div>
            {order.online_payment_discount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Online payment discount</span>
                <span>-{formatINR(order.online_payment_discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground">
              <span>Total</span>
              <span>{formatINR(order.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      <div>
        <h2 className="font-serif text-lg font-semibold">Return / Exchange</h2>
        {returns && returns.length > 0 ? (
          <div className="mt-3 space-y-2">
            {returns.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{r.type} request</span>
                  <Badge className="bg-muted text-foreground">{r.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">Reason: {r.reason}</p>
              </div>
            ))}
          </div>
        ) : eligibleForReturn ? (
          <ReturnRequestButton orderId={order.id} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Returns can be requested within {RETURN_WINDOW_DAYS} days of delivery.
          </p>
        )}
      </div>
    </div>
  );
}
