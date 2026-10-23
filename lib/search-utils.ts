/**
 * Search utilities:
 * 1. Hindi/Hinglish color word mapping
 * 2. Typo-tolerant fuzzy matching (Levenshtein distance)
 * 3. Multi-word query: each word matched independently across all fields
 */

// Hindi/Hinglish → English color mappings
const HINDI_COLOR_MAP: Record<string, string> = {
  // Reds
  lal: 'red', laal: 'red', surkh: 'red', gulabi: 'pink', gulaabi: 'pink',
  // Blues
  neela: 'blue', nila: 'blue', neeli: 'blue', nili: 'blue',
  // Greens
  hara: 'green', hari: 'green', haara: 'green',
  // Yellows
  peela: 'yellow', pila: 'yellow', peeli: 'yellow',
  // Whites
  safed: 'white', safaid: 'white', shwet: 'white',
  // Blacks
  kala: 'black', kaala: 'black', kali: 'black',
  // Oranges
  narangi: 'orange', kesariya: 'orange', kesari: 'orange',
  // Purples
  baingani: 'purple', jamuni: 'purple', jaamuni: 'purple',
  // Browns
  bhura: 'brown', bhoora: 'brown', bhoori: 'brown',
  // Greys
  thaitha: 'grey', dhusri: 'grey', surmai: 'grey',
  // Maroon
  maroon: 'maroon', laalimaa: 'maroon',
  // Gold / Mustard
  sona: 'gold', sone: 'gold', golden: 'gold', sarso: 'mustard', sarson: 'mustard',
  // Cream / Beige
  cream: 'cream', malai: 'cream', beige: 'beige',
  // Magenta / Rani
  rani: 'rani pink', magenta: 'magenta',
};

/**
 * Occasion/festival query synonyms. Occasion tags are free text an admin
 * types per product (see products-panel.tsx "Occasion tags"), so a shopper
 * searching a specific festival name -- "durga puja", "navratri", "karva
 * chauth" -- gets zero results if no product happens to be tagged with that
 * exact festival, even though plenty of products are tagged with the
 * broader occasion ("Puja", "Festive", "Wedding") that festival falls
 * under. Each word here expands to the broader tag(s) it's shopped under,
 * so matching tries both the literal word AND its broader occasion.
 */
const OCCASION_SYNONYMS: Record<string, string[]> = {
  durga: ['puja', 'festive'],
  kali: ['puja', 'festive'],
  saraswati: ['puja', 'festive'],
  lakshmi: ['puja', 'festive'],
  laxmi: ['puja', 'festive'],
  ganesh: ['puja', 'festive'],
  ganpati: ['puja', 'festive'],
  chaturthi: ['puja', 'festive'],
  navratri: ['festive'],
  navaratri: ['festive'],
  dussehra: ['festive'],
  dashami: ['festive'],
  diwali: ['festive'],
  deepavali: ['festive'],
  holi: ['festive'],
  eid: ['festive'],
  rakhi: ['festive'],
  raksha: ['festive'],
  bandhan: ['festive'],
  karva: ['festive'],
  chauth: ['festive'],
  pujo: ['puja', 'festive'],
  ashtami: ['puja', 'festive'],
  navami: ['puja', 'festive'],
  mehendi: ['wedding'],
  mehndi: ['wedding'],
  sangeet: ['wedding', 'party'],
  haldi: ['wedding'],
  reception: ['wedding', 'party'],
  engagement: ['wedding', 'party'],
  bridal: ['wedding'],
};

/**
 * Translate Hindi words in a query to English.
 * Returns [original, translated] — or just [original] if nothing was mapped.
 */
export function expandHindiQuery(q: string): string[] {
  const lower = q.trim().toLowerCase();
  const words = lower.split(/\s+/);
  let translated = false;
  const mappedWords = words.map((w) => {
    if (HINDI_COLOR_MAP[w]) { translated = true; return HINDI_COLOR_MAP[w]; }
    return w;
  });
  const results = [lower];
  if (translated) results.push(mappedWords.join(' '));
  return results;
}

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy match a SINGLE token against a text field.
 * Returns true if the text field contains the token (exact or ~typo).
 */
export function fuzzyMatch(text: string, token: string): boolean {
  if (!text || !token) return false;
  const t = text.toLowerCase();
  const q = token.toLowerCase();

  // Fast path: exact substring
  if (t.includes(q)) return true;

  // Too short for fuzzy
  if (q.length < 4) return false;

  const maxDist = q.length <= 5 ? 1 : 2;
  const words = t.split(/[\s,/\-–]+/);
  for (const w of words) {
    if (w.length < 2) continue;
    if (levenshtein(w, q) <= maxDist) return true;
  }
  return false;
}

/** All searchable text fields of a product as one flat list */
function productFields(product: ProductLike): string[] {
  return [
    product.name,
    product.category,
    product.fabric,
    product.origin,
    ...(product.all_colors ?? product.colors ?? []),
    ...(product.occasion ?? []),
  ].filter(Boolean) as string[];
}

/** Color + slug fields from variant list */
function variantColorFields(product: ProductLike): string[] {
  return (product.variant_list ?? []).map((v) => v.color).filter(Boolean);
}

