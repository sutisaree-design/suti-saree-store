'use client';

import { useCallback, useEffect, useRef, useState, ChangeEvent } from 'react';
import { Upload, FolderOpen, Trash2, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import MediaPickerDialog from './media-picker-dialog';
import { cn } from '@/lib/utils';

type Kind = 'logo' | 'favicon';

interface Brand {
  logo_url: string;
  favicon_url: string;
}

const COPY: Record<Kind, { title: string; hint: string; usedIn: string; box: string; img: string }> = {
  logo: {
    title: 'Logo',
    hint: 'PNG with transparent background works best. Wide logos look great (about 3:1).',
    usedIn: 'Website header & footer, mobile menu, all emails, campaign emails, invoice PDF, Google logo.',
    box: 'h-28',
    img: 'max-h-20 max-w-full object-contain',
  },
  favicon: {
    title: 'Favicon',
    hint: 'Square image, at least 48×48 px (512×512 recommended).',
    usedIn: 'Browser tab, Google search results, phone home-screen / app icon.',
    box: 'h-28',
    img: 'h-16 w-16 object-contain',
  },
};

function BrandSlot({
  kind,
  url,
  busy,
  onUpload,
  onPick,
  onRemove,
}: {
  kind: Kind;
  url: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const c = COPY[kind];

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onUpload(f);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="text-xs text-muted-foreground">{c.hint}</p>
      </div>
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-dashed border-border p-3',
          c.box,
          // light checkerboard so transparent PNGs are easy to judge
          '[background-image:linear-gradient(45deg,#f1f1f1_25%,transparent_25%,transparent_75%,#f1f1f1_75%),linear-gradient(45deg,#f1f1f1_25%,transparent_25%,transparent_75%,#f1f1f1_75%)] [background-position:0_0,8px_8px] [background-size:16px_16px]'
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${c.title} preview`} className={c.img} />
        ) : (
          <div className="text-center text-xs text-muted-foreground">
            <ImageOff className="mx-auto mb-1 h-5 w-5" />
            Not set — default is used
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="mr-1.5 h-4 w-4" /> Upload
        </Button>
        <Button size="sm" variant="outline" onClick={onPick} disabled={busy}>
          <FolderOpen className="mr-1.5 h-4 w-4" /> Select from library
        </Button>
        {url && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove} disabled={busy}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Used in:</span> {c.usedIn}
      </p>
    </div>
  );
}

export default function BrandIdentityCard({ onChanged }: { onChanged?: () => void }) {
  const [brand, setBrand] = useState<Brand>({ logo_url: '', favicon_url: '' });
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<Kind | null>(null);
  const [pickerKind, setPickerKind] = useState<Kind | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brand', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setBrand({ logo_url: json.logo_url || '', favicon_url: json.favicon_url || '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async (kind: Kind, init: RequestInit) => {
    setBusyKind(kind);
    try {
      const qs = init.method === 'DELETE' ? `?kind=${kind}` : '';
      const res = await fetch(`/api/admin/brand${qs}`, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong');
      setBrand({ logo_url: json.logo_url || '', favicon_url: json.favicon_url || '' });
      onChanged?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusyKind(null);
    }
  };

  const upload = async (kind: Kind, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    if (await apply(kind, { method: 'POST', body: fd })) toast.success(`${COPY[kind].title} updated`);
  };

  const pick = async (kind: Kind, url: string) => {
    const ok = await apply(kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, url }),
    });
    if (ok) {
      toast.success(`${COPY[kind].title} updated`);
      setPickerKind(null);
    }
  };

  const removeKind = async (kind: Kind) => {
    if (!window.confirm(`Remove the ${kind}? The original default will be used again.`)) return;
    if (await apply(kind, { method: 'DELETE' })) toast.success(`${COPY[kind].title} removed`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="font-serif text-lg font-bold text-primary">Brand identity</h2>
        <p className="text-sm text-muted-foreground">
          Set your logo and favicon once — they are used across the website, emails and invoices.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <BrandSlot
            kind="logo"
            url={brand.logo_url}
            busy={busyKind === 'logo'}
            onUpload={(f) => upload('logo', f)}
            onPick={() => setPickerKind('logo')}
            onRemove={() => removeKind('logo')}
          />
          <BrandSlot
            kind="favicon"
            url={brand.favicon_url}
            busy={busyKind === 'favicon'}
            onUpload={(f) => upload('favicon', f)}
            onPick={() => setPickerKind('favicon')}
            onRemove={() => removeKind('favicon')}
          />
        </div>
      )}

      <MediaPickerDialog
        open={!!pickerKind}
        onOpenChange={(o) => !o && setPickerKind(null)}
        title={pickerKind === 'favicon' ? 'Select favicon' : 'Select logo'}
        description="Choose an image from your media library. It is converted to a PNG automatically so it works in emails and browsers."
        busy={!!busyKind}
        onSelect={async (item) => {
          if (pickerKind) await pick(pickerKind, item.url);
        }}
      />
    </div>
  );

}
