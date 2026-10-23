'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { fetchMarketingSettings, MarketingSettings } from '@/lib/marketing-api';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';

export default function WhatsAppButton() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<MarketingSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarketingSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden inside the admin dashboard and while settings are unresolved,
  // disabled, or missing a number.
  if (pathname?.startsWith('/admin')) return null;
  if (!settings?.whatsapp_enabled || !settings.whatsapp_number) return null;

  const digits = settings.whatsapp_number.replace(/\D/g, '');
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(settings.whatsapp_message || '')}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-20 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 sm:bottom-6"
    >
      <WhatsAppIcon className="h-7 w-7 text-white" />
    </a>
  );
}
