import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CheckCircle2, Download, Truck, ShieldCheck, LogIn, Gift, Users } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import OrderTracking from '@/components/order/order-tracking';
import PurchaseTracker from '@/components/analytics/purchase-tracker';
import { toPublicMediaUrl } from '@/lib/media-url';
import TrustpilotInvitation from '@/components/analytics/trustpilot-invitation';
import GoogleCustomerReviewsOptIn from '@/components/analytics/google-customer-reviews-optin';
import { estimateDeliveryDate, toCountryCode } from '@/lib/google-customer-reviews';
import CancelOrHelp from '@/components/order/cancel-or-help';
import PaymentPendingBanner from '@/components/order/payment-pending-banner';
import EditAddressButton from '@/components/order/edit-address-button';
import { fetchFulfillmentSettings } from '@/lib/marketing-api';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from '@/lib/loyalty-api';
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from '@/lib/referrals-api';

// This page reads live order status (payment status, cancellation, ship
// status) straight from the DB, and the Cancel Order button on this same
// page needs the very next visit to reflect the new status. Next.js's
// App Router caches server-component fetches by default (force-cache),
// which was serving a stale "pending" snapshot even after the order had
// actually been cancelled in the DB. Forcing this route to be fully
// dynamic (no caching, always re-fetch) fixes that.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Never let search engines index private order pages.
export const metadata = {
  robots: { index: false, follow: false },
};

// Guest order-confirmation links expire after this many days.
const GUEST_LINK_EXPIRY_DAYS = 90;

// Badge styling per order.status. Keeps this page in sync with whatever
// the admin last set from Admin -> Orders (paid/shipped/delivered/
// cancelled/failed), instead of always reading "placed successfully".
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Payment Confirmed', className: 'bg-emerald-100 text-emerald-700' },
  shipped: { label: 'Shipped', className: 'bg-sky-100 text-sky-700' },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  failed: { label: 'Payment Failed', className: 'bg-red-100 text-red-700' },
};

