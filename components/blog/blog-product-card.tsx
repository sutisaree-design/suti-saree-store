'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { blurDataURL } from '@/lib/utils';
import { toPublicMediaUrl } from '@/lib/media-url';

export default function BlogProductCard({
  product,
  blogSlug,
}: {
  product: Product;
  blogSlug: string;
}) {
  const href = `/product/${product.default_variant_slug || product.slug}`;
  const img =
    toPublicMediaUrl(product.default_variant_image || product.images[0]) ||
    'https://placehold.co/800x1000?text=No+Image';
  const discount = discountPct(product.price, product.mrp);

  const handleClick = () => {
    fetch('/api/blog/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blog_slug: blogSlug, event_type: 'click', cta_type: 'product_card' }),
      keepalive: true,
    }).catch(() => {});
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="not-prose group my-6 flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-4 transition-shadow hover:shadow-md sm:gap-5 sm:p-5"
    >
      <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-28">
        <Image
          src={img}
          alt={product.name}
          fill
          sizes="120px"
          placeholder="blur"
          blurDataURL={blurDataURL(24, 30)}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Featured product
        </p>
        <p className="truncate font-serif text-base font-semibold text-foreground sm:text-lg">
          {product.name}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-primary">{formatINR(product.price)}</span>
          {discount > 0 && (
            <>
              <span className="text-xs text-muted-foreground line-through">
                {formatINR(product.mrp as number)}
              </span>
              <span className="text-xs font-medium text-secondary">{discount}% off</span>
            </>
          )}
        </div>
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground group-hover:opacity-90">
          <ShoppingBag className="h-3.5 w-3.5" />
          Shop Now
        </span>
      </div>
    </Link>
  );
}
