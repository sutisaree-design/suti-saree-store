'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Public "Track Order" landing page — this is what the footer link points
// to. A shopper (logged in or guest) doesn't always have their order-
// confirmation email handy, so this gives them a direct way in: logged-in
// users just get their own orders (no extra input needed), guests enter
// their Order ID + the email used at checkout. Both paths reuse the same
// deterministic lookup already used by the chat widget's "Track my order"
// flow (/api/chat/order-lookup), so behaviour stays identical everywhere.
export default function TrackOrderLookupPage() {
  const router = useRouter();
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multipleOrders, setMultipleOrders] = useState<{ id: string; shortId: string; createdAt: string }[] | null>(
    null
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMultipleOrders(null);
    setLoading(true);
    try {
      const res = await fetch('/api/chat/order-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId.trim(), email: email.trim() }),
      });
      const body = await res.json();

      if (!body.ok) {
        setError(body.error || 'Something went wrong. Please try again.');
        return;
      }

      if (body.needsDetails) {
        setError('Please enter both your Order ID and the email used at checkout.');
        return;
      }

      const orders = body.orders || [];
      if (orders.length === 0) {
        setError(body.message || "We couldn't find a matching order. Double-check the Order ID and email.");
        return;
      }
      if (orders.length === 1) {
        router.push(`/track/${orders[0].id}`);
        return;
      }
      // Logged-in user with no specific order id typed -> show a picker.
      setMultipleOrders(orders);
    } catch {
      setError('Could not reach our order system right now. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-boutique max-w-md py-14">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10">
          <PackageSearch className="h-6 w-6 text-secondary" />
        </div>
        <h1 className="mt-3 font-serif text-2xl font-bold text-primary">Track Your Order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No login needed — just enter your Order ID and the email you used at checkout.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Order ID</label>
          <Input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g. 8870A552"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email used at checkout</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-1 gap-2 bg-primary">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Track Order
        </Button>
      </form>

      {multipleOrders && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Your recent orders:</p>
          <ul className="space-y-2">
            {multipleOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/track/${o.id}`}
                  className="block rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm hover:border-secondary"
                >
                  <span className="font-medium">{o.shortId}</span>{' '}
                  <span className="text-muted-foreground">
                    · {new Date(o.createdAt).toLocaleDateString('en-IN')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Have a link from your order confirmation email instead?{' '}
        <span className="font-medium">Just click "Track My Order" in that email.</span>
      </p>
    </div>
  );
}