export default async function OrderConfirmationPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();

  if (!order) notFound();

  // Guest link expiry check
  const daysSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const isExpired = daysSinceOrder > GUEST_LINK_EXPIRY_DAYS;

  const fulfillmentSettings = await fetchFulfillmentSettings();

  // Admin > Marketing > Analytics > Google Customer Reviews toggle. On unless
  // an admin explicitly switched it off (missing setting = on). This page is
  // force-dynamic, so the toggle takes effect immediately.
  const { data: analyticsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'analytics_settings')
    .maybeSingle();
  const gcrOptInEnabled =
    (analyticsRow?.value as { gcr_optin_enabled?: boolean } | null)?.gcr_optin_enabled !== false;
  const { cancellation_window_hours: CANCELLATION_WINDOW_HOURS } = fulfillmentSettings;
  const hoursSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);

  // Loyalty points preview — shows what THIS order earns toward the next
  // purchase, computed the same way /api/order-confirm computes it
  // (points_per_100_rupees on total_amount). Reads settings via the
  // already-instantiated admin client instead of lib/loyalty-api's
  // fetchLoyaltySettings(), which uses the 'use client' Supabase singleton
  // and throws "Cannot access supabase.from on the server" when called
  // from a server component -- see lib/marketing-api.ts's note on the
  // exact same issue. Wrapped defensively too, since this is just a
  // "nice to have" preview and shouldn't be able to take down the page.
  const isCancelledOrFailed = order.status === 'cancelled' || order.status === 'failed';
  const isUnpaidPending = order.status === 'pending' && order.payment_method !== 'cod';
  const orderTotal = Number(order.total_amount) || 0;
  let loyaltySettings: LoyaltySettings = DEFAULT_LOYALTY_SETTINGS;
  let projectedPoints = 0;
  try {
    const { data: loyaltySettingsRow, error: loyaltySettingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'loyalty_program')
      .maybeSingle();
    if (!loyaltySettingsError && loyaltySettingsRow) {
      loyaltySettings = {
        ...DEFAULT_LOYALTY_SETTINGS,
        ...((loyaltySettingsRow.value as Partial<LoyaltySettings>) ?? {}),
      };
    }
    projectedPoints = Math.floor((orderTotal * loyaltySettings.points_per_100_rupees) / 100);
  } catch {
    // keep defaults; block below just won't show a non-zero figure
  }
  const pointsValue = projectedPoints * loyaltySettings.redeem_value_per_point;

  // Referral program preview — reads via the already-instantiated admin
  // client (service role) rather than lib/referrals-api's browser client,
  // since that client's cookie-based storage isn't safe to construct in a
  // server component. Also wrapped defensively for the same reason as above.
  let referralSettings: ReferralSettings = DEFAULT_REFERRAL_SETTINGS;
  try {
    const { data: referralSettingsRow, error: referralSettingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'referral_program')
      .maybeSingle();
    if (!referralSettingsError && referralSettingsRow) {
      referralSettings = {
        ...DEFAULT_REFERRAL_SETTINGS,
        ...((referralSettingsRow.value as Partial<ReferralSettings>) ?? {}),
      };
    }
  } catch {
    // keep defaults
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const addr = order.shipping_address as {
    address?: string;
    address2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;

  // Same gate the address API route enforces server-side -- kept in sync so
  // the Edit Address button simply doesn't render once it would fail anyway.
  const canEditAddress =
    !order.tracking_number &&
    order.status !== 'shipped' &&
    order.status !== 'delivered' &&
    order.status !== 'cancelled';

  if (isExpired) {
    return (
      <div className="container-boutique max-w-2xl py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </p>
        <h1 className="mt-2 font-serif text-2xl font-bold text-primary">This link has expired</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Guest order links are valid for {GUEST_LINK_EXPIRY_DAYS} days. Please log in to view your
          order details and invoice.
        </p>
        {order.customer_email && (
          <Button asChild className="mt-6 bg-primary">
            <Link
              href={`/login?next=${encodeURIComponent(`/account/orders/${order.id}`)}&email=${encodeURIComponent(order.customer_email)}`}
            >
              Log in with {order.customer_email}
            </Link>
          </Button>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          We'll email a one-time code — no password needed.
        </p>
      </div>
    );
  }

  return (
    <div className="container-boutique max-w-3xl py-10">
      <PurchaseTracker
        orderId={order.id}
        value={order.total_amount}
        shipping={order.shipping_charge ?? 0}
        tax={order.gst_amount ?? 0}
        couponCode={order.coupon_code}
        items={items.map((item: any) => ({
          product_id: item.product_id ?? null,
          product_name: item.product_name,
          price: item.price,
          quantity: item.quantity,
          feed_item_id: item.feed_item_id ?? null,
        }))}
        customerEmail={order.customer_email}
        customerPhone={order.customer_phone}
        customerName={order.customer_name}
        shippingCity={addr?.city ?? null}
        shippingState={addr?.state ?? null}
        shippingPostalCode={addr?.pincode ?? null}
      />
      <TrustpilotInvitation
        orderId={order.id}
        recipientEmail={order.customer_email}
        recipientName={order.customer_name}
      />
      {/* Google Customer Reviews survey opt-in -> builds the Merchant Center
          store rating. Only for live orders: not cancelled/failed, not an
          unpaid online order, not already delivered. */}
      {gcrOptInEnabled && order.customer_email && !isCancelledOrFailed && !isUnpaidPending && order.status !== 'delivered' && (
        <GoogleCustomerReviewsOptIn
          orderId={order.id}
          email={order.customer_email}
          deliveryCountry={toCountryCode((addr as { country?: string } | null)?.country)}
          estimatedDeliveryDate={estimateDeliveryDate(
            order.created_at,
            fulfillmentSettings.dispatch_days_max,
            fulfillmentSettings.delivery_other_max,
          )}
        />
      )}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-secondary/20 p-4">
          <CheckCircle2 className="h-10 w-10 text-secondary" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-primary">Thank you for your order!</h1>
        {STATUS_BADGE[order.status] && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_BADGE[order.status].className}`}
          >
            {STATUS_BADGE[order.status].label}
          </span>
        )}
        <p className="max-w-md text-sm text-muted-foreground">
          Order #{order.id.slice(0, 8).toUpperCase()} has been placed successfully. A confirmation
          email is on its way to {order.customer_email}. Your handwoven pieces will be dispatched
          soon.
          {order.status === 'cancelled' && (
            <>
              {' '}
              This order has since been <strong>cancelled</strong>.
            </>
          )}
          {order.payment_method === 'cod' && order.status !== 'cancelled' && (
            <>
              {' '}
              Please keep <strong>{formatINR(order.total_amount)}</strong> ready in cash for our
              delivery partner.
            </>
          )}
        </p>
        <CancelOrHelp
          orderId={order.id}
          orderShortId={order.id.slice(0, 8).toUpperCase()}
          status={order.status}
          trackingNumber={order.tracking_number}
          hoursSinceOrder={hoursSinceOrder}
          cancellationWindowHours={CANCELLATION_WINDOW_HOURS}
        />
      </div>

      {isUnpaidPending && (
        <div className="mt-6">
          <PaymentPendingBanner
            orderId={order.id}
            totalAmount={order.total_amount}
            originalPaymentMethod={order.original_payment_method}
            onlinePaymentDiscount={order.online_payment_discount}
            source="confirmation"
          />
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border/60 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-primary">Order Summary</h2>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={`/api/invoice/${order.id}`} download>
              <Download className="h-3.5 w-3.5" /> Download Invoice
            </a>
          </Button>
        </div>

        <Separator className="my-4" />

        <div className="divide-y divide-border/60">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
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
          ))}
        </div>

        <Separator className="my-4" />

        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatINR(order.subtotal ?? order.total_amount)}</span>
          </div>
          {order.coupon_discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coupon ({order.coupon_code})</span>
              <span>-{formatINR(order.coupon_discount)}</span>
            </div>
          )}
          {(order.bogo_discount ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">BOGO offer</span>
              <span>-{formatINR(order.bogo_discount ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span>{order.shipping_charge ? formatINR(order.shipping_charge) : 'FREE'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST (included)</span>
            <span>{formatINR(order.gst_amount ?? 0)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold text-foreground">
            <span>
              {order.payment_method === 'cod'
                ? 'Total (Pay on Delivery)'
                : order.payment_method === 'partial'
                  ? 'Order Total'
                  : isUnpaidPending
                  ? 'Total Due (Payment Pending)'
                  : 'Total Paid'}
            </span>
            <span className="font-serif text-lg text-primary">{formatINR(order.total_amount)}</span>
          </div>
          {order.payment_method === 'partial' && (
            <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-3 text-sm font-normal">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {order.advance_paid_at ? 'Advance paid online' : 'Advance to pay online'}
                </span>
                <span>{formatINR(order.advance_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <span>Balance to pay on delivery</span>
                <span>{formatINR(order.advance_paid_at ? order.balance_due ?? 0 : Math.max(0, order.total_amount - (order.advance_amount ?? 0)))}</span>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Shipping Address</h3>
            <EditAddressButton orderId={order.id} currentAddress={addr} canEdit={canEditAddress} />
          </div>
          {addr && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {order.customer_name}
              <br />
              {[addr.address, addr.address2].filter(Boolean).join(', ')}
              {addr.landmark ? ` (Near ${addr.landmark})` : ''}
              <br />
              {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
              <br />
              Phone: {order.customer_phone}
            </p>
          )}
        </div>
      </div>

      {loyaltySettings.enabled && projectedPoints > 0 && (
        <div className="mt-5 rounded-lg border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-secondary" />
            <h3 className="font-serif text-sm font-semibold text-primary">Loyalty Points</h3>
          </div>
          {isCancelledOrFailed ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              This order was {order.status === 'cancelled' ? 'cancelled' : 'not completed'}, so no
              loyalty points were credited.
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You'll earn <strong className="text-foreground">{projectedPoints} points</strong>{' '}
                (worth {formatINR(pointsValue)}) on this order — redeemable on your next purchase.
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Points are credited only once this order is <strong>delivered</strong>{' '}
                successfully. They are not awarded on orders that are cancelled or returned.
              </p>
            </>
          )}
        </div>
      )}

      {referralSettings.enabled && (
        <div className="mt-5 rounded-lg border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-secondary" />
            <h3 className="font-serif text-sm font-semibold text-primary">Refer &amp; Earn</h3>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Invite a friend to AruhiHandlooms — you'll earn{' '}
            <strong className="text-foreground">{referralSettings.referrer_reward_points} points</strong>{' '}
            and they'll get{' '}
            <strong className="text-foreground">{referralSettings.referred_reward_points} points</strong>{' '}
            the moment their first order is confirmed.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/refer-earn">Refer a friend</Link>
          </Button>
        </div>
      )}

      <div className="mt-5">
        <h2 className="mb-2 font-serif text-lg font-semibold text-primary">Shipment Tracking</h2>
        <OrderTracking
          orderId={order.id}
          initialTrackingNumber={order.tracking_number}
          initialCourierName={order.courier_name}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card p-4 text-center text-sm sm:grid-cols-3">
        <div className="flex flex-col items-center gap-1">
          <Truck className="h-5 w-5 text-secondary" />
          <span className="text-[11px] font-medium">Dispatch in 2-3 days</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ShieldCheck className="h-5 w-5 text-secondary" />
          <span className="text-[11px] font-medium">100% Authentic</span>
        </div>
        <div className="col-span-2 flex flex-col items-center gap-1 sm:col-span-1">
          <Download className="h-5 w-5 text-secondary" />
          <span className="text-[11px] font-medium">Invoice available above</span>
        </div>
      </div>

      {order.customer_email && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-secondary/50 bg-secondary/5 p-4 text-center">
          <LogIn className="h-5 w-5 text-secondary" />
          <p className="text-sm">
            Want more order detail, or to manage returns, addresses and your account from here on?
          </p>
          <Button asChild size="sm" className="bg-primary">
            <Link
              href={`/login?next=${encodeURIComponent(`/account/orders/${order.id}`)}&email=${encodeURIComponent(order.customer_email)}`}
            >
              Log in with {order.customer_email}
            </Link>
          </Button>
          <p className="text-[11px] text-muted-foreground">
            We'll email a one-time code to this address — no password needed.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="bg-primary">
          <Link href="/shop">Continue Shopping</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/track/${order.id}`}>Track this order</Link>
        </Button>
      </div>
    </div>
  );
}
