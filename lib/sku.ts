/**
 * Auto-generates a readable SKU code so admins never have to invent one by
 * hand. Format: PRD-XXXX(-COLOR)(-SIZE), e.g. "SAR-4821-GRN-M".
 * Always editable afterwards -- this is just a sensible starting point.
 */
function randomCode(len = 4): string {
  const chars = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function cleanPart(s: string, maxLen: number): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLen);
}

/** Base SKU for a product, e.g. "MAROONBAN-4821" from "Maroon Banarasi Silk Saree". */
export function generateProductSku(name: string, category?: string): string {
  const source = name || category || 'PRD';
  const prefix = cleanPart(source, 6) || 'PRD';
  return `${prefix}-${randomCode(4)}`;
}

/** Colour-variant SKU derived from the base product SKU, e.g. "MAROONBAN-4821-GRN". */
export function generateVariantSku(baseSku: string, color: string): string {
  const colorPart = cleanPart(color, 3) || 'CLR';
  return `${baseSku}-${colorPart}`;
}

/** Size-level SKU derived from the variant SKU, e.g. "MAROONBAN-4821-GRN-M". */
export function generateSizeSku(variantSku: string, size: string): string {
  const sizePart = cleanPart(size, 4) || 'SZ';
  return `${variantSku}-${sizePart}`;
}
