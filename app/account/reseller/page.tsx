'use client';

import { useEffect, useState } from 'react';
import { Store, IndianRupee, Package, TrendingUp, Loader2, ShoppingBag, Wallet } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatINR } from '@/lib/format';
import {
  fetchMyResellerOverview,
  fetchMyResellerOrders,
  joinResellerProgram,
  updateResellerDefaultMarkup,
  updateResellerPayoutDetails,
  type ResellerProfile,
  type ResellerEarnings,
  type ResellerOrderRow,
} from '@/lib/reseller-api';

const PAYOUT_LABELS: Record<string, { label: string; className: string }> = {
  pending_delivery: { label: 'Awaiting delivery', className: 'bg-muted text-muted-foreground' },
  in_return_window: { label: 'Delivered — in return window', className: 'bg-orange-100 text-orange-700' },
  eligible: { label: 'Ready — will be paid soon', className: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-700' },
  void: { label: 'Not payable (RTO/cancelled/returned)', className: 'bg-red-100 text-red-700' },
};

export default function ResellerPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ResellerProfile | null>(null);
  const [earnings, setEarnings] = useState<ResellerEarnings>({
    totalOrders: 0,
    totalSales: 0,
    totalProfit: 0,
    pendingOrders: 0,
    pendingDeliveryProfit: 0,
    inReturnWindowProfit: 0,
    eligibleProfit: 0,
    paidProfit: 0,
  });
  const [orders, setOrders] = useState<ResellerOrderRow[]>([]);
  const [joining, setJoining] = useState(false);
  const [markupInput, setMarkupInput] = useState('100');
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [upiInput, setUpiInput] = useState('');
  const [holderInput, setHolderInput] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  const load = async () => {
    try {
      const overview = await fetchMyResellerOverview();
      setProfile(overview.profile);
      setEarnings(overview.earnings);
      if (overview.profile) {
        setMarkupInput(String(overview.profile.default_markup_amount));
        setUpiInput(overview.profile.payout_upi_id || '');
        setHolderInput(overview.profile.payout_account_holder || '');
        const myOrders = await fetchMyResellerOrders();
        setOrders(myOrders);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load reseller data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const p = await joinResellerProgram(100);
      setProfile(p);
      setMarkupInput(String(p.default_markup_amount));
      toast.success('Welcome! You are now a reseller.');
      // GA4 event for Google Ads "Reseller Signup" conversion tracking.
      if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'reseller_signup', {
          event_category: 'partner_signup',
          event_label: 'account_reseller',
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleSaveMarkup = async () => {
    const val = Number(markupInput);
    if (!Number.isFinite(val) || val < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSavingMarkup(true);
    try {
      await updateResellerDefaultMarkup(val);
      setProfile((p) => (p ? { ...p, default_markup_amount: val } : p));
      toast.success('Default profit amount updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingMarkup(false);
    }
  };

  const handleSavePayout = async () => {
    if (!upiInput.trim()) {
      toast.error('Enter a UPI ID');
      return;
    }
    setSavingPayout(true);
    try {
      await updateResellerPayoutDetails(upiInput.trim(), holderInput.trim());
      setProfile((p) => (p ? { ...p, payout_upi_id: upiInput.trim(), payout_account_holder: holderInput.trim() } : p));
      toast.success('Payout details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save payout details');
    } finally {
      setSavingPayout(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!profile) {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">Become a Reseller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use this same account to resell our products — set your own margin, place orders for your
          customers, and we handle packing &amp; shipping directly to them.
        </p>
        <div className="mt-6 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold text-primary">No new signup needed</p>
              <p className="text-sm text-muted-foreground">Your existing login is your reseller login too.</p>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Tick "Resell this product" at checkout on any order</li>
            <li>Set your own selling price right there, see your profit in green</li>
            <li>We ship directly to your customer — no stock to hold</li>
            <li>Track every resale order and your earnings from this dashboard</li>
          </ul>
          <Button className="mt-5 bg-primary" onClick={handleJoin} disabled={joining}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Become a Reseller'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Reseller Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tick "Resell this product" at checkout to place an order for your own customer — we ship
        directly to them, you keep the margin.
      </p>

      <Link href="/shop">
        <Button className="mt-4 gap-2 bg-primary">
          <ShoppingBag className="h-4 w-4" /> Browse products to resell
        </Button>
      </Link>

      {/* Earnings summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 p-4">
          <Package className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{earnings.totalOrders}</p>
          <p className="text-xs text-muted-foreground">Total Orders</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <IndianRupee className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{formatINR(earnings.totalSales)}</p>
          <p className="text-xs text-muted-foreground">Total Sales</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-green-600">{formatINR(earnings.totalProfit)}</p>
          <p className="text-xs text-muted-foreground">Your Earnings</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <Package className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{earnings.pendingOrders}</p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </div>
      </div>

      {/* Payout stage breakdown — margin is only paid once an order is delivered AND the return window has passed */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-xl font-bold text-muted-foreground">{formatINR(earnings.pendingDeliveryProfit)}</p>
          <p className="text-xs text-muted-foreground">Awaiting delivery (not payable yet)</p>
        </div>
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <p className="text-xl font-bold text-orange-700">{formatINR(earnings.inReturnWindowProfit)}</p>
          <p className="text-xs text-orange-700">Delivered — in return window</p>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-xl font-bold text-amber-700">{formatINR(earnings.eligibleProfit)}</p>
          <p className="text-xs text-amber-700">Return window passed — will be paid soon</p>
        </div>
        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-xl font-bold text-green-700">{formatINR(earnings.paidProfit)}</p>
          <p className="text-xs text-green-700">Already paid to you</p>
        </div>
      </div>

      {/* Payout details */}
      <div className="mt-6 rounded-lg border border-border/60 p-4">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4" /> Where should we pay you?
        </Label>
        <p className="text-xs text-muted-foreground">
          Once an order you resold is delivered, your margin becomes payable. We'll send it to this
          UPI ID.
        </p>
        <div className="mt-2 grid max-w-md gap-2 sm:grid-cols-2">
          <Input placeholder="UPI ID, e.g. yourname@upi" value={upiInput} onChange={(e) => setUpiInput(e.target.value)} />
          <Input placeholder="Account holder name" value={holderInput} onChange={(e) => setHolderInput(e.target.value)} />
        </div>
        <Button variant="outline" className="mt-2" onClick={handleSavePayout} disabled={savingPayout}>
          {savingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payout details'}
        </Button>
      </div>

      {/* Default markup setting */}
      <div className="mt-6 rounded-lg border border-border/60 p-4">
        <Label className="text-sm font-medium">Your default profit amount (₹)</Label>
        <p className="text-xs text-muted-foreground">
          Pre-filled at checkout whenever you tick "Resell this product" — you can still change the
          selling price per order. e.g. ₹450 cost + ₹100 = ₹550 for your customer.
        </p>
        <div className="mt-2 flex max-w-xs gap-2">
          <Input type="number" min={0} value={markupInput} onChange={(e) => setMarkupInput(e.target.value)} />
          <Button variant="outline" onClick={handleSaveMarkup} disabled={savingMarkup}>
            {savingMarkup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>

      {/* Order history */}
      <h2 className="mt-8 font-serif text-lg font-semibold text-primary">Your Resale Orders</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No resale orders yet — tick "Resell this product" next time you check out.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm">
              <div>
                <p className="font-medium text-primary">{o.customer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString('en-IN')} · {o.items?.length ?? 0} item(s)
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatINR(o.total_amount)}</p>
                <p className="text-xs text-green-600">+{formatINR(o.reseller_profit)} profit</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-secondary px-2 py-1 text-xs capitalize">{o.status}</span>
                {o.reseller_payout_status && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      PAYOUT_LABELS[o.reseller_payout_status]?.className || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {PAYOUT_LABELS[o.reseller_payout_status]?.label || o.reseller_payout_status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
