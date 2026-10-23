'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomepageTile } from '@/lib/homepage-tiles-api';
import { toPublicMediaUrl } from '@/lib/media-url';

interface HomepageGridProps {
  tiles: HomepageTile[];
  collectionSlugById: Record<string, string>;
  /** Part 4b: promotion id -> collection slug, so a tile with
   *  link_type='promotion' (auto-linked in Part 4a) routes "Shop Now" to
   *  that promotion's own collection instead of rendering non-clickable. */
  promotionCollectionSlugById: Record<string, string>;
}

/**
 * Admin-curated "grid of offers" section — 2 columns on mobile widening to
 * 4 on larger screens, image on the top half of each card and the
 * title/subtitle/price/CTA on the bottom half, matching the visual language
 * of PromoSlider and CouponStrip (rounded-2xl cards, same shadow/border
 * tokens, primary/secondary theme colours) so it reads as part of the same
 * page instead of a bolted-on block.
 */
export default function HomepageGrid({
  tiles,
  collectionSlugById,
  promotionCollectionSlugById,
}: HomepageGridProps) {
  if (tiles.length === 0) return null;

  return (
    <section className="container-boutique py-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        Today&apos;s Picks
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => {
          if (tile.link_type === 'collection') {
            const slug = collectionSlugById[tile.link_value ?? ''];
            // A tile pointing at a collection that no longer exists (or has
            // since been deactivated) shouldn't produce a dead link — skip
            // it entirely rather than render a card that 404s.
            if (!slug) return null;
            return (
              <TileCard key={tile.id} tile={tile} href={`/collection/${slug}`} />
            );
          }

          if (tile.link_type === 'custom_url') {
            return (
              <TileCard
                key={tile.id}
                tile={tile}
                href={tile.link_value ?? ''}
                external={(tile.link_value ?? '').startsWith('http')}
              />
            );
          }

          // link_type === 'promotion' — auto-linked in Part 4a via
          // source_promotion_id, with link_value holding the promotion's
          // id. Resolve it to that promotion's collection slug so "Shop
          // Now" lands shoppers on the exact products the BOGO applies
          // to. Same dead-link guard as the collection case above: if the
          // promotion was deleted/deactivated since, skip rendering it.
          const promoSlug = promotionCollectionSlugById[tile.link_value ?? ''];
          if (!promoSlug) return <TileCard key={tile.id} tile={tile} href={null} />;
          return (
            <TileCard key={tile.id} tile={tile} href={`/collection/${promoSlug}`} />
          );
        })}
      </div>
    </section>
  );
}

function TileCard({
  tile,
  href,
  external = false,
}: {
  tile: HomepageTile;
  href: string | null;
  external?: boolean;
}) {
  const content = (
    <>
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {tile.image_url ? (
          <Image
            src={toPublicMediaUrl(tile.image_url) ?? tile.image_url}
            alt={tile.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Skeleton className="absolute inset-0 rounded-none" />
            <ImageOff className="relative h-6 w-6 text-muted-foreground/60" />
          </div>
        )}

        {tile.badge_text && (
          <span className="absolute left-2 top-2 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-secondary-foreground shadow-sm">
            {tile.badge_text}
          </span>
        )}
      </div>
    </>
  );

  const cardClass =
    'group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow duration-300 hover:shadow-lg';

  if (!href) {
    return <div className={cardClass}>{content}</div>;
  }

  if (external) {
    return (
      <a href={href} className={cardClass}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={cardClass}>
      {content}
    </Link>
  );
}
