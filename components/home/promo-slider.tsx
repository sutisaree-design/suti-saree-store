'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Store,
  Gift,
  Users2,
  Coins,
  ShieldCheck,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchLoyaltySettings, DEFAULT_LOYALTY_SETTINGS } from '@/lib/loyalty-api';
import { fetchReferralSettings, DEFAULT_REFERRAL_SETTINGS } from '@/lib/referrals-api';
import { fetchGiftCardSettings, DEFAULT_GIFT_CARD_SETTINGS } from '@/lib/giftcards-api';
import { formatINR } from '@/lib/format';

interface Slide {
  key: string;
  href: string;
  icon: typeof Store;
  eyebrow: string;
  title: string;
  desc: string;
  cta: string;
  gradient: string;
}

const AUTOPLAY_MS = 4500;

export default function PromoSlider() {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  // Each slide's numbers are pulled live from the same settings the admin
  // configures for Loyalty / Referrals / Gift Cards, so the banner never
  // quotes a stale rate — and a program the admin has switched off simply
  // doesn't get a slide at all.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchLoyaltySettings(),
      fetchReferralSettings(),
      fetchGiftCardSettings(),
    ]).then(([loyaltyRes, referralRes, giftRes]) => {
      if (cancelled) return;
      const loyalty =
        loyaltyRes.status === 'fulfilled' ? loyaltyRes.value : DEFAULT_LOYALTY_SETTINGS;
      const referral =
        referralRes.status === 'fulfilled' ? referralRes.value : DEFAULT_REFERRAL_SETTINGS;
      const gift =
        giftRes.status === 'fulfilled' ? giftRes.value : DEFAULT_GIFT_CARD_SETTINGS;
      const minGiftAmount = Math.min(...gift.denominations, DEFAULT_GIFT_CARD_SETTINGS.denominations[0]);

      const built: Slide[] = [
        {
          key: 'reseller',
          href: '/account/reseller',
          icon: Store,
          eyebrow: 'Become a Partner',
          title: 'Start Reselling, Earn Every Order',
          desc: 'Set your own markup and sell our handloom collection under your name — zero inventory required.',
          cta: 'Start Reselling',
          gradient: 'from-primary via-primary to-[#5b1a2e]',
        },
        ...(gift.enabled
          ? [
              {
                key: 'giftcard',
                href: '/gift-cards',
                icon: Gift,
                eyebrow: 'Gift Someone Special',
                title: `Gift Cards from ${formatINR(minGiftAmount)}`,
                desc: `Delivered instantly by email, valid for ${gift.expiry_months} months — the easiest gift that's always the right size.`,
                cta: 'Buy a Gift Card',
                gradient: 'from-secondary via-secondary/90 to-primary',
              },
            ]
          : []),
        ...(referral.enabled
          ? [
              {
                key: 'referral',
                href: '/account/referrals',
                icon: Users2,
                eyebrow: 'Refer & Earn',
                title: `Give ${referral.referred_reward_points} Points, Get ${referral.referrer_reward_points} Points`,
                desc: 'Invite friends to shop with you — you both earn reward points the moment their first order is placed.',
                cta: 'Refer a Friend',
                gradient: 'from-[#5b1a2e] via-primary to-secondary/80',
              },
            ]
          : []),
        ...(loyalty.enabled
          ? [
              {
                key: 'loyalty',
                href: '/account/loyalty',
                icon: Coins,
                eyebrow: 'Aruhi Rewards',
                title: `Earn ${loyalty.points_per_100_rupees} Points on Every ₹100`,
                desc: `Points convert straight to rupees at checkout — redeem ${loyalty.min_redeem_points}+ points anytime.`,
                cta: 'View My Points',
                gradient: 'from-primary via-secondary/70 to-primary',
              },
            ]
          : []),
      ];
      setSlides(built);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Autoplay — pauses while the pointer is over the banner so it doesn't
  // whisk away a slide someone's mid-read on, and resumes the moment they
  // move off.
  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setIndex((i) => (i + 1) % slides.length);
      }
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [slides]);

  if (!slides || slides.length === 0) return null;

  const go = (next: number) => {
    const len = slides.length;
    setIndex(((next % len) + len) % len);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      go(index + (delta < 0 ? 1 : -1));
    }
    touchStartX.current = null;
  };

  return (
    <section className="container-boutique py-5 sm:py-6">
      <div
        className="relative overflow-hidden rounded-2xl shadow-lg"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className={`relative flex w-full shrink-0 items-center gap-5 bg-gradient-to-r px-6 py-8 text-primary-foreground sm:px-10 sm:py-10 ${s.gradient}`}
            >
              {/* Soft glow accents give the banner a bit of depth/motion
                  without being distracting on repeat views. */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-14 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

              <span className="shimmer relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 sm:h-14 sm:w-14">
                <s.icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>

              <div className="relative min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
                  {s.eyebrow}
                </p>
                <h3 className="mt-1 font-serif text-lg font-bold leading-snug sm:text-2xl">
                  {s.title}
                </h3>
                <p className="mt-1 hidden max-w-md text-sm text-white/80 sm:block">
                  {s.desc}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold ring-1 ring-white/30 transition-colors hover:bg-white/25 sm:text-sm">
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Prev / next — desktop only, thumb + swipe covers mobile */}
        <button
          type="button"
          aria-label="Previous offer"
          onClick={() => go(index - 1)}
          className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/20 p-1.5 text-primary-foreground backdrop-blur-sm transition-colors hover:bg-background/30 sm:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next offer"
          onClick={() => go(index + 1)}
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/20 p-1.5 text-primary-foreground backdrop-blur-sm transition-colors hover:bg-background/30 sm:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Trust strip beneath the slider — reinforces credibility right
          where shoppers are being asked to trust us with referrals,
          money (gift cards) and their own resale business. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-secondary" /> 100% Secure & Verified
        </span>
        <span className="flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-secondary" /> Points Never Expire Unused
        </span>
        <span className="flex items-center gap-1.5">
          <Users2 className="h-3.5 w-3.5 text-secondary" /> Trusted by Real Customers
        </span>
      </div>
    </section>
  );
}
