'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchMyStockHoldDays, updateMyStockHoldDays } from '@/lib/vendor-api';

const MIN_DAYS = 15;
const MAX_DAYS = 30;

/**
 * Vendor > Settings — "Stock hold window". Kitne din ek returned/RTO
 * unit warehouse me hold rahega, bina kisi naye order ke, uske baad
 * automatically Return to Vendor queue me chala jaata hai (admin ke
 * Vendor Ops panel me). Minimum 15 din (default), vendor chaahe to
 * 30 din tak badha sakta hai.
 */
export default function StockHoldSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedDays, setSavedDays] = useState<number>(MIN_DAYS);
  const [days, setDays] = useState<number>(MIN_DAYS);

  useEffect(() => {
    fetchMyStockHoldDays()
      .then((d) => {
        setSavedDays(d);
        setDays(d);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateMyStockHoldDays(days);
      setSavedDays(updated);
      setDays(updated);
      toast.success(`Stock hold window set to ${updated} days`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5">
      <p className="flex items-center gap-2 font-serif text-lg font-semibold text-primary">
        <TimerReset className="h-4.5 w-4.5" /> Stock Hold Window
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Jab aapka koi item return ya RTO hoke warehouse wapas aata hai, ye setting decide karti hai ki
        kitne din tak use warehouse me rakha jaayega (isi dauraan agar usi product ka koi naya order aa
        jaaye, to hold apne aap cancel ho jaata hai). Agar is window ke andar koi naya order nahi aata,
        item automatically <span className="font-medium text-foreground">Return to Vendor</span> queue
        me chala jaata hai aur admin aapko wapas bhej dega.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-48 accent-primary"
          />
          <span className="min-w-[70px] rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-center text-sm font-semibold text-primary">
            {days} din
          </span>
        </div>
        <Button size="sm" className="bg-primary" disabled={saving || days === savedDays} onClick={handleSave}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Minimum {MIN_DAYS} din (default), maximum {MAX_DAYS} din. Current: {savedDays} din.
      </p>
    </div>
  );
}
