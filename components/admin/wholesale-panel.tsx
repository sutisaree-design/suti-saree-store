'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { fetchProducts } from '@/lib/products-api';
import {
  fetchWholesalePricing,
  createWholesaleTier,
  updateWholesaleTier,
  deleteWholesaleTier,
  WholesaleTierInput,
} from '@/lib/wholesale-api';
import { Product, WholesalePricingTier } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const emptyForm = (productId = ''): WholesaleTierInput => ({
  product_id: productId,
  min_quantity: 10,
  unit_price: 0,
  label: '',
});

export default function WholesalePanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<WholesalePricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WholesalePricingTier | null>(null);
  const [form, setForm] = useState<WholesaleTierInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<WholesalePricingTier | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([fetchProducts(), fetchWholesalePricing()]);
      setProducts(p);
      setTiers(t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load wholesale pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const tiersByProduct = useMemo(() => {
    const groups = new Map<string, WholesalePricingTier[]>();
    for (const t of tiers) {
      const arr = groups.get(t.product_id) ?? [];
      arr.push(t);
      groups.set(t.product_id, arr);
    }
    for (const arr of Array.from(groups.values())) arr.sort((a, b) => a.min_quantity - b.min_quantity);
    return groups;
  }, [tiers]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm(products[0]?.id ?? ''));
    setOpen(true);
  };

  const openEdit = (t: WholesalePricingTier) => {
    setEditing(t);
    setForm({
      product_id: t.product_id,
      min_quantity: t.min_quantity,
      unit_price: t.unit_price,
      label: t.label,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.product_id) {
      toast.error('Choose a product');
      return;
    }
    const basePrice = productMap.get(form.product_id)?.price ?? Infinity;
    if (form.min_quantity < 2) {
      toast.error('Minimum quantity must be at least 2');
      return;
    }
    if (form.unit_price <= 0) {
      toast.error('Unit price must be greater than 0');
      return;
    }
    if (form.unit_price >= basePrice) {
      toast.error('Wholesale price should be lower than the regular price');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateWholesaleTier(editing.id, form);
        toast.success('Tier updated');
      } else {
        await createWholesaleTier(form);
        toast.success('Wholesale tier added');
      }
      setOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast.error(
        message.includes('duplicate')
          ? 'A tier with this minimum quantity already exists for this product'
          : message
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteWholesaleTier(confirmTarget.id);
      toast.success('Tier deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  const productsWithTiers = products.filter((p) => tiersByProduct.has(p.id));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
            Wholesale Pricing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${tiers.length} tier${tiers.length === 1 ? '' : 's'} across ${productsWithTiers.length} product${
                  productsWithTiers.length === 1 ? '' : 's'
                }`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary" disabled={products.length === 0}>
          <Plus className="mr-1 h-4 w-4" /> Add Tier
        </Button>
      </div>

      <div className="grid gap-4">
        {productsWithTiers.map((product) => (
          <div key={product.id} className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
              {product.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="h-10 w-10 rounded-md object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted" />
              )}
              <div>
                <div className="text-sm font-semibold">{product.name}</div>
                <div className="text-xs text-muted-foreground">Regular price: {formatINR(product.price)}</div>
              </div>
            </div>
            <table className="w-full table-auto">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Min Qty</th>
                  <th className="px-4 py-2">Unit Price</th>
                  <th className="px-4 py-2">Savings</th>
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiersByProduct.get(product.id)!.map((t) => (
                  <tr key={t.id} className="border-t border-border/40">
                    <td className="px-4 py-2 text-sm font-medium">{t.min_quantity}+ units</td>
                    <td className="px-4 py-2 text-sm">{formatINR(t.unit_price)}</td>
                    <td className="px-4 py-2 text-sm text-emerald-700">
                      {Math.round(((product.price - t.unit_price) / product.price) * 100)}% off
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{t.label || '—'}</td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmTarget(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {!loading && productsWithTiers.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
            <Layers className="h-6 w-6 text-muted-foreground" />
            No wholesale tiers yet. Add one to offer bulk pricing.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Tier' : 'Add Wholesale Tier'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="wp-product">Product *</Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
                disabled={!!editing}
              >
                <SelectTrigger id="wp-product">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatINR(p.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wp-min-qty">Minimum quantity *</Label>
                <Input
                  id="wp-min-qty"
                  type="number"
                  min={2}
                  value={form.min_quantity}
                  onChange={(e) => setForm((f) => ({ ...f, min_quantity: Number(e.target.value) }))}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wp-unit-price">Unit price (₹) *</Label>
                <Input
                  id="wp-unit-price"
                  type="number"
                  min={1}
                  value={form.unit_price}
                  onChange={(e) => setForm((f) => ({ ...f, unit_price: Number(e.target.value) }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wp-label">Label (optional)</Label>
              <Input
                id="wp-label"
                value={form.label ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value || null }))}
                placeholder="e.g. Wholesale, Boutique bulk order"
              />
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Tier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this tier?</DialogTitle>
            <DialogDescription>
              This wholesale price will no longer apply. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
