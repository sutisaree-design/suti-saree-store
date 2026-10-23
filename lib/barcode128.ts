// ---------------------------------------------------------------------
// Phase 2, Part 4 — Code128 (Subset B) barcode encoding, from scratch.
//
// Deliberately dependency-free: no jsbarcode/bwip-js/canvas. This repo's
// PDF generation (lib/invoice-pdf.ts) already draws directly with
// pdf-lib primitives, so a barcode is just another set of rectangles —
// once we have the correct module (bar/space) pattern for each
// character, per the Code128 spec (ISO/IEC 15417).
//
// `CODE128B_PATTERNS` below is the standard's published bar/space
// pattern table (every Code128 symbol is 11 modules wide, except STOP
// which is 13) — this is fixed specification data, not vendor-specific
// logic, and is what every Code128 encoder (in any language) is built
// from. Values are plain integers whose *string* form is the module
// pattern itself (1 = bar, 0 = space) — e.g. 11011001100 both encodes
// symbol value 0 in Subset B and IS its 11-module bar pattern.
//
// Our barcode strings (e.g. "AH-V3F9A21-0007") only ever use
// A-Z, 0-9 and '-', all comfortably inside Code Set B's supported
// range (ASCII 32-126), so we only implement Subset B — no need for
// Subset A/C or the multi-set switching Code128 also supports.
// ---------------------------------------------------------------------

const CODE128B_PATTERNS: number[] = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
  10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
  11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
  10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
  11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
  11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
  10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
  11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
  11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
  11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
  10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
  10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
  11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
  10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
  10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
  10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
  10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
  11010011100, // symbol 105 = START C (103=START A, 104=START B are the two values just above)
  1100011101011, // symbol 106 = STOP (13 modules, one wider than the rest)
];

const START_B = 104;
const STOP = 106;
const MODULO = 103;

/** Every printable character Code Set B supports (ASCII 32-126). */
export function isCode128BCompatible(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}

/**
 * Encodes `text` as a Code128 Subset B module string: a sequence of
 * '1' (bar) / '0' (space) characters, one per module, ready to be
 * drawn directly as rectangles. Includes START, checksum and STOP —
 * this is the complete symbol, just missing the quiet-zone margin
 * (left to the caller/renderer).
 */
export function encodeCode128B(text: string): string {
  if (!isCode128BCompatible(text)) {
    throw new Error(`"${text}" contains characters outside Code128 Subset B's supported range (ASCII 32-126)`);
  }

  const values = [START_B, ...Array.from(text).map((ch) => ch.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, v, i) => (i === 0 ? v : sum + v * i), 0) % MODULO;
  const symbols = [...values, checksum, STOP];

  return symbols.map((v) => CODE128B_PATTERNS[v].toString()).join('');
}

/**
 * Converts a module string ("110100...") into a list of runs
 * (`{ bar: boolean; modules: number }`), which is all a renderer needs
 * to draw consecutive same-colour rectangles instead of one per module.
 */
export function toBarcodeRuns(moduleString: string): Array<{ bar: boolean; modules: number }> {
  const runs: Array<{ bar: boolean; modules: number }> = [];
  for (const ch of moduleString) {
    const isBar = ch === '1';
    const last = runs[runs.length - 1];
    if (last && last.bar === isBar) {
      last.modules += 1;
    } else {
      runs.push({ bar: isBar, modules: 1 });
    }
  }
  return runs;
}
