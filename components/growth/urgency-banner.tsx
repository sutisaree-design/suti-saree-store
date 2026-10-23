'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Truck, RotateCcw, Wallet, ShieldCheck, Tag, Sparkles, type LucideIcon } from 'lucide-react';
import { fetchGrowthSettings, GrowthSettings } from '@/lib/growth-api';

// Admin enters this as one line, e.g. "Free shipping India | COD Available |
// Easy Return" (Admin > Marketing > Growth Tools > Urgency Banner). Split on
// "|" so each claim gets its own icon and a thin gold divider instead of
// running together as one flat sentence. Falls back to Sparkles for any
// segment that doesn't match a keyword below.
const ICON_RULES: { icon: LucideIcon; keywords: string[] }[] = [
  { icon: Truck, keywords: ['ship', 'deliver'] },
  { icon: RotateCcw, keywords: ['return', 'exchange'] },
  { icon: Wallet, keywords: ['cod', 'cash on delivery', 'pay on delivery'] },
  { icon: ShieldCheck, keywords: ['secure', 'safe', 'authentic', 'guarantee'] },
  { icon: Tag, keywords: ['off', 'sale', 'discount', 'deal'] },
];

function iconFor(segment: string): LucideIcon {
  const lower = segment.toLowerCase();
  return ICON_RULES.find((rule) => rule.keywords.some((k) => lower.includes(k)))?.icon ?? Sparkles;
}

/**
 * Site-wide promo strip (Admin > Marketing > Growth Tools > Urgency Banner).
 * Permanent, not dismissible — the free-shipping / COD / returns message
 * stays visible for the whole visit instead of vanishing after one tap.
 */
export default function UrgencyBanner({ initialSettings }: { initialSettings?: GrowthSettings }) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<GrowthSettings | null>(initialSettings ?? null);

  useEffect(() => {
    if (initialSettings) return; // already provided by the server
    let cancelled = false;
    fetchGrowthSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialSettings]);

  // Hidden on admin (own dashboard chrome), product pages, and checkout —
  // keeps focus on the product / on completing the order, same reasoning
  // SiteBanner already uses for checkout.
  const hideOnThisPage =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/product/') ||
    pathname?.startsWith('/checkout');
  if (hideOnThisPage) return null;
  if (!settings?.urgency_banner_enabled || !settings.urgency_banner_text?.trim()) {
    return null;
  }

  const segments = settings.urgency_banner_text
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-primary via-primary to-[#5b1a2e]">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine-sweep bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      <div className="container-boutique relative z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-primary-foreground">
        {segments.map((segment, i) => {
          const Icon = iconFor(segment);
          return (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden className="h-3 w-px bg-secondary/50" />}
              <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide sm:text-xs">
                <Icon className="h-3.5 w-3.5 shrink-0 text-secondary" />
                {segment}
              </span>
            </span>
          );
        })}
      </div>
      <div className="gold-divider" />
    </div>
  );
}
