'use client';

import { useEffect, useState } from 'react';
import { Repeat, Palette } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fetchVariantSwitches, VariantSwitchesData } from '@/lib/variant-switches-api';

const RANGE_OPTIONS = [7, 30, 90];

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

/**
 * Admin > Analytics > Variant Switches. Shows, per product, which colour
 * shoppers switch TO the most -- i.e. "kaunsa variation me user jada
 * switch kar raha hai". Backed by app/api/admin/variant-switches/route.ts,
 * which reads the 'variant_switch' events logged from
 * app/product/[slug]/product-detail.tsx.
 */
export default function VariantSwitchesPanel() {
  const [data, setData] = useState<VariantSwitchesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetchVariantSwitches(days)
      .then(setData)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to load variant switch data')
      )
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load variant switch data right now.</p>;
  }

  const { topProducts, totalSwitches, rangeDays } = data;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Which colour shoppers switch to on each product page — last {rangeDays} days.
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
        >
          {RANGE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryCard icon={<Repeat className="h-3.5 w-3.5" />} label="Total colour switches" value={totalSwitches} />
        <SummaryCard
          icon={<Palette className="h-3.5 w-3.5" />}
          label="Products with switches"
          value={topProducts.length}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-serif text-lg font-bold text-primary">Most colour-switched products</h3>
        {topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No colour switches recorded in this period yet.</p>
        ) : (
          <div className="grid gap-4">
            {topProducts.map((p) => (
              <div key={p.productId} className="rounded-lg border border-border/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{p.productName}</p>
                  <span className="text-xs text-muted-foreground">{p.totalSwitches} switches</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.colors.map((c) => (
                    <span
                      key={c.toColor}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {c.toColor} · {c.count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
