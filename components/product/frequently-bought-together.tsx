'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toPublicMediaUrl } from '@/lib/media-url';
import { Plus } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { useCart } from '@/lib/cart-context';
import { fetchProductBundle } from '@/lib/bundles-api';
import { fetchGrowthSettings } from '@/lib/growth-api';
import { Button } from '@/components/ui/button';

export default function FrequentlyBoughtTogether({ productId }: { productId: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState(true);
  const { addItem } = useCart();

  useEffect(() => {
    fetchGrowthSettings()
      .then((s) => setEnabled(s.bundles_enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProductBundle(productId)
      .then((products) => {
        if (cancelled) return;
        setItems(products);
        setSelected(new Set(products.map((p) => p.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!enabled || items.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedItems = items.filter((p) => selected.has(p.id));
  const total = selectedItems.reduce((sum, p) => sum + p.price, 0);

  const addSelected = () => {
    if (selectedItems.length === 0) return;
    selectedItems.forEach((p) => addItem(p, p.sizes[0], 1));
  };

  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-serif text-2xl font-bold text-primary">Frequently Bought Together</h2>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {items.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <div className="relative">
                <Link href={`/product/${p.slug}`}>
                  <Image
                    src={toPublicMediaUrl(p.images[0]) || 'https://placehold.co/200x250?text=No+Image'}
                    alt={p.name}
                    width={92}
                    height={115}
                    className="rounded-md border border-border object-cover"
                  />
                </Link>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="absolute -right-1 -top-1 h-5 w-5 accent-primary"
                  aria-label={`Include ${p.name}`}
                />
              </div>
              <span className="max-w-[92px] truncate text-xs font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">{formatINR(p.price)}</span>
            </label>
            {i < items.length - 1 && <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <p className="text-sm">
          Total for {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}:{' '}
          <span className="font-serif text-lg font-bold text-primary">{formatINR(total)}</span>
        </p>
        <Button onClick={addSelected} disabled={selectedItems.length === 0}>
          Add selected to bag
        </Button>
      </div>
    </section>
  );
}
