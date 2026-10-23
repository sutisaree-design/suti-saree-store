'use client';

import { useEffect, useState, FormEvent, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Upload, Loader2, Star, Link2 } from 'lucide-react';
import { useProducts } from '@/lib/cart-context';
import {
  fetchVariantsWithSizes,
  createVariant,
  updateVariant,
  deleteVariant,
  setDefaultVariant,
  addVariantSize,
  updateVariantSize,
  deleteVariantSize,
  uploadVariantImage,
  VariantWithSizes,
} from '@/lib/variants-api';
import { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

interface VariantFormState {
  color: string;
  slug: string;
  images: string[];
  priceOverride: string;
  metaTitle: string;
  metaDescription: string;
  isDefault: boolean;
  sizes: { size: string; stockQuantity: string }[];
}

const emptyVariantForm = (): VariantFormState => ({
  color: '',
  slug: '',
  images: [],
  priceOverride: '',
  metaTitle: '',
  metaDescription: '',
  isDefault: false,
  sizes: [{ size: 'Free Size', stockQuantity: '0' }],
});

export default function VariantsPanel() {
  const { products, loading: productsLoading } = useProducts();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [variants, setVariants] = useState<VariantWithSizes[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const appliedProductParam = useRef(false);
  const appliedNewParam = useRef(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VariantWithSizes | null>(null);
  const [form, setForm] = useState<VariantFormState>(emptyVariantForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [cropOnImport, setCropOnImport] = useState(false);
  const [confirmVariant, setConfirmVariant] = useState<VariantWithSizes | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  const loadVariants = async (productId: string) => {
    if (!productId) {
      setVariants([]);
      return;
    }
    setLoadingVariants(true);
    try {
      const data = await fetchVariantsWithSizes(productId);
      setVariants(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load variants');
    } finally {
      setLoadingVariants(false);
    }
  };

  // Coming here from Products > "Manage variants" (or the "Add colour/size
  // variants" toast after creating a product) — jump straight to that
  // product instead of making the admin find it again in the dropdown.
  useEffect(() => {
    if (appliedProductParam.current || products.length === 0) return;
    const paramProductId = searchParams.get('product');
    if (paramProductId && products.some((p) => p.id === paramProductId)) {
      setSelectedProductId(paramProductId);
    } else if (!selectedProductId) {
      setSelectedProductId(products[0].id);
    }
    appliedProductParam.current = true;
  }, [products, searchParams, selectedProductId]);

  useEffect(() => {
    if (!appliedProductParam.current || appliedNewParam.current) return;
    if (!selectedProduct) return;
    if (searchParams.get('new') === '1' && searchParams.get('product') === selectedProduct.id) {
      appliedNewParam.current = true;
      openNew();
      // Drop the params so a refresh doesn't reopen the form.
      router.replace('/admin?section=variants');
    }
  }, [selectedProduct, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadVariants(selectedProductId);
  }, [selectedProductId]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyVariantForm(),
      images: selectedProduct?.images?.length ? [selectedProduct.images[0]] : [],
    });
    setOpen(true);
  };

  const openEdit = (v: VariantWithSizes) => {
    setEditing(v);
    setForm({
      color: v.color,
      slug: v.slug,
      images: v.images,
      priceOverride: v.price_override != null ? String(v.price_override) : '',
      metaTitle: v.meta_title ?? '',
      metaDescription: v.meta_description ?? '',
      isDefault: v.is_default,
      sizes: v.sizes.length
        ? v.sizes.map((s) => ({ size: s.size, stockQuantity: String(s.stock_quantity) }))
        : [{ size: 'Free Size', stockQuantity: '0' }],
    });
    setOpen(true);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadVariantImage));
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (idx: number) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/import-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, folder: 'variants', crop: cropOnImport }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not import that image');
        return;
      }
      setForm((f) => ({ ...f, images: [...f.images, data.url] }));
      setImportUrl('');
      toast.success(cropOnImport ? 'Image imported, cropped and converted to WebP' : 'Image imported and converted to WebP');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image import failed');
    } finally {
      setImporting(false);
    }
  };

  const updateSizeRow = (idx: number, patch: Partial<{ size: string; stockQuantity: string }>) => {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const addSizeRow = () => {
    setForm((f) => ({ ...f, sizes: [...f.sizes, { size: '', stockQuantity: '0' }] }));
  };

  const removeSizeRow = (idx: number) => {
    setForm((f) => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('Pick a product first');
      return;
    }
    if (!form.color.trim()) {
      toast.error('Colour name is required');
      return;
    }
    if (form.images.length === 0) {
      toast.error('Add at least one image for this variant');
      return;
    }
    const validSizes = form.sizes.filter((s) => s.size.trim());
    if (validSizes.length === 0) {
      toast.error('Add at least one size');
      return;
    }

    setSaving(true);
    try {
      const slug =
        form.slug.trim() ||
        slugify(`${selectedProduct?.name ?? ''}-${form.color}`);
      const priceOverride = form.priceOverride ? Number(form.priceOverride) : null;

      if (editing) {
        await updateVariant(editing.id, {
          color: form.color.trim(),
          slug,
          images: form.images,
          price_override: priceOverride,
          meta_title: form.metaTitle.trim() || null,
          meta_description: form.metaDescription.trim() || null,
        });

        // Reconcile sizes: update existing, add new, delete removed.
        const existingIds = new Set(editing.sizes.map((s) => s.id));
        const keptIds = new Set<string>();
        for (const row of form.sizes) {
          if (!row.size.trim()) continue;
          const match = editing.sizes.find((s) => s.size === row.size);
          if (match) {
            keptIds.add(match.id);
            await updateVariantSize(match.id, {
              size: row.size.trim(),
              stock_quantity: Number(row.stockQuantity) || 0,
            });
          } else {
            await addVariantSize({
              variantId: editing.id,
              size: row.size.trim(),
              stockQuantity: Number(row.stockQuantity) || 0,
            });
          }
        }
        for (const id of Array.from(existingIds)) {
          if (!keptIds.has(id)) await deleteVariantSize(id);
        }

        if (form.isDefault && !editing.is_default) {
          await setDefaultVariant(selectedProductId, editing.id);
        }
        toast.success('Variant updated');
      } else {
        const created = await createVariant({
          productId: selectedProductId,
          color: form.color.trim(),
          slug,
          images: form.images,
          priceOverride,
          metaTitle: form.metaTitle.trim() || undefined,
          metaDescription: form.metaDescription.trim() || undefined,
          isDefault: form.isDefault,
          sizes: validSizes.map((s) => ({
            size: s.size.trim(),
            stockQuantity: Number(s.stockQuantity) || 0,
          })),
        });
        if (form.isDefault) {
          await setDefaultVariant(selectedProductId, created.id);
        }
        toast.success('Variant added');
      }
      setOpen(false);
      await loadVariants(selectedProductId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmVariant) return;
    try {
      await deleteVariant(confirmVariant.id);
      toast.success('Variant deleted');
      await loadVariants(selectedProductId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmVariant(null);
    }
  };

  const makeDefault = async (v: VariantWithSizes) => {
    try {
      await setDefaultVariant(selectedProductId, v.id);
      toast.success(`${v.color} set as default`);
      await loadVariants(selectedProductId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-primary sm:text-4xl">
            Product Variants
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage colour options, images, price overrides and per-size stock.
          </p>
        </div>
        <Button
          onClick={openNew}
          disabled={!selectedProductId}
          className="w-full bg-primary sm:w-auto"
        >
          <Plus className="mr-1 h-4 w-4" /> Add Variant
        </Button>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:max-w-md sm:flex-row sm:items-center sm:gap-3">
        {selectedProduct?.images?.[0] && (
          <div className="relative hidden h-12 w-10 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
            <Image src={selectedProduct.images[0]} alt="" fill sizes="40px" className="object-cover" />
          </div>
        )}
        <div className="flex-1">
          <Label htmlFor="product-picker" className="text-xs text-muted-foreground">
            Product
          </Label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger id="product-picker" className="mt-1">
              <SelectValue placeholder={productsLoading ? 'Loading products…' : 'Select a product'} />
            </SelectTrigger>
            <SelectContent>
              {products.map((p: Product) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!loadingVariants && (
          <Badge variant="outline" className="w-fit shrink-0 text-xs">
            {variants.length} colour{variants.length === 1 ? '' : 's'}
          </Badge>
        )}
      </div>

      {loadingVariants ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          No colour variants yet for this product. Add one to create an independent SEO page for
          that colour.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((v) => (
            <div
              key={v.id}
              className={`rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm ${
                v.is_default ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border/60'
              }`}
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {v.images[0] ? (
                    <Image src={v.images[0]} alt={v.color} fill sizes="64px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      No image
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{v.color}</p>
                    {v.is_default && (
                      <Badge className="bg-primary text-primary-foreground">
                        <Star className="mr-1 h-3 w-3 fill-current" /> Default
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">/{v.slug}</p>
                  {v.price_override != null && (
                    <p className="text-xs font-medium text-secondary-foreground">
                      Price override: ₹{v.price_override}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {v.sizes.map((s) => (
                  <Badge
                    key={s.id}
                    variant="outline"
                    className={`text-xs ${
                      s.stock_quantity === 0
                        ? 'border-destructive/40 text-destructive'
                        : s.stock_quantity <= 3
                        ? 'border-amber-400 text-amber-600'
                        : ''
                    }`}
                  >
                    {s.size}: {s.stock_quantity}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                <Button size="sm" variant="outline" onClick={() => openEdit(v)} className="col-span-1">
                  <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                {!v.is_default ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => makeDefault(v)}
                    className="col-span-1"
                  >
                    <Star className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Make default</span>
                  </Button>
                ) : (
                  <div className="col-span-1" />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-1 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmVariant(v)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Variant' : 'Add Variant'}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct ? `For "${selectedProduct.name}"` : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-color">Colour *</Label>
                <Input
                  id="v-color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="e.g. Maroon"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-slug">SEO Slug (optional)</Label>
                <Input
                  id="v-slug"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="auto-generated"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="v-price">Price override (₹, optional)</Label>
              <Input
                id="v-price"
                type="number"
                min={0}
                value={form.priceOverride}
                onChange={(e) => setForm((f) => ({ ...f, priceOverride: e.target.value }))}
                placeholder="Leave blank to use base product price"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Images *</Label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-sm hover:border-primary/50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{uploading ? 'Uploading…' : 'Upload to Storage'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Paste any public image URL (Amazon, Google, etc.)"
                  className="max-w-md"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      importFromUrl();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={importFromUrl}
                  disabled={importing || !importUrl.trim()}
                >
                  {importing ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-1.5 h-4 w-4" />
                  )}
                  {importing ? 'Importing…' : 'Import from URL'}
                </Button>
                <label className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs">
                  <Switch checked={cropOnImport} onCheckedChange={setCropOnImport} className="scale-90" />
                  <span className="font-medium">Crop</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                {form.images.map((url, idx) => (
                  <div key={idx} className="relative h-20 w-16 overflow-hidden rounded-md border border-border bg-muted">
                    <Image src={url} alt={`${form.color || 'Variant'} image ${idx + 1}`} fill sizes="64px" className="object-cover" />
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
              <Label>Sizes & stock *</Label>
              <div className="grid gap-2">
                {form.sizes.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={row.size}
                      onChange={(e) => updateSizeRow(idx, { size: e.target.value })}
                      placeholder="Size (e.g. M)"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={row.stockQuantity}
                      onChange={(e) => updateSizeRow(idx, { stockQuantity: e.target.value })}
                      placeholder="Stock"
                      className="w-28"
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

            <div className="grid gap-1.5">
              <Label htmlFor="v-meta-title">Meta title (SEO, optional)</Label>
              <Input
                id="v-meta-title"
                value={form.metaTitle}
                onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-meta-desc">Meta description (SEO, optional)</Label>
              <Input
                id="v-meta-desc"
                value={form.metaDescription}
                onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Set as default colour for this product
            </label>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Variant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmVariant} onOpenChange={(o) => !o && setConfirmVariant(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this variant?</DialogTitle>
            <DialogDescription>
              This removes the "{confirmVariant?.color}" colour option and its SEO page. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
