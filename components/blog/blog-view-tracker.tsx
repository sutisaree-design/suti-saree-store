'use client';

import { useEffect } from 'react';

// Fires once when a blog post page loads. Also drops a short-lived cookie
// (`last_blog_slug`) so that IF the visitor buys something in this
// session, app/api/razorpay/verify-payment/route.ts can attribute that
// sale back to this post (see the conversion-tracking patch there).
export default function BlogViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    fetch('/api/blog/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blog_slug: slug, event_type: 'view' }),
      keepalive: true,
    }).catch(() => {});

    // 30-minute attribution window — long enough to browse, add to cart,
    // and check out without losing the source.
    document.cookie = `last_blog_slug=${encodeURIComponent(slug)}; max-age=1800; path=/`;
  }, [slug]);

  return null;
}
