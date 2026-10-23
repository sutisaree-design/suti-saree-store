'use client';

import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, ArrowUp, ArrowDown, ImageOff, Upload, Loader2 } from 'lucide-react';
import {
  HomepageTile,
  HomepageTileInput,
  HomepageTileLinkType,
  fetchHomepageTilesAdmin,
  createHomepageTile,
  updateHomepageTile,
  deleteHomepageTile,
  setHomepageTileActive,
  reorderHomepageTiles,
  uploadHomepageTileImage,
} from '@/lib/homepage-tiles-api';
import { fetchAdminCollections } from '@/lib/admin-collections-api';
import { fetchPromotions, Promotion } from '@/lib/promotions-api';
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

const emptyForm: HomepageTileInput = {
  title: '',
  subtitle: null,
  badge_text: null,
  price_label: null,
  image_url: null,
  cta_label: 'Shop Now',
  link_type: 'collection',
  link_value: null,
  is_active: true,
};

function linkSummary(
  tile: HomepageTile,
  collections: AdminCollectionRow[],
  promotions: Promotion[]
) {
  if (tile.link_type === 'collection') {
    return collections.find((c) => c.id === tile.link_value)?.name || 'Collection (not set)';
  }
  if (tile.link_type === 'promotion') {
    return promotions.find((p) => p.id === tile.link_value)?.name || 'Promotion (not set)';
  }
  return tile.link_value || 'URL (not set)';
}

export default function HomepageTilesPanel() {
  const [tiles, setTiles] = useState<HomepageTile[]>([]);
  const [collections, setCollections] = useState<AdminCollectionRow[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HomepageTile | null>(null);
  const [form, setForm] = useState<HomepageTileInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<HomepageTile | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTiles(await fetchHomepageTilesAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load homepage tiles');
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
    fetchPromotions()
      .then(setPromotions)
      .catch((err) => {
        setPromotions([]);
        toast.error(
          err instanceof Error
            ? `Failed to load promotions: ${err.message}`
            : 'Failed to load promotions'
        );
      });
  }, []);

  // Tiles are always shown ordered by position, ascending.
  const sortedTiles = [...tiles].sort((a, b) => a.position - b.position);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (t: HomepageTile) => {
    setEditing(t);
    setForm({
      title: t.title,
      subtitle: t.subtitle,
      badge_text: t.badge_text,
      price_label: t.price_label,
      image_url: t.image_url,
      cta_label: t.cta_label,
      link_type: t.link_type,
      link_value: t.link_value,
      is_active: t.is_active,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Tile title is required');
      return;
    }
    if (form.link_type !== 'custom_url' && !form.link_value) {
      toast.error(
        form.link_type === 'collection' ? 'Pick a collection for this tile' : 'Pick a promotion for this tile'
      );
      return;
    }
    if (form.link_type === 'custom_url' && !form.link_value?.trim()) {
      toast.error('Enter a URL for this tile');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateHomepageTile(editing.id, form);
        toast.success('Tile updated');
      } else {
        await createHomepageTile(form);
        toast.success('Tile created');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadHomepageTileImage(file, form.title);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (t: HomepageTile) => {
    try {
      await setHomepageTileActive(t.id, !t.is_active);
      setTiles((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteHomepageTile(confirmTarget.id);
      toast.success('Tile deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  // Swaps a tile with its neighbor above/below in the sorted list, then
  // persists the whole new order in one batch call.
  const move = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedTiles.length) return;

    const reordered = [...sortedTiles];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    const movedTileId = sortedTiles[index].id;
    setReordering(movedTileId);
    // Optimistic UI update so the row visibly moves right away.
    setTiles(reordered.map((t, i) => ({ ...t, position: i })));
    try {
      await reorderHomepageTiles(reordered.map((t) => t.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reorder');
      await load();
    } finally {
      setReordering(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Homepage Tiles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${tiles.length} tile${tiles.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Tile
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Tile</th>
              <th className="px-4 py-3">Links To</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTiles.map((t, index) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, 'up')}
                      disabled={index === 0 || reordering === t.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 'down')}
                      disabled={index === sortedTiles.length - 1 || reordering === t.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.image_url}
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
                        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-secondary" />
                        <span className="truncate">{t.title}</span>
                      </p>
                      {(t.subtitle || t.price_label) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[t.subtitle, t.price_label].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <span className="capitalize">{t.link_type.replace('_', ' ')}</span>
                  {' — '}
                  {linkSummary(t, collections, promotions)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmTarget(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sortedTiles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No homepage tiles yet. Add one to build out your homepage grid.
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
              {editing ? 'Edit Tile' : 'Add Tile'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tile-title">Title *</Label>
              <Input
                id="tile-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="BUY 1"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tile-subtitle">Subtitle</Label>
              <Input
                id="tile-subtitle"
                value={form.subtitle ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value || null }))}
                placeholder="GET 1 FREE"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="tile-badge">Badge Text</Label>
                <Input
                  id="tile-badge"
                  value={form.badge_text ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, badge_text: e.target.value || null }))}
                  placeholder="FREE"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tile-price-label">Price Label</Label>
                <Input
                  id="tile-price-label"
                  value={form.price_label ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, price_label: e.target.value || null }))}
                  placeholder="All at ₹190"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tile-image">Image</Label>
              <div className="flex gap-2">
                <Input
                  id="tile-image"
                  value={form.image_url ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value || null }))}
                  placeholder="https://… or upload below"
                  className="flex-1"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{uploading ? 'Uploading…' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              {form.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.image_url}
                  alt="Preview"
                  className="mt-1 h-24 w-full rounded-md border border-border/60 object-cover"
                />
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tile-cta">CTA Label</Label>
              <Input
                id="tile-cta"
                value={form.cta_label}
                onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                placeholder="Shop Now"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tile-link-type">Link type</Label>
              <Select
                value={form.link_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, link_type: v as HomepageTileLinkType, link_value: null }))
                }
              >
                <SelectTrigger id="tile-link-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collection">Collection</SelectItem>
                  <SelectItem value="promotion">Promotion</SelectItem>
                  <SelectItem value="custom_url">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.link_type === 'collection' && (
              <div className="grid gap-1.5">
                <Label htmlFor="tile-collection">Collection *</Label>
                <Select
                  value={form.link_value ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, link_value: v }))}
                >
                  <SelectTrigger id="tile-collection">
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

            {form.link_type === 'promotion' && (
              <div className="grid gap-1.5">
                <Label htmlFor="tile-promotion">Promotion *</Label>
                <Select
                  value={form.link_value ?? ''}
                  onValueChange={(v) => setForm((f) => ({ ...f, link_value: v }))}
                >
                  <SelectTrigger id="tile-promotion">
                    <SelectValue placeholder="Choose a promotion" />
                  </SelectTrigger>
                  <SelectContent>
                    {promotions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.link_type === 'custom_url' && (
              <div className="grid gap-1.5">
                <Label htmlFor="tile-url">URL *</Label>
                <Input
                  id="tile-url"
                  value={form.link_value ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, link_value: e.target.value || null }))}
                  placeholder="/collection/sarees or https://…"
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label htmlFor="tile-active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="tile-active"
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
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Tile'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this tile?</DialogTitle>
            <DialogDescription>
              {confirmTarget?.title} will disappear from the homepage immediately. This action cannot be
              undone.
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
