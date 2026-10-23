'use client';

import { useEffect, useState } from 'react';
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
import { fetchMyVendorProfile, submitVendorProduct, triggerVendorAIProcess } from '@/lib/vendor-api';
import PhotographyGuidelines from '@/components/vendor/photography-guidelines';
import VendorPriceBreakdown from '@/components/vendor/vendor-price-breakdown';
import ReturnRtoStats from '@/components/vendor/return-rto-stats';
import StockHoldTimers from '@/components/vendor/stock-hold-timers';

const EMPTY_FORM = {
  name: '',
  fabric: '',
  category_id: '',
  category_name: '',
  available_quantity: '',
  vendor_expected_price: '',
  is_dead_stock: false,
  vendor_return_consent: false,
  images: [] as string[],
};

export default function AddVendorProductPage() {
  const { categories } = useCategories();

  const [checkingVendor, setCheckingVendor] = useState(true);
  const [vendorApproved, setVendorApproved] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMyVendorProfile()
      .then((p) => setVendorApproved(p?.status === 'approved'))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to check vendor status'))
      .finally(() => setCheckingVendor(false));
  }, []);

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

  const resetForm = () => setForm(EMPTY_FORM);

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

    if (!form.vendor_return_consent) {
      toast.error('Please accept the 2x-return policy checkbox below to continue');
      return;
    }

    setSubmitting(true);
    try {
      const created = await submitVendorProduct({
        name: form.name.trim(),
        fabric: form.fabric.trim(),
        category_id: form.category_id || null,
        category_name: form.category_name,
        available_quantity: qty,
        vendor_expected_price: form.vendor_expected_price ? Number(form.vendor_expected_price) : null,
        is_dead_stock: form.is_dead_stock,
        vendor_return_consent: form.vendor_return_consent,
        images: form.images,
      });

      // Fire-and-forget: trigger AI enrichment in the background.
      // The AI will fill description, highlights, occasion, etc. and then flip
      // the product to 'live' + send the vendor an email.
      // We deliberately do NOT await this — the vendor sees the success toast
      // immediately while AI runs in the background.
      triggerVendorAIProcess(created.id).catch(() => {});

      toast.success(
        `"${created.name}" submitted! You'll get an email once it's live.`
      );
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit product');
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingVendor) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!vendorApproved) {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">Not Available Yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only approved vendors can list products. Check your application status on your dashboard.
        </p>
        <Link href="/vendor/dashboard">
          <Button variant="outline" className="mt-4">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <PackagePlus className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-2xl font-bold text-primary">Add a Product</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Fill this in and it publishes straight to the live site — no waiting on a review. Track it
        anytime from your{' '}
        <Link href="/vendor/dashboard" className="font-medium text-primary hover:underline">
          Dashboard
        </Link>
        .
      </p>

      <div className="mt-4 space-y-4">
        <ReturnRtoStats />
        <StockHoldTimers />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border/60 bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Product Name *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Maroon Banarasi Silk Saree"
              />
            </div>
            <div>
              <Label>Fabric *</Label>
              <Input
                required
                value={form.fabric}
                onChange={(e) => setForm((f) => ({ ...f, fabric: e.target.value }))}
                placeholder="e.g. Banarasi Silk"
              />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={form.category_id} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
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
            <div>
              <Label>Quantity *</Label>
              <Input
                required
                type="number"
                min={0}
                value={form.available_quantity}
                onChange={(e) => setForm((f) => ({ ...f, available_quantity: e.target.value }))}
                placeholder="e.g. 10"
              />
            </div>
            <div>
              <Label>Your Price (optional)</Label>
              <Input
                type="number"
                min={0}
                value={form.vendor_expected_price}
                onChange={(e) => setForm((f) => ({ ...f, vendor_expected_price: e.target.value }))}
                placeholder="₹ what you'd like for this"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank and we'll price it automatically based on similar live listings. This is
                YOUR price, not the website price — pickup + delivery shipping and the platform
                markup get added on top to get the final website price (see below).
              </p>
            </div>
          </div>

          {/* Price breakdown — full width so the tiles/lines have room to breathe */}
          <VendorPriceBreakdown
            vendorPrice={form.vendor_expected_price ? Number(form.vendor_expected_price) : null}
          />

          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <Checkbox
              id="dead-stock"
              checked={form.is_dead_stock}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_dead_stock: v === true }))}
            />
            <label htmlFor="dead-stock" className="text-sm leading-snug">
              This is dead / slow-moving stock
              <span className="block text-xs text-muted-foreground">
                We'll suggest a lower price to help it sell faster.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/60 p-3">
            <Checkbox
              id="return-consent"
              required
              checked={form.vendor_return_consent}
              onCheckedChange={(v) => setForm((f) => ({ ...f, vendor_return_consent: v === true }))}
            />
            <label htmlFor="return-consent" className="text-sm leading-snug">
              I agree: if this product is returned 2 times, it will be sent back to me and its cost
              will be deducted from my next settlement. *
              <span className="block text-xs text-muted-foreground">
                Required to list — this keeps repeatedly-returned stock from being restocked and
                resold at a loss.
              </span>
            </label>
          </div>

          <div className="grid gap-1.5">
            <Label>Photos *</Label>
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
                  <div key={url + idx} className="group relative h-20 w-20 overflow-hidden rounded-md border border-border/60">
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

          <Button type="submit" className="w-full bg-primary" disabled={submitting || uploading || !form.vendor_return_consent}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publish Product'}
          </Button>
        </form>

        <PhotographyGuidelines />
      </div>
    </div>
  );
}
