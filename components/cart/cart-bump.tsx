'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import { useCart } from '@/lib/cart-context';
import { formatINR } from '@/lib/format';
import {
  CheckoutBumpSettings,
  DEFAULT_CHECKOUT_BUMP_SETTINGS,
  fetchCheckoutBumpSettings,
} from '@/lib/checkout-bump-api';
import { fetchProductById } from '@/lib/products-api';
import { Product } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Same admin-configured bump product/price as the checkout page (Admin ->
 * Marketing -> Checkout Bump) — shown a step earlier too, in the cart
 * drawer and the full cart page, so the customer can already say yes
 * before reaching checkout. Self-contained: reads/writes the cart directly,
 * no props needed from the parent besides sizing.
 */
export default function CartBump({ compact = false }: { compact?: boolean }) {
  const { items, addItem, removeItem } = useCart();
  const [settings, setSettings] = useState<CheckoutBumpSettings>(DEFAULT_CHECKOUT_BUMP_SETTINGS);
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchCheckoutBumpSettings()
      .then(async (s) => {
        setSettings(s);
        if (s.enabled && s.product_id) {
          const p = await fetchProductById(s.product_id).catch(() => null);
          setProduct(p);
        }
      })
      .catch(() => {});
  }, []);

  if (!settings.enabled || !product) return null;

  const size = product.sizes?.[0] || 'Free Size';
  const inCart = items.some((i) => i.product.id === product.id);
  if (inCart) return null;

  const price = Math.round(product.price * (1 - settings.discount_percent / 100));

  const toggle = (checked: boolean) => {
    if (checked) {
      addItem({ ...product, price }, size, 1, { isBump: true });
    } else {
      removeItem(product.id, size, product.colors?.[0] ?? null);
    }
  };

  return (
    <div
      className={`rounded-lg border border-dashed border-primary/40 bg-primary/5 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      {!compact && <p className="text-sm font-semibold text-primary">{settings.headline}</p>}
      <label className={`flex cursor-pointer items-start gap-3 ${compact ? '' : 'mt-2'}`}>
        <Checkbox className="mt-1" checked={inCart} onCheckedChange={(v) => toggle(v === true)} />
        <div className={`relative shrink-0 overflow-hidden rounded-md bg-muted ${compact ? 'h-12 w-10' : 'h-14 w-12'}`}>
          <Image
            src={toPublicMediaUrl(product.images[0]) || 'https://placehold.co/48x56?text=No+Image'}
            alt={product.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        </div>
        <div className="flex-1">
          {compact && <p className="text-xs font-semibold text-primary">{settings.headline}</p>}
          <p className="text-sm font-medium leading-tight">{product.name}</p>
          <p className="mt-0.5 text-sm">
            <span className="font-semibold text-primary">{formatINR(price)}</span>
            {settings.discount_percent > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground line-through">
                {formatINR(product.price)}
              </span>
            )}
          </p>
          {!compact && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{settings.subtext}</p>
          )}
        </div>
      </label>
    </div>
  );
}
