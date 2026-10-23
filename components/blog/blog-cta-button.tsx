'use client';

import Link from 'next/link';

// Self-hosted click tracking (no GA4 needed) — POSTs straight to
// /api/blog/track. If GA4 gets configured later, this still works
// unchanged since it doesn't depend on gtag at all.
export default function BlogCtaButton({
  categorySlug,
  categoryName,
  blogSlug,
}: {
  categorySlug: string;
  categoryName: string;
  blogSlug: string;
}) {
  const handleClick = () => {
    fetch('/api/blog/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blog_slug: blogSlug, event_type: 'click', cta_type: 'category' }),
      keepalive: true,
    }).catch(() => {});
  };

  return (
    <div className="mt-10 rounded-2xl border border-border bg-muted/40 p-6 text-center">
      <p className="font-serif text-lg font-semibold text-foreground">
        Shop the {categoryName} collection
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Handpicked pieces, straight from the weavers.
      </p>
      <Link
        href={`/category/${categorySlug}`}
        onClick={handleClick}
        className="mt-4 inline-block rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Browse {categoryName}
      </Link>
    </div>
  );
}
