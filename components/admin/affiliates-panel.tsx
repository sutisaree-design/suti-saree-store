'use client';

import { useEffect, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { Users2, IndianRupee, ShoppingBag, Ban, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import {
  fetchAdminAffiliatesOverview,
  updateAdminAffiliateStatus,
  updateAdminAffiliateCommission,
  type AdminAffiliateRow,
  type AffiliateStatus,
} from '@/lib/affiliate-api';
import AffiliatePayoutsPanel from './affiliate-payouts-panel';

const STATUS_BADGE: Record<AffiliateStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', className: 'bg-secondary/20 text-secondary-foreground', icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'bg-muted text-muted-foreground', icon: Ban },
  suspended: { label: 'Suspended', className: '', icon: Ban },
};

export default function AffiliatesPanel() {
  const [tab, setTab] = useState<'overview' | 'payouts'>('overview');
  const [affiliates, setAffiliates] = useState<AdminAffiliateRow[]>([]);
  const [totals, setTotals] = useState({ totalAffiliates: 0, totalOrders: 0, totalSales: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const focusId = useAdminFocus(!loading && affiliates.length > 0);
  useEffect(() => {
    if (focusId) setTab('overview');
  }, [focusId]);
  const [commissionInputs, setCommissionInputs] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminAffiliatesOverview();
      setAffiliates(overview.affiliates);
      setCommissionInputs(
        Object.fromEntries(overview.affiliates.map((a) => [a.id, String(a.commissionPercent)]))
      );
      setTotals({
        totalAffiliates: overview.totalAffiliates,
        totalOrders: overview.totalOrders,
        totalSales: overview.totalSales,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load affiliates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (a: AdminAffiliateRow, status: AffiliateStatus) => {
    setUpdatingId(a.id);
    try {
      await updateAdminAffiliateStatus(a.id, status);
      setAffiliates((rows) => rows.map((row) => (row.id === a.id ? { ...row, status } : row)));
      toast.success(`Affiliate ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update affiliate');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveCommission = async (a: AdminAffiliateRow) => {
    const val = Number(commissionInputs[a.id]);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      toast.error('Enter a commission % between 0 and 100');
      return;
    }
    setUpdatingId(a.id);
    try {
      await updateAdminAffiliateCommission(a.id, val);
      setAffiliates((rows) => rows.map((row) => (row.id === a.id ? { ...row, commissionPercent: val } : row)));
      toast.success('Commission % updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update commission');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Affiliate Program</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers who refer other customers with a unique link and earn cash commission —
            unlike Resellers, affiliates never touch pricing.
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
        <AffiliatePayoutsPanel />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <Users2 className="h-4 w-4 text-primary" />
              <p className="mt-2 text-xl font-bold text-primary">{totals.totalAffiliates}</p>
              <p className="text-xs text-muted-foreground">Affiliates</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <p className="mt-2 text-xl font-bold text-primary">{totals.totalOrders}</p>
              <p className="text-xs text-muted-foreground">Referred Orders</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <IndianRupee className="h-4 w-4 text-primary" />
              <p className="mt-2 text-xl font-bold text-primary">{formatINR(totals.totalSales)}</p>
              <p className="text-xs text-muted-foreground">Total Referred Sales</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
            <table className="w-full table-auto">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Affiliate</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Commission %</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Sales</th>
                  <th className="px-4 py-3">Commission Earned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  const Icon = badge.icon;
                  return (
                    <tr key={a.id} data-focus-id={a.id} className="border-t align-top">
                      <td className="px-4 py-3 text-sm">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.email || a.phone || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">{a.code}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 w-20"
                            value={commissionInputs[a.id] ?? ''}
                            onChange={(e) =>
                              setCommissionInputs((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={updatingId === a.id}
                            onClick={() => saveCommission(a)}
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{a.totalOrders}</td>
                      <td className="px-4 py-3 text-sm">{formatINR(a.totalSales)}</td>
                      <td className="px-4 py-3 text-sm text-green-600">{formatINR(a.totalCommission)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Badge className={`flex w-fit items-center gap-1 ${badge.className}`} variant={a.status === 'suspended' ? 'destructive' : undefined}>
                          <Icon className="h-3 w-3" /> {badge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {a.status === 'pending' && (
                            <>
                              <Button size="sm" disabled={updatingId === a.id} onClick={() => setStatus(a, 'approved')}>
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updatingId === a.id}
                                onClick={() => setStatus(a, 'rejected')}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {a.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === a.id}
                              onClick={() => setStatus(a, 'suspended')}
                            >
                              Suspend
                            </Button>
                          )}
                          {(a.status === 'suspended' || a.status === 'rejected') && (
                            <Button size="sm" disabled={updatingId === a.id} onClick={() => setStatus(a, 'approved')}>
                              Approve
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && affiliates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      <span className="flex flex-col items-center gap-2">
                        <Users2 className="h-8 w-8 text-muted-foreground" />
                        No affiliates yet.
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
