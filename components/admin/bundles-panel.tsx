'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { fetchProducts } from '@/lib/products-api';
import { fetchBundlesForProduct, addBundleLink, removeBundleLink, ProductBundleRow } from '@/lib/bundles-api';
import { Product } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function BundlesPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');
  const [addId, setAddId] = useState('');
  const [links, setLinks] = useState<ProductBundleRow[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  useEffect(() => {
    fetchProducts()
      .then((p) => {
        setProducts(p);
        if (p.length > 0) setSourceId(p[0].id);
      })
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const loadLinks = async (productId: string) => {
    if (!productId) return;
    setLinksLoading(true);
    try {
      setLinks(await fetchBundlesForProduct(productId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load bundle');
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    if (sourceId) loadLinks(sourceId);
  }, [sourceId]);

  const handleAdd = async () => {
    if (!sourceId || !addId || sourceId === addId) return;
    try {
      await addBundleLink(sourceId, addId, links.length);
      setAddId('');
      toast.success('Added to bundle');
      loadLinks(sourceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add — it may already be linked');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeBundleLink(id);
      loadLinks(sourceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  const linkedIds = new Set(links.map((l) => l.bundle_product_id));
  const candidates = products.filter((p) => p.id !== sourceId && !linkedIds.has(p.id));

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" /> Frequently Bought Together
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pick a product, then choose which other products should show as "Frequently Bought
          Together" on its page. If you don't curate anything here, the storefront automatically
          falls back to real co-purchase data from past orders.
        </p>
        <p className="text-xs text-muted-foreground">
          To turn this feature on/off site-wide, go to Admin &gt; Marketing &gt; Growth Tools.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-md">
          <label className="mb-1.5 block text-sm font-medium">Product</label>
          <Select value={sourceId} onValueChange={setSourceId} disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sourceId && (
          <>
            <div className="flex max-w-md items-end gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium">Add paired product</label>
                <Select value={addId} onValueChange={setAddId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product to pair" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={!addId}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">
                Currently paired with {productMap.get(sourceId)?.name || 'this product'}
              </p>
              {linksLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No manual pairing yet — showing auto-computed suggestions on the storefront.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {links.map((link) => {
                    const p = productMap.get(link.bundle_product_id);
                    return (
                      <li key={link.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm">
                          {p?.name || 'Unknown product'}{' '}
                          {p && <span className="text-muted-foreground">— {formatINR(p.price)}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemove(link.id)}
                          aria-label="Remove"
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
