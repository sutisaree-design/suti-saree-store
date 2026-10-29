'use client';

import { useState } from 'react';
import OrdersPanel from '@/components/admin/orders-panel';
import LegacyOrdersPanel from '@/components/admin/legacy-orders-panel';

type Tab = 'orders' | 'legacy';

export default function OrdersWithLegacy() {
  const [tab, setTab] = useState<Tab>('orders');
  // Legacy panel is mounted lazily on first open, then kept mounted.
  const [legacyOpened, setLegacyOpened] = useState(false);

  const select = (t: Tab) => {
    if (t === 'legacy') setLegacyOpened(true);
    setTab(t);
  };

  const tabClass = (t: Tab) =>
    `rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="grid gap-4">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border/60 bg-card p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'orders'} onClick={() => select('orders')} className={tabClass('orders')}>
          Orders
        </button>
        <button type="button" role="tab" aria-selected={tab === 'legacy'} onClick={() => select('legacy')} className={tabClass('legacy')}>
          Old Site Orders
        </button>
      </div>

      {/* OrdersPanel stays mounted so its state is preserved. */}
      <div className={tab === 'orders' ? '' : 'hidden'}>
        <OrdersPanel />
      </div>

      {legacyOpened && (
        <div className={tab === 'legacy' ? '' : 'hidden'}>
          <LegacyOrdersPanel />
        </div>
      )}
    </div>
  );
}
