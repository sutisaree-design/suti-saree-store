'use client';

import Link from 'next/link';
import { Link2, IndianRupee, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

// NOTE: the 5% figure below matches the DB default in
// supabase/migrations/20260914000000_affiliate_default_commission_5pct.sql
// (affiliates.commission_percent DEFAULT 5). There's no public settings
// row for this yet — unlike loyalty/referrals, it's a plain column
// default — so if that default is ever changed, update this text too.
const DEFAULT_COMMISSION_PERCENT = 5;

export default function AffiliateProgramPage() {
  const { user, loading: authLoading } = useAuth();

  const steps = [
    {
      icon: Link2,
      title: 'Get your link',
      body: 'Log in and apply — you get a unique referral link instantly, no waiting on approval.',
    },
    {
      icon: TrendingUp,
      title: 'Share it anywhere',
      body: 'Post it on Instagram, YouTube, a blog, or send it directly to friends and followers.',
    },
    {
      icon: IndianRupee,
      title: 'Earn commission',
      body: `Earn ${DEFAULT_COMMISSION_PERCENT}% commission on every order placed through your link.`,
    },
    {
      icon: Wallet,
      title: 'Get paid',
      body: 'Once an order clears its return window, the commission becomes payable to your UPI ID.',
    },
  ];

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="border-b border-border/60 bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <IndianRupee className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">
            Turn your audience into income
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Love recommending AruhiHandlooms sarees already? Join our affiliate programme and earn
            real commission every time someone buys through your link.
          </p>

          <div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-lg border border-border/60 bg-card px-8 py-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Commission per order</p>
              <p className="font-serif text-2xl font-bold text-primary">
                {DEFAULT_COMMISSION_PERCENT}%
              </p>
            </div>
          </div>

          <div className="mt-8">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/affiliate">Get my affiliate link</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/login?redirect=/account/affiliate">Log in to apply</Link>
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

      {/* Who it's for */}
      <section className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="font-serif text-2xl font-bold text-primary">Who is this for?</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Content creators, stylists, boutique owners, or anyone with a following that loves
            handloom sarees. No minimum followers required — apply and start sharing your link
            right away.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {authLoading ? null : user ? (
              <Button asChild size="lg" className="bg-primary">
                <Link href="/account/affiliate">Get my affiliate link</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="bg-primary">
                  <Link href="/login?redirect=/account/affiliate">Log in to apply</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/signup">New here? Create an account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
