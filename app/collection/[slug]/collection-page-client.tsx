'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Star, Store } from 'lucide-react';
import ProductCard from '@/components/product-card';
import { expandProductVariants } from '@/lib/expand-product-variants';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchVendorStorefront, VendorStorefront } from '@/lib/vendor-storefront-api';
import { fireGtagEvent } from '@/lib/gtag-track';

export default function CollectionPageClient() {
  const params = useParams<{ slug: string }>();
  const [data, setData] = useState<VendorStorefront | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVendorStorefront(params.slug).then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  // Fire GA4 / Google Ads view_item_list once this vendor's products load.
  useEffect(() => {
    if (!data?.vendor || data.products.length === 0) return;
    fireGtagEvent('view_item_list', {
      item_list_name: `Collection: ${data.vendor.name}`,
      items: data.products.slice(0, 20).map((p, idx) => ({
        item_id: p.id,
        item_name: p.name,
        item_category: p.category,
        price: p.price,
        index: idx,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.vendor?.id]);

  if (loading) {
    return (
      <div className="container-boutique py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-40" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.vendor) {
    return (
      <div className="container-boutique py-20 text-center">
        <Store className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl font-bold text-primary">Collection not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This vendor page doesn&apos;t exist or isn&apos;t available right now.
        </p>
      </div>
    );
  }

  const { vendor, showRating, rating, reviewCount, products } = data;
  const expandedProducts = expandProductVariants(products);

  return (
    <div className="container-boutique py-8 pb-24 md:pb-8">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Collection
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
          {vendor.name}
        </h1>

        {/* Aggregate rating/review summary -- only rendered when the
            admin's "show_public_rating" toggle for this vendor is on
            (Admin > Vendors). When off, the page still lists every
            product below, just without this block. */}
        {showRating && rating != null && reviewCount != null && reviewCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1 rounded-full bg-secondary/10 px-3 py-1">
              <Star className="h-4 w-4 fill-secondary text-secondary" />
              <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
            </div>
            <span className="text-muted-foreground">
              {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'} across {products.length}{' '}
              {products.length === 1 ? 'product' : 'products'}
            </span>
          </div>
        )}

        <p className="mt-2 text-sm text-muted-foreground">
          {expandedProducts.length} {expandedProducts.length === 1 ? 'piece' : 'pieces'} from {vendor.name}
        </p>
      </div>

      {products.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No products from this vendor are live right now.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {expandedProducts.map((p, idx) => (
            <ProductCard key={`${p.id}-${p.slug}`} product={p} priority={idx < 4} disableAutoplayVideo={!!p.isVariantCard} />
          ))}
        </div>
      )}
    </div>
  );
}
