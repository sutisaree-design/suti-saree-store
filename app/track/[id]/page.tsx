import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, Package, Truck, Home, XCircle, LogIn, Gift, Users, PackageCheck } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import OrderTracking from '@/components/order/order-tracking';
import PaymentPendingBanner from '@/components/order/payment-pending-banner';
import { toPublicMediaUrl } from '@/lib/media-url';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from '@/lib/loyalty-api';
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from '@/lib/referrals-api';
import { getUnshippedItemIndexes } from '@/lib/shipments';

// Guest-friendly tracking page. Uses the exact same trust model already used
// by /order-confirmation/[id] and the self-cancel API: the order UUID itself
// is the access token, so no login/signup is required to view it -- this is
// what "Track this order" links to instead of the account-only
// /account/orders/[id] page, and what every order-lifecycle email links to.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Never let search engines index private order pages.
export const metadata = {
  robots: { index: false, follow: false },
};

// Guest order links expire after this many days from order creation.
// After expiry the user is redirected to log in to view their order.
const GUEST_LINK_EXPIRY_DAYS = 90;

const STEPS = [
  { key: 'placed', label: 'Order Placed', icon: CheckCircle2 },
  { key: 'confirmed', label: 'Confirmed', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Home },
] as const;

function currentStepIndex(order: { status: string; out_for_delivery?: boolean; tracking_number?: string | null; payment_method?: string | null; cod_confirmed_at?: string | null }) {
  if (order.status === 'delivered') return 4;
  if (order.out_for_delivery) return 3;
  if (order.status === 'shipped' || order.tracking_number) return 2;
  if (order.status === 'paid') return 1;
  // COD: "Confirmed" only once the customer (or admin) has confirmed the order.
  if (order.payment_method === 'cod' && order.cod_confirmed_at) return 1;
  return 0;
}

