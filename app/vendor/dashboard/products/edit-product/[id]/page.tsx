'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Upload, X, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadProductImage } from '@/lib/products-api';
import { useCategories } from '@/lib/cart-context';
import {
  fetchMyVendorProducts,
  updateVendorProduct,
  triggerVendorAIProcess,
  type VendorProductRow,
} from '@/lib/vendor-api';
import PhotographyGuidelines from '@/components/vendor/photography-guidelines';
import VendorPriceBreakdown from '@/components/vendor/vendor-price-breakdown';

export default function EditVendorProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { categories } = useCategories();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<VendorProductRow | null>(null);

  const [form, setForm] = useState({
    name: '',
    fabric: '',
    category_id: '',
    category_name: '',
    available_quantity: '',
    vendor_expected_price: '',
    is_dead_stock: false,
    images: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load the product to pre-fill the form
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchMyVendorProducts()
      .then((products) => {
        const found = products.find((p) => p.id === id) ?? null;
        if (!found) {
          toast.error('Product not found');
          router.replace('/vendor/dashboard/products');
          return;
        }
        setProduct(found);
        setForm({
          name: found.name,
          fabric: found.fabric ?? '',
          category_id: '',          // category_id is not returned to vendor; keep blank
          category_name: found.category_name ?? '',
          available_quantity: String(found.available_quantity),
          vendor_expected_price: found.vendor_expected_price != null ? String(found.vendor_expected_price) : '',
          is_dead_stock: found.is_dead_stock,
          images: found.images ?? [],
        });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load product'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((file) => uploadProductImage(file, form.name)));
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

  const handleCategoryChange = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) => ({ ...f, category_id: categoryId, category_name: cat?.name || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.fabric.trim() || !form.category_name) {
      toast.error('Please fill in product name, fabric and category');
      return;
    }
    if (form.images.length === 0) {
      toast.error('Upload at least one product photo');
      return;
    }
    const qty = Number(form.available_quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateVendorProduct(id, {
        name: form.name.trim(),
        fabric: form.fabric.trim(),
        category_id: form.category_id || null,
        category_name: form.category_name,
        available_quantity: qty,
        vendor_expected_price: form.vendor_expected_price ? Number(form.vendor_expected_price) : null,
        is_dead_stock: form.is_dead_stock,
        images: form.images,
      });

      // Fire-and-forget: trigger AI re-enrichment in the background.
      // Pass isEdit=true so the vendor gets the edit-specific email.
      // Product URL (slug) is not changed — all existing links still work.
      triggerVendorAIProcess(updated.id, true).catch(() => {});

      toast.success(
        `Changes saved! You'll get an email once "${updated.name}" is live again.`
      );
      router.replace('/vendor/dashboard/products');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <PackagePlus className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-2xl font-bold text-primary">Edit Product</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Update the details below and click <strong>Publish Changes</strong>. AI will re-generate the full
        listing and email you when it&apos;s live. The product URL won&apos;t change.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border/60 bg-card p-5">
          {/* Product Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="name">
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Maroon Banarasi Silk Saree"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          {/* Fabric & Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fabric">
                Fabric <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fabric"
                placeholder="e.g. Banarasi Silk"
                value={form.fabric}
                onChange={(e) => setForm((f) => ({ ...f, fabric: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category_id || undefined}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.category_name || 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="qty">
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qty"
                type="number"
                min={0}
                placeholder="e.g. 10"
                value={form.available_quantity}
                onChange={(e) => setForm((f) => ({ ...f, available_quantity: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Your Price (optional)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                placeholder="₹ what you'd like for this"
                value={form.vendor_expected_price}
                onChange={(e) => setForm((f) => ({ ...f, vendor_expected_price: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank and we&apos;ll price it automatically based on similar live listings. This
                is YOUR price, not the website price — pickup + delivery shipping and the platform
                markup get added on top to get the final website price (see below).
              </p>
            </div>
          </div>

          {/* Price breakdown — full width so the tiles/lines have room to breathe */}
          <VendorPriceBreakdown
            vendorPrice={form.vendor_expected_price ? Number(form.vendor_expected_price) : null}
          />

          {/* Dead stock checkbox */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="dead-stock"
              checked={form.is_dead_stock}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_dead_stock: Boolean(v) }))}
            />
            <label htmlFor="dead-stock" className="grid gap-0.5">
              <span className="text-sm font-medium leading-none">
                This is dead / slow-moving stock
              </span>
              <span className="text-xs text-muted-foreground">
                We&apos;ll suggest a lower price to help it sell faster.
              </span>
            </label>
          </div>

          {/* Photos */}
          <div className="grid gap-1.5">
            <Label>Photos <span className="text-destructive">*</span></Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-sm hover:border-primary/50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? 'Uploading…' : 'Upload Photos'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onUpload}
                  disabled={uploading}
                />
              </label>
              <span className="text-xs text-muted-foreground">Follow the checklist on the right.</span>
            </div>
            {form.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.images.map((url, idx) => (
                  <div
                    key={url + idx}
                    className="group relative h-20 w-20 overflow-hidden rounded-md border border-border/60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              className="flex-1 bg-primary"
              disabled={submitting || uploading}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publish Changes'}
            </Button>
            <Link href="/vendor/dashboard/products">
              <Button type="button" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </Link>
          </div>
        </form>

        <PhotographyGuidelines />
      </div>
    </div>
  );
}
