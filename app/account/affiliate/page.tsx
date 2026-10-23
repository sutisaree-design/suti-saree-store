'use client';

import { useEffect, useState } from 'react';
import { Users2, IndianRupee, Package, TrendingUp, Loader2, Wallet, Copy, Clock, Link2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatINR } from '@/lib/format';
import {
  fetchMyAffiliateOverview,
  fetchMyAffiliateOrders,
  applyForAffiliate,
  updateAffiliatePayoutDetails,
  buildAffiliateReferralLink,
  buildAffiliateProductLink,
  CODE_EXPIRY_DAYS,
  type AffiliateProfile,
  type AffiliateEarningsSummary,
  type AffiliateOrderRow,
} from '@/lib/affiliate-api';

const PAYOUT_LABELS: Record<string, { label: string; className: string }> = {
  pending_delivery: { label: 'Awaiting delivery', className: 'bg-muted text-muted-foreground' },
  in_return_window: { label: 'Delivered — in return window', className: 'bg-orange-100 text-orange-700' },
  eligible: { label: 'Ready — will be paid soon', className: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-700' },
  void: { label: 'Not payable (RTO/cancelled/returned)', className: 'bg-red-100 text-red-700' },
};

const STATUS_NOTE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Application pending admin approval', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Application rejected', className: 'bg-red-100 text-red-700' },
  suspended: { label: 'Account suspended', className: 'bg-red-100 text-red-700' },
};

