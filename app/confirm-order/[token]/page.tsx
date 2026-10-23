'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, CheckCircle2, Loader2, Package, ShieldCheck, Wallet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';

type Summary = { id: string; shortId: string; firstName: string; total: number; itemNames: string[]; items?: { name: string; imageUrl: string | null; size: string | null; quantity: number; lineTotal: number }[]; itemCount: number };
type Lookup =
  | { state: 'invalid' | 'expired' | 'cancelled' | 'not_cod' }
  | { state: 'ok' | 'confirmed' | 'processing'; summary: Summary };

const MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: { title: 'This link is not valid', body: 'The link may be incomplete. Please open it again from your email or WhatsApp message.' },
  expired: { title: 'This link has expired', body: 'Please contact us and we will confirm your order for you.' },
  cancelled: { title: 'This order was cancelled', body: 'There is nothing to confirm for this order.' },
  not_cod: { title: 'No confirmation needed', body: 'This order is no longer Cash on Delivery. Please check your email for the latest update.' },
};

export default function ConfirmOrderPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cod-confirm?token=${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ state: 'invalid' }));
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/cod-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      });
      const d: Lookup = await res.json();
      if (d.state === 'confirmed') setData(d);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const summary = data && 'summary' in data ? data.summary : null;
  const confirmed = data?.state === 'confirmed';

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
      <div className="w-full overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_20px_50px_-28px_hsl(var(--primary)/0.5)]">
        <div className="h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
        <div className="p-6">
          {!data && (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Checking your order…</p>
            </div>
          )}

          {data && !summary && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="h-9 w-9 text-secondary" />
              <h1 className="font-serif text-xl font-bold text-primary">{MESSAGES[data.state]?.title}</h1>
              <p className="text-sm text-muted-foreground">{MESSAGES[data.state]?.body}</p>
              <Link href="/contact" className="mt-2 text-sm font-medium text-primary underline underline-offset-4">
                Contact us
              </Link>
            </div>
          )}

          {summary && (
            <>
              <div className="flex flex-col items-center text-center">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    confirmed ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {confirmed ? <CheckCircle2 className="h-8 w-8" /> : <Wallet className="h-7 w-7" />}
                </span>
                <h1 className="mt-3 font-serif text-2xl font-bold text-primary">
                  {confirmed
                    ? 'Order confirmed, thank you!'
                    : `Confirm your order${summary.firstName ? `, ${summary.firstName}` : ''}`}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {confirmed
                    ? `Order #${summary.shortId} is confirmed. We will keep you updated on email and WhatsApp.`
                    : data?.state === 'processing'
                    ? `Order #${summary.shortId} is already being processed. Nothing more is needed from you.`
                    : `One tap to confirm your Cash on Delivery order #${summary.shortId}.`}
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Package className="h-4 w-4 text-secondary" />
                  {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'}
                </div>
                <ul className="mt-3 space-y-3 text-sm">
                  {(summary.items && summary.items.length > 0
                    ? summary.items
                    : summary.itemNames.map((n) => ({ name: n, imageUrl: null, size: null, quantity: 1, lineTotal: 0 }))
                  ).map((it, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
                        <Image
                          src={it.imageUrl || 'https://placehold.co/80x80?text=No+Image'}
                          alt={it.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-medium leading-snug">{it.name}</p>
                        {(it.size || it.quantity > 1) && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {it.size ? `Size: ${it.size}` : ''}
                            {it.size && it.quantity > 1 ? ' · ' : ''}
                            {it.quantity > 1 ? `Qty: ${it.quantity}` : ''}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                  {summary.itemCount > (summary.items?.length ?? summary.itemNames.length) && (
                    <li className="text-xs text-muted-foreground">
                      + {summary.itemCount - (summary.items?.length ?? summary.itemNames.length)} more
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="text-sm text-muted-foreground">Pay on delivery</span>
                  <span className="font-serif text-lg font-bold text-primary">{formatINR(summary.total)}</span>
                </div>
              </div>

              {data?.state === 'ok' && (
                <>
                  <Button onClick={confirm} disabled={busy} size="lg" className="mt-5 w-full bg-primary">
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming…
                      </>
                    ) : (
                      <>
                        <BadgeCheck className="mr-2 h-4 w-4" /> Yes, confirm my order
                      </>
                    )}
                  </Button>
                  {failed && (
                    <p className="mt-2 text-center text-xs text-red-600">Something went wrong. Please try again.</p>
                  )}
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-secondary" /> No payment needed now. You pay when it arrives.
                  </p>
                </>
              )}

              {(confirmed || data?.state === 'processing') && (
                <Button asChild variant="outline" size="lg" className="mt-5 w-full">
                  <Link href={`/track/${summary.id}`}>Track my order</Link>
                </Button>
              )}

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Want to change or cancel?{' '}
                <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
                  Contact us
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
