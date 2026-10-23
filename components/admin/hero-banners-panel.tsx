'use client';

import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { Plus, Pencil, Trash2, Images, ArrowUp, ArrowDown, ImageOff, Upload, Loader2, AlertTriangle, Film, ImageIcon, VolumeX } from 'lucide-react';
import {
  HeroBanner,
  HeroBannerInput,
  fetchHeroBannersAdmin,
  createHeroBanner,
  updateHeroBanner,
  deleteHeroBanner,
  setHeroBannerActive,
  reorderHeroBanners,
  uploadHeroBannerImage,
  uploadHeroBannerVideo,
  readImageDimensions,
  readRemoteImageDimensions,
} from '@/lib/hero-banners-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';

const emptyForm: HeroBannerInput = {
  image_url: '',
  link_url: null,
  is_active: true,
  media_type: 'image',
  poster_url: null,
  mobile_image_url: null,
  mobile_media_type: null,
  mobile_poster_url: null,
};

export default function HeroBannersPanel() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [form, setForm] = useState<HeroBannerInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<HeroBanner | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  // Reference dimensions taken from the first existing (non-editing)
  // banner in the list — every new upload gets compared against this so
  // the admin is warned before a mismatched-size slide breaks the
  // carousel's consistent look. Cached once per dialog-open rather than
  // re-fetched on every upload.
  const [referenceDimensions, setReferenceDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setBanners(await fetchHeroBannersAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load hero banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Banners are always shown ordered by position, ascending.
  const sortedBanners = [...banners].sort((a, b) => a.position - b.position);

  const loadReferenceDimensions = async (excludingId?: string) => {
    const reference = sortedBanners.find((b) => b.id !== excludingId && b.image_url);
    if (!reference) {
      setReferenceDimensions(null);
      return;
    }
    try {
      setReferenceDimensions(await readRemoteImageDimensions(reference.image_url));
    } catch {
      setReferenceDimensions(null);
    }
  };

  const [deviceTab, setDeviceTab] = useState<'desktop' | 'mobile'>('desktop');

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setSizeWarning(null);
    setDeviceTab('desktop');
    loadReferenceDimensions();
    setOpen(true);
  };

  const openEdit = (b: HeroBanner) => {
    setEditing(b);
    setForm({
      image_url: b.image_url,
      link_url: b.link_url,
      is_active: b.is_active,
      media_type: b.media_type ?? 'image',
      poster_url: b.poster_url ?? null,
      mobile_image_url: b.mobile_image_url ?? null,
      mobile_media_type: b.mobile_media_type ?? null,
      mobile_poster_url: b.mobile_poster_url ?? null,
    });
    setSizeWarning(null);
    setDeviceTab('desktop');
    loadReferenceDimensions(b.id);
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.image_url) {
      toast.error(form.media_type === 'video' ? 'Upload a banner video' : 'Upload a banner image');
      return;
    }
    if (form.mobile_media_type !== null && !form.mobile_image_url) {
      toast.error(
        form.mobile_media_type === 'video' ? 'Upload a mobile banner video' : 'Upload a mobile banner image'
      );
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateHeroBanner(editing.id, form);
        toast.success('Banner updated');
      } else {
        await createHeroBanner(form);
        toast.success('Banner created');
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
    setSizeWarning(null);
    try {
      // Check the new image's size against the cached reference
      // dimensions before uploading, so the admin sees the warning
      // right away rather than after the upload completes.
      if (referenceDimensions) {
        const dims = await readImageDimensions(file);
        if (dims.width !== referenceDimensions.width || dims.height !== referenceDimensions.height) {
          setSizeWarning(
            `This image is ${dims.width}×${dims.height}px, but your other banner(s) are ${referenceDimensions.width}×${referenceDimensions.height}px. For a smooth carousel, all banners should be the same size.`
          );
        }
      }
      const url = await uploadHeroBannerImage(file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const onUploadVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingVideo(true);
    try {
      const url = await uploadHeroBannerVideo(file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success('Video uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Video upload failed');
    } finally {
      setUploadingVideo(false);
    }
  };

  // Optional cover-frame image shown while the video loads / on browsers
  // that block autoplay — reuses the same image upload path as regular
  // banner images, just written into poster_url instead of image_url.
  const onUploadPoster = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPoster(true);
    try {
      const url = await uploadHeroBannerImage(file);
      setForm((f) => ({ ...f, poster_url: url }));
      toast.success('Cover frame uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cover frame upload failed');
    } finally {
      setUploadingPoster(false);
    }
  };

  // --- Mobile-specific media (optional). Mirrors the desktop handlers
  // above, but writes into mobile_image_url / mobile_poster_url instead,
  // so a banner can show a different crop/video on phones vs desktop. ---
  const [uploadingMobileImage, setUploadingMobileImage] = useState(false);
  const [uploadingMobileVideo, setUploadingMobileVideo] = useState(false);
  const [uploadingMobilePoster, setUploadingMobilePoster] = useState(false);
  const mobileEnabled = form.mobile_media_type !== null;

  const enableMobileOverride = () => {
    setForm((f) => ({ ...f, mobile_media_type: f.media_type }));
  };
  const removeMobileOverride = () => {
    setForm((f) => ({ ...f, mobile_image_url: null, mobile_media_type: null, mobile_poster_url: null }));
  };

  const onUploadMobileImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingMobileImage(true);
    try {
      const url = await uploadHeroBannerImage(file);
      setForm((f) => ({ ...f, mobile_image_url: url }));
      toast.success('Mobile image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mobile image upload failed');
    } finally {
      setUploadingMobileImage(false);
    }
  };

  const onUploadMobileVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingMobileVideo(true);
    try {
      const url = await uploadHeroBannerVideo(file);
      setForm((f) => ({ ...f, mobile_image_url: url }));
      toast.success('Mobile video uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mobile video upload failed');
    } finally {
      setUploadingMobileVideo(false);
    }
  };

  const onUploadMobilePoster = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingMobilePoster(true);
    try {
      const url = await uploadHeroBannerImage(file);
      setForm((f) => ({ ...f, mobile_poster_url: url }));
      toast.success('Mobile cover frame uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mobile cover frame upload failed');
    } finally {
      setUploadingMobilePoster(false);
    }
  };

  const toggleActive = async (b: HeroBanner) => {
    try {
      await setHeroBannerActive(b.id, !b.is_active);
      setBanners((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteHeroBanner(confirmTarget.id);
      toast.success('Banner deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  // Swaps a banner with its neighbor above/below in the sorted list,
  // then persists the whole new order in one batch call.
  const move = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedBanners.length) return;

    const reordered = [...sortedBanners];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    const movedId = sortedBanners[index].id;
    setReordering(movedId);
    // Optimistic UI update so the row visibly moves right away.
    setBanners(reordered.map((b, i) => ({ ...b, position: i })));
    try {
      await reorderHeroBanners(reordered.map((b) => b.id));
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
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Hero Banners</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${banners.length} banner${banners.length === 1 ? '' : 's'} — auto-rotate as a carousel on the homepage when there are 2 or more active`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Banner
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Banner</th>
              <th className="px-4 py-3">Links To</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedBanners.map((b, index) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, 'up')}
                      disabled={index === 0 || reordering === b.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 'down')}
                      disabled={index === sortedBanners.length - 1 || reordering === b.id}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    {b.image_url ? (
                      b.media_type === 'video' ? (
                        <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md border border-border/60 bg-black">
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video
                            src={b.image_url}
                            poster={b.poster_url || undefined}
                            muted
                            className="h-full w-full object-cover"
                          />
                          <Film className="absolute bottom-0.5 right-0.5 h-3 w-3 text-white drop-shadow" />
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.image_url}
                          alt=""
                          className="h-10 w-16 shrink-0 rounded-md border border-border/60 object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground">
                        <ImageOff className="h-4 w-4" />
                      </div>
                    )}
                    <p className="flex items-center gap-1.5 font-semibold">
                      {b.media_type === 'video' ? (
                        <Film className="h-3.5 w-3.5 shrink-0 text-secondary" />
                      ) : (
                        <Images className="h-3.5 w-3.5 shrink-0 text-secondary" />
                      )}
                      Banner {index + 1}
                      {b.mobile_media_type && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          +mobile
                        </span>
                      )}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {b.link_url ? (
                    <span className="truncate">{b.link_url}</span>
                  ) : (
                    <span className="italic">No link</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmTarget(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sortedBanners.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No hero banners yet. Add at least 2 to enable the homepage carousel.
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
              {editing ? 'Edit Banner' : 'Add Banner'}
            </DialogTitle>
            <DialogDescription>
              Recommended: keep every banner the exact same pixel size so the carousel doesn&apos;t jump
              between slides.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="flex gap-1 border-b border-border/60">
              <button
                type="button"
                onClick={() => setDeviceTab('desktop')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  deviceTab === 'desktop'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setDeviceTab('mobile')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  deviceTab === 'mobile'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mobile {mobileEnabled ? '' : '(optional)'}
              </button>
            </div>

            {deviceTab === 'desktop' ? (
              <>
                <div className="grid gap-1.5">
                  <Label>Media type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, media_type: 'image', image_url: '', poster_url: null }))}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        form.media_type === 'image'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      <ImageIcon className="h-4 w-4" /> Image
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, media_type: 'video', image_url: '', poster_url: null }))}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        form.media_type === 'video'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      <Film className="h-4 w-4" /> Video
                    </button>
                  </div>
                  {form.media_type === 'video' && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <VolumeX className="h-3 w-3" /> Always plays muted &amp; on loop on the homepage — no
                      sound, matches browser autoplay rules.
                    </p>
                  )}
                </div>

                {form.media_type === 'image' ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="banner-image">Image *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="banner-image"
                        value={form.image_url}
                        onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
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
                    <p className="text-xs text-muted-foreground">
                      Uploaded images are auto-converted to WebP for faster loading.
                    </p>
                    {form.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.image_url}
                        alt="Preview"
                        className="mt-1 h-32 w-full rounded-md border border-border/60 object-cover"
                      />
                    )}
                    {sizeWarning && (
                      <div className="mt-1 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{sizeWarning}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="banner-video">Video * (.mp4 or .webm, max 45MB)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="banner-video"
                          value={form.image_url}
                          onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                          placeholder="https://… or upload below"
                          className="flex-1"
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                          {uploadingVideo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span>{uploadingVideo ? 'Uploading…' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            className="hidden"
                            onChange={onUploadVideo}
                            disabled={uploadingVideo}
                          />
                        </label>
                      </div>
                      {form.image_url && (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          src={form.image_url}
                          poster={form.poster_url || undefined}
                          muted
                          loop
                          autoPlay
                          playsInline
                          className="mt-1 h-32 w-full rounded-md border border-border/60 bg-black object-cover"
                        />
                      )}
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="banner-poster">Cover frame (optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="banner-poster"
                          value={form.poster_url ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, poster_url: e.target.value || null }))}
                          placeholder="https://… or upload below"
                          className="flex-1"
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                          {uploadingPoster ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span>{uploadingPoster ? 'Uploading…' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={onUploadPoster}
                            disabled={uploadingPoster}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Shown for an instant while the video loads, and on any browser that blocks autoplay.
                        Recommended: a still frame the same size as the video.
                      </p>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {!mobileEnabled ? (
                  <div className="rounded-md border border-dashed border-border/60 p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No mobile-specific banner yet — phones will show the desktop image/video above.
                    </p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={enableMobileOverride}>
                      Add a mobile-specific banner
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label>Mobile media type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, mobile_media_type: 'image', mobile_image_url: '', mobile_poster_url: null }))
                          }
                          className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                            form.mobile_media_type === 'image'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          <ImageIcon className="h-4 w-4" /> Image
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, mobile_media_type: 'video', mobile_image_url: '', mobile_poster_url: null }))
                          }
                          className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                            form.mobile_media_type === 'video'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          <Film className="h-4 w-4" /> Video
                        </button>
                      </div>
                    </div>

                    {form.mobile_media_type === 'image' ? (
                      <div className="grid gap-1.5">
                        <Label htmlFor="banner-mobile-image">Mobile image *</Label>
                        <div className="flex gap-2">
                          <Input
                            id="banner-mobile-image"
                            value={form.mobile_image_url ?? ''}
                            onChange={(e) => setForm((f) => ({ ...f, mobile_image_url: e.target.value || null }))}
                            placeholder="https://… or upload below"
                            className="flex-1"
                          />
                          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                            {uploadingMobileImage ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            <span>{uploadingMobileImage ? 'Uploading…' : 'Upload'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={onUploadMobileImage}
                              disabled={uploadingMobileImage}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Auto-converted to WebP. Tip: a tall crop (portrait) usually works better for phones.
                        </p>
                        {form.mobile_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={form.mobile_image_url}
                            alt="Mobile preview"
                            className="mt-1 h-40 w-28 rounded-md border border-border/60 object-cover"
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-1.5">
                          <Label htmlFor="banner-mobile-video">Mobile video * (.mp4 or .webm, max 45MB)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="banner-mobile-video"
                              value={form.mobile_image_url ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, mobile_image_url: e.target.value || null }))}
                              placeholder="https://… or upload below"
                              className="flex-1"
                            />
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                              {uploadingMobileVideo ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              <span>{uploadingMobileVideo ? 'Uploading…' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm"
                                className="hidden"
                                onChange={onUploadMobileVideo}
                                disabled={uploadingMobileVideo}
                              />
                            </label>
                          </div>
                          {form.mobile_image_url && (
                            // eslint-disable-next-line jsx-a11y/media-has-caption
                            <video
                              src={form.mobile_image_url}
                              poster={form.mobile_poster_url || undefined}
                              muted
                              loop
                              autoPlay
                              playsInline
                              className="mt-1 h-40 w-28 rounded-md border border-border/60 bg-black object-cover"
                            />
                          )}
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="banner-mobile-poster">Mobile cover frame (optional)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="banner-mobile-poster"
                              value={form.mobile_poster_url ?? ''}
                              onChange={(e) => setForm((f) => ({ ...f, mobile_poster_url: e.target.value || null }))}
                              placeholder="https://… or upload below"
                              className="flex-1"
                            />
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                              {uploadingMobilePoster ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              <span>{uploadingMobilePoster ? 'Uploading…' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={onUploadMobilePoster}
                                disabled={uploadingMobilePoster}
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={removeMobileOverride}>
                      Remove mobile-specific banner (use desktop image/video on phones)
                    </Button>
                  </>
                )}
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="banner-link">Link (optional)</Label>
              <Input
                id="banner-link"
                value={form.link_url ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value || null }))}
                placeholder="/collection/sarees or https://…"
              />
              <p className="text-xs text-muted-foreground">
                If set, tapping the banner opens this link. The URL is never shown as text on the image.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <Label htmlFor="banner-active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="banner-active"
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
              <Button
                type="submit"
                disabled={saving || uploading || uploadingVideo || uploadingPoster || uploadingMobileImage || uploadingMobileVideo || uploadingMobilePoster}
                className="bg-primary"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Banner'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this banner?</DialogTitle>
            <DialogDescription>
              It will disappear from the homepage carousel immediately. This action cannot be undone.
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
