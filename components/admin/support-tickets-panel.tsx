'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { Loader2, LifeBuoy, Bot, Send, Mail, Paperclip, X, Search, Package } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type SuggestedProduct = {
  id: string;
  name: string;
  slug?: string | null;
  image?: string | null;
  price?: number | null;
};

type TicketRow = {
  id: string;
  order_id: string | null;
  customer_name?: string | null;
  customer_email: string;
  subject: string;
  message: string;
  source: 'chat' | 'admin' | 'email' | 'other';
  status: string;
  admin_notes?: string | null;
  reply_message?: string | null;
  replied_at?: string | null;
  created_at: string;
  attachment_url?: string | null;
  reply_attachment_url?: string | null;
  suggested_product?: SuggestedProduct | null;
  order?: {
    customer_name?: string;
    customer_email?: string;
    status?: string;
    total_amount?: number;
  } | null;
};

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-muted text-muted-foreground',
};

export default function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  useAdminFocus(!loading && tickets.length > 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/support-tickets');
      if (res.ok) {
        const body = await res.json();
        setTickets(body.tickets || []);
      } else {
        toast.error('Failed to load support tickets');
      }
    } catch {
      toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const chatCount = tickets.filter((t) => t.source === 'chat').length;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Tickets</p>
          <p className="mt-2 text-2xl font-semibold">{tickets.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="mt-2 text-2xl font-semibold">{openCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Raised via AI Chat</p>
          <p className="mt-2 flex items-center gap-1.5 text-2xl font-semibold">
            <Bot className="h-4 w-4 text-muted-foreground" /> {chatCount}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <LifeBuoy className="h-10 w-10" />
          <p>No support tickets yet. Tickets raised from the AI chat widget will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((t) => (
            <div key={t.id} data-focus-id={t.id}>
              <TicketCard t={t} onUpdated={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({ t, onUpdated }: { t: TicketRow; onUpdated: () => void }) {
  const [status, setStatus] = useState(t.status);
  const [notes, setNotes] = useState(t.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Optional photo/PDF attached to the reply (e.g. a size chart, a
  // replacement-item photo, a courier POD) — uploaded immediately on
  // pick so "Send reply" itself stays a single fast round-trip.
  const [replyAttachment, setReplyAttachment] = useState<{ url: string; name: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optional product to recommend in the reply — searched from the
  // catalog via /api/admin/products/search.
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<SuggestedProduct[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [showProductResults, setShowProductResults] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SuggestedProduct | null>(null);

  const dirty = status !== t.status || notes !== (t.admin_notes || '');

  const handleAttachmentPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttaching(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/support-tickets/upload-attachment', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok && data.url) {
        setReplyAttachment({ url: data.url, name: data.name || file.name });
      } else {
        toast.error(data?.error || 'Failed to upload attachment');
      }
    } catch {
      toast.error('Failed to upload attachment');
    } finally {
      setAttaching(false);
    }
  };

  // Debounced product search as the admin types.
  useEffect(() => {
    const q = productQuery.trim();
    if (!q) {
      setProductResults([]);
      return;
    }
    setSearchingProducts(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({ products: [] }));
        setProductResults(data.products || []);
      } catch {
        setProductResults([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [productQuery]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/support-tickets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: notes }),
      });
      if (res.ok) {
        toast.success('Ticket updated');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/support-tickets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reply_message: replyText,
          reply_attachment_url: replyAttachment?.url || null,
          suggested_product: selectedProduct || null,
        }),
      });
      if (res.ok) {
        toast.success(`Reply emailed to ${t.customer_email}`);
        setReplyText('');
        setReplyAttachment(null);
        setSelectedProduct(null);
        setProductQuery('');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to send reply');
      }
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {t.subject}{' '}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-muted'}`}>
              {t.status.replace('_', ' ')}
            </span>
            {t.source === 'chat' && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Bot className="h-3 w-3" /> AI chat
              </span>
            )}
            {t.replied_at && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Mail className="h-3 w-3" /> Replied
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.customer_name || 'Guest'} ({t.customer_email})
            {t.order_id && <> &middot; Order #{t.order_id.slice(0, 8).toUpperCase()}</>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Raised {new Date(t.created_at).toLocaleString('en-IN')}
          </p>
        </div>
        {t.order?.total_amount !== undefined && (
          <div className="text-sm font-semibold">{formatINR(t.order.total_amount!)}</div>
        )}
      </div>

      <p className="mt-3 text-sm">
        <span className="font-medium">Message: </span>
        {t.message}
      </p>

      {t.attachment_url && (
        <a
          href={t.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground hover:border-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.attachment_url} alt="" className="h-8 w-8 rounded object-cover" />
          Customer&apos;s attachment — view full size
        </a>
      )}

      {t.reply_message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
            Your reply {t.replied_at ? `· ${new Date(t.replied_at).toLocaleString('en-IN')}` : ''}
          </p>
          <p className="whitespace-pre-wrap text-emerald-900">{t.reply_message}</p>
          {t.reply_attachment_url && (
            <a
              href={t.reply_attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 underline"
            >
              <Paperclip className="h-3 w-3" /> View attachment
            </a>
          )}
          {t.suggested_product && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-white/70 p-1.5">
              {t.suggested_product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.suggested_product.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : (
                <Package className="h-8 w-8 shrink-0 rounded bg-muted p-1.5 text-muted-foreground" />
              )}
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-emerald-900">{t.suggested_product.name}</p>
                {typeof t.suggested_product.price === 'number' && (
                  <p className="text-emerald-700">{formatINR(t.suggested_product.price)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Emails the customer directly (via the configured Resend/ZeptoMail
          provider) -- separate from "Internal note" below, which the
          customer never sees. */}
      <div className="mt-4 grid gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Reply to customer (sent by email)</label>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={`Type your reply to ${t.customer_email}...`}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm"
        />

        {/* Attach a photo/PDF to this reply. */}
        <div>
          {replyAttachment ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={replyAttachment.url} alt="" className="h-7 w-7 rounded object-cover" />
              <span className="flex-1 truncate">{replyAttachment.name}</span>
              <button
                type="button"
                onClick={() => setReplyAttachment(null)}
                aria-label="Remove attachment"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleAttachmentPick}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {attaching ? 'Uploading...' : 'Attach a photo or PDF'}
              </button>
            </>
          )}
        </div>

        {/* Suggest a product from the catalog. */}
        <div className="relative">
          {selectedProduct ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              {selectedProduct.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedProduct.image} alt="" className="h-7 w-7 rounded object-cover" />
              ) : (
                <Package className="h-7 w-7 shrink-0 rounded bg-muted p-1 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">
                Suggesting: <span className="font-medium">{selectedProduct.name}</span>
                {typeof selectedProduct.price === 'number' && ` — ${formatINR(selectedProduct.price)}`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                aria-label="Remove suggested product"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setShowProductResults(true);
                }}
                onFocus={() => setShowProductResults(true)}
                onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                placeholder="Suggest a product to the customer (search by name)"
                className="w-full rounded-md border border-dashed border-border py-1.5 pl-8 pr-2 text-xs outline-none transition-colors focus:border-primary"
              />
              {showProductResults && productQuery.trim() && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                  {searchingProducts ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                    </div>
                  ) : productResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No products found.</p>
                  ) : (
                    productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedProduct(p);
                          setProductQuery('');
                          setProductResults([]);
                          setShowProductResults(false);
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-muted"
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                        ) : (
                          <Package className="h-7 w-7 shrink-0 rounded bg-muted p-1 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {typeof p.price === 'number' && (
                          <span className="shrink-0 text-muted-foreground">{formatINR(p.price)}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={sendReply} disabled={!replyText.trim() || sendingReply} className="gap-1.5">
            {sendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send reply
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Internal note</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
