'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, IndianRupee, Loader2 } from 'lucide-react';
import {
  PriceRangeBucket,
  DEFAULT_PRICE_RANGE_FILTERS,
  fetchPriceRangeFilters,
  savePriceRangeFilters,
} from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const emptyForm = { label: '', min: '', max: '' };

/** Admin > Catalog > Price Filters -- manages the buckets shown in the
 *  "Shop by Price" scrollable chip bar on /shop (see
 *  components/shop/price-range-filter-bar.tsx). Stored as a single JSON
 *  row in the generic `settings` table (key: price_range_filters), same
 *  pattern as every other admin-editable setting in lib/settings-api.ts --
 *  no schema migration needed.
 */
export default function PriceRangeFiltersPanel() {
  const [ranges, setRanges] = useState<PriceRangeBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceRangeBucket | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmTarget, setConfirmTarget] = useState<PriceRangeBucket | null>(null);

  const load = () => {
    setLoading(true);
    fetchPriceRangeFilters()
      .then(setRanges)
      .catch(() => toast.error('Failed to load price filters'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const persist = async (next: PriceRangeBucket[]) => {
    setSaving(true);
    try {
      await savePriceRangeFilters(next);
      setRanges(next);
      return true;
    } catch {
      toast.error('Failed to save price filters');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (bucket: PriceRangeBucket) => {
    setEditing(bucket);
    setForm({ label: bucket.label, min: String(bucket.min), max: String(bucket.max) });
    setOpen(true);
  };

  const handleSubmit = async () => {
    const min = Number(form.min);
    const max = Number(form.max);
    if (!form.label.trim()) {
      toast.error('Please enter a label, e.g. "Under ₹499"');
      return;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
      toast.error('Max price must be greater than min price');
      return;
    }

    const bucket: PriceRangeBucket = {
      id: editing?.id ?? `pr-${Date.now()}`,
      label: form.label.trim(),
      min,
      max,
    };

    const next = editing
      ? ranges.map((r) => (r.id === editing.id ? bucket : r))
      : [...ranges, bucket];

    const ok = await persist(next);
    if (ok) {
      setOpen(false);
      toast.success(editing ? 'Price range updated' : 'Price range added');
    }
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;
    const next = ranges.filter((r) => r.id !== confirmTarget.id);
    const ok = await persist(next);
    if (ok) {
      toast.success('Price range removed');
      setConfirmTarget(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ranges.length) return;
    const next = [...ranges];
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next);
  };

  const resetToDefaults = async () => {
    const ok = await persist(DEFAULT_PRICE_RANGE_FILTERS);
    if (ok) toast.success('Reset to default price ranges');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Price Filters</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the &quot;Shop by Price&quot; chip bar shoppers see on the Shop page.
            Add, edit, reorder or remove price bands -- changes go live immediately,
            no code/deploy needed.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={resetToDefaults} disabled={saving || loading}>
            Reset to defaults
          </Button>
          <Button onClick={openCreate} disabled={saving || loading}>
            <Plus className="mr-2 h-4 w-4" /> Add Price Range
          </Button>
        </div>
      </div>

      {/* Live preview, matching the shopper-facing chip bar styling */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </p>
        <div className="flex flex-wrap gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full border border-primary bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            All Prices
          </span>
          {ranges.map((r) => (
            <span
              key={r.id}
              className="flex items-center gap-1 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground/80"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <IndianRupee className="h-2.5 w-2.5" />
              </span>
              {r.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-16 px-4 py-3">Order</th>
              <th className="px-4 py-3">Label (shown to shoppers)</th>
              <th className="px-4 py-3">Min ₹</th>
              <th className="px-4 py-3">Max ₹</th>
              <th className="w-32 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : ranges.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No price ranges yet -- add one to show the filter bar on Shop.
                </td>
              </tr>
            ) : (
              ranges.map((r, idx) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0 || saving}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={idx === ranges.length - 1 || saving}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3">₹{r.min.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">₹{r.max.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmTarget(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Price Range' : 'Add Price Range'}</DialogTitle>
            <DialogDescription>
              This shows up as a tappable chip in the Shop page&apos;s price filter bar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="pr-label">Label</Label>
              <Input
                id="pr-label"
                placeholder="e.g. Under ₹499 or ₹499 - ₹699"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pr-min">Min price (₹)</Label>
                <Input
                  id="pr-min"
                  type="number"
                  min={0}
                  value={form.min}
                  onChange={(e) => setForm((f) => ({ ...f, min: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pr-max">Max price (₹)</Label>
                <Input
                  id="pr-max"
                  type="number"
                  min={0}
                  value={form.max}
                  onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove &quot;{confirmTarget?.label}&quot;?</DialogTitle>
            <DialogDescription>
              This price band will no longer show in the Shop page filter bar. This
              doesn&apos;t affect any products.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
