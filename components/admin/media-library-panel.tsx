'use client';

import { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from 'react';
import {
  Search,
  Upload,
  Loader2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  LayoutGrid,
  List,
  Film,
  FileText,
  ImageOff,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import BrandIdentityCard from './brand-identity-card';

type Bucket = 'product-images' | 'product-videos' | 'review-images' | 'support-attachments' | 'r2';
type MediaType = 'image' | 'video' | 'other';

interface MediaItem {
  bucket: Bucket;
  path: string;
  name: string;
  folder: string;
  url: string;
  type: MediaType;
  size: number;
  mime: string;
  createdAt: string | null;
  derived: boolean;
  thumb?: string;
}

interface Counts {
  all: number;
  image: number;
  video: number;
  other: number;
  totalBytes: number;
}

interface ListResponse {
  items: MediaItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  counts: Counts;
  truncated: boolean;
  warnings?: string[];
  error?: string;
}

const BUCKET_LABELS: Record<string, string> = {
  all: 'All folders',
  'product-images': 'Product images',
  'product-videos': 'Product videos',
  'review-images': 'Review photos',
  'support-attachments': 'Support attachments',
  r2: 'WordPress uploads (R2)',
};

const TYPE_TABS: { value: 'all' | MediaType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'other', label: 'Other' },
];

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Thumb({ item, className }: { item: MediaItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (item.type === 'image' && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumb || item.url}
        alt={item.name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }
  if (item.type === 'video') {
    return (
      <div className={cn('relative h-full w-full bg-black', className)}>
        <video
          src={`${item.url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <Film className="absolute bottom-1.5 right-1.5 h-4 w-4 text-white drop-shadow" />
      </div>
    );
  }
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-muted text-muted-foreground', className)}>
      {item.type === 'image' ? <ImageOff className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
    </div>
  );
}

export default function MediaLibraryPanel() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [bucket, setBucket] = useState<string>('all');
  const [type, setType] = useState<'all' | MediaType>('all');
  const [sort, setSort] = useState('newest');
  const [showDerived, setShowDerived] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const perPage = 48;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<MediaItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change goes back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, bucket, type, sort, showDerived]);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          bucket,
          type,
          sort,
          page: String(page),
          perPage: String(perPage),
        });
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (showDerived) params.set('derived', '1');
        if (opts?.refresh) params.set('refresh', '1');
        const res = await fetch(`/api/admin/media-library?${params.toString()}`, { cache: 'no-store' });
        const json = (await res.json()) as ListResponse;
        if (id !== reqId.current) return; // a newer request already won
        if (!res.ok) throw new Error(json.error || 'Could not load media.');
        setData(json);
      } catch (err) {
        if (id !== reqId.current) return;
        setError(err instanceof Error ? err.message : 'Could not load media.');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [bucket, type, sort, page, debouncedSearch, showDerived]
  );

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const keyOf = (i: MediaItem) => `${i.bucket}::${i.path}`;
  const selectedItems = useMemo(() => items.filter((i) => selected.has(keyOf(i))), [items, selected]);

  const toggleSelect = (item: MediaItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const openItem = (item: MediaItem) => {
    if (bulkMode) toggleSelect(item);
    else {
      setCopied(false);
      setDetail(item);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — select and copy the URL manually.');
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let failed = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        failed++;
        toast.error(`${file.name}: only images can be uploaded here.`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'products');
        fd.append('seoName', file.name.replace(/\.[^.]+$/, ''));
        const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed');
        ok++;
      } catch (err) {
        failed++;
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
      }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} image${ok > 1 ? 's' : ''} uploaded`);
    if (ok) {
      setSort('newest');
      setPage(1);
      load({ refresh: true });
    }
    if (!ok && !failed) return;
  };

  const confirmDelete = async () => {
    if (!deleteTargets) return;
    setDeleting(true);
    let ok = 0;
    for (const t of deleteTargets) {
      try {
        const res = await fetch('/api/admin/media-library', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: t.bucket, path: t.path }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Delete failed');
        ok++;
      } catch (err) {
        toast.error(`${t.name}: ${err instanceof Error ? err.message : 'Delete failed'}`);
      }
    }
    setDeleting(false);
    setDeleteTargets(null);
    setDetail(null);
    setSelected(new Set());
    if (ok) toast.success(`${ok} file${ok > 1 ? 's' : ''} deleted`);
    load({ refresh: true });
  };

  const counts = data?.counts;

  return (
    <div className="space-y-4">
      {/* Logo + favicon (upload or pick from the library below) */}
      <BrandIdentityCard onChanged={() => load({ refresh: true })} />

      {/* Top bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media by file name or folder…"
            className="pl-9 pr-9"
            aria-label="Search media"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Add new
          </Button>
          <Button variant="outline" onClick={() => load({ refresh: true })} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_TABS.map((t) => {
            const n = counts ? (t.value === 'all' ? counts.all : counts[t.value]) : null;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground/80 hover:bg-accent'
                )}
              >
                {t.label}
                {n !== null && <span className={cn('ml-1.5 text-xs', active ? 'opacity-90' : 'text-muted-foreground')}>{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            aria-label="Folder"
          >
            {Object.entries(BUCKET_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            aria-label="Sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A–Z)</option>
            <option value="size">Largest first</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground/80">
            <input
              type="checkbox"
              checked={showDerived}
              onChange={(e) => setShowDerived(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Show resized copies
          </label>
          <div className="flex overflow-hidden rounded-md border border-input">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={cn('p-2', view === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn('p-2', view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary + bulk bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          {data ? (
            <>
              {data.total} item{data.total === 1 ? '' : 's'}
              {counts ? ` · ${formatBytes(counts.totalBytes)} total` : ''}
              {debouncedSearch ? ` · matching “${debouncedSearch}”` : ''}
            </>
          ) : (
            'Loading…'
          )}
        </p>
        <div className="flex items-center gap-2">
          {bulkMode && selectedItems.length > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setDeleteTargets(selectedItems)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete selected ({selectedItems.length})
            </Button>
          )}
          {bulkMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(new Set(items.map(keyOf)))}
              disabled={items.length === 0}
            >
              Select all on page
            </Button>
          )}
          <Button
            size="sm"
            variant={bulkMode ? 'secondary' : 'outline'}
            onClick={() => {
              setBulkMode((v) => !v);
              setSelected(new Set());
            }}
          >
            {bulkMode ? 'Cancel selection' : 'Bulk select'}
          </Button>
        </div>
      </div>

      {data?.truncated && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Library is very large — not every file is listed (limit: 20,000 per Supabase folder, 150,000 for WordPress uploads). Use the search box or pick a
          specific folder to narrow it down.
        </p>
      )}

      {data?.warnings && data.warnings.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Some folders could not be loaded: {data.warnings.join(' · ')}
        </p>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading media…
        </div>
      ) : items.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-20 text-center text-muted-foreground">
          <ImageOff className="mx-auto mb-2 h-8 w-8" />
          {debouncedSearch ? 'No media matches your search.' : 'No media found.'}
        </div>
      ) : view === 'grid' ? (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
            loading && 'opacity-60 transition-opacity'
          )}
        >
          {items.map((item) => {
            const isSel = selected.has(keyOf(item));
            return (
              <button
                key={keyOf(item)}
                type="button"
                onClick={() => openItem(item)}
                className={cn(
                  'group relative overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isSel ? 'border-primary ring-2 ring-primary' : 'border-border'
                )}
                title={item.path}
              >
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  <Thumb item={item} />
                </div>
                {bulkMode && (
                  <span
                    className={cn(
                      'absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border',
                      isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-white bg-black/30'
                    )}
                  >
                    {isSel && <Check className="h-3.5 w-3.5" />}
                  </span>
                )}
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatBytes(item.size)}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={cn('overflow-x-auto rounded-lg border border-border bg-card', loading && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {bulkMode && <th className="w-10 px-3 py-2" />}
                <th className="px-3 py-2">File</th>
                <th className="hidden px-3 py-2 md:table-cell">Folder</th>
                <th className="hidden px-3 py-2 sm:table-cell">Type</th>
                <th className="px-3 py-2">Size</th>
                <th className="hidden px-3 py-2 sm:table-cell">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSel = selected.has(keyOf(item));
                return (
                  <tr
                    key={keyOf(item)}
                    onClick={() => openItem(item)}
                    className={cn('cursor-pointer border-t border-border hover:bg-accent/50', isSel && 'bg-primary/10')}
                  >
                    {bulkMode && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSel} readOnly className="h-4 w-4" />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                          <Thumb item={item} />
                        </div>
                        <span className="max-w-[260px] truncate font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                      {BUCKET_LABELS[item.bucket]}
                      {item.folder ? ` / ${item.folder}` : ''}
                    </td>
                    <td className="hidden px-3 py-2 capitalize text-muted-foreground sm:table-cell">{item.type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatBytes(item.size)}</td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{formatDate(item.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages || loading}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="break-all pr-6 text-base">{detail.name}</DialogTitle>
                <DialogDescription>
                  {BUCKET_LABELS[detail.bucket]} · {detail.type} · {formatBytes(detail.size)} · {formatDate(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex max-h-[50vh] items-center justify-center overflow-hidden rounded-md bg-muted">
                {detail.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.url} alt={detail.name} className="max-h-[50vh] w-auto object-contain" />
                ) : detail.type === 'video' ? (
                  <video src={detail.url} controls playsInline className="max-h-[50vh] w-full" />
                ) : (
                  <div className="py-16 text-muted-foreground">
                    <FileText className="mx-auto h-10 w-10" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File URL</label>
                <div className="flex gap-2">
                  <Input readOnly value={detail.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                  <Button variant="outline" onClick={() => copyUrl(detail.url)}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="break-all text-xs text-muted-foreground">Path: {detail.bucket}/{detail.path}</p>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="destructive" onClick={() => setDeleteTargets([detail])}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
                </Button>
                <Button variant="outline" asChild>
                  <a href={detail.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTargets} onOpenChange={(o) => !o && !deleting && setDeleteTargets(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTargets?.length === 1 ? 'this file' : `${deleteTargets?.length} files`} permanently?
            </DialogTitle>
            <DialogDescription>
              The file and its resized copies are removed from storage (for WordPress uploads: from Cloudflare R2). If a product, banner or blog post still uses
              it, that image will show as broken. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargets(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
