'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { fetchMyReturnRiskStats, type VendorReturnRiskStats } from '@/lib/vendor-api';

/**
 * "Aapke store ka return/RTO rate" — vendor apna khud ka number dekh
 * sake, product add karne se pehle hi, taaki price/quality decisions
 * usi hisaab se le sake. Purely informational — koi block/restriction
 * yahan se nahi lagta (COD cooldown customer-phone level par hai, see
 * supabase/migrations/20260911000000_return_rto_risk_tracking.sql).
 */
export default function ReturnRtoStats() {
  const [stats, setStats] = useState<VendorReturnRiskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyReturnRiskStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your return/RTO stats…
      </div>
    );
  }

  if (!stats || stats.total_items === 0) {
    return null; // no order history yet — nothing useful to show
  }

  const highRisk = (stats.return_rate_percent ?? 0) + (stats.rto_rate_percent ?? 0) >= 20;

  return (
    <div
      className={`rounded-lg border p-4 ${highRisk ? 'border-amber-300 bg-amber-50' : 'border-muted bg-muted/30'}`}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className={`h-4 w-4 ${highRisk ? 'text-amber-600' : 'text-muted-foreground'}`} />
        Your store's return/RTO rate
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold">{stats.total_items}</div>
          <div className="text-xs text-muted-foreground">Orders shipped</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{stats.return_rate_percent ?? 0}%</div>
          <div className="text-xs text-muted-foreground">Returned ({stats.return_count})</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{stats.rto_rate_percent ?? 0}%</div>
          <div className="text-xs text-muted-foreground">RTO ({stats.rto_count})</div>
        </div>
      </div>
      {highRisk && (
        <p className="mt-2 text-xs text-amber-700">
          Ye rate industry average se zyada hai — product photos/description/sizing accurate rakhein taaki
          returns aur RTO kam ho.
        </p>
      )}
    </div>
  );
}
