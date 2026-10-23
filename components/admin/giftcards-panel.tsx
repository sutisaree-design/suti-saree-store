'use client';

import { useEffect, useState, FormEvent } from 'react';
import { CreditCard, Sparkles, Save, PlusCircle, Ban, Copy } from 'lucide-react';
import {
  GiftCardSettings,
  DEFAULT_GIFT_CARD_SETTINGS,
  GiftCard,
  fetchAdminGiftCardsOverview,
  saveGiftCardSettings,
  issueGiftCard,
  deactivateGiftCard,
} from '@/lib/giftcards-api';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-secondary/20 text-secondary-foreground',
  redeemed: 'bg-muted text-foreground',
  deactivated: 'bg-destructive/10 text-destructive',
  expired: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-muted-foreground',
};

export default function GiftCardsPanel() {
  const [settings, setSettings] = useState<GiftCardSettings>(DEFAULT_GIFT_CARD_SETTINGS);
  const [denominationsInput, setDenominationsInput] = useState('');
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [totals, setTotals] = useState({ totalIssued: 0, totalActiveBalance: 0, totalRedeemed: 0 });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueAmount, setIssueAmount] = useState(500);
  const [issueRecipientName, setIssueRecipientName] = useState('');
  const [issueRecipientEmail, setIssueRecipientEmail] = useState('');
  const [issueReason, setIssueReason] = useState('Manual admin issue');
  const [issuing, setIssuing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await fetchAdminGiftCardsOverview();
      setSettings(overview.settings);
      setDenominationsInput(overview.settings.denominations.join(', '));
      setCards(overview.cards);
      setTotals(overview.totals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load gift card data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    const denominations = denominationsInput
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (denominations.length === 0) {
      toast.error('Enter at least one valid denomination');
      return;
    }

    setSavingSettings(true);
    try {
      const next = { ...settings, denominations };
      await saveGiftCardSettings(next);
      setSettings(next);
      toast.success('Gift card settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const onIssue = async (e: FormEvent) => {
    e.preventDefault();
    if (!issueAmount || issueAmount < 1) {
      toast.error('Enter an amount greater than 0');
      return;
    }
    setIssuing(true);
    try {
      const result = await issueGiftCard({
        amount: issueAmount,
        recipientName: issueRecipientName || undefined,
        recipientEmail: issueRecipientEmail || undefined,
        reason: issueReason,
      });
      toast.success(`Gift card ${result.code} issued`);
      setIssueOpen(false);
      setIssueAmount(500);
      setIssueRecipientName('');
      setIssueRecipientEmail('');
      setIssueReason('Manual admin issue');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue gift card');
    } finally {
      setIssuing(false);
    }
  };

  const onDeactivate = async (card: GiftCard) => {
    if (!confirm(`Deactivate gift card ${card.code}? This cannot be undone.`)) return;
    try {
      await deactivateGiftCard(card.id);
      toast.success('Gift card deactivated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate gift card');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Gift Cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${cards.length} issued · ${formatINR(totals.totalActiveBalance)} active balance · ${formatINR(totals.totalRedeemed)} redeemed`}
          </p>
        </div>
        <Button className="bg-primary" onClick={() => setIssueOpen(true)}>
          <PlusCircle className="mr-1.5 h-4 w-4" /> Issue Gift Card
        </Button>
      </div>

      {/* Settings */}
      <form onSubmit={onSaveSettings} className="mb-8 rounded-lg border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
            <Sparkles className="h-4 w-4 text-secondary" /> Program Settings
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="giftcards-enabled" className="cursor-pointer text-sm">
              Enabled
            </Label>
            <Switch
              id="giftcards-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="denominations">Denominations shown on /gift-cards (comma separated)</Label>
            <Input
              id="denominations"
              value={denominationsInput}
              onChange={(e) => setDenominationsInput(e.target.value)}
              placeholder="500, 1000, 2000, 5000"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="expiry-months">Validity (months from purchase)</Label>
            <Input
              id="expiry-months"
              type="number"
              min={1}
              value={settings.expiry_months}
              onChange={(e) => setSettings((s) => ({ ...s, expiry_months: Number(e.target.value) }))}
            />
          </div>
        </div>

        <Button type="submit" disabled={savingSettings} className="mt-4 bg-primary">
          <Save className="mr-1.5 h-4 w-4" />
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </Button>
      </form>

      {/* Issued cards */}
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 text-sm">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                    {c.code}
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      aria-label="Copy code"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{c.recipient_name || c.purchaser_name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{c.recipient_email || c.purchaser_email || '—'}</p>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{formatINR(c.initial_value)}</td>
                <td className="px-4 py-3 text-sm font-semibold">{formatINR(c.balance)}</td>
                <td className="px-4 py-3 text-sm">
                  <Badge className={STATUS_STYLE[c.status] || 'bg-muted text-foreground'}>
                    {c.status[0].toUpperCase() + c.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => onDeactivate(c)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {!loading && cards.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <span className="flex flex-col items-center gap-2">
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                    No gift cards issued yet.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Issue a comp gift card</DialogTitle>
          </DialogHeader>
          <form onSubmit={onIssue} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-amount">Amount (₹)</Label>
              <Input
                id="issue-amount"
                type="number"
                min={1}
                value={issueAmount}
                onChange={(e) => setIssueAmount(Number(e.target.value))}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-recipient-name">Recipient name (optional)</Label>
              <Input
                id="issue-recipient-name"
                value={issueRecipientName}
                onChange={(e) => setIssueRecipientName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-recipient-email">Recipient email (optional)</Label>
              <Input
                id="issue-recipient-email"
                type="email"
                value={issueRecipientEmail}
                onChange={(e) => setIssueRecipientEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-reason">Reason</Label>
              <Input id="issue-reason" value={issueReason} onChange={(e) => setIssueReason(e.target.value)} />
            </div>
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={issuing} className="bg-primary">
                {issuing ? 'Issuing…' : 'Issue Gift Card'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
