'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ExternalLink,
  Layers,
  Store,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { useProducts } from '@/lib/cart-context';
import {
  fetchAdminCollections,
  fetchAdminCollection,
  createAdminCollection,
  updateAdminCollection,
  deleteAdminCollection,
  fetchAdminVendorCollections,
  AdminVendorCollectionRow,
} from '@/lib/admin-collections-api';
import { fetchActivePromotions, ActivePromotion } from '@/lib/promotions-api';
import { AdminCollectionRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

type StatusFilter = 'all' | 'active' | 'inactive';

type Row =
  | { source: 'admin'; data: AdminCollectionRow }
  | { source: 'vendor'; data: AdminVendorCollectionRow };

export default function CollectionsPanel() {
  const { products } = useProducts();

  const [collections, setCollections] = useState<AdminCollectionRow[]>([]);
  const [vendorCollections, setVendorCollections] = useState<AdminVendorCollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCollectionRow | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showOnHomepage, setShowOnHomepage] = useState(true);
  const [showBogoBadge, setShowBogoBadge] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  /** Per product id, the list of variation keys ('base' for the product's
   *  own colour, otherwise a `product_variants.slug`) excluded from this
   *  collection. A product with no entry here contributes every variation
   *  it has — same as before this feature existed. */
  const [variantExclusions, setVariantExclusions] = useState<Record<string, string[]>>({});
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [activePromotions, setActivePromotions] = useState<ActivePromotion[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [minPriceFilter, setMinPriceFilter] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('');
  const [percentOffFilter, setPercentOffFilter] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<AdminCollectionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminCollections();
      setCollections(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
    try {
      const vendorRows = await fetchAdminVendorCollections();
      setVendorCollections(vendorRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load vendor collections');
    }
  };

  useEffect(() => {
    load();
    fetchActivePromotions().then(setActivePromotions);
  }, []);

  /** Product id -> a short "Buy 2 Get 1" style label, for every product
   *  that's already covered by a live promotion (scope='all' covers every
   *  product; scope='collection' covers just that collection's products).
   *  Shown in the picker so the admin doesn't accidentally add the same
   *  product into a second BOGO collection and stack/duplicate the offer. */
  const promoLabelByProductId = useMemo(() => {
    const map = new Map<string, string>();
    const label = (p: ActivePromotion) => `Buy ${p.buy_qty} Get ${p.get_qty}`;
    const allScopePromo = activePromotions.find((p) => p.scope === 'all');
    if (allScopePromo) {
      for (const p of products) map.set(p.id, label(allScopePromo));
    }
    for (const promo of activePromotions) {
      if (promo.scope !== 'collection' || !promo.product_ids) continue;
      for (const id of promo.product_ids) {
        if (!map.has(id)) map.set(id, label(promo));
      }
    }
    return map;
  }, [activePromotions, products]);

  const allRows: Row[] = useMemo(
    () => [
      ...collections.map((c): Row => ({ source: 'admin', data: c })),
      ...vendorCollections.map((v): Row => ({ source: 'vendor', data: v })),
    ],
    [collections, vendorCollections]
  );

  const counts = useMemo(
    () => ({
      all: allRows.length,
      active: allRows.filter((r) => (r.source === 'admin' ? r.data.is_active : true)).length,
      inactive: allRows.filter((r) => (r.source === 'admin' ? !r.data.is_active : false)).length,
    }),
    [allRows]
  );

  const filtered = useMemo(() => {
    let list = allRows;
    if (statusFilter === 'active') list = list.filter((r) => (r.source === 'admin' ? r.data.is_active : true));
    if (statusFilter === 'inactive') list = list.filter((r) => (r.source === 'admin' ? !r.data.is_active : false));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const d = r.data;
        return (
          d.name.toLowerCase().includes(q) ||
          d.slug.toLowerCase().includes(q) ||
          (r.source === 'admin' && (r.data.description ?? '').toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [allRows, statusFilter, searchQuery]);

  const productCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (categoryFilter !== 'all') list = list.filter((p) => p.category === categoryFilter);
    const minPrice = parseFloat(minPriceFilter);
    if (!Number.isNaN(minPrice)) list = list.filter((p) => p.price >= minPrice);
    const maxPrice = parseFloat(maxPriceFilter);
    if (!Number.isNaN(maxPrice)) list = list.filter((p) => p.price <= maxPrice);
    const minPercentOff = parseFloat(percentOffFilter);
    if (!Number.isNaN(minPercentOff)) {
      list = list.filter((p) => {
        if (!p.mrp || p.mrp <= p.price) return false;
        const off = ((p.mrp - p.price) / p.mrp) * 100;
        return off >= minPercentOff;
      });
    }
    const q = productSearch.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [products, productSearch, categoryFilter, minPriceFilter, maxPriceFilter, percentOffFilter]);

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedProductIds.includes(p.id));

  const toggleSelectAllFiltered = () => {
    setSelectedProductIds((prev) => {
      if (allFilteredSelected) {
        const filteredIds = new Set(filteredProducts.map((p) => p.id));
        return prev.filter((id) => !filteredIds.has(id));
      }
      const merged = new Set(prev);
      filteredProducts.forEach((p) => merged.add(p.id));
      return Array.from(merged);
    });
  };

  const openNew = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setDescription('');
    setIsActive(true);
    setShowOnHomepage(true);
    setShowBogoBadge(true);
    setProductSearch('');
    setCategoryFilter('all');
    setMinPriceFilter('');
    setMaxPriceFilter('');
    setPercentOffFilter('');
    setVariantExclusions({});
    setExpandedProductIds(new Set());
    setOpen(true);
  };

  const openEdit = async (c: AdminCollectionRow) => {
    setEditing(c);
    setName(c.name);
    setSlug(c.slug);
    setDescription(c.description ?? '');
    setIsActive(c.is_active);
    setShowOnHomepage(c.show_on_homepage);
    setShowBogoBadge(c.show_bogo_badge);
    setSelectedProductIds([]);
    setProductSearch('');
    setCategoryFilter('all');
    setMinPriceFilter('');
    setMaxPriceFilter('');
    setPercentOffFilter('');
    setVariantExclusions({});
    setExpandedProductIds(new Set());
    setOpen(true);
    setLoadingProducts(true);
    try {
      const { product_ids, variant_exclusions } = await fetchAdminCollection(c.id);
      setSelectedProductIds(product_ids);
      setVariantExclusions(variant_exclusions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load collection products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleProductExpanded = (id: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Every selectable variation of a product: its own base colour first
   *  (key 'base'), then each `product_variants` colour (key = that
   *  variant's slug). Products with no added colour variants just get the
   *  one 'base' entry, so the expand toggle only ever shows for products
   *  that actually have more than one. */
  const variationsFor = (p: (typeof products)[number]) => {
    const list: { key: string; color: string; image?: string | null }[] = [
      { key: 'base', color: p.colors?.[0] || p.name, image: p.images?.[0] },
    ];
    for (const v of p.variant_list ?? []) {
      list.push({ key: v.slug, color: v.color || v.slug, image: v.image });
    }
    return list;
  };

  const isVariantIncluded = (productId: string, variantKey: string) =>
    !(variantExclusions[productId] ?? []).includes(variantKey);

  const toggleVariant = (productId: string, variantKey: string) => {
    setVariantExclusions((prev) => {
      const current = prev[productId] ?? [];
      const next = current.includes(variantKey)
        ? current.filter((k) => k !== variantKey)
        : [...current, variantKey];
      const updated = { ...prev };
      if (next.length > 0) updated[productId] = next;
      else delete updated[productId];
      return updated;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Collection name is required');
      return;
    }
    setSaving(true);
    try {
      const selectedIdSet = new Set(selectedProductIds);
      const trimmedExclusions: Record<string, string[]> = {};
      for (const [productId, keys] of Object.entries(variantExclusions)) {
        if (selectedIdSet.has(productId) && keys.length > 0) trimmedExclusions[productId] = keys;
      }
      const payload = {
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        description: description.trim() || null,
        is_active: isActive,
        show_on_homepage: showOnHomepage,
        show_bogo_badge: showBogoBadge,
        product_ids: selectedProductIds,
        variant_exclusions: trimmedExclusions,
      };
      if (editing) {
        await updateAdminCollection(editing.id, payload);
        toast.success('Collection updated');
      } else {
        await createAdminCollection(payload);
        toast.success('Collection created');
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
    setDeleting(true);
    try {
      await deleteAdminCollection(confirmTarget.id);
      toast.success('Collection deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setConfirmTarget(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated product groups you manage directly, shown together with every approved vendor&rsquo;s
            automatic &ldquo;&lt;Vendor&gt;&rsquo;s Collection&rdquo; page (marked <Store className="inline h-3 w-3 align-text-top" />, read-only here — manage those from the Vendors tab). Each one gets its own page at /collection/[slug].
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add New Collection
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {([
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ] as { value: StatusFilter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      <div className="mb-4 relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search name, slug, description…"
          className="pl-9 pr-8"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const d = r.data;
              return (
                <tr key={`${r.source}-${d.id}`} className="border-t">
                  <td className="px-4 py-3 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {r.source === 'vendor' && (
                        <span title="Vendor's automatic collection">
                          <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </span>
                      )}
                      {d.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <a
                      href={`/collection/${d.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                    >
                      {d.slug}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {d.product_count} {d.product_count === 1 ? 'product' : 'products'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.source === 'vendor' ? (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Vendor</Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          className={
                            r.data.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-100'
                              : 'bg-muted text-muted-foreground hover:bg-muted'
                          }
                        >
                          {r.data.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {!r.data.show_on_homepage && (
                          <span
                            title="Hidden from the homepage &ldquo;Shop by Collection&rdquo; row — still reachable via a Promotion or Homepage Tile link"
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <EyeOff className="h-3 w-3" />
                            Off homepage
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.source === 'vendor' ? (
                      <span className="text-xs text-muted-foreground">Manage in Vendors tab</span>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(r.data)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmTarget(r.data)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && allRows.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No collections match your search/filter.
                </td>
              </tr>
            )}
            {!loading && allRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  No collections yet. Add one to get started.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Collection' : 'Add New Collection'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="coll-name">Name *</Label>
              <Input
                id="coll-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali Specials"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="coll-slug">Slug (optional — auto-generated if left blank)</Label>
              <Input
                id="coll-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugify(name) || 'diwali-specials'}
              />
              <p className="text-xs text-muted-foreground">
                Public page: /collection/{slug.trim() || slugify(name) || 'diwali-specials'}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="coll-desc">Description</Label>
              <Textarea
                id="coll-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description shown on the collection page"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="coll-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="coll-active" className="text-sm text-muted-foreground">
                Active (visible at /collection/{slug.trim() || slugify(name) || '…'})
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="coll-show-on-homepage"
                checked={showOnHomepage}
                onCheckedChange={setShowOnHomepage}
              />
              <Label htmlFor="coll-show-on-homepage" className="text-sm text-muted-foreground">
                Show on homepage (in the &ldquo;Shop by Collection&rdquo; row). Turn this off to
                keep the collection reachable only via a Promotion or Homepage Tile link.
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="coll-show-bogo-badge"
                checked={showBogoBadge}
                onCheckedChange={setShowBogoBadge}
              />
              <Label htmlFor="coll-show-bogo-badge" className="text-sm text-muted-foreground">
                Show &ldquo;Buy X Get Y&rdquo; badge on the shop grid and product page when a
                Promotion targets this collection. Turn this off to keep the discount live
                without advertising it on every product card.
              </Label>
            </div>

            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Products ({selectedProductIds.length} selected)</Label>
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  disabled={filteredProducts.length === 0}
                  className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
                >
                  {(() => {
                    const bits: string[] = [];
                    if (categoryFilter !== 'all') bits.push(categoryFilter);
                    if (minPriceFilter && !Number.isNaN(parseFloat(minPriceFilter)))
                      bits.push(`over ₹${minPriceFilter}`);
                    if (maxPriceFilter && !Number.isNaN(parseFloat(maxPriceFilter)))
                      bits.push(`under ₹${maxPriceFilter}`);
                    if (percentOffFilter && !Number.isNaN(parseFloat(percentOffFilter)))
                      bits.push(`${percentOffFilter}%+ off`);
                    const suffix = bits.length ? ` in ${bits.join(', ')}` : '';
                    return allFilteredSelected
                      ? `Deselect all${suffix} (${filteredProducts.length})`
                      : `Select all${suffix} (${filteredProducts.length})`;
                  })()}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[10rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products to add…"
                    className="pl-9"
                  />
                </div>
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ≥ ₹
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={minPriceFilter}
                    onChange={(e) => setMinPriceFilter(e.target.value)}
                    placeholder="Min price"
                    className="pl-8"
                  />
                </div>
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ≤ ₹
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={maxPriceFilter}
                    onChange={(e) => setMaxPriceFilter(e.target.value)}
                    placeholder="Max price"
                    className="pl-8"
                  />
                </div>
                <div className="relative w-32 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={percentOffFilter}
                    onChange={(e) => setPercentOffFilter(e.target.value)}
                    placeholder="Min % off"
                    className="pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                Price and % off filters only help you find products to add — they filter this picker
                list, not the live collection (products aren&apos;t auto-added/removed later if their
                price changes).
              </p>
              {productCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      categoryFilter === 'all'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/60 text-muted-foreground hover:bg-muted/60'
                    }`}
                  >
                    All categories
                  </button>
                  {productCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        categoryFilter === cat
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/60 text-muted-foreground hover:bg-muted/60'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-72 overflow-y-auto rounded-md border border-border/60">
                {loadingProducts ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">Loading products…</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No products match.</p>
                ) : (
                  filteredProducts.map((p) => {
                    const variations = variationsFor(p);
                    const hasVariations = variations.length > 1;
                    const isExpanded = expandedProductIds.has(p.id);
                    const promoLabel = promoLabelByProductId.get(p.id);
                    return (
                      <div key={p.id} className="border-b border-border/40 last:border-b-0">
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(p.id)}
                            onChange={() => toggleProduct(p.id)}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.default_variant_image || p.images?.[0] || ''}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md border border-border/60 bg-muted object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.visibility = 'hidden';
                            }}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="truncate">{p.name}</span>
                              {promoLabel && (
                                <span
                                  title="This product is already covered by an active promotion — adding it here too may stack/duplicate the offer."
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                                >
                                  <Gift className="h-3 w-3" />
                                  {promoLabel}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.mrp && p.mrp > p.price ? (
                                <>
                                  <span className="font-medium text-secondary">₹{p.price}</span>{' '}
                                  <span className="line-through">₹{p.mrp}</span>
                                </>
                              ) : (
                                <span className="font-medium">₹{p.price}</span>
                              )}
                            </span>
                          </span>
                          {hasVariations && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                toggleProductExpanded(p.id);
                              }}
                              title={`${variations.length} colour variations`}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </label>
                        {hasVariations && isExpanded && (
                          <div className="space-y-1 border-t border-border/30 bg-muted/20 px-3 py-2 pl-11">
                            <p className="text-[11px] text-muted-foreground">
                              Untick a colour to leave it out of this collection while keeping the
                              rest of the product in.
                            </p>
                            {variations.map((v) => (
                              <label
                                key={v.key}
                                className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={isVariantIncluded(p.id, v.key)}
                                  disabled={!selectedProductIds.includes(p.id)}
                                  onChange={() => toggleVariant(p.id, v.key)}
                                  className="h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-40"
                                />
                                {v.image && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={v.image}
                                    alt=""
                                    className="h-6 w-6 shrink-0 rounded border border-border/60 bg-muted object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.visibility = 'hidden';
                                    }}
                                  />
                                )}
                                <span className={selectedProductIds.includes(p.id) ? '' : 'text-muted-foreground'}>
                                  {v.color}
                                  {v.key === 'base' && <span className="text-muted-foreground"> (default)</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Collection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this collection?</DialogTitle>
            <DialogDescription>
              {confirmTarget && confirmTarget.product_count > 0
                ? `${confirmTarget.product_count} product${
                    confirmTarget.product_count === 1 ? '' : 's'
                  } are in this collection. Deleting it will not delete those products, just removes this
                    curated grouping and its public page. This action cannot be undone.`
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
