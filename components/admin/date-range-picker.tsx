'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  subHours,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SimpleRange {
  from: Date;
  to: Date;
}

interface Preset {
  label: string;
  getRange: () => SimpleRange;
}

// Hour-level presets -- kept as exact timestamps (not startOfDay/endOfDay)
// so "Last 1 hour" etc. actually means the trailing N hours, not the day.
const HOUR_PRESETS: Preset[] = [
  { label: 'Last 1 hour', getRange: () => ({ from: subHours(new Date(), 1), to: new Date() }) },
  { label: 'Last 6 hours', getRange: () => ({ from: subHours(new Date(), 6), to: new Date() }) },
  { label: 'Last 12 hours', getRange: () => ({ from: subHours(new Date(), 12), to: new Date() }) },
  { label: 'Last 24 hours', getRange: () => ({ from: subHours(new Date(), 24), to: new Date() }) },
];

const DAY_PRESETS: Preset[] = [
  { label: 'Today', getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    label: 'Last 7 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    label: 'Last 30 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    label: 'Last 90 days',
    getRange: () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }),
  },
  {
    label: 'This month',
    getRange: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }),
  },
  {
    label: 'Last month',
    getRange: () => {
      const prev = subMonths(new Date(), 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    },
  },
];

const DEFAULT_LABEL = 'Last 30 days';

export function DateRangePicker({
  value,
  onChange,
}: {
  value: SimpleRange;
  onChange: (range: SimpleRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: value.from, to: value.to });
  // Two full-width months don't fit a phone screen -- show one on narrow
  // viewports, two on everything wide enough (matches Tailwind's sm: 640px).
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsNarrow(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  // Tracked explicitly (rather than diffed from `value`) so hour-level
  // presets -- whose `to` is `new Date()` at click time -- still show the
  // right active label instead of falling back to a raw timestamp range.
  const [activeLabel, setActiveLabel] = useState<string>(DEFAULT_LABEL);

  const isHourRange = HOUR_PRESETS.some((p) => p.label === activeLabel);
  const label =
    activeLabel === 'Custom'
      ? `${format(value.from, 'dd MMM, HH:mm')} – ${format(value.to, 'dd MMM, HH:mm')}`
      : activeLabel;

  function applyPreset(preset: Preset) {
    const range = preset.getRange();
    setDraft(range);
    onChange(range);
    setActiveLabel(preset.label);
    setOpen(false);
  }

  function applyDraft() {
    if (draft?.from) {
      onChange({ from: startOfDay(draft.from), to: endOfDay(draft.to ?? draft.from) });
      setActiveLabel('Custom');
      setOpen(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft({ from: value.from, to: value.to });
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-lg border-border/70 bg-card px-3 text-xs font-medium shadow-sm hover:bg-accent/60"
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-auto sm:max-w-none">
        <div className="flex max-h-[80vh] flex-col overflow-y-auto sm:max-h-none sm:flex-row sm:overflow-visible">
          <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-2 sm:border-b-0 sm:border-r sm:p-3 sm:w-44">
            <div>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                By hour
              </p>
              <div className="flex flex-col gap-0.5">
                {HOUR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent',
                      activeLabel === preset.label ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                By day
              </p>
              <div className="flex flex-col gap-0.5">
                {DAY_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent',
                      activeLabel === preset.label ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-3">
            {isHourRange && (
              <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                Hour filters use exact timestamps; pick a day range below for calendar selection.
              </p>
            )}
            <Calendar
              mode="range"
              defaultMonth={draft?.from}
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={isNarrow ? 1 : 2}
              disabled={{ after: new Date() }}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">
                {draft?.from ? format(draft.from, 'dd MMM yyyy') : 'Start date'}
                {' – '}
                {draft?.to ? format(draft.to, 'dd MMM yyyy') : draft?.from ? format(draft.from, 'dd MMM yyyy') : 'End date'}
              </p>
              <Button size="sm" className="h-8 px-4 text-xs" onClick={applyDraft} disabled={!draft?.from}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
