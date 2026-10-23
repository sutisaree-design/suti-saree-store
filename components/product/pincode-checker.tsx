'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { MapPin, CheckCircle2, XCircle, Loader2, Truck, ChevronRight, Clock } from 'lucide-react';
import { checkPincodeServiceability, PincodeResult } from '@/lib/pincode-api';
import {
  fetchFulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
  FulfillmentSettings,
} from '@/lib/marketing-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Once a shopper's pincode is confirmed serviceable, it's remembered here so
// they never have to re-type it on every product page — same pincode is
// reused everywhere PincodeChecker is rendered, until they tap "Change".
const STORAGE_KEY = 'aruhi_delivery_pincode';

interface SavedLocation extends PincodeResult {
  savedAt: number;
}

function loadSavedLocation(): SavedLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    return parsed.serviceable ? parsed : null;
  } catch {
    return null;
  }
}

function saveLocation(result: PincodeResult) {
  if (typeof window === 'undefined') return;
  try {
    const toSave: SavedLocation = { ...result, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage unavailable (private browsing etc.) — the checker still works,
    // it just won't be remembered on the next visit.
  }
}

// MUST match "Order cut off" under Google Merchant Center > Shipping >
// Delivery times exactly (currently 2:00 PM IST there). Orders placed
// before this hour count as handled same-day; after it, handling starts
// the next day. Keeping this in sync with Merchant Center avoids a
// delivery-time mismatch between what's shown here and what's declared
// to Google — see shipping/misrepresentation policy.
const ORDER_CUTOFF_HOUR = 14;

function nextCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setHours(ORDER_CUTOFF_HOUR, 0, 0, 0);
  if (now >= cutoff) cutoff.setDate(cutoff.getDate() + 1);
  return cutoff;
}

function effectiveHandlingStart(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setHours(ORDER_CUTOFF_HOUR, 0, 0, 0);
  const start = new Date(now);
  if (now >= cutoff) start.setDate(start.getDate() + 1);
  return start;
}

// Same rough zone-by-PIN-digit grouping used elsewhere on the site, but
// mapped to a delivery TIER instead of a fixed day count, so the actual
// day counts always come from fulfillment settings (Admin > Marketing >
// Shipping & Returns Timing) — the same numbers submitted in the Google
// Merchant Center feed. This keeps the on-site estimate and the Merchant
// Center-declared delivery time from ever drifting apart.
type Tier = 'metro' | 'other' | 'remote';
const ZONE_TIER: Record<string, Tier> = {
  '1': 'metro', // Delhi, Haryana, Punjab, HP, J&K
  '2': 'other', // UP, Uttarakhand
  '3': 'other', // Rajasthan, Gujarat
  '4': 'metro', // Maharashtra, MP, Chhattisgarh, Goa
  '5': 'other', // AP, Telangana, Karnataka
  '6': 'other', // Tamil Nadu, Kerala, Puducherry
  '7': 'metro', // West Bengal, Odisha, NE states
  '8': 'remote', // Bihar, Jharkhand
  '9': 'remote', // Army post offices / remote
};

function tierForPincode(pincode: string): Tier {
  return ZONE_TIER[pincode[0]] ?? 'other';
}

function tierWindow(f: FulfillmentSettings, tier: Tier): { min: number; max: number } {
  if (tier === 'metro') return { min: f.delivery_metro_min, max: f.delivery_metro_max };
  if (tier === 'remote') return { min: f.delivery_remote_min, max: f.delivery_remote_max };
  return { min: f.delivery_other_min, max: f.delivery_other_max };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDeliveryDate(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function DeliveryCountdown() {
  const [msLeft, setMsLeft] = useState(() => nextCutoff(new Date()).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setMsLeft(nextCutoff(new Date()).getTime() - Date.now());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-destructive"
      title="Order within this time to get the delivery estimate above"
    >
      <Clock className="h-3 w-3 shrink-0" />
      {formatCountdown(msLeft)} left
    </span>
  );
}

export default function PincodeChecker() {
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [editing, setEditing] = useState(false);
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<PincodeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);

  useEffect(() => {
    const existing = loadSavedLocation();
    setSaved(existing);
    setEditing(!existing);
    fetchFulfillmentSettings().then(setFulfillment).catch(() => {});
  }, []);

  const onCheck = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!pincode.trim()) return;
      setChecking(true);
      setResult(null);
      try {
        const res = await checkPincodeServiceability(pincode);
        setResult(res);
        if (res.serviceable) {
          saveLocation(res);
          setSaved({ ...res, savedAt: Date.now() });
          setEditing(false);
        }
      } finally {
        setChecking(false);
      }
    },
    [pincode]
  );

  // Total delivery window = handling time (dispatch_days) + transit time
  // for this pincode's tier — both pulled from fulfillment settings, the
  // same source that feeds the Google Merchant Center product feed. A
  // range is shown (not a single date) because transit time genuinely
  // varies 3-12 days across India; collapsing that to one date would
  // either overpromise for remote areas or undersell metro speed.
  const deliveryRange = saved
    ? (() => {
        const start = effectiveHandlingStart(new Date());
        const tier = tierForPincode(saved.pincode);
        const window = tierWindow(fulfillment, tier);
        const minDate = addDays(start, fulfillment.dispatch_days_min + window.min);
        const maxDate = addDays(start, fulfillment.dispatch_days_max + window.max);
        return { minDate, maxDate };
      })()
    : null;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4 text-secondary" />
        Delivery details
      </div>

      {!editing && saved ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3 rounded-md bg-secondary/10 p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <div>
                <p className="text-sm font-semibold">
                  Delivering to {saved.city ? `${saved.city}, ` : ''}
                  {saved.pincode}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setPincode('');
                setResult(null);
              }}
              className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
            >
              Change
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <p className="flex min-w-0 shrink items-center gap-1.5 whitespace-nowrap text-xs font-medium sm:text-sm">
              <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
              {deliveryRange &&
                (formatDeliveryDate(deliveryRange.minDate) === formatDeliveryDate(deliveryRange.maxDate)
                  ? `By ${formatDeliveryDate(deliveryRange.maxDate)}`
                  : `${formatDeliveryDate(deliveryRange.minDate)} – ${formatDeliveryDate(deliveryRange.maxDate)}`)}
            </p>
            <DeliveryCountdown />
          </div>
          {/* NOTE: an occasion badge (e.g. "Arriving before Rakhi") can go
              here — intentionally left out for now, add when ready. */}
        </div>
      ) : (
        <>
          {!saved && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mb-3 flex w-full items-center justify-between gap-2 rounded-md bg-secondary/10 p-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-secondary" />
                Location not set
              </span>
              <span className="flex items-center gap-0.5 text-xs font-semibold text-primary">
                Select delivery location
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          )}

          <form onSubmit={onCheck} className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter pincode"
                inputMode="numeric"
                autoFocus={!saved}
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={checking || pincode.length !== 6} variant="outline">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
            </Button>
            {saved && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </form>

          {result && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-md p-3 text-sm ${
                result.serviceable
                  ? 'bg-secondary/10 text-secondary-foreground'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {result.serviceable ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div>
                <p className="font-medium">{result.message}</p>
                {result.serviceable && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {result.codAvailable ? 'Cash on Delivery available' : 'Prepaid orders only'}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

