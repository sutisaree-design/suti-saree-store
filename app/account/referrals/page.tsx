'use client';

import { useEffect, useState } from 'react';
import { Users2, Copy, Check, Gift, CheckCircle2, Clock } from 'lucide-react';
import { fetchMyReferralOverview, type MyReferral, type ReferralSettings } from '@/lib/referrals-api';
import { DEFAULT_REFERRAL_SETTINGS } from '@/lib/referrals-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ReferralsPage() {
  const [code, setCode] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReferralSettings>(DEFAULT_REFERRAL_SETTINGS);
  const [referrals, setReferrals] = useState<MyReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    fetchMyReferralOverview()
      .then((overview) => {
        setCode(overview.code);
        setSettings(overview.settings);
        setReferrals(overview.referrals);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load referrals'))
      .finally(() => setLoading(false));
  }, []);

  const shareLink =
    code && typeof window !== 'undefined' ? `${window.location.origin}/signup?ref=${code}` : '';

  const copyToClipboard = async (text: string, which: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success(which === 'code' ? 'Code copied' : 'Link copied');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy — please copy it manually');
    }
  };

  const TYPE_LABEL: Record<string, string> = {
    pending: 'Pending',
    completed: 'Completed',
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Refer &amp; Earn</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Share your code — when a friend places their first order, you both earn reward points.
      </p>

      <div className="mt-6 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Your referral code</p>
            <p className="font-serif text-2xl font-bold text-primary">
              {loading ? 'Loading…' : code || '—'}
            </p>
          </div>
        </div>

        {!loading && code && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => copyToClipboard(code, 'code')}
            >
              {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy code
            </Button>
            <Button
              type="button"
              className="flex-1 gap-2 bg-primary"
              onClick={() => copyToClipboard(shareLink, 'link')}
            >
              {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy share link
            </Button>
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Your friend gets <span className="font-semibold text-foreground">{settings.referred_reward_points} points</span>{' '}
          on signup with your code, and you get{' '}
          <span className="font-semibold text-foreground">{settings.referrer_reward_points} points</span> once their
          first order is confirmed.
        </p>
      </div>

      <h2 className="mt-8 font-serif text-lg font-semibold text-primary">Your Referrals</h2>

      {!loading && referrals.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Gift className="h-10 w-10" />
          <p>No referrals yet.</p>
          <p className="text-sm">Share your code above to start earning bonus points.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-border/60 p-4"
            >
              <div className="flex items-center gap-3">
                {r.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-secondary" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {r.status === 'completed' ? 'Friend completed first order' : 'Signed up, waiting on first order'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === 'completed' && (
                  <span className="text-sm font-semibold text-secondary-foreground">
                    +{r.referrer_reward_points} pts
                  </span>
                )}
                <Badge className="bg-muted text-foreground">{TYPE_LABEL[r.status] || r.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
