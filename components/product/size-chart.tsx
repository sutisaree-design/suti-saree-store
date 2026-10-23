'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SIZE_CHART, SizeChartUnit } from '@/lib/size-chart';

interface Props {
  /** The sizes this specific product offers (product.sizes). Only the ones
   *  with a fixed entry in SIZE_CHART get a row -- "Free Size" has no fixed
   *  measurements so it's skipped automatically. */
  sizes: string[];
}

const HOW_TO_MEASURE: { label: string; tip: string }[] = [
  { label: 'Shoulder', tip: 'Measure straight across the back, from one shoulder edge to the other.' },
  { label: 'Length', tip: 'Measure from the shoulder seam down to where you want the hem to fall.' },
  { label: 'Waist', tip: 'Measure around the narrowest part of your natural waistline.' },
  { label: 'Bust', tip: 'Wrap the tape around the fullest part of your chest, keeping it level.' },
  { label: 'Hip', tip: 'Measure around the fullest part of your hips, roughly 8 inches below your waist.' },
];

export default function SizeChart({ sizes }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'dimensions' | 'measure'>('dimensions');
  const [unit, setUnit] = useState<SizeChartUnit>('cm');

  const rows = sizes.map((s) => SIZE_CHART[s]).filter(Boolean);
  if (rows.length === 0) return null;

  return (
    <div className="border-b border-border pb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold"
      >
        Size Chart
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-4 border-b border-border text-sm">
            <button
              type="button"
              onClick={() => setTab('dimensions')}
              className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
                tab === 'dimensions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Product Dimensions
            </button>
            <button
              type="button"
              onClick={() => setTab('measure')}
              className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
                tab === 'measure'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              How to Measure
            </button>
          </div>

          {tab === 'dimensions' ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Select measurement unit:</span>
                <div className="flex overflow-hidden rounded-md border border-primary">
                  <button
                    type="button"
                    onClick={() => setUnit('inch')}
                    className={`px-3 py-1 font-medium transition-colors ${
                      unit === 'inch' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    inch
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit('cm')}
                    className={`px-3 py-1 font-medium transition-colors ${
                      unit === 'cm' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    cm
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                {/* Mobile: one card per size, measurements stacked in a
                    2-col grid -- avoids the 6-column table forcing a
                    horizontal scroll that silently cut off the "Hip"
                    column on narrow phones with no visible scroll hint. */}
                <div className="grid gap-2 sm:hidden">
                  {rows.map((r) => (
                    <div key={r.size} className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-sm font-bold">{r.size}</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">Shoulder:</span> {r.shoulder[unit]} {unit}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Length:</span> {r.length[unit]} {unit}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Waist:</span> {r.waist[unit]} {unit}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Bust:</span> {r.bust[unit]} {unit}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Hip:</span> {r.hip[unit]} {unit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Tablet/desktop: the full comparison table, with room to
                    breathe so it doesn't need to scroll. */}
                <table className="hidden w-full min-w-[420px] text-xs sm:table">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="p-2 font-semibold">Size</th>
                      <th className="p-2 font-semibold">Shoulder ({unit})</th>
                      <th className="p-2 font-semibold">Length ({unit})</th>
                      <th className="p-2 font-semibold">Waist ({unit})</th>
                      <th className="p-2 font-semibold">Bust ({unit})</th>
                      <th className="p-2 font-semibold">Hip ({unit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.size} className="border-t border-border">
                        <td className="p-2 font-bold">{r.size}</td>
                        <td className="p-2 text-muted-foreground">{r.shoulder[unit]}</td>
                        <td className="p-2 text-muted-foreground">{r.length[unit]}</td>
                        <td className="p-2 text-muted-foreground">{r.waist[unit]}</td>
                        <td className="p-2 text-muted-foreground">{r.bust[unit]}</td>
                        <td className="p-2 text-muted-foreground">{r.hip[unit]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <ul className="space-y-2 text-xs text-muted-foreground">
              {HOW_TO_MEASURE.map((item) => (
                <li key={item.label}>
                  <span className="font-semibold text-foreground">{item.label}: </span>
                  {item.tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
