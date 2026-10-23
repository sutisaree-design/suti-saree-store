'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import {
  Coupon,
  CouponInput,
  fetchCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  setCouponActive,
  setCouponShowOnProductPage,
  setCouponShowInGooglePromotions,
} from '@/lib/coupons-api';
import { formatINR } from '@/lib/format';
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

const emptyForm: CouponInput = {
  code: '',
  discount_type: 'percentage',
  discount_value: 10,
  min_order_value: 0,
  usage_limit: null,
  expires_at: null,
  is_active: true,
  show_on_product_page: false,
  show_in_google_promotions: false,
};

export default function CouponsPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Coupon | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setCoupons(await fetchCoupons());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_value: c.min_order_value,
      usage_limit: c.usage_limit,
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : null,
      is_active: c.is_active,
      show_on_product_page: c.show_on_product_page,
      show_in_google_promotions: c.show_in_google_promotions ?? false,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.error('Coupon code is required');
      return;
    }
    if (!form.discount_value || form.discount_value <= 0) {
      toast.error('Discount value must be greater than 0');
      return;
    }
    setSaving(true);
    try {
      const payload: CouponInput = {
        ...form,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (editing) {
        await updateCoupon(editing.id, payload);
        toast.success('Coupon updated');
      } else {
        await createCoupon(payload);
        toast.success('Coupon created');
      }
      setOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      toast.error(message.includes('duplicate') ? 'A coupon with this code already exists' : message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      await setCouponActive(c.id, !c.is_active);
      setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const toggleShowOnProductPage = async (c: Coupon) => {
    try {
      await setCouponShowOnProductPage(c.id, !c.show_on_product_page);
      setCoupons((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, show_on_product_page: !x.show_on_product_page } : x))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const toggleShowInGooglePromotions = async (c: Coupon) => {
    try {
      await setCouponShowInGooglePromotions(c.id, !c.show_in_google_promotions);
      setCoupons((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, show_in_google_promotions: !x.show_in_google_promotions } : x
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteCoupon(confirmTarget.id);
      toast.success('Coupon deleted');
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
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Coupon
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Min Order</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Show on Product Page</th>
              <th className="px-4 py-3">Google Promotions</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-secondary" /> {c.code}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatINR(c.discount_value)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {c.min_order_value ? formatINR(c.min_order_value) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {c.times_used}
                  {c.usage_limit ? ` / ${c.usage_limit}` : ''}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN') : 'Never'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch
                    checked={c.show_on_product_page}
                    onCheckedChange={() => toggleShowOnProductPage(c)}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch
                    checked={!!c.show_in_google_promotions}
                    onCheckedChange={() => toggleShowInGooglePromotions(c)}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmTarget(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && coupons.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No coupons yet. Add one to run your first offer.
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
              {editing ? 'Edit Coupon' : 'Add Coupon'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="coupon-code">Code *</Label>
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="WELCOME10"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="discount-type">Discount type</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, discount_type: v as 'percentage' | 'flat' }))
                  }
                >
                  <SelectTrigger id="discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="discount-value">
                  {form.discount_type === 'percentage' ? 'Percent off' : 'Amount off (₹)'} *
                </Label>
                <Input
                  id="discount-value"
                  type="number"
                  min={1}
                  value={form.discount_value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="min-order">Minimum order value (₹)</Label>
                <Input
                  id="min-order"
                  type="number"
                  min={0}
                  value={form.min_order_value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, min_order_value: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="usage-limit">Usage limit (blank = unlimited)</Label>
                <Input
                  id="usage-limit"
                  type="number"
                  min={1}
                  value={form.usage_limit ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      usage_limit: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="expires-at">Expiry date (blank = never expires)</Label>
              <Input
                id="expires-at"
                type="date"
                value={form.expires_at ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value || null }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label htmlFor="coupon-active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="coupon-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <div>
                <Label htmlFor="coupon-show-product-page" className="cursor-pointer">
                  Show on Product Page
                </Label>
                <p className="text-xs text-muted-foreground">
                  Lists this coupon under &quot;Available Coupons&quot; on every product page
                </p>
              </div>
              <Switch
                id="coupon-show-product-page"
                checked={form.show_on_product_page}
                onCheckedChange={(v) => setForm((f) => ({ ...f, show_on_product_page: v }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <div>
                <Label htmlFor="coupon-google-promotions" className="cursor-pointer">
                  Show in Google Promotions
                </Label>
                <p className="text-xs text-muted-foreground">
                  Sends this coupon to Google Merchant Center (Shopping ads / free listings)
                </p>
              </div>
              <Switch
                id="coupon-google-promotions"
                checked={form.show_in_google_promotions}
                onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_google_promotions: v }))}
              />
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Coupon'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this coupon?</DialogTitle>
            <DialogDescription>
              {confirmTarget?.code} will stop working immediately. This action cannot be undone.
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
