'use client';

import { useEffect, useState } from 'react';
import { Loader2, Circle } from 'lucide-react';

interface HistoryEntry {
  id: string;
  kind: 'status' | 'payment_request' | 'reverted_to_cod' | 'customer_cancelled';
  by?: 'customer' | 'admin' | null;
  from_status: string | null;
  to_status: string | null;
  changed_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order placed',
  paid: 'Payment received',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Payment failed',
};

export default function OrderStatusHistory({ orderId }: { orderId: string }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [originalPaymentMethod, setOriginalPaymentMethod] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/status-history`);
        if (!res.ok) throw new Error('Failed');
        const body = await res.json();
        if (!cancelled) {
          setHistory(body.history || []);
          setOriginalPaymentMethod(body.original_payment_method ?? null);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return <p className="text-xs text-muted-foreground">Couldn't load status history.</p>;
  }

  if (!history) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history...
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground">No status history yet.</p>;
  }

  // The very first "pending" entry (from_status null) is the order's
  // placement row -- label it with how it was actually paid for
  // (original_payment_method never changes after placement, even once
  // "Request Online Payment" later flips payment_method itself -- see
  // 20260923000000_orders_original_payment_method.sql).
  const orderPlacedLabel =
    originalPaymentMethod === 'cod' ? 'Order placed (COD)' : 'Order placed (Prepaid)';

  const labelFor = (entry: HistoryEntry) => {
    if (entry.kind === 'payment_request') return 'Admin requested online payment';
    if (entry.kind === 'reverted_to_cod') {
      if (entry.by === 'customer') return 'Customer chose to keep COD';
      if (entry.by === 'admin') return 'Admin reverted to COD';
      return 'Reverted to COD';
    }
    if (entry.kind === 'customer_cancelled') return 'Customer cancelled (from payment page)';
    if (entry.to_status === 'pending' && entry.from_status === null) return orderPlacedLabel;
    return (entry.to_status && STATUS_LABELS[entry.to_status]) || entry.to_status || '—';
  };

  return (
    <ul className="space-y-2">
      {history.map((entry, idx) => (
        <li key={entry.id} className="flex items-start gap-2 text-sm">
          <Circle
            className={`mt-0.5 h-3 w-3 flex-shrink-0 ${
              idx === history.length - 1 ? 'fill-secondary text-secondary' : 'fill-muted-foreground/40 text-muted-foreground/40'
            }`}
          />
          <div>
            <div className="font-medium">{labelFor(entry)}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(entry.changed_at).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
