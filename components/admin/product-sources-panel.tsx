'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Search, X, Boxes, MessageCircle, EyeOff } from 'lucide-react';
import {
  ProductSource,
  ProductSourceInput,
  ProductSourceLinkedProduct,
  fetchProductSources,
  createProductSource,
  updateProductSource,
  deleteProductSource,
  fetchProductSourceDetail,
} from '@/lib/product-sources-api';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const DEFAULT_IMAGE = 'https://placehold.co/80x100?text=No+Image';

// datetime-local <-> ISO helpers (mirrors the pattern used elsewhere for
// date inputs in this codebase — keep local time as typed by the admin)
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (): ProductSourceInput => ({
  name: '',
  whatsapp_name: '',
  whatsapp_number: '',
  source_date: toDatetimeLocal(new Date().toISOString()),
  notes: '',
});

export default function ProductSourcesPanel() {
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductSource | null>(null);
  const [form, setForm] = useState<ProductSourceInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ProductSource | null>(null);

  const [detailFor, setDetailFor] = useState<ProductSource | null>(null);
  const [detailProducts, setDetailProducts] = useState<ProductSourceLinkedProduct[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSources(
        await fetchProductSources({
          q: q || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load product sources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced re-fetch as the admin types/filters
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (s: ProductSource) => {
    setEditing(s);
    setForm({
      name: s.name,
      whatsapp_name: s.whatsapp_name || '',
      whatsapp_number: s.whatsapp_number || '',
      source_date: toDatetimeLocal(s.source_date),
      notes: s.notes || '',
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Source name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: ProductSourceInput = {
        ...form,
        source_date: form.source_date ? new Date(form.source_date).toISOString() : null,
      };
      if (editing) {
        await updateProductSource(editing.id, payload);
        toast.success('Product source updated');
      } else {
        await createProductSource(payload);
        toast.success('Product source added');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteProductSource(confirmTarget.id);
      toast.success('Product source deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  const openDetail = async (s: ProductSource) => {
    setDetailFor(s);
    setDetailLoading(true);
    setDetailProducts([]);
    try {
      const { products } = await fetchProductSourceDetail(s.id);
      setDetailProducts(products);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load products for this source');
    } finally {
      setDetailLoading(false);
    }
  };

  const hasFilters = q || from || to;

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This section is admin-only. It never appears on the storefront, in search results, or in the
          Google Merchant Center feed — nothing here is readable without an active admin session.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Product Sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${sources.length} source${sources.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add New
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, WhatsApp name or number…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="source-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="source-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="source-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="source-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setFrom('');
              setTo('');
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Source Name</th>
              <th className="px-4 py-3">WhatsApp Name</th>
              <th className="px-4 py-3">WhatsApp Number</th>
              <th className="px-4 py-3">Sourced On</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Boxes className="h-3.5 w-3.5 text-secondary" /> {s.name}
                  </span>
                  {s.notes && <div className="mt-0.5 max-w-xs truncate text-xs font-normal text-muted-foreground">{s.notes}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{s.whatsapp_name || '—'}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {s.whatsapp_number ? (
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-green-600" /> {s.whatsapp_number}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(s.source_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => openDetail(s)}
                    className="rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-secondary/20"
                  >
                    {s.product_count} product{s.product_count === 1 ? '' : 's'}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmTarget(s)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sources.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {hasFilters ? 'No sources match your search/filter.' : 'No product sources yet — add your first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Product Source' : 'Add Product Source'}</DialogTitle>
              <DialogDescription>Visible to admins only — never shown on the storefront.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ps-name">Source name *</Label>
                <Input
                  id="ps-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Surat Silk Wholesaler"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-wa-name">WhatsApp name</Label>
                  <Input
                    id="ps-wa-name"
                    value={form.whatsapp_name || ''}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp_name: e.target.value }))}
                    placeholder="e.g. Ramesh Textiles"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-wa-number">WhatsApp number</Label>
                  <Input
                    id="ps-wa-number"
                    value={form.whatsapp_number || ''}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
                    placeholder="+91…"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ps-date">Sourced on (date &amp; time)</Label>
                <Input
                  id="ps-date"
                  type="datetime-local"
                  value={form.source_date || ''}
                  onChange={(e) => setForm((f) => ({ ...f, source_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ps-notes">Notes</Label>
                <Textarea
                  id="ps-notes"
                  value={form.notes || ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything else worth remembering about this source"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Source'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this source?</DialogTitle>
            <DialogDescription>
              &quot;{confirmTarget?.name}&quot; will be removed. Products already linked to it keep their saved
              buy price, but will show as unassigned until you pick a new source.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linked products detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(v) => !v && setDetailFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Products from &quot;{detailFor?.name}&quot;</DialogTitle>
            <DialogDescription>Every product currently assigned to this source.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {detailLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : detailProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No products assigned to this source yet. Assign it from the Source field when adding or
                editing a product.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {detailProducts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded bg-muted">
                      <Image src={p.images?.[0] || DEFAULT_IMAGE} alt={p.name} fill className="object-cover" sizes="44px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ? `SKU: ${p.sku} · ` : ''}Stock: {p.stock_quantity} · {p.in_stock ? 'In stock' : 'Out of stock'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="font-semibold">{formatINR(p.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        Buy: {p.buy_price != null ? formatINR(p.buy_price) : '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
