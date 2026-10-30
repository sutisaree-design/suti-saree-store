'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Gives client components (header, footer) the logo the admin picked in
// Admin > Media > Brand identity. The value is read on the server in
// app/layout.tsx, so the logo is already in the first HTML (no flash of the
// text wordmark). Empty string = no custom logo -> show the text wordmark.
const BrandContext = createContext<{ logoUrl: string }>({ logoUrl: '' });

export function BrandProvider({ logoUrl, children }: { logoUrl: string; children: ReactNode }) {
  return <BrandContext.Provider value={{ logoUrl }}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}

/**
 * Renders the uploaded logo image, or `fallback` (the original text wordmark)
 * when no logo has been set. `onDark` puts the logo on a soft white plate so a
 * dark logo stays readable on the maroon drawer / footer.
 */
export function BrandLogo({
  fallback,
  className,
  onDark = false,
}: {
  fallback: ReactNode;
  className?: string;
  onDark?: boolean;
}) {
  const { logoUrl } = useBrand();
  if (!logoUrl) return <>{fallback}</>;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt="Sutisaree"
      className={cn('block w-auto object-contain', className ?? 'h-8 max-w-[170px] sm:h-10')}
    />
  );
  return onDark ? <span className="inline-block rounded-md bg-white/95 px-2.5 py-1.5">{img}</span> : img;
}
