'use client';

import { useState, FormEvent } from 'react';
import { BellRing, CheckCircle2, Loader2, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { requestStockNotification } from '@/lib/stock-notify-api';
import { toast } from 'sonner';

type Channel = 'whatsapp' | 'email';

export type NotifyVariant = { color?: string | null; slug?: string | null; image?: string | null };

export default function NotifyMeForm({
  productId,
  variant,
  embedded = false,
}: {
  productId: string;
  variant?: NotifyVariant;
  /** true inside the popup: no outer card/header, the dialog supplies those */
  embedded?: boolean;
}) {
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneVia, setDoneVia] = useState<Channel | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (channel === 'whatsapp') {
      const digits = trimmed.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      if (digits.length !== 10) {
        toast.error('Please enter a valid 10-digit WhatsApp number');
        return;
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      await requestStockNotification(
        productId,
        channel === 'whatsapp' ? { phone: trimmed } : { email: trimmed },
        variant
      );
      setDoneVia(channel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong, please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (doneVia) {
    return (
      <div
        className={`text-center ${
          embedded ? 'py-2' : 'rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-background p-5 shadow-sm'
        }`}
      >
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="mt-3 font-serif text-lg font-bold text-emerald-900">You&apos;re on the list!</p>
        <p className="mt-1 text-sm text-emerald-800/80">
          We&apos;ll message you on {doneVia === 'whatsapp' ? 'WhatsApp' : 'email'} the moment this saree is back in
          stock.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        embedded
          ? ''
          : 'overflow-hidden rounded-xl border border-secondary/30 bg-gradient-to-br from-secondary/10 via-card to-card shadow-sm'
      }
    >
      {!embedded && (
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <BellRing className="h-5 w-5" />
        </span>
        <div>
          <p className="font-serif text-base font-bold leading-tight text-primary">Sold out — but not forever</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tell us where to reach you and we&apos;ll alert you the moment it&apos;s back in stock.
          </p>
        </div>
      </div>
      )}

      <div className={embedded ? '' : 'px-4 pb-4'}>
        <div role="tablist" aria-label="How should we notify you?" className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
          {(
            [
              { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
              { id: 'email', label: 'Email', Icon: Mail },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={channel === id}
              onClick={() => {
                setChannel(id);
                setValue('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition ${
                channel === id ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-4 w-4 ${id === 'whatsapp' && channel === id ? 'text-emerald-600' : ''}`} />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          {channel === 'whatsapp' && (
            <span className="flex items-center border-r border-border bg-muted/50 px-3 text-base font-medium text-muted-foreground sm:text-sm">
              +91
            </span>
          )}
          <input
            key={channel}
            type={channel === 'whatsapp' ? 'tel' : 'email'}
            inputMode={channel === 'whatsapp' ? 'numeric' : 'email'}
            autoComplete={channel === 'whatsapp' ? 'tel-national' : 'email'}
            placeholder={channel === 'whatsapp' ? '10-digit WhatsApp number' : 'you@example.com'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-transparent px-3 py-3 text-base outline-none placeholder:text-muted-foreground/70 sm:text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-shine mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Notify me when available
        </button>

        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Only used to alert you about this product. No spam.
        </p>
      </div>
    </form>
  );
}
