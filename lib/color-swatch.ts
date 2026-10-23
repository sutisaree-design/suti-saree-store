import { COLOR_PRESETS } from '@/lib/color-presets';

/**
 * Best-effort colour-name -> hex lookup for showing a little swatch next to
 * a colour's name in filter chips (Shop/Search sidebar, mobile filter
 * sheet). Product colours are free-text (admin can type anything when
 * adding a variant), so this can't rely on the CSS colour keyword list
 * alone -- most real saree/lehenga colour names ("Rani Pink", "Bottle
 * Green", "Mustard Yellow", "Rust Orange"...) aren't valid CSS colours at
 * all. Resolution order:
 *   1. Exact match against the admin's own COLOR_PRESETS (already has
 *      curated hex values for the shades used across the catalog).
 *   2. Exact match against this extended dictionary, which additionally
 *      covers every compound/shaded name actually seen in product data
 *      (e.g. "Dark Olive Green", "Off White", "Black With Red").
 *   3. Keyword fallback: pull out a recognised base-colour word from the
 *      name (e.g. "Charcoal Grey" -> grey, "Chocolate Brown" -> brown) and
 *      darken/lighten it if the name says "Dark"/"Light".
 *   4. Letting the browser interpret the raw string as a CSS colour (many
 *      single-word names, e.g. "Crimson", "Coral", "Ivory", are valid CSS
 *      keywords on their own).
 *   5. A neutral grey placeholder swatch as the last resort, so an unknown
 *      colour name never renders as invisible/black.
 */
const EXTENDED_COLOR_MAP: Record<string, string> = {
  'black with red': '#3B0A0A',
  'black with stripes': '#1A1A1A',
  'blush pink': '#F4C2C2',
  'burnt orange': '#CC5500',
  'charcoal grey': '#36454F',
  'charcoal gray': '#36454F',
  'chocolate brown': '#3F2305',
  'cobalt blue': '#0047AB',
  'coral pink': '#F88379',
  'crimson': '#DC143C',
  'dark black': '#000000',
  'dark magenta': '#8B008B',
  'dark maroon': '#3C0511',
  'dark olive green': '#556B2F',
  'dark purple': '#301934',
  'dark red': '#8B0000',
  'dark slate grey': '#2F4F4F',
  'dark slate gray': '#2F4F4F',
  'dark teal': '#014D4E',
  'forest green': '#228B22',
  'fuchsia': '#FF00FF',
  'golden brown': '#996515',
  'goldenrod': '#DAA520',
  'hot pink': '#FF69B4',
  'ivory': '#FFFFF0',
  'lemon yellow': '#FFF44F',
  'light green': '#90EE90',
  'lime green': '#32CD32',
  'mango yellow': '#FFC324',
  'medium orchid': '#BA55D3',
  'mint green': '#98FF98',
  'mushroom brown': '#8A6E5A',
  'mustard yellow': '#E6B800',
  'navy blue': '#0B1F3A',
  'off white': '#F6F1E9',
  'off-white': '#F6F1E9',
  'olive green': '#556B2F',
  'rani pink': '#D6006D',
  'rose': '#C08081',
  'royal blue': '#4169E1',
  'rust orange': '#C24E1E',
  'rust pink': '#D9827C',
  'sky blue': '#87CEEB',
};

// Base colour words used for the keyword fallback (ordered longest-first
// isn't required since we check `includes`, but keep them specific enough
// that e.g. "grey"/"gray" both resolve).
const BASE_COLOR_KEYWORDS: [string, string][] = [
  ['maroon', '#6D071A'],
  ['magenta', '#BE1B7A'],
  ['fuchsia', '#FF00FF'],
  ['crimson', '#DC143C'],
  ['red', '#C1121F'],
  ['pink', '#E75480'],
  ['orange', '#E8641C'],
  ['rust', '#B7410E'],
  ['mustard', '#D4A017'],
  ['gold', '#C9A227'],
  ['yellow', '#F4C430'],
  ['beige', '#E8DCC8'],
  ['cream', '#F5EEDC'],
  ['ivory', '#FFFFF0'],
  ['white', '#FFFFFF'],
  ['teal', '#146B6B'],
  ['turquoise', '#30BFBF'],
  ['mint', '#A8DDCB'],
  ['olive', '#5C5B29'],
  ['green', '#1E7B45'],
  ['navy', '#0B1F3A'],
  ['blue', '#1A4F8B'],
  ['lavender', '#B497D6'],
  ['purple', '#6A2E8C'],
  ['orchid', '#DA70D6'],
  ['grey', '#8C8C8C'],
  ['gray', '#8C8C8C'],
  ['charcoal', '#36454F'],
  ['black', '#111111'],
  ['chocolate', '#3F2305'],
  ['brown', '#6B4226'],
  ['tan', '#C8A165'],
  ['copper', '#B5652E'],
  ['coral', '#FF6F5E'],
  ['peach', '#FFCBA4'],
];

function shade(hex: string, amount: number): string {
  // amount > 0 lightens, < 0 darkens. Simple linear blend toward white/black.
  const n = hex.replace('#', '');
  const r = parseInt(n.substring(0, 2), 16);
  const g = parseInt(n.substring(2, 4), 16);
  const b = parseInt(n.substring(4, 6), 16);
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? c + (255 - c) * amount : c + c * amount)));
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Only used to sanity-check letting the browser interpret a raw colour
 *  string (step 4) -- guards against passing through something that isn't
 *  colour-like at all (numbers, punctuation-heavy strings, etc). */
function looksLikeCssColorKeyword(s: string): boolean {
  return /^[a-z]+$/i.test(s);
}

export function getColorSwatchHex(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '#CCCCCC';
  const lower = trimmed.toLowerCase();

  const preset = COLOR_PRESETS.find((c) => c.name.toLowerCase() === lower);
  if (preset) return preset.hex;

  if (EXTENDED_COLOR_MAP[lower]) return EXTENDED_COLOR_MAP[lower];

  const isDark = /\bdark\b/.test(lower);
  const isLight = /\blight\b/.test(lower);
  for (const [word, hex] of BASE_COLOR_KEYWORDS) {
    if (lower.includes(word)) {
      if (isDark) return shade(hex, -0.35);
      if (isLight) return shade(hex, 0.35);
      return hex;
    }
  }

  const noSpaces = lower.replace(/\s+/g, '');
  if (looksLikeCssColorKeyword(noSpaces)) return noSpaces;

  return '#CCCCCC';
}
