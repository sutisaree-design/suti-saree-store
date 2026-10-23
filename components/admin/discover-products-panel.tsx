'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ImageOff,
  Loader2,
  Search,
} from 'lucide-react';
import {
  DiscoverSectionSettings,
  DiscoverPickRow,
  DEFAULT_DISCOVER_SETTINGS,
  fetchDiscoverSettingsAdmin,
  saveDiscoverSettings,
  fetchDiscoverPicksAdmin,
  addDiscoverPick,
  removeDiscoverPick,
  setDiscoverPickActive,
  reorderDiscoverPicks,
} from '@/lib/discover-products-api';
import { fetchProducts } from '@/lib/products-api';
import { Product } from '@/lib/types';
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

/** Admin > Marketing > Discover Products — controls the "Discover
 *  Products For You" homepage section (rendered right after "Today's
 *  Picks"; see components/home/discover-products-section.tsx, Part 2).
 *
 *  Two independent pieces of state, saved separately:
 *   - Section settings (enabled/title/mode/sort/filters) — one JSON row
 *     in the generic `settings` table, same pattern as "Shop by Price".
 *   - Manual picks — only read by the storefront when mode = 'manual',
 *     but always editable here so an admin can pre-build the list before
 *     switching modes.
 */
export default function DiscoverProductsPanel() {
  const [settings, setSettings] = useState<DiscoverSectionSettings>(DEFAULT_DISCOVER_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [picks, setPicks] = useState<DiscoverPickRow[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [reordering, setReordering] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<DiscoverPickRow | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      setSettings(await fetchDiscoverSettingsAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Discover Products settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadPicks = async () => {
    setPicksLoading(true);
    try {
      setPicks(await fetchDiscoverPicksAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Discover Products picks');
    } finally {
      setPicksLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadPicks();
  }, []);

  const sortedPicks = [...picks].sort((a, b) => a.position - b.position);

  const saveSettingsNow = async () => {
    setSavingSettings(true);
    try {
      await saveDiscoverSettings(settings);
      toast.success('Discover Products settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setSearch('');
    if (allProducts.length === 0) {
      setProductsLoading(true);
      try {
        setAllProducts(await fetchProducts());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        setProductsLoading(false);
      }
    }
  };

  const pickedIds = useMemo(() => new Set(picks.map((p) => p.product_id)), [picks]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = q
      ? allProducts.filter((p) => p.name.toLowerCase().includes(q))
      : allProducts;
    return pool.slice(0, 30);
  }, [allProducts, search]);

  const onAdd = async (product: Product) => {
    setAddingId(product.id);
    try {
      await addDiscoverPick(product.id);
      toast.success(`${product.name} added`);
      await loadPicks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add product');
    } finally {
      setAddingId(null);
    }
  };

  const toggleActive = async (pick: DiscoverPickRow) => {
    try {
      await setDiscoverPickActive(pick.id, !pick.is_active);
      setPicks((prev) =>
        prev.map((p) => (p.id === pick.id ? { ...p, is_active: !p.is_active } : p))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await removeDiscoverPick(confirmTarget.id);
      toast.success('Removed from Discover Products');
      await loadPicks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setConfirmTarget(null);
    }
  };

  const move = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedPicks.length) return;

    const reordered = [...sortedPicks];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    const movedId = sortedPicks[index].id;
    setReordering(movedId);
    setPicks(reordered.map((p, i) => ({ ...p, position: i })));
    try {
      await reorderDiscoverPicks(reordered.map((p) => p.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reorder');
      await loadPicks();
    } finally {
      setReordering(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">
          Discover Products
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls the "Discover Products For You" section shown on the homepage right after
          Today's Picks.
        </p>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Section settings                                                */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-8 rounded-lg border border-border/60 bg-card p-5">
        <h2 className="mb-4 font-serif text-lg font-semibold text-primary">Section Settings</h2>

        {settingsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label htmlFor="discover-enabled" className="cursor-pointer">
                Show this section on the homepage
              </Label>
              <Switch
                id="discover-enabled"
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="discover-title">Section title</Label>
                <Input
                  id="discover-title"
                  value={settings.title}
                  onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))}
                  placeholder="Discover Products For You"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="discover-subtitle">Subtitle (optional)</Label>
                <Input
                  id="discover-subtitle"
                  value={settings.subtitle ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, subtitle: e.target.value || null }))}
                  placeholder="Handpicked for your taste"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="discover-mode">Mode</Label>
                <Select
                  value={settings.mode}
                  onValueChange={(v) => setSettings((s) => ({ ...s, mode: v as 'auto' | 'manual' }))}
                >
                  <SelectTrigger id="discover-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto — show live products automatically</SelectItem>
                    <SelectItem value="manual">Manual — I'll pick the exact products</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="discover-sort">Sort (Auto mode only)</Label>
                <Select
                  value={settings.sort}
                  onValueChange={(v) =>
                    setSettings((s) => ({ ...s, sort: v as 'popularity' | 'newest' }))
                  }
                  disabled={settings.mode !== 'auto'}
                >
                  <SelectTrigger id="discover-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popularity">Popularity</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="discover-page-size">Products per page</Label>
                <Input
                  id="discover-page-size"
                  type="number"
                  min={4}
                  max={48}
                  value={settings.page_size}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      page_size: Math.max(4, Math.min(48, Number(e.target.value) || 12)),
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <Label htmlFor="discover-cat-filter" className="cursor-pointer">
                  Show category filter chips
                </Label>
                <Switch
                  id="discover-cat-filter"
                  checked={settings.show_category_filter}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, show_category_filter: v }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <Label htmlFor="discover-price-filter" className="cursor-pointer">
                  Show price filter chips
                </Label>
                <Switch
                  id="discover-price-filter"
                  checked={settings.show_price_filter}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, show_price_filter: v }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveSettingsNow} disabled={savingSettings} className="bg-primary">
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Manual picks                                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-primary">Manual Picks</h2>
          <p className="text-sm text-muted-foreground">
            {settings.mode === 'manual'
              ? 'Used live by the homepage section, in this order.'
              : "Only used once Mode above is switched to Manual — safe to pre-build now."}
          </p>
        </div>
        <Button onClick={openPicker} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPicks.map((p, index) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, 'up')}
                      disabled={index === 0 || reordering === p.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 'down')}
                      disabled={index === sortedPicks.length - 1 || reordering === p.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    {p.product_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.product_image}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground">
                        <ImageOff className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-secondary" />
                        <span className="truncate">{p.product_name}</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {p.product_price != null ? `₹${p.product_price.toLocaleString('en-IN')}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {!picksLoading && sortedPicks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No products picked yet. Add one, or switch Mode to Auto above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Product picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Add Product</DialogTitle>
            <DialogDescription>Search your catalog and add a product to Discover Products.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name…"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
            {productsLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
              </div>
            ) : searchResults.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No products found.</p>
            ) : (
              searchResults.map((product) => {
                const already = pickedIds.has(product.id);
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
                  >
                    {product.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0]}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground">
                        <ImageOff className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ₹{product.price.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={already ? 'outline' : 'default'}
                      disabled={already || addingId === product.id}
                      onClick={() => onAdd(product)}
                      className={already ? '' : 'bg-primary'}
                    >
                      {already ? 'Added' : addingId === product.id ? 'Adding…' : 'Add'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Remove this product?</DialogTitle>
            <DialogDescription>
              {confirmTarget?.product_name} will no longer appear in Discover Products. This action
              cannot be undone.
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
