'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Gift, Share2, UserPlus, ShoppingBag, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  fetchReferralSettings,
  DEFAULT_REFERRAL_SETTINGS,
  type ReferralSettings,
} from '@/lib/referrals-api';

export default function ReferEarnPage() {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<ReferralSettings>(DEFAULT_REFERRAL_SETTINGS);

  useEffect(() => {
    fetchReferralSettings().then(setSettings).catch(() => {
      /* falls back to DEFAULT_REFERRAL_SETTINGS, already set */
    });
  }, []);

  const steps = [
    {
      icon: Share2,
      title: 'Share your code',
      body: 'Once you sign up, you get a personal referral code and link to share with friends and family.',
    },
    {
      icon: UserPlus,
      title: 'They sign up',
      body: `Your friend creates an account with your code and gets ${settings.referred_reward_points} reward points instantly.`,
    },
    {
      icon: ShoppingBag,
      title: 'They place an order',
      body: 'When their first order is confirmed, the referral is marked complete.',
    },
    {
      icon: Gift,
      title: 'You both earn',
      body: `You receive ${settings.referrer_reward_points} reward points, redeemable on your next purchase.`,
    },
  ];

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="border-b border-border/60 bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">
            Refer a friend, earn together
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Every saree you love is more fun shared. Invite friends to AruhiHandlooms — when they
            place their first order, you both get rewarded.
          </p>

          <div className="mx-auto mt-8 inline-flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-card px-8 py-5 sm:flex-row sm:gap-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your friend gets</p>
              <p className="font-serif text-2xl font-bold text-primary">
                {settings.referred_reward_points} points
              </p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">You get</p>
              <p className="font-serif text-2xl font-bold text-primary">
                {settings.referrer_reward_points} points
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/referrals">Get my referral code</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="bg-primary">
                  <Link href="/login?redirect=/account/referrals">Log in to get my code</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/signup">New here? Create an account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center font-serif text-2xl font-bold text-primary">How it works</h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="relative text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-secondary-foreground/70">
                Step {i + 1}
              </p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why it's worth it */}
      <section className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="font-serif text-2xl font-bold text-primary">
            No limit on how much you can earn
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Refer as many friends as you like — every completed order adds more points to your
            account. Points can be used towards your next handloom saree.
          </p>
          <div className="mt-8">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/referrals">View my referrals</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/login?redirect=/account/referrals">Get started</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
