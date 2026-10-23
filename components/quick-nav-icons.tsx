'use client';

import Link from 'next/link';
import { Home, LayoutGrid } from 'lucide-react';

/**
 * A small pair of icon links (Home, Categories) meant to sit at the left
 * edge of the Filters/Sort bar on listing pages (Shop, Category). Mobile
 * shoppers land on these bars mid-filter and previously had no way back
 * to Home/Categories without dismissing the filter sheet or scrolling up
 * to the header first — this puts that one tap away, right where their
 * thumb already is.
 *
 * Desktop hides this (`lg:hidden`) since the full header nav is already
 * visible there — matches the same breakpoint the Filters button uses.
 */
export default function QuickNavIcons() {
  return (
    <div className="flex items-center gap-1.5 lg:hidden">
      <Link
        href="/"
        aria-label="Home"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Home className="h-4 w-4" />
      </Link>
      <Link
        href="/categories"
        aria-label="Categories"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <LayoutGrid className="h-4 w-4" />
      </Link>
    </div>
  );
}
