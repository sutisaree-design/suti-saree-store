'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Coins, ShoppingBag, Wallet, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import {
  fetchLoyaltySettings,
  DEFAULT_LOYALTY_SETTINGS,
  type LoyaltySettings,
} from '@/lib/loyalty-api';
import { formatINR } from '@/lib/format';

export default function LoyaltyPage() {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<LoyaltySettings>(DEFAULT_LOYALTY_SETTINGS);

  useEffect(() => {
    fetchLoyaltySettings().then(setSettings).catch(() => {
      /* falls back to DEFAULT_LOYALTY_SETTINGS, already set */
    });
  }, []);

  const redeemValueForMin = settings.min_redeem_points * settings.redeem_value_per_point;

  const steps = [
    {
      icon: ShoppingBag,
      title: 'Shop as usual',
      body: `Every order earns points automatically — ${settings.points_per_100_rupees} points for every ₹100 you spend.`,
    },
    {
      icon: Coins,
      title: 'Points add up',
      body: 'Points land in your account once the order is confirmed. No sign-up forms, no codes to enter.',
    },
    {
      icon: Wallet,
      title: 'Redeem at checkout',
      body: `Once you have ${settings.min_redeem_points}+ points, use them to knock money off any order.`,
    },
    {
      icon: Repeat,
      title: 'Keep earning',
      body: 'There is no cap — the more you shop, the more you save on the next saree.',
    },
  ];

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="border-b border-border/60 bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Coins className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">
            Earn points on every order
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Our loyalty programme rewards you automatically for shopping with us — no separate
            sign-up, no extra steps. Just shop, and points land in your account.
          </p>

          <div className="mx-auto mt-8 inline-flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-card px-8 py-5 sm:flex-row sm:gap-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">You earn</p>
              <p className="font-serif text-2xl font-bold text-primary">
                {settings.points_per_100_rupees} pts / ₹100
              </p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Minimum to redeem</p>
              <p className="font-serif text-2xl font-bold text-primary">
                {settings.min_redeem_points} pts
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {settings.min_redeem_points} points ≈ {formatINR(redeemValueForMin)} off your order
          </p>

          <div className="mt-8">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/loyalty">View my points</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/login?redirect=/account/loyalty">Log in to see my points</Link>
              </Button>
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

      {/* CTA */}
      <section className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="font-serif text-2xl font-bold text-primary">
            Already shopping with us?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            If you've placed an order before, you may already have points waiting. Log in to check
            your balance.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/loyalty">View my points</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="bg-primary">
                  <Link href="/login?redirect=/account/loyalty">Log in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/shop">Start shopping</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
