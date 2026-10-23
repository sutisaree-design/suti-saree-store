'use client';

import { useEffect, useState, FormEvent, Dispatch, SetStateAction } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Upload, Loader2, Star, Link2, Wand2, Video, Check, Sparkles } from 'lucide-react';
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
import { generateVariantSku, generateSizeSku } from '@/lib/sku';
import { generateVariantSeoContent } from '@/lib/variant-seo-content';
import { COLOR_PRESETS, findPresetByName, searchPresets, ColorPreset } from '@/lib/color-presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STANDARD_SIZES } from '@/lib/size-chart';
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
  /** Hex swatch colour, e.g. "#7A1F2B" — either picked from the library
   *  below or typed/adjusted manually via the colour-type input. */
  colorHex: string;
  slug: string;
  images: string[];
  /** Optional short fabric/drape/try-on video URL for this colour. */
  video: string;
  priceOverride: string;
  sku: string;
  metaTitle: string;
  metaDescription: string;
  /** Unique on-page paragraph for this colour, shown in the PDP
   *  Description tab so each colour's visible content (not just its meta
   *  tags) differs from its siblings -- see lib/variant-seo-content.ts. */
  styleNote: string;
  isDefault: boolean;
  /** Optional per-colour rating (0-5) / review-count override, shown as
   *  plain strings in the form (empty = no override, falls back to the
   *  base product's rating/reviews on the storefront). */
  rating: string;
  reviews: string;
  sizes: { size: string; stockQuantity: string; priceOverride: string; sku: string }[];
}

/**
 * A colour variant added while the *product itself* hasn't been saved yet
 * (brand-new "Add New Product" form -- there's no real productId to attach
 * a `product_variants` row to). Staged entirely in memory here and lifted
 * up to the parent (products-panel.tsx) via `pendingVariants`/
 * `setPendingVariants`; the parent creates the real rows through the same
 * `createVariant` API call, one per staged entry, right after the product
 * save succeeds and a real productId exists. See onSubmit below for the
 * staging logic and products-panel.tsx's onSubmit for the flush.
 */
export type PendingVariant = VariantFormState & { localId: string };

