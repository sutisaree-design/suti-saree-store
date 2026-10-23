'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2, Percent } from 'lucide-react';
import {
  Promotion,
  PromotionInput,
  fetchPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  setPromotionActive,
} from '@/lib/promotions-api';
import { fetchAdminCollections } from '@/lib/admin-collections-api';
import { AdminCollectionRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

const emptyForm: PromotionInput = {
  name: '',
  offer_type: 'buy_x_get_y',
  buy_qty: 1,
  get_qty: 1,
  free_item_discount_percent: 100,
  scope: 'all',
  collection_id: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  show_as_homepage_tile: false,
};

function offerLabel(p: Pick<Promotion, 'buy_qty' | 'get_qty' | 'free_item_discount_percent'>) {
  const discountLabel = p.free_item_discount_percent === 100 ? 'Free' : `${p.free_item_discount_percent}% off`;
  return `Buy ${p.buy_qty} Get ${p.get_qty} ${discountLabel}`;
}

export default function PromotionsPanel() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [collections, setCollections] = useState<AdminCollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromotionInput>(emptyForm);
  const [discountMode, setDiscountMode] = useState<'100' | '50' | 'custom'>('100');
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Promotion | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setPromotions(await fetchPromotions());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load promotions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetchAdminCollections()
      .then(setCollections)
      .catch((err) => {
        setCollections([]);
        toast.error(
          err instanceof Error
            ? `Failed to load collections: ${err.message}`
            : 'Failed to load collections'
        );
      });
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDiscountMode('100');
    setOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name,
      offer_type: p.offer_type,
      buy_qty: p.buy_qty,
      get_qty: p.get_qty,
      free_item_discount_percent: p.free_item_discount_percent,
      scope: p.scope,
      collection_id: p.collection_id,
      is_active: p.is_active,
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      show_as_homepage_tile: p.show_as_homepage_tile ?? false,
    });
    setDiscountMode(
      p.free_item_discount_percent === 100 ? '100' : p.free_item_discount_percent === 50 ? '50' : 'custom'
    );
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Promotion name is required');
      return;
    }
    if (!form.buy_qty || form.buy_qty < 1 || !form.get_qty || form.get_qty < 1) {
      toast.error('Buy Qty and Get Qty must be at least 1');
      return;
    }
    if (form.scope === 'collection' && !form.collection_id) {
      toast.error('Pick a collection for this promotion, or switch scope to All Products');
      return;
    }
    setSaving(true);
    try {
      const payload: PromotionInput = {
        ...form,
        collection_id: form.scope === 'collection' ? form.collection_id : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (editing) {
        await updatePromotion(editing.id, payload);
        toast.success('Promotion updated');
      } else {
        await createPromotion(payload);
        toast.success('Promotion created');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      await setPromotionActive(p.id, !p.is_active);
      setPromotions((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deletePromotion(confirmTarget.id);
      toast.success('Promotion deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${promotions.length} promotion${promotions.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Promotion
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-secondary" /> {p.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{offerLabel(p)}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {p.scope === 'all'
                    ? 'All Products'
                    : collections.find((c) => c.id === p.collection_id)?.name || 'Collection'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {p.ends_at ? new Date(p.ends_at).toLocaleDateString('en-IN') : 'No end date'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmTarget(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && promotions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No promotions yet. Add one to run your first BOGO offer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Promotion' : 'Add Promotion'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="promo-name">Name *</Label>
              <Input
                id="promo-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Buy 1 Get 1 Free — Sarees"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="buy-qty">Buy Qty *</Label>
                <Input
                  id="buy-qty"
                  type="number"
                  min={1}
                  value={form.buy_qty}
                  onChange={(e) => setForm((f) => ({ ...f, buy_qty: Number(e.target.value) }))}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="get-qty">Get Qty *</Label>
                <Input
                  id="get-qty"
                  type="number"
                  min={1}
                  value={form.get_qty}
                  onChange={(e) => setForm((f) => ({ ...f, get_qty: Number(e.target.value) }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="discount-mode">Free item discount</Label>
              <Select
                value={discountMode}
                onValueChange={(v) => {
                  const mode = v as '100' | '50' | 'custom';
                  setDiscountMode(mode);
                  if (mode === '100') setForm((f) => ({ ...f, free_item_discount_percent: 100 }));
                  if (mode === '50') setForm((f) => ({ ...f, free_item_discount_percent: 50 }));
                }}
              >
                <SelectTrigger id="discount-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100% off (fully free)</SelectItem>
                  <SelectItem value="50">50% off</SelectItem>
                  <SelectItem value="custom">Custom %</SelectItem>
                </SelectContent>
              </Select>
              {discountMode === 'custom' && (
                <Input
                  id="discount-percent"
                  type="number"
                  min={1}
                  max={100}
                  className="mt-1.5"
                  value={form.free_item_discount_percent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, free_item_discount_percent: Number(e.target.value) }))
                  }
                  placeholder="e.g. 30"
                />
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="scope">Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    scope: v as 'all' | 'collection',
                    collection_id: v === 'all' ? null : f.collection_id,
                    show_as_homepage_tile: v === 'all' ? false : f.show_as_homepage_tile,
                  }))
                }
              >
                <SelectTrigger id="scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  <SelectItem value="collection">Specific Collection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.scope === 'collection' && (
              <div className="grid gap-1.5">
                <Label htmlFor="collection">Collection *</Label>
                <Select
                  value={form.collection_id ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, collection_id: v }))}
                >
                  <SelectTrigger id="collection">
                    <SelectValue placeholder="Choose a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.scope === 'collection' && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <div>
                  <Label htmlFor="show-as-tile" className="cursor-pointer">
                    Show as homepage tile
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-adds this offer to the homepage grid — no need to build it manually in
                    Homepage Tiles.
                  </p>
                </div>
                <Switch
                  id="show-as-tile"
                  checked={!!form.show_as_homepage_tile}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, show_as_homepage_tile: v }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="starts-at">Start date (blank = starts now)</Label>
                <Input
                  id="starts-at"
                  type="date"
                  value={form.starts_at ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value || null }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ends-at">End date (blank = no end)</Label>
                <Input
                  id="ends-at"
                  type="date"
                  value={form.ends_at ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value || null }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label htmlFor="promo-active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="promo-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Promotion'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this promotion?</DialogTitle>
            <DialogDescription>
              {confirmTarget?.name} will stop applying immediately. This action cannot be undone.
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
