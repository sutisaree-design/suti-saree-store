/**
 * Maps this store's own `category` string (admin-managed, free text --
 * see the `Category` type in lib/types.ts) to a specific Google product
 * taxonomy path for the `<g:google_product_category>` field in the
 * Merchant Center feed (app/api/merchant-feed/route.ts).
 *
 * Previously every product shipped the same generic
 * "Apparel & Accessories > Clothing" value regardless of whether it was a
 * saree, lehenga, kurti, or anarkali. Google's Shopping algorithm uses this
 * field for query matching and category-specific attribute requirements --
 * a flat top-level value means Google has to guess the rest from the title
 * alone, which weakens Shopping ad relevance and free-listing matching for
 * a store whose whole catalog is otherwise-hard-to-classify ethnic wear.
 *
 * Matching is by keyword/substring against the category name (and product
 * name as a fallback) rather than a fixed enum, since categories here are
 * admin-created free text (e.g. "Banarasi Sarees", "Kurta Sets" both need
 * to match even though they're not the exact strings below).
 *
 * Reference: https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 */

interface CategoryRule {
  keywords: string[];
  path: string;
}

// Order matters: more specific rules should come first since the first
// match wins. "lehenga" is checked before "saree" so a "Lehenga Saree" style
// name still resolves sensibly (both currently map to the same taxonomy
// leaf, but keeping them separate makes it easy to split later if Google
// ever adds distinct leaves for each).
const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['lehenga', 'leheng', 'ghagra', 'chaniya'],
    path: 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas',
  },
  {
    keywords: ['saree', 'sari'],
    path: 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas',
  },
  {
    keywords: ['anarkali', 'gown', 'maxi'],
    path: 'Apparel & Accessories > Clothing > Dresses',
  },
  {
    keywords: ['kurti', 'kurta', 'tunic'],
    path: 'Apparel & Accessories > Clothing > Shirts & Tops',
  },
  {
    keywords: ['salwar', 'suit set', 'suit piece', 'palazzo set'],
    path: 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing',
  },
  {
    keywords: ['blouse'],
    path: 'Apparel & Accessories > Clothing > Shirts & Tops > Blouses',
  },
  {
    keywords: ['dupatta', 'stole', 'scarf'],
    path: 'Apparel & Accessories > Clothing Accessories > Scarves & Shawls',
  },
];

/**
 * Returns the most specific Google product category path that matches, or
 * a safe generic fallback ("Apparel & Accessories > Clothing") if nothing
 * matches -- this keeps the feed valid even for a brand-new admin-created
 * category the rules above don't recognize yet, instead of erroring out.
 */
export function resolveGoogleProductCategory(categoryName: string, productName?: string): string {
  const haystack = `${categoryName || ''} ${productName || ''}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.path;
    }
  }

  return 'Apparel & Accessories > Clothing';
}