export default function AffiliatePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [earnings, setEarnings] = useState<AffiliateEarningsSummary>({
    totalOrders: 0,
    totalSales: 0,
    totalCommission: 0,
    pendingOrders: 0,
    pendingDeliveryCommission: 0,
    inReturnWindowCommission: 0,
    eligibleCommission: 0,
    paidCommission: 0,
  });
  const [orders, setOrders] = useState<AffiliateOrderRow[]>([]);
  const [applying, setApplying] = useState(false);
  const [upiInput, setUpiInput] = useState('');
  const [holderInput, setHolderInput] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);
  const [productUrlInput, setProductUrlInput] = useState('');
  const [generatedProductLink, setGeneratedProductLink] = useState('');

  const load = async () => {
    try {
      const overview = await fetchMyAffiliateOverview();
      setProfile(overview.profile);
      setEarnings(overview.earnings);
      if (overview.profile) {
        setUpiInput(overview.profile.payout_upi_id || '');
        setHolderInput(overview.profile.payout_account_holder || '');
        if (overview.profile.status === 'approved') {
          const myOrders = await fetchMyAffiliateOrders();
          setOrders(myOrders);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load affiliate data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = async () => {
    setApplying(true);
    try {
      const { profile: p } = await applyForAffiliate();
      setProfile(p);
      toast.success("You're in! Your referral link is ready below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  const handleSavePayout = async () => {
    if (!upiInput.trim()) {
      toast.error('Enter a UPI ID');
      return;
    }
    setSavingPayout(true);
    try {
      await updateAffiliatePayoutDetails({
        payout_upi_id: upiInput.trim(),
        payout_account_holder: holderInput.trim(),
      });
      setProfile((p) => (p ? { ...p, payout_upi_id: upiInput.trim(), payout_account_holder: holderInput.trim() } : p));
      toast.success('Payout details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save payout details');
    } finally {
      setSavingPayout(false);
    }
  };

  const copyLink = () => {
    if (!profile) return;
    const link = buildAffiliateReferralLink(profile.code);
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success('Referral link copied'))
      .catch(() => toast.error('Could not copy — copy it manually'));
  };

  const handleGenerateProductLink = () => {
    if (!profile) return;
    if (!productUrlInput.trim()) {
      toast.error('Paste a product page link first');
      return;
    }
    const link = buildAffiliateProductLink(profile.code, productUrlInput.trim());
    if (!link) {
      toast.error("Couldn't recognise that as a link — paste the full product page URL");
      return;
    }
    setGeneratedProductLink(link);
  };

  const copyProductLink = () => {
    if (!generatedProductLink) return;
    navigator.clipboard
      .writeText(generatedProductLink)
      .then(() => toast.success('Product link copied'))
      .catch(() => toast.error('Could not copy — copy it manually'));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!profile) {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">Become an Affiliate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your own referral link — when someone places an order after clicking it, you earn a
          cash commission. No pricing to manage, we handle everything else.
        </p>
        <div className="mt-6 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold text-primary">Same login, no new signup</p>
              <p className="text-sm text-muted-foreground">Apply with this account — you're approved instantly.</p>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Apply once — you're approved instantly, no waiting on admin review</li>
            <li>Get a unique referral code/link right away and start sharing</li>
            <li>Earn a % commission on their order, no pricing changes on your end</li>
            <li>Commission is payable once the order is delivered and the return window passes</li>
          </ul>
          <Button className="mt-5 bg-primary" onClick={handleApply} disabled={applying}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply to become an Affiliate'}
          </Button>
        </div>
      </div>
    );
  }

  if (profile.status !== 'approved') {
    const note = STATUS_NOTE[profile.status];
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">Affiliate Program</h1>
        <div className="mt-4 rounded-lg border border-border/60 p-6">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${note?.className || 'bg-muted text-muted-foreground'}`}>
            <Clock className="h-4 w-4" /> {note?.label || profile.status}
          </span>
          {profile.status === 'pending' && (
            <p className="mt-3 text-sm text-muted-foreground">
              We'll let you know as soon as an admin reviews your application. Thanks for your patience!
            </p>
          )}
          {(profile.status === 'rejected' || profile.status === 'suspended') && (
            <p className="mt-3 text-sm text-muted-foreground">
              Reach out to our support team if you have questions about this.
            </p>
          )}
        </div>
      </div>
    );
  }

  const referralLink = buildAffiliateReferralLink(profile.code);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Affiliate Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Share your link below — every order placed after someone clicks it is tracked to you.
      </p>

      {/* Referral link */}
      <div className="mt-4 rounded-lg border border-border/60 p-4">
        <Label className="text-sm font-medium">Your referral link</Label>
        <div className="mt-2 flex max-w-lg gap-2">
          <Input readOnly value={referralLink} className="font-mono text-xs" />
          <Button variant="outline" onClick={copyLink} className="shrink-0 gap-1">
            <Copy className="h-4 w-4" /> Copy
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Your code: <span className="font-mono font-medium">{profile.code}</span> · Commission:{' '}
          {profile.commission_percent}% per order
        </p>
      </div>

      {/* Product-specific link generator */}
      <div className="mt-4 rounded-lg border border-border/60 p-4">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" /> Create a link for a specific product
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Want to promote one exact saree or colour variant instead of the homepage? Paste that
          product's page link below (copy it from your browser's address bar while viewing it) and
          we'll turn it into your own trackable link — same commission, same rules.
        </p>
        <div className="mt-2 flex max-w-lg gap-2">
          <Input
            placeholder="https://www.aruhihandlooms.com/product/kanjivaram-silk-saree"
            value={productUrlInput}
            onChange={(e) => setProductUrlInput(e.target.value)}
          />
          <Button variant="outline" onClick={handleGenerateProductLink} className="shrink-0">
            Generate
          </Button>
        </div>
        {generatedProductLink && (
          <div className="mt-2 flex max-w-lg gap-2">
            <Input readOnly value={generatedProductLink} className="font-mono text-xs" />
            <Button variant="outline" onClick={copyProductLink} className="shrink-0 gap-1">
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        )}
      </div>

      {/* How it works — full details */}
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4" /> How this works, in detail
        </Label>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-primary">1. Sharing your link</p>
            <p>
              Use your homepage link above to promote the whole store, or generate a link to one
              specific product/variant using the tool above. Both work exactly the same way — the
              only difference is where the visitor lands.
            </p>
          </div>
          <div>
            <p className="font-medium text-primary">2. How long a click stays valid</p>
            <p>
              When someone clicks your link, we remember it in their browser for{' '}
              <strong>{CODE_EXPIRY_DAYS} days</strong>. If they place an order any time within
              those {CODE_EXPIRY_DAYS} days — even if they browse around, close the tab, or come
              back later — it's still credited to you. After {CODE_EXPIRY_DAYS} days with no order,
              the link expires and stops tracking to you.
            </p>
          </div>
          <div>
            <p className="font-medium text-primary">3. How commission is calculated</p>
            <p>
              You earn <strong>{profile.commission_percent}%</strong> of the order's subtotal — no
              markup or pricing changes on your side, the customer always pays the normal store
              price.
            </p>
          </div>
          <div>
            <p className="font-medium text-primary">4. How and when you get paid</p>
            <p>
              A new commission starts as <strong>awaiting delivery</strong>. Once the order is
              delivered, it moves to <strong>in return window</strong> for our standard return
              period. If the order isn't returned, cancelled, or refunded during that window, it
              becomes <strong>eligible</strong> — ready to be paid. We then send it to the UPI ID
              you've saved below, and it shows as <strong>paid</strong> once sent. If the order is
              returned, cancelled, or fails delivery during the return window, that commission is
              voided instead and won't be paid.
            </p>
          </div>
        </div>
      </div>

      {/* Earnings summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 p-4">
          <Package className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{earnings.totalOrders}</p>
          <p className="text-xs text-muted-foreground">Referred Orders</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <IndianRupee className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{formatINR(earnings.totalSales)}</p>
          <p className="text-xs text-muted-foreground">Total Referred Sales</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-green-600">{formatINR(earnings.totalCommission)}</p>
          <p className="text-xs text-muted-foreground">Your Commission</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <Package className="h-4 w-4 text-primary" />
          <p className="mt-2 text-xl font-bold text-primary">{earnings.pendingOrders}</p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </div>
      </div>

      {/* Payout stage breakdown */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-xl font-bold text-muted-foreground">{formatINR(earnings.pendingDeliveryCommission)}</p>
          <p className="text-xs text-muted-foreground">Awaiting delivery (not payable yet)</p>
        </div>
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <p className="text-xl font-bold text-orange-700">{formatINR(earnings.inReturnWindowCommission)}</p>
          <p className="text-xs text-orange-700">Delivered — in return window</p>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-xl font-bold text-amber-700">{formatINR(earnings.eligibleCommission)}</p>
          <p className="text-xs text-amber-700">Return window passed — will be paid soon</p>
        </div>
        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-xl font-bold text-green-700">{formatINR(earnings.paidCommission)}</p>
          <p className="text-xs text-green-700">Already paid to you</p>
        </div>
      </div>

      {/* Payout details */}
      <div className="mt-6 rounded-lg border border-border/60 p-4">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4" /> Where should we pay you?
        </Label>
        <p className="text-xs text-muted-foreground">
          Once a referred order is delivered and the return window passes, your commission becomes
          payable. We'll send it to this UPI ID.
        </p>
        <div className="mt-2 grid max-w-md gap-2 sm:grid-cols-2">
          <Input placeholder="UPI ID, e.g. yourname@upi" value={upiInput} onChange={(e) => setUpiInput(e.target.value)} />
          <Input placeholder="Account holder name" value={holderInput} onChange={(e) => setHolderInput(e.target.value)} />
        </div>
        <Button variant="outline" className="mt-2" onClick={handleSavePayout} disabled={savingPayout}>
          {savingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payout details'}
        </Button>
      </div>

      {/* Referred orders */}
      <h2 className="mt-8 font-serif text-lg font-semibold text-primary">Referred Orders</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No referred orders yet — share your link above to start earning.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm">
              <div>
                <p className="font-medium text-primary">Order #{o.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatINR(o.totalAmount)}</p>
                {o.commissionAmount != null && (
                  <p className="text-xs text-green-600">+{formatINR(o.commissionAmount)} commission</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-secondary px-2 py-1 text-xs capitalize">{o.status}</span>
                {o.commissionStatus && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      PAYOUT_LABELS[o.commissionStatus]?.className || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {PAYOUT_LABELS[o.commissionStatus]?.label || o.commissionStatus}
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
