// ---------------------------------------------------------------------
// Phase 2, Part 4 — Printable barcode label (barcode + product name +
// vendor name), one label per page, sized for a standard 4x2 inch
// shipping/product label so it prints cleanly on either a dedicated
// label printer or a normal printer (cut along the page edge).
//
// Uses the same plain pdf-lib-primitives approach as lib/invoice-pdf.ts
// — no extra dependency for the barcode graphic itself; the bars are
// drawn as rectangles from lib/barcode128.ts's verified Code128B
// encoding.
// ---------------------------------------------------------------------

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { encodeCode128B, toBarcodeRuns } from './barcode128';

export interface ProductLabelInput {
  barcode: string;
  product_name: string;
  vendor_name: string;
  /** e.g. "Color: Red" — set when this label is for one variant unit
   *  of a multi-variant product, omitted for a single-variant product. */
  variant_label?: string | null;
}

const LABEL_WIDTH = 288; // 4in @ 72pt/in
const LABEL_HEIGHT = 144; // 2in @ 72pt/in
const MARGIN = 14;

/**
 * Renders one or more printable barcode labels, one per PDF page.
 * Never throws for a bad barcode string mid-batch — a single
 * unencodable barcode (shouldn't happen; all our barcodes are
 * auto-generated in the AH-V… format) is skipped with a visible
 * error label instead of failing the whole print job.
 */
export async function generateProductLabelPdf(labels: ProductLabelInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const black = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.45, 0.45, 0.45);
  const primary = rgb(0.49, 0.23, 0.11); // matches the storefront's brand tone (see invoice-pdf.ts)

  for (const label of labels) {
    const page = doc.addPage([LABEL_WIDTH, LABEL_HEIGHT]);
    let y = LABEL_HEIGHT - MARGIN;

    // ---- Vendor name (small, top) ----
    page.drawText(truncate(label.vendor_name || 'Unknown Vendor', 42), {
      x: MARGIN,
      y: y - 8,
      size: 8,
      font,
      color: muted,
    });
    y -= 20;

    // ---- Product name (bold, wraps to max 2 lines) ----
    const nameLines = wrapText(label.product_name || 'Unnamed Product', bold, 11, LABEL_WIDTH - MARGIN * 2).slice(0, 2);
    for (const line of nameLines) {
      page.drawText(line, { x: MARGIN, y: y - 10, size: 11, font: bold, color: primary });
      y -= 14;
    }
    if (label.variant_label) {
      page.drawText(truncate(label.variant_label, 46), { x: MARGIN, y: y - 8, size: 8, font, color: muted });
      y -= 14;
    }

    y -= 6;

    // ---- Barcode graphic ----
    try {
      const barcodeAreaWidth = LABEL_WIDTH - MARGIN * 2;
      const barcodeHeight = 40;
      drawCode128Barcode(page, label.barcode, {
        x: MARGIN,
        y: y - barcodeHeight,
        maxWidth: barcodeAreaWidth,
        height: barcodeHeight,
        color: black,
      });
      y -= barcodeHeight + 4;
    } catch (err) {
      page.drawText('(barcode could not be rendered)', { x: MARGIN, y: y - 20, size: 8, font, color: rgb(0.8, 0.1, 0.1) });
      y -= 24;
    }

    // ---- Human-readable barcode text (below the bars, as usual on real labels) ----
    page.drawText(label.barcode, {
      x: MARGIN,
      y: y - 10,
      size: 10,
      font: mono,
      color: black,
    });
  }

  return doc.save();
}

/**
 * Draws a Code128 Subset B barcode as a series of rectangles, scaled
 * to fit `maxWidth`. Includes a blank quiet zone on both sides (10
 * modules, per the Code128 spec) so real barcode scanners can find the
 * start/stop guard pattern reliably.
 */
function drawCode128Barcode(
  page: import('pdf-lib').PDFPage,
  value: string,
  opts: { x: number; y: number; maxWidth: number; height: number; color: ReturnType<typeof rgb> }
) {
  const runs = toBarcodeRuns(encodeCode128B(value));
  const totalModules = runs.reduce((sum, r) => sum + r.modules, 0);
  const quietModules = 10;
  const moduleWidth = opts.maxWidth / (totalModules + quietModules * 2);

  let x = opts.x + quietModules * moduleWidth;
  for (const run of runs) {
    const width = run.modules * moduleWidth;
    if (run.bar) {
      page.drawRectangle({ x, y: opts.y, width, height: opts.height, color: opts.color });
    }
    x += width;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Greedy word-wrap using the font's actual measured width (no external layout lib needed). */
function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
