'use client';

import { useState } from 'react';
import { BadgeCheck, Clock, Copy, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const VIA_LABEL: Record<string, string> = {
  link: 'link',
  whatsapp_reply: 'WhatsApp reply',
  admin: 'admin',
};

interface Props {
  orderId: string;
  /** Digits with country code (e.g. 919876543210) or null when the phone is invalid. */
  whatsappDigits: string | null;
  firstName: string;
  shortId: string;
  total: number;
  storeName: string;
  confirmedAt?: string | null;
  confirmedVia?: string | null;
  onChanged: () => void;
}

/**
 * Admin > Orders: COD confirmation status + actions.
 * Purely informational for the admin -- it never blocks shipping by itself.
 */
export default function CodConfirmationControls({
  orderId,
  whatsappDigits,
  firstName,
  shortId,
  total,
  storeName,
  confirmedAt,
  confirmedVia,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<'wa' | 'copy' | 'mark' | null>(null);

  const fetchLink = async (): Promise<string | null> => {
    const res = await fetch(`/api/admin/orders/${orderId}/cod-confirmation`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.url) {
      toast.error(body?.error || 'Could not create the confirmation link');
      return null;
    }
    return body.url as string;
  };

  const sendWhatsApp = async () => {
    if (!whatsappDigits) return;
    setBusy('wa');
    // Open the tab synchronously (inside the click) so popup blockers allow it.
    const win = window.open('', '_blank');
    try {
      const url = await fetchLink();
      if (!url) {
        win?.close();
        return;
      }
      const inr = `₹${Math.round(total).toLocaleString('en-IN')}`;
      const text = [
        `Dear${firstName ? ` ${firstName}` : ''},`,
        '',
        `Thank you for ordering from *${storeName}*. We have received your Cash on Delivery order *#${shortId}* of *${inr}*.`,
        '',
        `Please confirm it with one tap so we can get it ready for dispatch:`,
        url,
        '',
        `You can also simply reply *YES* to this message.`,
        '',
        `Warm regards,`,
        `*Team ${storeName}*`,
      ].join('\n');
      const wa = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(text)}`;
      if (win) win.location.href = wa;
      else window.location.href = wa;
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    setBusy('copy');
    try {
      const url = await fetchLink();
      if (url) {
        await navigator.clipboard.writeText(url);
        toast.success('Confirmation link copied');
      }
    } finally {
      setBusy(null);
    }
  };

  const markConfirmed = async () => {
    setBusy('mark');
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cod-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_confirmed' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || 'Could not mark as confirmed');
        return;
      }
      toast.success('Marked as confirmed');
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  if (confirmedAt) {
    return (
      <span
        className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
        title={new Date(confirmedAt).toLocaleString('en-IN')}
      >
        <BadgeCheck className="h-3 w-3" />
        COD confirmed{confirmedVia ? ` · ${VIA_LABEL[confirmedVia] || confirmedVia}` : ''}
      </span>
    );
  }

  const btn =
    'inline-flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-tight disabled:opacity-60';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        <Clock className="h-3 w-3" />
        COD awaiting confirmation
      </span>
      <div className="flex flex-wrap gap-1.5">
        {whatsappDigits ? (
          <button
            type="button"
            onClick={sendWhatsApp}
            disabled={busy !== null}
            className={`${btn} border-transparent bg-[#25D366] text-white hover:bg-[#1ebe57]`}
            title="Opens WhatsApp with a message containing the customer's one-tap confirm link"
          >
            {busy === 'wa' ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
            Ask to confirm on WhatsApp
          </button>
        ) : (
          <span className="text-[10px] text-red-600">No valid phone number for WhatsApp</span>
        )}
        <button type="button" onClick={copyLink} disabled={busy !== null} className={`${btn} border-border bg-card hover:bg-muted`}>
          {busy === 'copy' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
          Copy link
        </button>
        <button
          type="button"
          onClick={markConfirmed}
          disabled={busy !== null}
          className={`${btn} border-border bg-card hover:bg-muted`}
          title="Use when the customer confirmed by phone or by replying on WhatsApp"
        >
          {busy === 'mark' ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />}
          Mark confirmed
        </button>
      </div>
    </div>
  );
}
