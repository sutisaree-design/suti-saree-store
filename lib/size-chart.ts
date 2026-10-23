/**
 * Fixed, predefined measurements for each standard size. These are NOT
 * editable per-product -- an admin just picks which of these sizes apply to
 * a given product (in the product form), and the storefront's Size Chart
 * automatically shows the matching rows. "Free Size" has no fixed
 * measurements (one-size-fits-all) so it's excluded from the chart table.
 */

export type SizeChartUnit = 'cm' | 'inch';

export interface SizeChartRow {
  size: string;
  shoulder: { cm: number; inch: number };
  length: { cm: number; inch: number };
  waist: { cm: number; inch: number };
  bust: { cm: number; inch: number };
  hip: { cm: number; inch: number };
}

export const SIZE_CHART: Record<string, SizeChartRow> = {
  XS: {
    size: 'XS',
    shoulder: { cm: 68.6, inch: 27 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 78.7, inch: 31 },
    bust: { cm: 86.4, inch: 34 },
    hip: { cm: 91.4, inch: 36 },
  },
  S: {
    size: 'S',
    shoulder: { cm: 71.1, inch: 28 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 83.8, inch: 33 },
    bust: { cm: 91.4, inch: 36 },
    hip: { cm: 96.5, inch: 38 },
  },
  M: {
    size: 'M',
    shoulder: { cm: 73.7, inch: 29 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 88.9, inch: 35 },
    bust: { cm: 96.5, inch: 38 },
    hip: { cm: 101.6, inch: 40 },
  },
  L: {
    size: 'L',
    shoulder: { cm: 76.2, inch: 30 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 94, inch: 37 },
    bust: { cm: 101.6, inch: 40 },
    hip: { cm: 106.7, inch: 42 },
  },
  XL: {
    size: 'XL',
    shoulder: { cm: 81.3, inch: 32 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 99.1, inch: 39 },
    bust: { cm: 106.7, inch: 42 },
    hip: { cm: 111.8, inch: 44 },
  },
  XXL: {
    size: 'XXL',
    shoulder: { cm: 83.8, inch: 33 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 104.1, inch: 41 },
    bust: { cm: 111.8, inch: 44 },
    hip: { cm: 116.8, inch: 46 },
  },
  XXXL: {
    size: 'XXXL',
    shoulder: { cm: 86.4, inch: 34 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 109.2, inch: 43 },
    bust: { cm: 116.8, inch: 46 },
    hip: { cm: 121.9, inch: 48 },
  },
  '4XL': {
    size: '4XL',
    shoulder: { cm: 88.9, inch: 35 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 114.3, inch: 45 },
    bust: { cm: 121.9, inch: 48 },
    hip: { cm: 127, inch: 50 },
  },
  '5XL': {
    size: '5XL',
    shoulder: { cm: 91.4, inch: 36 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 119.4, inch: 47 },
    bust: { cm: 127, inch: 50 },
    hip: { cm: 132.1, inch: 52 },
  },
  '6XL': {
    size: '6XL',
    shoulder: { cm: 94, inch: 37 },
    length: { cm: 104.1, inch: 41 },
    waist: { cm: 124.5, inch: 49 },
    bust: { cm: 132.1, inch: 52 },
    hip: { cm: 137.2, inch: 54 },
  },
};

/** The fixed, standard set of sizes an admin can pick from for a product.
 *  "Free Size" is just a normal option here now — it starts pre-checked
 *  on a brand-new product (see emptyForm() in products-panel.tsx) but can
 *  be unchecked and saved like any other size. */
export const STANDARD_SIZES = [
  'Free Size',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  '4XL',
  '5XL',
  '6XL',
] as const;
