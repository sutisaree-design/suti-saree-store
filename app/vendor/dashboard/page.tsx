'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Loader2,
  Clock,
  XCircle,
  Ban,
  Landmark,
  ShieldCheck,
  PackagePlus,
  PackageSearch,
  Boxes,
  IndianRupee,
  Wallet,
  Clock3,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/format';
import {
  fetchMyVendorProfile,
  requestVendorBankUpdate,
  fetchMyVendorProducts,
  fetchMyVendorOrders,
  fetchMyVendorEarnings,
  type VendorProfile,
  type VendorProductRow,
  type VendorProductApprovalStatus,
  type VendorOrderItemRow,
  type VendorEarningsSummary,
} from '@/lib/vendor-api';

function maskAccount(account: string | null) {
  if (!account) return '—';
  if (account.length <= 4) return account;
  return `${'•'.repeat(account.length - 4)}${account.slice(-4)}`;
}

const PRODUCT_STATUS_META: Record<VendorProductApprovalStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  pending_review: { label: 'Pending Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  awaiting_stock: { label: 'Awaiting Stock Pickup', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  live: { label: 'Live on Site', className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
};

const ORDER_STAGE_META: Record<string, { label: string; className: string }> = {
  placed: { label: 'Awaiting Your Response', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  vendor_accepted: { label: 'Arrange Pickup', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  picked_from_vendor: { label: 'Picked Up', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  received_at_warehouse: { label: 'At Warehouse', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  packed: { label: 'Packed', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  shipped_to_customer: { label: 'Shipped', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  delivered: { label: 'Delivered', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
  returned: { label: 'Returned', className: 'bg-red-50 text-red-700 border-red-200' },
  quality_hold: { label: 'Quality Hold', className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="font-serif text-2xl font-bold text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [accountInput, setAccountInput] = useState('');
  const [ifscInput, setIfscInput] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [requesting, setRequesting] = useState(false);

  const [products, setProducts] = useState<VendorProductRow[]>([]);
  const [orders, setOrders] = useState<VendorOrderItemRow[]>([]);
  const [earnings, setEarnings] = useState<VendorEarningsSummary | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const p = await fetchMyVendorProfile();
      setProfile(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load vendor profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (profile?.status !== 'approved') return;
    setLoadingExtras(true);
    Promise.all([fetchMyVendorProducts(), fetchMyVendorOrders(), fetchMyVendorEarnings()])
      .then(([productRows, orderRows, earningsRes]) => {
        setProducts(productRows);
        setOrders(orderRows);
        setEarnings(earningsRes.summary);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load dashboard data'))
      .finally(() => setLoadingExtras(false));
  }, [profile?.status]);

  const stats = useMemo(() => {
    const liveProducts = products.filter((p) => p.approval_status === 'live').length;
    const pendingOrders = orders.filter((o) => o.stage === 'placed').length;
    const actionNeeded = orders.filter(
      (o) => o.stage === 'vendor_accepted' && !o.pickup_requested_at
    ).length;
    return { liveProducts, pendingOrders, actionNeeded };
  }, [products, orders]);

  const recentProducts = products.slice(0, 5);
  const recentOrders = orders.slice(0, 5);

  const handleRequestBankUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountInput || !ifscInput) {
      toast.error('Enter both account number and IFSC');
      return;
    }
    setRequesting(true);
    try {
      await requestVendorBankUpdate(accountInput, ifscInput, upiInput || undefined);
      toast.success('Request sent — an admin will verify and approve it shortly.');
      setAccountInput('');
      setIfscInput('');
      setUpiInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request bank detail update');
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">No Application Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You haven't applied to sell with us yet.
        </p>
        <Link href="/sell-with-us">
          <Button className="mt-4 bg-primary">Apply Now</Button>
        </Link>
      </div>
    );
  }

  if (profile.status !== 'approved') {
    const meta = {
      pending: { icon: Clock, label: 'Application Under Review', color: 'text-amber-600' },
      rejected: { icon: XCircle, label: 'Application Not Approved', color: 'text-red-600' },
      suspended: { icon: Ban, label: 'Account Suspended', color: 'text-red-600' },
    }[profile.status];
    const Icon = meta.icon;
    return (
      <div>
        <h1 className={`flex items-center gap-2 font-serif text-2xl font-bold ${meta.color}`}>
          <Icon className="h-6 w-6" /> {meta.label}
        </h1>
        {profile.admin_note && (
          <p className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            {profile.admin_note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-primary">Vendor Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Welcome, {profile.business_name}.</p>
        </div>
        <Link href="/vendor/dashboard/products/add-product">
          <Button className="bg-primary">
            <PackagePlus className="mr-1.5 h-4 w-4" /> Add Product
          </Button>
        </Link>
      </div>

      {/* ---------------- Analytics ---------------- */}
      {loadingExtras ? (
        <div className="mt-6 flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Boxes} label="Live Products" value={String(stats.liveProducts)} />
            <StatCard
              icon={PackageSearch}
              label="Orders Awaiting You"
              value={String(stats.pendingOrders)}
              hint={stats.pendingOrders > 0 ? 'Accept or reject soon' : undefined}
            />
            {earnings && (
              <>
                <StatCard icon={IndianRupee} label="Total Sales" value={formatINR(earnings.total_sales)} />
                <StatCard
                  icon={Clock3}
                  label="Awaiting Settlement"
                  value={formatINR(earnings.total_unsettled)}
                />
              </>
            )}
          </div>

          {/* ---------------- Recent Orders ---------------- */}
          <div className="mt-6 rounded-lg border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-primary" />
                <p className="font-serif text-lg font-semibold text-primary">Recent Orders</p>
              </div>
              <Link href="/vendor/dashboard/orders" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentOrders.map((o) => {
                  const meta = ORDER_STAGE_META[o.stage] ?? {
                    label: o.stage,
                    className: 'bg-muted text-muted-foreground border-border',
                  };
                  return (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3"
                    >
                      <div className="flex items-center gap-3">
                        {o.product_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.product_image} alt="" className="h-10 w-10 rounded-md border border-border/60 object-cover" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{o.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty {o.quantity} · {formatINR(o.price)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---------------- Recent Products ---------------- */}
          <div className="mt-6 rounded-lg border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <p className="font-serif text-lg font-semibold text-primary">Your Products</p>
              </div>
              <Link href="/vendor/dashboard/products" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            {recentProducts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing added yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {recentProducts.map((p) => {
                  const meta = PRODUCT_STATUS_META[p.approval_status];
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3"
                    >
                      <div className="flex items-center gap-3">
                        {p.images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt="" className="h-10 w-10 rounded-md border border-border/60 object-cover" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.category_name} · Qty {p.available_quantity}
                          </p>
                          {p.barcode && (
                            <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                              <BarcodeIcon className="h-3 w-3" /> {p.barcode}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                        {(p.final_price ?? p.ai_suggested_price) != null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            ₹{p.final_price ?? p.ai_suggested_price}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---------------- Earnings snapshot ---------------- */}
          {earnings && (
            <div className="mt-6 rounded-lg border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <p className="font-serif text-lg font-semibold text-primary">Earnings Snapshot</p>
                </div>
                <Link href="/vendor/dashboard/earnings" className="text-xs font-medium text-primary hover:underline">
                  Full breakdown
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid Out</p>
                  <p className="font-serif text-lg font-semibold text-primary">{formatINR(earnings.total_paid)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Settled, Pending Payment</p>
                  <p className="font-serif text-lg font-semibold text-primary">
                    {formatINR(earnings.total_pending_settlement)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Handling Fee</p>
                  <p className="font-serif text-lg font-semibold text-primary">{formatINR(earnings.total_fee)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Bank Details ---------------- */}
      <div className="mt-6 rounded-lg border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <p className="font-serif text-lg font-semibold text-primary">Bank Details</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Current account on file: <span className="font-mono">{maskAccount(profile.bank_account_number)}</span>
          {profile.bank_ifsc ? ` · ${profile.bank_ifsc}` : ''}
          {profile.upi_id ? ` · UPI: ${profile.upi_id}` : ''}
        </p>

        {profile.pending_bank_update ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              A bank detail change request is pending admin approval — for your security, this
              doesn't take effect until manually verified.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRequestBankUpdate} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>New Account Number</Label>
              <Input value={accountInput} onChange={(e) => setAccountInput(e.target.value)} />
            </div>
            <div>
              <Label>New IFSC</Label>
              <Input value={ifscInput} onChange={(e) => setIfscInput(e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label>UPI ID (optional)</Label>
              <Input placeholder="yourname@bank" value={upiInput} onChange={(e) => setUpiInput(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline" disabled={requesting}>
                {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request Bank Detail Change'}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                For fraud prevention, changes are held for manual admin verification before they
                apply — this can take a little time. This same verification covers UPI ID changes
                too, there's no separate process for it.
              </p>
            </div>
          </form>
        )}
      </div>

      {/* ---------------- KYC ---------------- */}
      <div className="mt-6 rounded-lg border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-serif text-lg font-semibold text-primary">KYC Documents</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your PAN card, GST certificate (if applicable), and bank proof for compliance records.
        </p>
        <Link href="/vendor/dashboard/kyc">
          <Button variant="outline" className="mt-3">
            Go to KYC Documents
          </Button>
        </Link>
      </div>
    </div>
  );
}
