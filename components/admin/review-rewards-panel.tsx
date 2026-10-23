'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Gift, Sparkles, Save, Star, Ticket } from 'lucide-react';
import {
  fetchAdminReviewRewardSettings,
  saveAdminReviewRewardSettings,
  type ReviewRewardSettings,
} from '@/lib/review-reward-admin-api';
import { DEFAULT_REVIEW_REWARD_SETTINGS } from '@/lib/review-reward-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

/**
 * Admin > Rewards -- controls the guest review-reward flow that backs
 * app/review/[token]/page.tsx (a >=minStars rating auto-issues a
 * one-time discount coupon; see lib/review-rewards-server.ts). Same
 * settings-card + stats layout as components/admin/loyalty-panel.tsx.
 */
export default function ReviewRewardsPanel() {
  const [settings, setSettings] = useState<ReviewRewardSettings>(DEFAULT_REVIEW_REWARD_SETTINGS);
  const [totalIssued, setTotalIssued] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminReviewRewardSettings();
      setSettings(overview.settings);
      setTotalIssued(overview.stats.totalIssued);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load review reward settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveAdminReviewRewardSettings(settings);
      setSettings(saved);
      toast.success('Review reward settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Review Rewards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : 'Auto-issue a one-time coupon when a customer leaves a high star rating.'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-4">
          <div className="rounded-full bg-secondary/15 p-2.5">
            <Ticket className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Rewards issued</p>
            <p className="font-serif text-2xl font-bold text-primary">{loading ? '—' : totalIssued}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-4">
          <div className="rounded-full bg-secondary/15 p-2.5">
            <Star className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trigger</p>
            <p className="font-serif text-2xl font-bold text-primary">
              {settings.minStars}★ or more
            </p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <form onSubmit={onSave} className="rounded-lg border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
            <Sparkles className="h-4 w-4 text-secondary" /> Program Settings
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="rewards-enabled" className="cursor-pointer text-sm">
              Enabled
            </Label>
            <Switch
              id="rewards-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="min-stars">Minimum star rating to earn a reward</Label>
            <Select
              value={String(settings.minStars)}
              onValueChange={(v) => setSettings((s) => ({ ...s, minStars: Number(v) }))}
            >
              <SelectTrigger id="min-stars">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}★ or more
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="discount-type">Discount type</Label>
            <Select
              value={settings.discountType}
              onValueChange={(v) => setSettings((s) => ({ ...s, discountType: v as 'percentage' | 'flat' }))}
            >
              <SelectTrigger id="discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="flat">Flat amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="discount-value">
              {settings.discountType === 'percentage' ? 'Percent off' : 'Amount off (₹)'}
            </Label>
            <Input
              id="discount-value"
              type="number"
              min={1}
              value={settings.discountValue}
              onChange={(e) => setSettings((s) => ({ ...s, discountValue: Number(e.target.value) }))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expiry-days">Coupon expires after (days)</Label>
            <Input
              id="expiry-days"
              type="number"
              min={1}
              value={settings.expiryDays}
              onChange={(e) => setSettings((s) => ({ ...s, expiryDays: Number(e.target.value) }))}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="min-order-value">Minimum order value to redeem (₹)</Label>
            <Input
              id="min-order-value"
              type="number"
              min={0}
              value={settings.minOrderValue}
              onChange={(e) => setSettings((s) => ({ ...s, minOrderValue: Number(e.target.value) }))}
            />
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gift className="h-3.5 w-3.5 text-secondary" />
          A {settings.minStars}★+ review through the guest review link auto-issues a one-time{' '}
          {settings.discountType === 'percentage' ? `${settings.discountValue}%` : `₹${settings.discountValue}`}{' '}
          off coupon, shown instantly on the page and mentioned in the review-request/reminder emails.
        </p>

        <div className="mt-5 border-t border-border/60 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-primary">Required steps before the coupon fires</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            The star rating above is always required. Turn these on/off to control how many more steps a
            customer must complete on the same review before ONE coupon is issued -- never one coupon per
            step, always just one for the whole review.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <Label htmlFor="require-written" className="cursor-pointer text-sm">
                  Require a written review
                </Label>
                <p className="text-xs text-muted-foreground">Customer must type a comment, not just tap stars.</p>
              </div>
              <Switch
                id="require-written"
                checked={settings.requireWrittenReview}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, requireWrittenReview: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <Label htmlFor="require-photo" className="cursor-pointer text-sm">
                  Require a real photo
                </Label>
                <p className="text-xs text-muted-foreground">Customer must upload at least one photo.</p>
              </div>
              <Switch
                id="require-photo"
                checked={settings.requirePhoto}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, requirePhoto: v }))}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Steps required right now:{' '}
            <span className="font-medium text-primary">
              Rate{settings.requireWrittenReview ? ' → Write a review' : ''}
              {settings.requirePhoto ? ' → Upload a photo' : ''}
            </span>
          </p>
        </div>

        <Button type="submit" disabled={saving} className="mt-4 bg-primary">
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>
    </div>
  );
}
