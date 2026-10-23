'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Gift, Sparkles, Save, PlusCircle, MinusCircle, Download } from 'lucide-react';
import {
  LoyaltySettings,
  DEFAULT_LOYALTY_SETTINGS,
  AdminLoyaltyCustomer,
  fetchAdminLoyaltyOverview,
  saveLoyaltySettings,
  adjustCustomerPoints,
} from '@/lib/loyalty-api';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function LoyaltyPanel() {
  const [settings, setSettings] = useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);
  const [customers, setCustomers] = useState<AdminLoyaltyCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<AdminLoyaltyCustomer | null>(null);
  const [adjustPoints, setAdjustPoints] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustMode, setAdjustMode] = useState<'credit' | 'debit'>('credit');
  const [adjusting, setAdjusting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminLoyaltyOverview();
      setSettings(overview.settings);
      setCustomers(overview.customers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load loyalty data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveLoyaltySettings(settings);
      toast.success('Loyalty settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const openAdjust = (c: AdminLoyaltyCustomer, mode: 'credit' | 'debit') => {
    setAdjustTarget(c);
    setAdjustMode(mode);
    setAdjustPoints(0);
    setAdjustReason(mode === 'credit' ? 'Bonus points' : 'Correction');
  };

  const onSubmitAdjust = async (e: FormEvent) => {
    e.preventDefault();
    if (!adjustTarget || !adjustPoints || adjustPoints <= 0) {
      toast.error('Enter a points value greater than 0');
      return;
    }
    setAdjusting(true);
    try {
      const signedPoints = adjustMode === 'credit' ? adjustPoints : -adjustPoints;
      await adjustCustomerPoints(adjustTarget.userId, signedPoints, adjustReason);
      toast.success(`${adjustMode === 'credit' ? 'Credited' : 'Debited'} ${adjustPoints} points`);
      setAdjustTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust points');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Loyalty Points</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${customers.length} customer${customers.length === 1 ? '' : 's'} with a points history`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/loyalty/export" download>
              <Download className="mr-1.5 h-4 w-4" /> Google member list (all)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/loyalty/export?scope=earners" download>
              <Download className="mr-1.5 h-4 w-4" /> Only point earners
            </a>
          </Button>
        </div>
      </div>

      {/* Settings */}
      <form
        onSubmit={onSaveSettings}
        className="mb-8 rounded-lg border border-border/60 bg-card p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
            <Sparkles className="h-4 w-4 text-secondary" /> Program Settings
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="loyalty-enabled" className="cursor-pointer text-sm">
              Enabled
            </Label>
            <Switch
              id="loyalty-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="points-per-100">Points earned per ₹100 spent</Label>
            <Input
              id="points-per-100"
              type="number"
              min={0}
              value={settings.points_per_100_rupees}
              onChange={(e) =>
                setSettings((s) => ({ ...s, points_per_100_rupees: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="redeem-value">₹ value of 1 point when redeemed</Label>
            <Input
              id="redeem-value"
              type="number"
              min={0}
              step="0.01"
              value={settings.redeem_value_per_point}
              onChange={(e) =>
                setSettings((s) => ({ ...s, redeem_value_per_point: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="min-redeem">Minimum points to redeem</Label>
            <Input
              id="min-redeem"
              type="number"
              min={0}
              value={settings.min_redeem_points}
              onChange={(e) =>
                setSettings((s) => ({ ...s, min_redeem_points: Number(e.target.value) }))
              }
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Example: a {formatINR(1000)} order earns{' '}
          {Math.floor((1000 * settings.points_per_100_rupees) / 100)} points, worth{' '}
          {formatINR(
            Math.round((1000 * settings.points_per_100_rupees) / 100) * settings.redeem_value_per_point
          )}{' '}
          on a future order.
        </p>

        <Button type="submit" disabled={savingSettings} className="mt-4 bg-primary">
          <Save className="mr-1.5 h-4 w-4" />
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>

      {/* Customer balances */}
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Worth</th>
              <th className="px-4 py-3">Total Earned</th>
              <th className="px-4 py-3">Total Redeemed</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.userId} className="border-t">
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.email || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-secondary" /> {c.balance}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatINR(Math.round(c.balance * settings.redeem_value_per_point))}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c.totalEarned}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c.totalRedeemed}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openAdjust(c, 'credit')}>
                      <PlusCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => openAdjust(c, 'debit')}
                    >
                      <MinusCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No customers have earned points yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {adjustMode === 'credit' ? 'Credit points to' : 'Debit points from'} {adjustTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitAdjust} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-points">Points</Label>
              <Input
                id="adjust-points"
                type="number"
                min={1}
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(Number(e.target.value))}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Input
                id="adjust-reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Birthday bonus, order correction"
              />
            </div>
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={adjusting} className="bg-primary">
                {adjusting ? 'Saving…' : `${adjustMode === 'credit' ? 'Credit' : 'Debit'} Points`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
