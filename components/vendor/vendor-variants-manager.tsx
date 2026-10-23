'use client';

import { useEffect, useState, FormEvent } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Upload, Loader2 } from 'lucide-react';
import {
  fetchMyVendorVariants,
  createVendorVariant,
  updateVendorVariant,
  deleteVendorVariant,
  VendorVariant,
} from '@/lib/vendor-api';
import { uploadProductImage } from '@/lib/products-api';
import VendorPayoutPreview from '@/components/vendor/payout-preview';
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

interface FormState {
  color: string;
  images: string[];
  priceOverride: string;
  sizes: { size: string; stockQuantity: string }[];
}

const emptyForm = (): FormState => ({
  color: '',
  images: [],
  priceOverride: '',
  sizes: [{ size: 'Free Size', stockQuantity: '3' }],
});

interface Props {
  productId: string;
  productName: string;
  /** Whether the inline panel is expanded (controlled by the parent row's chevron). */
  expanded: boolean;
  /** Notifies the parent of the current variant count, so it can show
   *  "3 variations" in the collapsed row without opening the panel. */
  onCountChange?: (count: number) => void;
}

/**
 * Inline (non-modal) colour/size variant panel for a vendor's own product.
 * Rendered directly under the product row when the row's chevron is
 * expanded — lets the vendor view, edit, or delete existing colours, and
 * add new ones, without leaving the page. Deliberately simpler than the
 * admin variant manager (no AI colour detection, no "import from URL").
 */
export default function VendorVariantsManager({ productId, productName, expanded, onCountChange }: Props) {
  const [variants, setVariants] = useState<VendorVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorVariant | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VendorVariant | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMyVendorVariants(productId);
      setVariants(data);
      onCountChange?.(data.length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load variants');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (expanded && !loaded) load();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (v: VendorVariant) => {
    setEditing(v);
    setForm({
      color: v.color,
      images: v.images,
      priceOverride: v.price_override != null ? String(v.price_override) : '',
      sizes: v.sizes.length
        ? v.sizes.map((s) => ({ size: s.size, stockQuantity: String(s.stock_quantity) }))
        : [{ size: 'Free Size', stockQuantity: '3' }],
    });
    setFormOpen(true);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadProductImage(f, `${productName}-${form.color}`)));
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (idx: number) => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  const addSizeRow = () => setForm((f) => ({ ...f, sizes: [...f.sizes, { size: '', stockQuantity: '0' }] }));
  const removeSizeRow = (idx: number) => setForm((f) => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }));
  const updateSizeRow = (idx: number, patch: Partial<{ size: string; stockQuantity: string }>) =>
    setForm((f) => ({ ...f, sizes: f.sizes.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.color.trim()) return toast.error('Enter a colour name');
    if (form.images.length === 0) return toast.error('Add at least one photo for this colour');
    if (form.sizes.some((s) => !s.size.trim())) return toast.error('Every size row needs a size name');

    setSaving(true);
    try {
      const sizes = form.sizes.map((s) => ({ size: s.size.trim(), stock_quantity: Number(s.stockQuantity) || 0 }));
      if (editing) {
        await updateVendorVariant(editing.id, {
          color: form.color.trim(),
          images: form.images,
          price_override: form.priceOverride ? Number(form.priceOverride) : null,
          sizes,
        });
        toast.success('Variant updated');
      } else {
        await createVendorVariant({
          product_id: productId,
          color: form.color.trim(),
          images: form.images,
          price_override: form.priceOverride ? Number(form.priceOverride) : null,
          sizes,
        });
        toast.success('Variant added');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save variant');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteVendorVariant(confirmDelete.id);
      toast.success('Variant removed');
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete variant');
    }
  };

  if (!expanded) return null;

  return (
    <>
      <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Colour variations for &quot;{productName}&quot;
        </p>

        {loading ? (
          <div className="py-4 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {variants.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">No colour variations yet.</p>
            )}
            {variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card p-2.5">
                <div className="flex items-center gap-3">
                  {v.images[0] && (
                    <div className="relative h-11 w-11 overflow-hidden rounded-md border border-border/60">
                      <Image src={v.images[0]} alt={v.color} fill sizes="44px" className="object-cover" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{v.color}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.sizes.map((s) => `${s.size} (${s.stock_quantity})`).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => openEdit(v)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-destructive" onClick={() => setConfirmDelete(v)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={openNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add colour
            </Button>
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Colour' : 'Add Colour'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="vv-color">Colour name *</Label>
              <Input
                id="vv-color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="e.g. Maroon"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vv-price">Price override (₹, optional)</Label>
              <Input
                id="vv-price"
                type="number"
                min={0}
                value={form.priceOverride}
                onChange={(e) => setForm((f) => ({ ...f, priceOverride: e.target.value }))}
                placeholder="Leave blank to use the base price"
              />
              <VendorPayoutPreview
                price={form.priceOverride ? Number(form.priceOverride) : null}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Photos *</Label>
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-sm hover:border-primary/50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? 'Uploading…' : 'Upload photos'}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} disabled={uploading} />
              </label>
              <div className="flex flex-wrap gap-3">
                {form.images.map((url, idx) => (
                  <div key={idx} className="relative h-20 w-16 overflow-hidden rounded-md border border-border bg-muted">
                    <Image src={url} alt={`${form.color || 'Colour'} ${idx + 1}`} fill sizes="64px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive shadow-sm hover:bg-background"
                      aria-label="Remove image"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Sizes &amp; stock *</Label>
              <div className="grid gap-2">
                {form.sizes.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={row.size}
                      onChange={(e) => updateSizeRow(idx, { size: e.target.value })}
                      placeholder="Size (e.g. M, Free Size)"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={row.stockQuantity}
                      onChange={(e) => updateSizeRow(idx, { stockQuantity: e.target.value })}
                      placeholder="Stock"
                      className="w-24"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => removeSizeRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addSizeRow} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add size
              </Button>
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Colour'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this colour?</DialogTitle>
            <DialogDescription>
              This removes &quot;{confirmDelete?.color}&quot; and its sizes/stock. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
