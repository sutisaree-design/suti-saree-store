'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, ImageOff, ChevronLeft, ChevronRight, Check } from 'lucide-react';
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

interface PickerItem {
  bucket: string;
  path: string;
  name: string;
  url: string;
  size: number;
  thumb?: string;
}

/**
 * "Select from media library" popup (like WordPress's Select Image modal).
 * Shows only images, with search + pagination, and hands the chosen file's URL
 * back through onSelect.
 */
export default function MediaPickerDialog({
  open,
  onOpenChange,
  title = 'Select image',
  description = 'Pick an image from your media library.',
  busy = false,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  busy?: boolean;
  onSelect: (item: PickerItem) => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PickerItem | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    if (!open) {
      setChosen(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ type: 'image', sort: 'newest', page: String(page), perPage: '24' });
    if (debounced) params.set('q', debounced);
    fetch(`/api/admin/media-library?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(json.error || 'Could not load media.');
        setItems(json.items || []);
        setTotalPages(json.totalPages || 1);
      })
      .catch((err) => id === reqId.current && setError(err instanceof Error ? err.message : 'Could not load media.'))
      .finally(() => id === reqId.current && setLoading(false));
  }, [open, page, debounced]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name…"
            className="pl-9"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="min-h-[240px]">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ImageOff className="mx-auto mb-2 h-8 w-8" />
              No images found.
            </div>
          ) : (
            <div className={cn('grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6', loading && 'opacity-60')}>
              {items.map((item) => {
                const isSel = chosen?.url === item.url;
                return (
                  <button
                    key={`${item.bucket}/${item.path}`}
                    type="button"
                    onClick={() => setChosen(item)}
                    title={item.name}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-md border bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isSel ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/60'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb || item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                    {isSel && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => chosen && onSelect(chosen)} disabled={!chosen || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Use selected image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