export default async function TrackOrderPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from('orders').select('*').eq('id', params.id).single();

  if (!order) notFound();

  // Guest link expiry — after GUEST_LINK_EXPIRY_DAYS days, redirect to
  // login so the customer accesses the order through their account instead.
  const daysSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const isExpired = daysSinceOrder > GUEST_LINK_EXPIRY_DAYS;

  const items = Array.isArray(order.items) ? order.items : [];
  const isCancelled = order.status === 'cancelled' || order.status === 'failed';
  const isUnpaidPending = order.status === 'pending' && order.payment_method !== 'cod';
  // Split (partial) shipments: items can leave in different parcels. The big
  // stepper reflects the order as a whole, so while anything is still unshipped
  // it stays on "Shipped" (relabelled "Partly Shipped"); per-parcel progress is
  // shown in the tracking section below.
  const { data: shipmentRows } = await supabase
    .from('order_shipments')
    .select('item_indexes, expected_delivery_date, delivery_status')
    .eq('order_id', order.id);
  const shipmentList = shipmentRows ?? [];
  const unshippedCount = shipmentList.length > 0 ? getUnshippedItemIndexes(items, shipmentList).length : 0;
  const isPartlyShipped = shipmentList.length > 0 && unshippedCount > 0 && !isCancelled && order.status !== 'delivered';
  const stepIdx = isPartlyShipped ? 2 : currentStepIndex(order);
  const steps = STEPS.map((st) => (st.key === 'shipped' && isPartlyShipped ? { ...st, label: 'Partly Shipped' } : st));
  const nextParcelDate = shipmentList
    .filter((x: any) => x.expected_delivery_date && x.delivery_status !== 'delivered')
    .map((x: any) => x.expected_delivery_date as string)
    .sort()[0];

  // Loyalty points preview — mirrors the block on /order-confirmation/[id].
  // Reads settings via the admin client (not fetchLoyaltySettings(), which
  // uses a 'use client' Supabase singleton that throws when called from a
  // server component -- see the note in that file).
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
    // keep defaults
  }
  const pointsValue = projectedPoints * loyaltySettings.redeem_value_per_point;

  // Referral program preview — see order-confirmation/[id]/page.tsx for
  // why this reads via the admin client instead of lib/referrals-api's
  // browser client. Also wrapped defensively for the same reason.
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

  const expected = (nextParcelDate || order.expected_delivery_date)
    ? new Date((nextParcelDate || order.expected_delivery_date) as string).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;

  // Expired guest link — show a clean message with a login CTA
  if (isExpired) {
    return (
      <div className="container-boutique max-w-2xl py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </p>
        <h1 className="mt-2 font-serif text-2xl font-bold text-primary">This link has expired</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Guest order links are valid for {GUEST_LINK_EXPIRY_DAYS} days. Please log in to view your
          order details and track your shipment.
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
    <div className="container-boutique max-w-2xl py-10">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-primary sm:text-3xl">
          {isCancelled ? 'Order Cancelled' : 'Track Your Order'}
        </h1>
        {expected && !isCancelled && order.status !== 'delivered' && (
          <p className="mt-2 text-sm text-secondary-foreground">
            Arriving <strong>{expected}</strong>
          </p>
        )}
      </div>

      {/* Status stepper */}
      {!isCancelled ? (
        <div className="mt-8 flex items-start justify-between">
          {steps.map((step, i) => {
            const done = i <= stepIdx;
            const Icon = done ? step.icon : Circle;
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <div className={`h-px flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-secondary' : 'bg-border'}`} />
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      done ? 'border-secondary bg-secondary text-white' : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div
                    className={`h-px flex-1 ${i === steps.length - 1 ? 'opacity-0' : i < stepIdx ? 'bg-secondary' : 'bg-border'}`}
                  />
                </div>
                <span className={`mt-2 text-[11px] font-medium leading-tight ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            This order was {order.status === 'cancelled' ? 'cancelled' : 'not completed'}. Reach out to support if
            you think this is a mistake.
          </p>
        </div>
      )}

      {isUnpaidPending && (
        <div className="mt-6">
          <PaymentPendingBanner
            orderId={order.id}
            totalAmount={order.total_amount}
            originalPaymentMethod={order.original_payment_method}
            onlinePaymentDiscount={order.online_payment_discount}
            source="track"
          />
        </div>
      )}

      <div className="mt-8">
        <OrderTracking
          orderId={order.id}
          initialTrackingNumber={order.tracking_number}
          initialCourierName={order.courier_name}
        />
      </div>

      {order.status === 'paid' && (
        <div className="mt-5 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
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

      <div className="rounded-lg border border-border/60 bg-card p-4 sm:p-5">
        <h2 className="font-serif text-base font-semibold text-primary">Order Summary</h2>
        <div className="mt-3 divide-y divide-border/60">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
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
                  <p className="text-xs text-muted-foreground">
                    Size: {item.size} · Qty: {item.quantity}
                  </p>
                </div>
              </div>
              <p className="font-medium">{formatINR(item.price * item.quantity)}</p>
            </div>
          ))}
        </div>
        <Separator className="my-3" />
        <div className="flex justify-between text-sm font-semibold">
          <span>
            {order.payment_method === 'cod'
              ? 'Total (Pay on Delivery)'
              : order.payment_method === 'partial'
                ? 'Order Total'
                : isUnpaidPending
                ? 'Total Due (Payment Pending)'
                : 'Total Paid'}
          </span>
          <span className="font-serif text-primary">{formatINR(order.total_amount)}</span>
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

      {loyaltySettings.enabled && projectedPoints > 0 && (
        <div className="mt-5 rounded-lg border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-secondary" />
            <h3 className="font-serif text-sm font-semibold text-primary">Loyalty Points</h3>
          </div>
          {isCancelled ? (
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
            Invite a friend to Sutisaree — you'll earn{' '}
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

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/order-confirmation/${order.id}`}>View Full Order &amp; Invoice</Link>
        </Button>
        <Button asChild className="bg-primary">
          <Link href="/shop">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}
