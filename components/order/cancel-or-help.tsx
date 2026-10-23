import Link from 'next/link';
import { MessageCircleQuestion } from 'lucide-react';
import CancelOrderButton from '@/components/account/cancel-order-button';

// Statuses where cancellation is still conceptually "in play" for this
// order (before it's delivered, already cancelled, or failed) -- used to
// decide whether to show a "Contact us for help" fallback when the
// window has passed or the order has already shipped, instead of just
// silently hiding everything.
const IN_FLIGHT_STATUSES = ['pending', 'paid', 'confirmed', 'shipped'];

export default function CancelOrHelp({
  orderId,
  orderShortId,
  status,
  trackingNumber,
  hoursSinceOrder,
  cancellationWindowHours,
}: {
  orderId: string;
  orderShortId: string;
  status: string;
  trackingNumber?: string | null;
  hoursSinceOrder: number;
  cancellationWindowHours: number;
}) {
  const hasShipped = !!trackingNumber || status === 'shipped';
  const windowPassed = hoursSinceOrder > cancellationWindowHours;
  const canCancel = ['pending', 'paid', 'confirmed'].includes(status) && !hasShipped && !windowPassed;

  if (canCancel) {
    return <CancelOrderButton orderId={orderId} />;
  }

  if (!IN_FLIGHT_STATUSES.includes(status)) {
    // Already delivered/cancelled/failed -- nothing to show here, those
    // states have their own messaging elsewhere on the page.
    return null;
  }

  const reason = hasShipped
    ? 'This order has already shipped, so it can no longer be cancelled online.'
    : `The ${cancellationWindowHours}-hour cancellation window for this order has passed.`;

  const contactHref = `/contact?subject=${encodeURIComponent(`Cancel order #${orderShortId}`)}&message=${encodeURIComponent(
    `Hi, I'd like to cancel my order #${orderShortId}. `
  )}`;

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <p>{reason} Please contact us for help.</p>
        <Link href={contactHref} className="mt-1 inline-block font-medium underline underline-offset-2 hover:text-amber-900">
          Contact Us
        </Link>
      </div>
    </div>
  );
}
