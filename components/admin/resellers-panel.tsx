'use client';

import { useEffect, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { Store, IndianRupee, ShoppingBag, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/format';
import {
  fetchAdminResellersOverview,
  updateAdminResellerStatus,
  type AdminResellerRow,
} from '@/lib/reseller-api';
import ResellerPayoutsPanel from './reseller-payouts-panel';

export default function ResellersPanel() {
  const [tab, setTab] = useState<'overview' | 'payouts'>('overview');
  const [resellers, setResellers] = useState<AdminResellerRow[]>([]);
  const [totals, setTotals] = useState({ totalResellers: 0, totalOrders: 0, totalSales: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const focusId = useAdminFocus(!loading && resellers.length > 0);
  useEffect(() => {
    if (focusId) setTab('overview');
  }, [focusId]);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminResellersOverview();
      setResellers(overview.resellers);
      setTotals({
        totalResellers: overview.totalResellers,
        totalOrders: overview.totalOrders,
        totalSales: overview.totalSales,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load resellers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (r: AdminResellerRow) => {
    const next = r.status === 'active' ? 'suspended' : 'active';
    setUpdatingId(r.id);
    try {
      await updateAdminResellerStatus(r.id, next);
      setResellers((rows) => rows.map((row) => (row.id === r.id ? { ...row, status: next } : row)));
      toast.success(next === 'active' ? 'Reseller reactivated' : 'Reseller suspended');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update reseller');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Reseller Program</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers who resell your products using their own account. You still pack &amp; ship every order.
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-border/60">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 pb-2 text-sm font-medium ${
            tab === 'overview' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('payouts')}
          className={`px-3 pb-2 text-sm font-medium ${
            tab === 'payouts' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
          }`}
        >
          Payouts
        </button>
      </div>

      {tab === 'payouts' ? (
        <ResellerPayoutsPanel />
      ) : (
        <>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <Store className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{totals.totalResellers}</p>
          <p className="text-xs text-muted-foreground">Resellers</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{totals.totalOrders}</p>
          <p className="text-xs text-muted-foreground">Reseller Orders</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <IndianRupee className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{formatINR(totals.totalSales)}</p>
          <p className="text-xs text-muted-foreground">Total Reseller Sales</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Reseller</th>
              <th className="px-4 py-3">Default Markup</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Sales</th>
              <th className="px-4 py-3">Their Profit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {resellers.map((r) => (
              <tr key={r.id} data-focus-id={r.id} className="border-t">
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.email || r.phone || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm">+{formatINR(r.defaultMarkupAmount)}</td>
                <td className="px-4 py-3 text-sm">{r.totalOrders}</td>
                <td className="px-4 py-3 text-sm">{formatINR(r.totalSales)}</td>
                <td className="px-4 py-3 text-sm text-green-600">{formatINR(r.totalProfit)}</td>
                <td className="px-4 py-3 text-sm">
                  {r.status === 'active' ? (
                    <Badge className="flex w-fit items-center gap-1 bg-secondary/20 text-secondary-foreground">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex w-fit items-center gap-1">
                      <Ban className="h-3 w-3" /> Suspended
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingId === r.id}
                    onClick={() => toggleStatus(r)}
                  >
                    {r.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && resellers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <span className="flex flex-col items-center gap-2">
                    <Store className="h-8 w-8 text-muted-foreground" />
                    No resellers yet.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
