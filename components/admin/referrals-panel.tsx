'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Users2, Sparkles, Save, CheckCircle2, Clock } from 'lucide-react';
import {
  ReferralSettings,
  DEFAULT_REFERRAL_SETTINGS,
  AdminReferralRow,
  fetchAdminReferralsOverview,
  saveReferralSettings,
} from '@/lib/referrals-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ReferralsPanel() {
  const [settings, setSettings] = useState<ReferralSettings>(DEFAULT_REFERRAL_SETTINGS);
  const [referrals, setReferrals] = useState<AdminReferralRow[]>([]);
  const [totals, setTotals] = useState({ totalReferrers: 0, totalCompleted: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminReferralsOverview();
      setSettings(overview.settings);
      setReferrals(overview.referrals);
      setTotals({
        totalReferrers: overview.totalReferrers,
        totalCompleted: overview.totalCompleted,
        totalPending: overview.totalPending,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load referral data');
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
      await saveReferralSettings(settings);
      toast.success('Referral settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Referral Program</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${totals.totalReferrers} customer${totals.totalReferrers === 1 ? '' : 's'} referring · ${totals.totalCompleted} completed · ${totals.totalPending} pending`}
          </p>
        </div>
      </div>

      {/* Settings */}
      <form onSubmit={onSaveSettings} className="mb-8 rounded-lg border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
            <Sparkles className="h-4 w-4 text-secondary" /> Program Settings
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="referral-enabled" className="cursor-pointer text-sm">
              Enabled
            </Label>
            <Switch
              id="referral-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="referrer-points">Points credited to the referrer</Label>
            <Input
              id="referrer-points"
              type="number"
              min={0}
              value={settings.referrer_reward_points}
              onChange={(e) =>
                setSettings((s) => ({ ...s, referrer_reward_points: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="referred-points">Points credited to the new customer</Label>
            <Input
              id="referred-points"
              type="number"
              min={0}
              value={settings.referred_reward_points}
              onChange={(e) =>
                setSettings((s) => ({ ...s, referred_reward_points: Number(e.target.value) }))
              }
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Both rewards are credited as reward points (via the Loyalty program) the moment the
          referred customer&apos;s first order is confirmed.
        </p>

        <Button type="submit" disabled={savingSettings} className="mt-4 bg-primary">
          <Save className="mr-1.5 h-4 w-4" />
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>

      {/* Referrals list */}
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Referrer</th>
              <th className="px-4 py-3">Referred Customer</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rewards</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{r.referrerName}</p>
                  <p className="text-xs text-muted-foreground">{r.referrerEmail || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{r.referredName}</p>
                  <p className="text-xs text-muted-foreground">{r.referredEmail || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3 text-sm">
                  {r.status === 'completed' ? (
                    <Badge className="flex w-fit items-center gap-1 bg-secondary/20 text-secondary-foreground">
                      <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                  ) : (
                    <Badge className="flex w-fit items-center gap-1 bg-muted text-foreground">
                      <Clock className="h-3 w-3" /> Pending
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {r.status === 'completed'
                    ? `+${r.referrerRewardPoints} / +${r.referredRewardPoints} pts`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
            {!loading && referrals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <span className="flex flex-col items-center gap-2">
                    <Users2 className="h-8 w-8 text-muted-foreground" />
                    No referrals yet.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