// Builds the starting size rows for a brand-new variant from the sizes
// ticked on the main product form (e.g. "Free Size, S, M, L"). Falls back
// to "Free Size" if the product has none selected yet.
const defaultSizeRows = (productSizes?: string) => {
  const sizes = (productSizes ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = sizes.length ? sizes : ['Free Size'];
  return list.map((size) => ({ size, stockQuantity: '3', priceOverride: '', sku: '' }));
};

const emptyVariantForm = (productSizes?: string): VariantFormState => ({
  color: '',
  colorHex: '',
  slug: '',
  images: [],
  video: '',
  priceOverride: '',
  sku: '',
  metaTitle: '',
  metaDescription: '',
  styleNote: '',
  isDefault: false,
  rating: '',
  reviews: '',
  sizes: defaultSizeRows(productSizes),
});

interface Props {
  productId: string | null;
  productName: string;
  productSku: string;
  // Used only to pick the right SEO vocabulary (saree vs kurti vs lehenga
  // etc.) when auto-generating meta title/description/style note below --
  // without these the generator has no way to tell a Kurti apart from a
  // Saree and defaults to saree wording for everything.
  productFabric?: string | null;
  productCategory?: string | null;
  baseImage?: string;
  // Comma-separated list from the main product's "Colours" field. The
  // first entry is the product's own base colour (never a real row in
  // product_variants until explicitly converted -- see
  // "Add original colour as a variant" button below).
  productColors?: string;
  // Comma-separated list of sizes ticked in the main product's "Sizes"
  // field (e.g. "Free Size, S, M, L"). Used to pre-select the same sizes
  // when a new colour/variant is added, instead of always defaulting to
  // just "Free Size".
  productSizes?: string;
  // When true, the "Add Variant" form opens automatically as soon as the
  // product is ready -- lets a button outside this component (the row's
  // "Add Variation" icon) jump straight to adding a colour without an
  // extra click once the edit dialog is open.
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
  // Staged colour variants for a brand-new product that hasn't been saved
  // yet (productId is null). Lifted up to the parent so it can create the
  // real rows right after the product itself is created. Once productId
  // is real, this component ignores these and talks to the API directly
  // like it always has.
  pendingVariants: PendingVariant[];
  setPendingVariants: Dispatch<SetStateAction<PendingVariant[]>>;
}

/**
 * Colour/size variant management, embedded directly inside the Add/Edit
 * Product dialog -- no separate "Variants" tab to hunt for. Click a
 * product's title/row in the list (or the palette icon) to open the same
 * dialog this lives in.
 */
export default function ProductVariantsManager({
  productId,
  productName,
  productSku,
  productFabric,
  productCategory,
  baseImage,
  productColors,
  productSizes,
  autoOpenAdd,
  onAutoOpenAddHandled,
  pendingVariants,
  setPendingVariants,
}: Props) {
  const [variants, setVariants] = useState<VariantWithSizes[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VariantWithSizes | null>(null);
  // Set instead of `editing` when the form is editing a *staged* (pending)
  // variant rather than one already saved to the database.
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantFormState>(emptyVariantForm(productSizes));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [cropOnImport, setCropOnImport] = useState(false);
  const [detectingColor, setDetectingColor] = useState(false);
  const [confirmVariant, setConfirmVariant] = useState<VariantWithSizes | null>(null);
  const [confirmPendingId, setConfirmPendingId] = useState<string | null>(null);
  const [colorSuggestions, setColorSuggestions] = useState<ColorPreset[]>([]);
  const [showColorSuggestions, setShowColorSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const loadVariants = async (id: string) => {
    setLoading(true);
    try {
      const data = await fetchVariantsWithSizes(id);
      setVariants(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load variants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId) loadVariants(productId);
    else setVariants([]);
  }, [productId]);

  const openNew = () => {
    setEditing(null);
    setEditingPendingId(null);
    setForm({
      ...emptyVariantForm(productSizes),
      images: baseImage ? [baseImage] : [],
    });
    setOpen(true);
  };

  // The product's own base colour (first entry of the "Colours" field on
  // the main product form) -- only relevant when there's a real size
  // spread to price separately. A single "Free Size" product has nothing
  // to gain from a size-price grid, so the button below only shows once
  // more than one size is selected.
  const baseColorName = (productColors ?? '').split(',')[0]?.trim() || '';
  const productSizeList = (productSizes ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hasMultipleSizes = productSizeList.length > 1;
  // Once a product is saved, "existing colours" comes from the API
  // (`variants`); before that, it comes from what's staged in memory.
  const effectiveColorNames = productId ? variants.map((v) => v.color) : pendingVariants.map((p) => p.color);
  const baseColorAlreadyVariant = baseColorName
    ? effectiveColorNames.some((c) => c.trim().toLowerCase() === baseColorName.toLowerCase())
    : false;
  const showConvertBaseColorButton = !!baseColorName && hasMultipleSizes && !baseColorAlreadyVariant;

  // Turns the base colour into a proper variant row, pre-filled with its
  // name, image and the product's sizes -- the admin just fills in
  // price/stock per size and hits "Add Variant".
  const openNewFromBaseColour = () => {
    setEditing(null);
    setEditingPendingId(null);
    setForm({
      ...emptyVariantForm(productSizes),
      color: baseColorName,
      colorHex: findPresetByName(baseColorName)?.hex ?? '',
      images: baseImage ? [baseImage] : [],
      isDefault: true,
    });
    setOpen(true);
  };

  // Fired from the product row's "Add Variation" button (outside this
  // component) -- opens the add-variant form the moment we have a real
  // productId to attach the variant to.
  useEffect(() => {
    if (autoOpenAdd && productId) {
      openNew();
      onAutoOpenAddHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd, productId]);

  // Single-size products (the common "Free Size only" case) still use the
  // same manual "Add ... as variant" button as multi-size products -- see
  // showConvertBaseColorButton below (an earlier version of this made the
  // base colour auto-become a variant for single-size products, but that
  // surprised admins who hadn't asked for the colour to become its own
  // priced/stocked variant yet, so it was reverted).

  // Opens the same form dialog pre-filled with a staged (not-yet-saved)
  // variant's data, so it can be edited/removed before the product itself
  // is saved.
  const openEditPending = (localId: string) => {
    const p = pendingVariants.find((pv) => pv.localId === localId);
    if (!p) return;
    const { localId: _drop, ...formState } = p;
    setEditing(null);
    setEditingPendingId(localId);
    setForm(formState);
    setOpen(true);
  };

  const openEdit = (v: VariantWithSizes) => {
    setEditing(v);
    setEditingPendingId(null);
    setForm({
      color: v.color,
      colorHex: v.color_hex ?? findPresetByName(v.color)?.hex ?? '',
      slug: v.slug,
      images: v.images,
      video: v.video ?? '',
      priceOverride: v.price_override != null ? String(v.price_override) : '',
      sku: v.sku ?? '',
      metaTitle: v.meta_title ?? '',
      metaDescription: v.meta_description ?? '',
      styleNote: v.style_note ?? '',
      isDefault: v.is_default,
      rating: v.rating != null ? String(v.rating) : '',
      reviews: v.reviews != null ? String(v.reviews) : '',
      sizes: v.sizes.length
        ? v.sizes.map((s) => ({
            size: s.size,
            stockQuantity: String(s.stock_quantity),
            priceOverride: s.price_override != null ? String(s.price_override) : '',
            sku: s.sku ?? '',
          }))
        : defaultSizeRows(productSizes),
    });
    setOpen(true);
  };

  // Fills meta title/description + the on-page style note with unique,
  // keyword-aware copy for this colour (see lib/variant-seo-content.ts).
  // Same generator the server falls back to on save, exposed here so the
  // admin/vendor can preview and hand-edit it before publishing, or
  // regenerate fresh copy after changing the colour name.
  const autoFillSeo = () => {
    if (!form.color.trim()) {
      toast.error('Add a colour name first');
      return;
    }
    const seo = generateVariantSeoContent({
      productName,
      fabric: productFabric,
      category: productCategory,
      color: form.color.trim(),
    });
    setForm((f) => ({
      ...f,
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      styleNote: seo.styleNote,
    }));
    toast.success('SEO content generated for this colour');
  };

  // Auto-fill the colour + size SKUs from the product SKU the moment a
  // colour name is typed, if the admin hasn't set one manually yet.
  const autoFillSkus = () => {
    const base = productSku.trim();
    if (!base || !form.color.trim()) {
      toast.error('Add the product SKU and a colour name first');
      return;
    }
    const vSku = generateVariantSku(base, form.color.trim());
    setForm((f) => ({
      ...f,
      sku: vSku,
      sizes: f.sizes.map((s) => ({ ...s, sku: s.sku || generateSizeSku(vSku, s.size || 'FREE') })),
    }));
  };

  /**
   * Sends a variant photo to the AI vision model and fills in the colour
   * name + hex swatch from what it sees in the image. `silent` is used for
   * the automatic call right after the first photo is added — it skips the
   * "no photo yet" error toast and doesn't overwrite a colour the admin
   * already typed themselves.
   */
  const detectColorFromImage = async (imageUrl: string, opts?: { silent?: boolean }) => {
    if (!imageUrl) {
      if (!opts?.silent) toast.error('Add a photo for this colour first, then detect.');
      return;
    }
    setDetectingColor(true);
    try {
      const existingColors = productId
        ? variants.filter((v) => v.id !== editing?.id).map((v) => v.color)
        : pendingVariants.filter((p) => p.localId !== editingPendingId).map((p) => p.color);
      const res = await fetch('/api/admin/detect-variant-color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, existingColors }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!opts?.silent) toast.error(data.error || 'Could not detect the colour');
        return;
      }
      setForm((f) => ({ ...f, color: data.color, colorHex: data.colorHex }));
      toast.success(`Detected colour: ${data.color}`);
    } catch (err) {
      if (!opts?.silent) toast.error(err instanceof Error ? err.message : 'Colour detection failed');
    } finally {
      setDetectingColor(false);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadVariantImage));
      const isFirstImage = form.images.length === 0;
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
      // Auto-fill the colour from the first photo added, but only if the
      // admin hasn't already typed a colour name themselves.
      if (isFirstImage && !form.color.trim() && urls[0]) {
        detectColorFromImage(urls[0], { silent: true });
      }
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
      const isFirstImage = form.images.length === 0;
      setForm((f) => ({ ...f, images: [...f.images, data.url] }));
      setImportUrl('');
      toast.success(cropOnImport ? 'Image imported, cropped and converted to WebP' : 'Image imported and converted to WebP');
      if (isFirstImage && !form.color.trim()) {
        detectColorFromImage(data.url, { silent: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image import failed');
    } finally {
      setImporting(false);
    }
  };

  const updateSizeRow = (idx: number, patch: Partial<{ size: string; stockQuantity: string; priceOverride: string; sku: string }>) => {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const addSizeRow = () => {
    setForm((f) => ({ ...f, sizes: [...f.sizes, { size: '', stockQuantity: '3', priceOverride: '', sku: '' }] }));
  };

  const removeSizeRow = (idx: number) => {
    setForm((f) => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.color.trim()) {
      toast.error('Colour name is required');
      return;
    }
    const existingColorNames = productId
      ? variants.filter((v) => v.id !== editing?.id).map((v) => v.color)
      : pendingVariants.filter((p) => p.localId !== editingPendingId).map((p) => p.color);
    const nameTaken = existingColorNames.some(
      (c) => c.trim().toLowerCase() === form.color.trim().toLowerCase()
    );
    if (nameTaken) {
      toast.error(
        `"${form.color.trim()}" is already used by another colour on this product. Give this shade a more specific name (e.g. "Steel Blue" instead of "Blue") so it saves as its own variant.`
      );
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

    // Product hasn't been saved yet -- stage this variant in memory instead
    // of calling the API. products-panel.tsx creates the real rows right
    // after the product itself is created (see its onSubmit).
    if (!productId) {
      const cleanForm: VariantFormState = { ...form, sizes: validSizes };
      if (editingPendingId) {
        setPendingVariants((prev) =>
          prev.map((p) =>
            p.localId === editingPendingId
              ? { ...cleanForm, localId: editingPendingId }
              : cleanForm.isDefault
                ? { ...p, isDefault: false }
                : p
          )
        );
        toast.success('Variant updated');
      } else {
        const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setPendingVariants((prev) => [
          ...(cleanForm.isDefault ? prev.map((p) => ({ ...p, isDefault: false })) : prev),
          { ...cleanForm, localId },
        ]);
        toast.success('Colour variant added — it will be saved once you save the product');
      }
      setOpen(false);
      setEditingPendingId(null);
      return;
    }

    setSaving(true);
    try {
      const slug = form.slug.trim() || slugify(`${productName}-${form.color}`);
      const priceOverride = form.priceOverride ? Number(form.priceOverride) : null;
      const vSku = form.sku.trim() || (productSku ? generateVariantSku(productSku, form.color) : null);
      const ratingOverride = form.rating.trim() ? Number(form.rating) : null;
      const reviewsOverride = form.reviews.trim() ? Number(form.reviews) : null;

      if (editing) {
        await updateVariant(editing.id, {
          color: form.color.trim(),
          color_hex: form.colorHex.trim() || null,
          slug,
          images: form.images,
          video: form.video.trim() || null,
          price_override: priceOverride,
          meta_title: form.metaTitle.trim() || null,
          meta_description: form.metaDescription.trim() || null,
          style_note: form.styleNote.trim() || null,
          sku: vSku,
          rating: ratingOverride,
          reviews: reviewsOverride,
        });

        const existingIds = new Set(editing.sizes.map((s) => s.id));
        const keptIds = new Set<string>();
        for (const row of form.sizes) {
          if (!row.size.trim()) continue;
          const match = editing.sizes.find((s) => s.size === row.size);
          const rowSku = row.sku.trim() || (vSku ? generateSizeSku(vSku, row.size) : null);
          if (match) {
            keptIds.add(match.id);
            await updateVariantSize(match.id, {
              size: row.size.trim(),
              stock_quantity: Number(row.stockQuantity) || 0,
              price_override: row.priceOverride.trim() ? Number(row.priceOverride) : null,
              sku: rowSku,
            });
          } else {
            await addVariantSize({
              variantId: editing.id,
              size: row.size.trim(),
              stockQuantity: Number(row.stockQuantity) || 0,
              priceOverride: row.priceOverride.trim() ? Number(row.priceOverride) : null,
              sku: rowSku,
            });
          }
        }
        for (const id of Array.from(existingIds)) {
          if (!keptIds.has(id)) await deleteVariantSize(id);
        }

        if (form.isDefault && !editing.is_default) {
          await setDefaultVariant(productId, editing.id);
        }
        toast.success('Variant updated');
      } else {
        const created = await createVariant({
          productId,
          color: form.color.trim(),
          colorHex: form.colorHex.trim() || null,
          slug,
          images: form.images,
          video: form.video.trim() || null,
          priceOverride,
          metaTitle: form.metaTitle.trim() || undefined,
          metaDescription: form.metaDescription.trim() || undefined,
          styleNote: form.styleNote.trim() || undefined,
          isDefault: form.isDefault,
          sku: vSku,
          rating: ratingOverride,
          reviews: reviewsOverride,
          sizes: validSizes.map((s) => ({
            size: s.size.trim(),
            stockQuantity: Number(s.stockQuantity) || 0,
            priceOverride: s.priceOverride.trim() ? Number(s.priceOverride) : null,
            sku: s.sku.trim() || (vSku ? generateSizeSku(vSku, s.size) : null),
          })),
        });
        if (form.isDefault) {
          await setDefaultVariant(productId, created.id);
        }
        toast.success('Colour variant added');
      }
      setOpen(false);
      await loadVariants(productId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (confirmPendingId) {
      setPendingVariants((prev) => prev.filter((p) => p.localId !== confirmPendingId));
      toast.success('Variant removed');
      setConfirmPendingId(null);
      return;
    }
    if (!confirmVariant || !productId) return;
    try {
      await deleteVariant(confirmVariant.id);
      toast.success('Variant deleted');
      await loadVariants(productId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmVariant(null);
    }
  };

  const makeDefault = async (v: VariantWithSizes) => {
    if (!productId) return;
    try {
      await setDefaultVariant(productId, v.id);
      toast.success(`${v.color} set as default`);
      await loadVariants(productId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const makePendingDefault = (localId: string) => {
    setPendingVariants((prev) => prev.map((p) => ({ ...p, isDefault: p.localId === localId })));
  };

  // A brand-new product has no productId yet, so colour variants can't be
  // saved to the database until the product itself is saved -- but the
  // admin can still stage them here the moment at least one colour has
  // been typed into the main "Colors" field above. They're held in
  // `pendingVariants` and flushed to the API by products-panel.tsx right
  // after the product save succeeds.
  const hasBaseColor = (productColors ?? '').split(',').map((s) => s.trim()).filter(Boolean).length > 0;
  if (!productId && !hasBaseColor) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        Add at least one colour above (in the &quot;Colors&quot; field) — colour/size variants can then be added
        right here, even before you save the product.
      </div>
    );
  }

  // Unified list the JSX below renders from -- backed by the API
  // (`variants`) once the product is saved, or by the in-memory staged
  // list (`pendingVariants`) before that.
  const rows = productId
    ? variants.map((v) => ({
        id: v.id,
        color: v.color,
        color_hex: v.color_hex,
        images: v.images,
        sku: v.sku,
        is_default: v.is_default,
        video: v.video,
        sizes: v.sizes.map((s) => ({ id: s.id, size: s.size, stock_quantity: s.stock_quantity })),
        pending: false as const,
      }))
    : pendingVariants.map((p) => ({
        id: p.localId,
        color: p.color,
        color_hex: p.colorHex || null,
        images: p.images,
        sku: p.sku || null,
        is_default: p.isDefault,
        video: p.video || null,
        sizes: p.sizes
          .filter((s) => s.size.trim())
          .map((s, i) => ({ id: `${p.localId}-${i}`, size: s.size, stock_quantity: Number(s.stockQuantity) || 0 })),
        pending: true as const,
      }));

  return (
    <div className="grid gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Colour &amp; size variants</p>
          <p className="text-xs text-muted-foreground">
            {productId
              ? 'Each colour gets its own photos, SKU and per-size stock — managed right here.'
              : 'Staged for now — these are created for real as soon as you save the product below.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {showConvertBaseColorButton && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewFromBaseColour}
              className="gap-1.5"
              title={`"${baseColorName}" is the product's own colour and isn't priced per-size yet`}
            >
              <Plus className="h-3.5 w-3.5" /> Add &quot;{baseColorName}&quot; as variant
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={openNew} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add colour
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No colour variants yet. Click &quot;Add colour&quot; to create the first one (e.g. Maroon, Green).
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((v) => (
            <div
              key={v.id}
              className={`flex items-start gap-2 rounded-md border p-2 ${
                v.is_default ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border/60'
              }`}
            >
              <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded bg-muted">
                {v.images[0] ? (
                  <Image src={v.images[0]} alt={v.color} fill sizes="44px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  {v.color_hex && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border/70"
                      style={{ backgroundColor: v.color_hex }}
                      title={v.color_hex}
                    />
                  )}
                  <p className="truncate text-sm font-semibold">{v.color}</p>
                  {v.video && <Video className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {v.is_default && (
                    <Badge className="bg-primary px-1 py-0 text-[10px] text-primary-foreground">
                      <Star className="mr-0.5 h-2.5 w-2.5 fill-current" /> Default
                    </Badge>
                  )}
                  {v.pending && (
                    <Badge variant="outline" className="px-1 py-0 text-[10px]" title="Saved once you save the product">
                      Staged
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  SKU: {v.sku || <span className="italic">not set</span>}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {v.sizes.map((s) => (
                    <Badge key={s.id} variant="outline" className="px-1 py-0 text-[10px]">
                      {s.size}: {s.stock_quantity}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() =>
                      v.pending ? openEditPending(v.id) : openEdit(variants.find((x) => x.id === v.id)!)
                    }
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  {!v.is_default && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() =>
                        v.pending ? makePendingDefault(v.id) : makeDefault(variants.find((x) => x.id === v.id)!)
                      }
                    >
                      <Star className="mr-1 h-3 w-3" /> Default
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      v.pending ? setConfirmPendingId(v.id) : setConfirmVariant(variants.find((x) => x.id === v.id)!)
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit variant dialog -- stacks on top of the product dialog. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing || editingPendingId ? 'Edit Variant' : 'Add Colour Variant'}
            </DialogTitle>
            <DialogDescription>For &quot;{productName || 'this product'}&quot;</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Pick a colour</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={detectingColor || form.images.length === 0}
                  title={form.images.length === 0 ? 'Add a photo first' : 'Detect colour from the photo using AI'}
                  onClick={() => detectColorFromImage(form.images[0])}
                >
                  {detectingColor ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {detectingColor ? 'Detecting…' : 'Detect from photo (AI)'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Select from the colour library, or type a custom colour name and set its swatch below. Adding a
                photo auto-detects the colour too — use this button to re-run it any time.
              </p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => {
                  const isSelected = form.color.trim().toLowerCase() === c.name.toLowerCase();
                  return (
                    <button
                      key={c.name}
                      type="button"
                      title={c.name}
                      onClick={() => setForm((f) => ({ ...f, color: c.name, colorHex: c.hex }))}
                      className="group flex flex-col items-center gap-1"
                    >
                      <span
                        className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${
                          isSelected ? 'border-primary ring-2 ring-primary/25' : 'border-border/70 group-hover:border-primary/40'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && (
                          <Check className={`h-3.5 w-3.5 ${c.hex === '#FFFFFF' ? 'text-foreground' : 'text-white'}`} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div className="relative grid gap-1.5">
                <Label htmlFor="v-color">Colour name *</Label>
                <Input
                  id="v-color"
                  value={form.color}
                  autoComplete="off"
                  onChange={(e) => {
                    const value = e.target.value;
                    const preset = findPresetByName(value);
                    setForm((f) => ({ ...f, color: value, colorHex: preset ? preset.hex : f.colorHex }));
                    setColorSuggestions(searchPresets(value));
                    setShowColorSuggestions(true);
                    setActiveSuggestion(-1);
                  }}
                  onFocus={(e) => {
                    setColorSuggestions(searchPresets(e.target.value));
                    setShowColorSuggestions(true);
                  }}
                  onBlur={() => {
                    // Delay so a click on a suggestion registers before the list unmounts.
                    setTimeout(() => setShowColorSuggestions(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (!showColorSuggestions || colorSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSuggestion((i) => (i + 1) % colorSuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSuggestion((i) => (i <= 0 ? colorSuggestions.length - 1 : i - 1));
                    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
                      e.preventDefault();
                      const picked = colorSuggestions[activeSuggestion];
                      setForm((f) => ({ ...f, color: picked.name, colorHex: picked.hex }));
                      setShowColorSuggestions(false);
                      setActiveSuggestion(-1);
                    } else if (e.key === 'Escape') {
                      setShowColorSuggestions(false);
                    }
                  }}
                  placeholder="e.g. Maroon, or type a new/custom colour"
                  required
                />
                {showColorSuggestions && colorSuggestions.length > 0 && (
                  <ul
                    role="listbox"
                    className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
                  >
                    {colorSuggestions.map((c, i) => (
                      <li key={c.name}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === activeSuggestion}
                          // onMouseDown fires before the input's onBlur, so the click still registers.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setForm((f) => ({ ...f, color: c.name, colorHex: c.hex }));
                            setShowColorSuggestions(false);
                            setActiveSuggestion(-1);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                            i === activeSuggestion ? 'bg-accent' : 'hover:bg-accent/60'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/70"
                            style={{ backgroundColor: c.hex }}
                          />
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {form.color.trim() && !findPresetByName(form.color) && (
                  <p className="text-xs text-muted-foreground">
                    &quot;{form.color.trim()}&quot; isn&apos;t in the colour library yet — it&apos;ll be saved as a new custom colour.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-color-hex">Colour type</Label>
                <input
                  id="v-color-hex"
                  type="color"
                  value={/^#([0-9a-f]{3}){1,2}$/i.test(form.colorHex) ? form.colorHex : '#cccccc'}
                  onChange={(e) => setForm((f) => ({ ...f, colorHex: e.target.value }))}
                  title="Pick the exact swatch colour"
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-sku">SKU code</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="v-sku"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="auto-generated on save"
                  />
                  <Button type="button" variant="outline" size="icon" title="Auto-generate SKU" onClick={autoFillSkus}>
                    <Wand2 className="h-4 w-4" />
                  </Button>
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
            </div>

            <div className="grid gap-1.5 rounded-md border border-dashed border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  SEO — Meta title, meta description &amp; style note
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={autoFillSeo}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Auto-generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each colour needs its own text here — leaving these blank (or copy-pasting the
                same text across colours) makes Google treat the colour pages as duplicates of
                each other, which is why they can end up stuck as &quot;Discovered - currently
                not indexed&quot;. Click Auto-generate for unique, keyword-aware copy, then tweak
                it if you like.
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="v-meta-title">Meta title</Label>
                <Input
                  id="v-meta-title"
                  value={form.metaTitle}
                  onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
                  placeholder="Auto-generated from colour + product name if left blank"
                  maxLength={100}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-meta-description">Meta description</Label>
                <textarea
                  id="v-meta-description"
                  value={form.metaDescription}
                  onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                  placeholder="Auto-generated from colour + product name if left blank"
                  maxLength={160}
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-style-note">
                  Style note <span className="text-muted-foreground">(shown on the product page)</span>
                </Label>
                <textarea
                  id="v-style-note"
                  value={form.styleNote}
                  onChange={(e) => setForm((f) => ({ ...f, styleNote: e.target.value }))}
                  placeholder="A colour-specific styling tip or occasion note, e.g. what to pair this shade with"
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
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
                  placeholder="Paste any public image URL"
                  className="max-w-md"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      importFromUrl();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={importFromUrl} disabled={importing || !importUrl.trim()}>
                  {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                  {importing ? 'Importing…' : 'Import from URL'}
                </Button>
                <label className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs">
                  <Switch checked={cropOnImport} onCheckedChange={setCropOnImport} className="scale-90" />
                  <span className="font-medium">Crop</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing uploaded yet? The base product photo is used automatically as a placeholder — swap it out any time.
                {cropOnImport && ' Crop is ON — the bottom 10% of the image will be trimmed off automatically, whatever its size.'}
              </p>
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
              <Label htmlFor="v-video" className="flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" /> Video URL (optional)
              </Label>
              <Input
                id="v-video"
                value={form.video}
                onChange={(e) => setForm((f) => ({ ...f, video: e.target.value }))}
                placeholder="Short fabric/drape/try-on video link for this colour"
              />
              <p className="text-xs text-muted-foreground">
                Shows as the first slide in this colour&apos;s gallery on the product page. Leave blank to use the
                product&apos;s main video (if any).
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-rating" className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" /> Rating (0–5, optional)
                </Label>
                <Input
                  id="v-rating"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={form.rating}
                  onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                  placeholder="Leave blank to use base product rating"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-reviews">Reviews count (optional)</Label>
                <Input
                  id="v-reviews"
                  type="number"
                  min={0}
                  value={form.reviews}
                  onChange={(e) => setForm((f) => ({ ...f, reviews: e.target.value }))}
                  placeholder="Leave blank to use base product reviews"
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Optional — gives this colour its own rating/review numbers instead of sharing the base product&apos;s.
                Real customer reviews still count toward the base product either way.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label>Sizes, stock, price &amp; SKU *</Label>
              <div className="grid gap-2">
                {form.sizes.map((row, idx) => {
                  const usedByOtherRows = new Set(
                    form.sizes.filter((_, i) => i !== idx).map((r) => r.size).filter(Boolean)
                  );
                  const sizeOptions = Array.from(new Set([...STANDARD_SIZES, ...(row.size ? [row.size] : [])])).filter(
                    (sz) => sz === row.size || !usedByOtherRows.has(sz)
                  );
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={row.size || undefined} onValueChange={(v) => updateSizeRow(idx, { size: v })}>
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="Size" />
                        </SelectTrigger>
                        <SelectContent>
                          {sizeOptions.map((sz) => (
                            <SelectItem key={sz} value={sz}>
                              {sz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        value={row.stockQuantity}
                        onChange={(e) => updateSizeRow(idx, { stockQuantity: e.target.value })}
                        placeholder="Stock"
                        className="w-20"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={row.priceOverride}
                        onChange={(e) => updateSizeRow(idx, { priceOverride: e.target.value })}
                        placeholder="Price (₹, optional)"
                        title="Leave blank to use this colour's price"
                        className="w-32"
                      />
                      <Input
                        value={row.sku}
                        onChange={(e) => updateSizeRow(idx, { sku: e.target.value })}
                        placeholder="SKU (auto)"
                        className="flex-1"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => removeSizeRow(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addSizeRow} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add size
              </Button>
              <p className="text-xs text-muted-foreground">
                Leave a size&apos;s price blank to use this colour&apos;s price (or the base product price if the
                colour has none either). Set a number here only for sizes that should cost more or less.
              </p>
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
                {saving ? 'Saving…' : editing || editingPendingId ? 'Save Changes' : 'Add Variant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmVariant || !!confirmPendingId}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmVariant(null);
            setConfirmPendingId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this variant?</DialogTitle>
            <DialogDescription>
              This removes the &quot;
              {confirmVariant?.color ?? pendingVariants.find((p) => p.localId === confirmPendingId)?.color}&quot;
              colour option{confirmVariant ? ' and its SEO page' : ''}. This action cannot be undone.
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
