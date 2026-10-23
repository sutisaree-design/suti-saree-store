'use client';

import { useEffect, useState } from 'react';

import { fetchGrowthSettings } from '@/lib/growth-api';

export default function LowStockBadge({ stockQuantity }: { stockQuantity: number }) {
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(5);

  useEffect(() => {
    fetchGrowthSettings()
      .then((s) => {
        setEnabled(s.low_stock_enabled);
        setThreshold(s.low_stock_threshold);
      })
      .catch(() => {});
  }, []);

  if (!enabled || stockQuantity <= 0 || stockQuantity > threshold) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      Only {stockQuantity} left in stock — order soon
    </span>
  );
}
