'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { Product } from '@/lib/types';

interface Row {
  label: string;
  value?: string | null;
}

function Cell({ label, value }: Row) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}

/**
 * "Product Highlights" spec block, styled after the familiar marketplace
 * layout (Meesho/Flipkart-style): Occasion, Saree Fabric, Transparency and
 * Blouse always visible, with an "Additional Details" chevron that expands
 * the rest (pattern, ornamentation, blouse specifics, brand, loom type,
 * etc). A "Copy" button lets the admin/store owner quickly copy the whole
 * spec sheet as text — handy for pasting into Meesho/Flipkart/Amazon
 * listings. Fields are populated by the AI listing generator in admin, with
 * graceful fallbacks to the product's existing fabric/pattern/occasion/
 * colour data for older listings that don't have `highlights` filled in yet.
 */
export default function ProductHighlights({ product, activeColor }: { product: Product; activeColor?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const h = product.highlights || {};

  const color = activeColor || product.colors[0];

  const primaryRows: Row[] = [
    { label: 'Occasion', value: product.occasion?.join(', ') },
    { label: 'Saree Fabric', value: h.saree_fabric || product.fabric },
    { label: 'Transparency', value: h.transparency },
    { label: 'Blouse', value: h.blouse },
  ].filter((r) => r.value);

  const detailRows: Row[] = [
    { label: 'Color', value: color },
    { label: 'Generic Name', value: h.generic_name },
    { label: 'Pattern', value: h.saree_pattern || product.pattern },
    { label: 'Print or Pattern Type', value: h.print_or_pattern_type },
    { label: 'Net Quantity (N)', value: h.net_quantity },
    { label: 'Ornamentation', value: h.ornamentation },
    { label: 'Type', value: h.type },
    { label: 'Blouse Fabric', value: h.blouse_fabric },
    { label: 'Pallu Details', value: h.pallu_details },
    { label: 'Blouse Pattern', value: h.blouse_pattern },
    { label: 'Blouse Color', value: h.blouse_color },
    { label: 'Brand', value: h.brand },
    { label: 'Loom Type', value: h.loom_type },
    { label: 'Country of Origin', value: h.country_of_origin },
    // Kurti/lehenga-style fields — naturally blank for sarees, so they just
    // won't render for those listings.
    { label: 'Fit / Shape', value: h.fit_shape },
    { label: 'Length', value: h.length },
    { label: 'Neck', value: h.neck },
    { label: 'Sleeve Length', value: h.sleeve_length },
    { label: 'Sleeve Styling', value: h.sleeve_styling },
    { label: 'Surface Styling', value: h.surface_styling },
    { label: 'Add On', value: h.add_on },
  ].filter((r) => r.value);

  if (primaryRows.length === 0 && detailRows.length === 0) return null;

  const handleCopy = async () => {
    const lines = [...primaryRows, ...detailRows].map((r) => `${r.label}: ${r.value}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently,
      // it's a convenience feature, not core functionality.
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-serif text-base font-semibold text-primary">Product Highlights</p>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary hover:opacity-80"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {primaryRows.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {primaryRows.map((r) => (
            <Cell key={r.label} {...r} />
          ))}
        </div>
      )}

      {detailRows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-4 flex w-full items-center justify-between border-t border-border/60 pt-3 text-sm font-semibold text-primary"
          >
            Additional Details
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {detailRows.map((r) => (
                <Cell key={r.label} {...r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