export type ProductLike = {
  name: string;
  category: string;
  fabric: string;
  origin: string;
  colors?: string[];
  all_colors?: string[];
  occasion?: string[];
  variant_list?: { color: string; slug: string; image?: string | null }[];
};

/**
 * Core match logic for a SINGLE expanded query string.
 *
 * Multi-word strategy:
 *   - Each word in the query must match AT LEAST ONE field of the product.
 *   - "yellow saree" → "yellow" must match color/name/etc AND "saree" must match name/category/etc
 *   - This means ANY combination of word→field works.
 *
 * Single-word: just checks all fields (same as before).
 */
function matchesSingleQuery(
  product: ProductLike,
  q: string
): { matched: boolean; matchedVariant?: ProductLike['variant_list'] extends (infer T)[] | undefined ? T : never } {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { matched: false };

  const fields = productFields(product);
  const variantColors = variantColorFields(product);

  // Every token must match something -- either the token itself, or (for
  // festival/occasion words like "durga" in "durga puja") one of its
  // broader-occasion synonyms, since products are tagged with the broad
  // occasion ("Puja", "Festive", "Wedding") rather than every specific
  // festival name a shopper might type.
  for (const token of tokens) {
    const candidates = [token, ...(OCCASION_SYNONYMS[token] ?? [])];
    const fieldMatch = candidates.some((c) => fields.some((f) => fuzzyMatch(f, c)));
    const variantMatch = variantColors.some((c) => fuzzyMatch(c, token));
    if (!fieldMatch && !variantMatch) return { matched: false };
  }

  // Find which variant (if any) matched — useful for showing correct image
  // Prefer a variant whose color matches as many tokens as possible
  let matchedVariant: ProductLike['variant_list'] extends (infer T)[] | undefined ? T : never = undefined as any;
  if (product.variant_list && product.variant_list.length > 0) {
    // color-specific tokens: tokens that matched a variant color field but NOT
    // the base product's own color/name field
    const colorTokens = tokens.filter((token) =>
      variantColors.some((c) => fuzzyMatch(c, token))
    );
    if (colorTokens.length > 0) {
      matchedVariant = product.variant_list.find((v) =>
        colorTokens.some((t) => fuzzyMatch(v.color, t))
      ) as any;
    }
  }

  return { matched: true, matchedVariant };
}

/**
 * Master search function.
 * Tries original query AND Hindi-translated version.
 */
export function productMatchesQuery(
  product: ProductLike,
  rawQuery: string
): { matched: boolean; matchedVariant?: { color: string; slug: string; image?: string | null } } {
  const queries = expandHindiQuery(rawQuery);
  for (const q of queries) {
    const result = matchesSingleQuery(product, q);
    if (result.matched) return result as any;
  }
  return { matched: false };
}

/**
 * Build ranked KEYWORD phrase suggestions for the search dropdown --
 * "Yellow Sarees", "Mulmul Cotton Sarees", "Bridal Lehenga" -- instead of
 * full product cards with photos and prices. This is the Amazon/Flipkart-
 * style search-bar behaviour: the dropdown should help a shopper refine
 * *what they're typing*, not jump straight to a specific product before
 * they've even finished the word.
 *
 * Phrases are generated from the catalog itself (colour + category, fabric
 * + category, occasion + category, plain category), so they only ever
 * suggest combinations that actually exist -- no phrase is fabricated.
 *
 * Ranking combines two things:
 *  - `count`: how many matching products a phrase covers -- common,
 *    well-stocked phrases surface first.
 *  - `tokenPrefWeights`: an optional per-shopper preference map (word ->
 *    score) built from that shopper's own past searches/clicks (see
 *    header.tsx's token-preference helpers). A shopper who often searches
 *    "cotton" gets cotton-related phrases nudged upward across future
 *    searches too, not just an exact repeat of the same query.
 */
export function getKeywordSuggestions(
  products: ProductLike[],
  rawQuery: string,
  tokenPrefWeights: Record<string, number> = {},
  limit = 8
): string[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const countByKey = new Map<string, number>();
  const displayByKey = new Map<string, string>();

  const add = (phrase?: string | null) => {
    if (!phrase) return;
    const trimmed = phrase.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    if (!displayByKey.has(key)) displayByKey.set(key, trimmed);
  };

  for (const product of products) {
    const { matched } = productMatchesQuery(product, q);
    if (!matched) continue;
    const colors = product.all_colors?.length ? product.all_colors : (product.colors ?? []);
    for (const c of colors) add(`${c} ${product.category}`);
    if (product.fabric) add(`${product.fabric} ${product.category}`);
    for (const o of product.occasion ?? []) add(`${o} ${product.category}`);
    add(product.category);
  }

  // Only keep phrases that genuinely contain every typed word (fuzzy) --
  // a phrase built off one matched product's fabric/category shouldn't
  // surface if it doesn't actually relate to what was typed.
  const candidates = Array.from(displayByKey.entries()).filter(([key]) =>
    tokens.every((t) => fuzzyMatch(key, t))
  );

  const scored = candidates.map(([key, phrase]) => {
    const prefScore = key
      .split(/\s+/)
      .reduce((sum: number, word: string) => sum + (tokenPrefWeights[word] ?? 0), 0);
    return { phrase, score: (countByKey.get(key) ?? 0) + prefScore * 3 };
  });

  scored.sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));
  return scored.slice(0, limit).map((s) => s.phrase);
}
