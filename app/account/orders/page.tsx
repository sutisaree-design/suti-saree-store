import Link from 'next/link';
import Image from 'next/image';
import { Package, TrendingUp, Download } from 'lucide-react';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import { formatINR } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PaymentPendingBanner from '@/components/order/payment-pending-banner';
import { toPublicMediaUrl } from '@/lib/media-url';

const STATUS_VARIANT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  returned: 'bg-gray-200 text-gray-800',
  failed: 'bg-red-100 text-red-800',
};

export default async function OrdersPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  // Fetch regular orders (customer orders)
  const { data: regularOrders } = await supabase
    .from('orders')
    .select('*')
    .or(`user_id.eq.${user!.id},customer_email.ilike.${user!.email}`)
    .eq('is_reseller_order', false)
    .order('created_at', { ascending: false });

  // Fetch reseller orders (orders placed by this user as a reseller)
  const { data: resellerOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user!.id)
    .eq('is_reseller_order', true)
    .order('created_at', { ascending: false });

  // Combine and sort all orders by date
  const allOrders = [
    ...(regularOrders || []).map(order => ({ ...order, orderType: 'regular' })),
    ...(resellerOrders || []).map(order => ({ ...order, orderType: 'reseller' }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const orders = allOrders;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">My Orders</h1>

      {!orders || orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Package className="h-10 w-10" />
          <p>You haven&apos;t placed any orders yet.</p>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => {
            // A 'pending' + non-COD order always means "nothing's been
            // charged yet" -- either an ordinary online order the
            // customer abandoned mid-checkout, or a COD order Admin
            // converted via "Request Online Payment" (Admin > Orders).
            // Both need the same "why is this pending" explanation and a
            // way to pay, shown right here on the list -- previously this
            // only appeared after opening the order, so a customer who
            // never opened the reminder email and only glances at this
            // list had no idea why it said "pending" or what to do about
            // it.
            const isUnpaidPending = order.status === 'pending' && order.payment_method !== 'cod';
            const isResellerOrder = order.orderType === 'reseller';

            return (
              <div
                key={order.id}
                className="rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <Link href={`/account/orders/${order.id}`} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">Order #{order.id.slice(0, 8)}</p>
                        {isResellerOrder && (
                          <Badge className="bg-green-100 text-green-800">Reseller</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Placed on {new Date(order.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <Badge className={STATUS_VARIANT[order.status] ?? 'bg-muted'}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {(Array.isArray(order.items) ? order.items : []).slice(0, 3).map((item: any, i: number) => (
                          <div
                            key={i}
                            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border-2 border-background bg-muted"
                          >
                            <Image
                              src={toPublicMediaUrl(item.image_url) || 'https://placehold.co/80x80?text=No+Image'}
                              alt={item.product_name || 'Product'}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </div>
                        ))}
                        {Array.isArray(order.items) && order.items.length > 3 && (
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-background bg-muted text-xs font-medium text-muted-foreground">
                            +{order.items.length - 3}
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {Array.isArray(order.items) ? order.items.length : 0} item(s)
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        {formatINR(order.total_amount)}
                      </p>
                      {isResellerOrder && order.reseller_profit && (
                        <p className="text-xs text-green-600 flex items-center justify-end gap-1">
                          <TrendingUp className="h-3 w-3" />
                          +{formatINR(order.reseller_profit)} profit
                        </p>
                      )}
                    </div>
                  </div>
                </Link>

                {isUnpaidPending && (
                  <div className="mt-3">
                    <PaymentPendingBanner
                      orderId={order.id}
                      totalAmount={order.total_amount}
                      originalPaymentMethod={order.original_payment_method}
                      onlinePaymentDiscount={order.online_payment_discount}
                      source="account"
                    />
                  </div>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={`/api/invoice/${order.id}`} download>
                      <Download className="h-3.5 w-3.5" /> Download Invoice
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/account/orders/${order.id}`}>View Order</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
