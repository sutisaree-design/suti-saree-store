'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { RotateCcw, Zap, Truck, type LucideIcon } from 'lucide-react';
import { fetchShippingSettings, DEFAULT_SHIPPING_SETTINGS } from '@/lib/pincode-api';
import { fetchGrowthSettings, DEFAULT_GROWTH_SETTINGS, type GrowthSettings } from '@/lib/growth-api';

interface Feature {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

/**
 * Trust strip shown site-wide right below the header — the three
 * reassurances a shopper looks for before trusting a new boutique with
 * their money: easy returns, how fast it ships, and the free-shipping
 * cutoff. Title/subtitle text and the on/off switch are editable from
 * Admin > Marketing > Growth Tools. The free-shipping line reads the
 * real threshold from Admin > Settings > Shipping whenever its subtitle
 * is left blank in Growth Tools, so it can never drift out of sync with
 * checkout.
 */
export default function FeatureStrip({
  initialGrowth,
  initialThreshold,
}: {
  initialGrowth?: GrowthSettings;
  initialThreshold?: number;
}) {
  const pathname = usePathname();
  const [threshold, setThreshold] = useState<number | null>(initialThreshold ?? null);
  const [growth, setGrowth] = useState<GrowthSettings | null>(initialGrowth ?? null);

  useEffect(() => {
    // Both values come from the server (app/layout.tsx) -- skip the two
    // browser requests entirely when they are present.
    if (initialGrowth && initialThreshold !== undefined) return;
    let cancelled = false;
    fetchShippingSettings()
      .then((s) => {
        if (!cancelled) setThreshold(s.free_shipping_threshold);
      })
      .catch(() => {
        if (!cancelled) setThreshold(DEFAULT_SHIPPING_SETTINGS.free_shipping_threshold);
      });
    fetchGrowthSettings()
      .then((s) => {
        if (!cancelled) setGrowth(s);
      })
      .catch(() => {
        if (!cancelled) setGrowth(DEFAULT_GROWTH_SETTINGS);
      });
    return () => {
      cancelled = true;
    };
  }, [initialGrowth, initialThreshold]);

  // Hidden on admin (own dashboard chrome), product pages, and checkout —
  // keeps focus on the product / on completing the order, same reasoning
  // SiteBanner already uses for checkout.
  const hideOnThisPage =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/product/') ||
    pathname?.startsWith('/checkout');
  if (hideOnThisPage) return null;

  // Admin can switch the whole strip off from Growth Tools.
  if (growth && !growth.feature_strip_enabled) return null;

  const g = growth ?? DEFAULT_GROWTH_SETTINGS;

  const autoShippingSubtitle =
    threshold === null
      ? '\u00A0' // reserve the line's height while loading so nothing jumps
      : threshold > 0
        ? `For orders ${threshold.toLocaleString('en-IN')}+`
        : 'On every order';

  const features: Feature[] = [
    { icon: RotateCcw, title: g.feature_strip_returns_title, subtitle: g.feature_strip_returns_subtitle },
    { icon: Zap, title: g.feature_strip_delivery_title, subtitle: g.feature_strip_delivery_subtitle },
    {
      icon: Truck,
      title: g.feature_strip_shipping_title,
      subtitle: g.feature_strip_shipping_subtitle.trim() || autoShippingSubtitle,
    },
  ];

  return (
    <div className="border-b border-border/60 bg-card">
      <div className="container-boutique grid grid-cols-3 divide-x divide-border/60">
        {features.map((f) => (
          <div
            key={f.title}
            className="flex items-center justify-center gap-2 py-2.5 sm:gap-3 sm:py-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-secondary/30 sm:h-9 sm:w-9">
              <f.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[11px] font-semibold text-foreground sm:text-sm">
                {f.title}
              </span>
              <span className="block truncate text-[9px] text-muted-foreground sm:text-xs">
                {f.subtitle}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
