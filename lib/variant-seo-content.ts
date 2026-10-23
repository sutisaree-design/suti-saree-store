// Deterministic (no AI call) SEO content generator for colour variants.
//
// WHY THIS EXISTS: each colour variant gets its own URL (see
// app/product/[slug]/page.tsx), but if the vendor/admin leaves the
// meta_title/meta_description blank for every colour, or copy-pastes the
// same text into each one, Google can end up treating all the colour pages
// as near-duplicate content and only indexing one of them (the "Discovered
// - currently not indexed" pattern). This generator guarantees every colour
// gets a genuinely different <title>, meta description, AND a visible
// on-page paragraph (`styleNote`, rendered in the Description tab — see
// product-detail.tsx) so the *content*, not just the URL, differs.
//
// Selection is seeded from the product name + colour (not random), so:
//   - the same product+colour always regenerates the same copy (idempotent,
//     safe to call again after an edit)
//   - two different colours on the same product reliably land on different
//     template combinations
//   - re-running this after a title/colour change naturally produces fresh
//     copy instead of being stuck on stale wording
//
// The phrase pools below are grounded in what's actually driving search
// traffic for Indian ethnic wear right now (organic/office wear cottons,
// festive silks with zari/jewel tones, sustainable handloom, linen/organza/
// silk-cotton blends) rather than generic filler, since the whole point is
// to help these pages rank and pull in organic traffic -- not just pass a
// "content is unique" check.

export interface VariantSeoInput {
  /** Base product / listing name, e.g. "Cotton Silk Saree with Floral Motif Embroidery". */
  productName: string;
  /** e.g. "Banarasi Silk", "Chanderi Cotton" — falls back to "handloom" if missing. */
  fabric?: string | null;
  /** e.g. "Sarees", "Lehengas" — used to pick the right product noun. */
  category?: string | null;
  /** AI-generated occasion tags for the base product, e.g. ["Wedding", "Festive"]. */
  occasion?: string[] | null;
  /** This variant's colour, e.g. "Peacock Blue". */
  color: string;
}

export interface VariantSeoOutput {
  metaTitle: string;
  metaDescription: string;
  /** Short on-page paragraph, unique per colour — render this visibly on
   *  the PDP (not just in <head> metadata) so the page's actual content
   *  differs between colour variants, not only its meta tags. */
  styleNote: string;
}

// Search-intent phrases + styling tips, grouped per product type. Sarees,
// kurtis, lehengas, anarkalis and bridal wear are styled completely
// differently (a saree has a "pallu" and "blouse"; a kurti has a
// "palazzo"/"dupatta"; none of that transfers) so each group gets its own
// vocabulary instead of one saree-only pool applied to every product.
//
// BUG FIX: this used to be a single hardcoded saree-only pool used for
// every product regardless of category, so a Kurti or Lehenga would get
// an auto-generated title/description like "Banarasi Silk Saree Online"
// -- wrong and confusing for a shopper. `resolveProductGroup()` below now
// picks the right pool from the product's category (falling back to
// scanning the product name for a type word) before generating anything.
type ProductGroup = 'saree' | 'kurti' | 'lehenga' | 'anarkali' | 'bridal';

const KEYWORD_PHRASES: Record<ProductGroup, string[]> = {
  saree: [
    'handloom saree online',
    'pure cotton handloom saree',
    'silk saree for wedding',
    'festive silk saree with zari border',
    'sustainable handloom saree',
    'banarasi silk saree online',
    'silk-cotton blend saree',
    'checked cotton saree for daily wear',
    'organza saree online',
    'linen saree for office wear',
    'handwoven saree for festive season',
    'cotton saree for daily wear',
  ],
  kurti: [
    'cotton kurti for daily wear',
    'rayon kurti with palazzo online',
    'printed kurti set online',
    'kurti palazzo set for office wear',
    'ethnic kurti online india',
    'straight kurti for casual wear',
    'kurti with dupatta set',
    'floral print kurti online',
    'festive kurti set for women',
    'cotton kurti set for daily wear',
  ],
  lehenga: [
    'lehenga choli online',
    'bridal lehenga set online',
    'wedding lehenga for reception',
    'party wear lehenga choli',
    'designer lehenga online india',
    'silk lehenga for wedding season',
    'embroidered lehenga choli set',
    'lehenga set for sangeet',
  ],
  anarkali: [
    'anarkali suit online',
    'anarkali gown for wedding',
    'floor length anarkali suit',
    'party wear anarkali set',
    'embroidered anarkali suit online',
    'festive anarkali gown',
  ],
  bridal: [
    'bridal lehenga online',
    'wedding collection lehenga',
    'bridal silk saree online',
    'reception outfit for bride',
    'designer bridal wear online',
  ],
};

const OCCASION_HOOKS = [
  'perfect for festive get-togethers',
  'an easy pick for everyday office wear',
  'ideal for a wedding sangeet or reception',
  'a versatile piece you can dress up or down',
  'great for pooja days and family functions',
  'a comfortable choice for long summer days',
  'a statement piece for date nights and parties',
  'suited to Diwali, Durga Puja and festive mornings',
  'made for the daily-wear rotation that still looks put together',
  'a graceful pick for a formal work event',
];

const STYLING_TIPS: Record<ProductGroup, string[]> = {
  saree: [
    'Pair it with polki or kundan jewellery and a sleek bun for a classic festive look.',
    'Keep the blouse minimal and let the drape do the talking — a single statement earring is enough.',
    'Style it with a contrast blouse and juttis for a modern ethnic-chic look.',
    'A jhumka and a small bindi finish the look beautifully without overdoing it.',
    'Layer a light shawl over it on cooler evenings without hiding the weave.',
    'Go for gold-toned accessories to bring out the border work.',
    'Team it with a potli bag and block heels for weddings and receptions.',
    'Keep hair in loose waves to balance the structured pallu.',
    'A simple cotton blouse and minimal jewellery keep this one office-appropriate.',
    'Add a statement neckpiece if dressing it up for evening functions.',
  ],
  kurti: [
    'Pair it with matching palazzos and juttis for an easy everyday look.',
    'Add a contrast dupatta and small earrings to dress it up for festive days.',
    'Keep footwear simple — flats or juttis — for all-day comfort at work.',
    'Layer a light jacket over it on cooler days without losing the print.',
    'A minimal neckpiece and kolhapuris finish this off nicely for daily wear.',
    'Team it with straight pants for a smart-casual office look.',
    'Add oxidised jewellery and a potli bag for a festive daytime look.',
  ],
  lehenga: [
    'Pair it with statement kundan jewellery and heels for the reception.',
    'Keep the dupatta draped over one shoulder to highlight the embroidery.',
    'A sleek bun and jhumkas let the lehenga workmanship stand out.',
    'Add a contrast dupatta pin and potli bag for the sangeet.',
    'Go for gold-toned accessories to match the zari and border work.',
  ],
  anarkali: [
    'Pair it with a statement necklace and juttis for wedding functions.',
    'Keep hair in loose curls to balance the flare of the anarkali.',
    'Add a dupatta drape over one shoulder for a more festive silhouette.',
    'Team it with block heels and minimal jewellery for daytime events.',
  ],
  bridal: [
    'Pair it with heirloom kundan or polki jewellery for the big day.',
    'Keep the dupatta draped to show off the borderwork during rituals.',
    'A statement maang tikka and jhumkas complete the bridal look.',
    'Add heavier gold-toned accessories to match the zari work.',
  ],
};

/** Maps a product's category / name to the vocabulary pool that actually
 *  matches it, instead of defaulting every product to saree wording. */
function resolveProductGroup(category: string | null | undefined, productName: string): ProductGroup {
  const text = `${category || ''} ${productName || ''}`.toLowerCase();
  if (/\bbridal\b/.test(text)) return 'bridal';
  if (/\blehenga\b|\bcholi\b/.test(text)) return 'lehenga';
  if (/\banarkali\b/.test(text)) return 'anarkali';
  if (/\bkurti\b|\bkurta\b/.test(text)) return 'kurti';
  return 'saree';
}

/** Small deterministic string hash (djb2) — good enough to pick stable,
 *  well-spread indices from the pools above; no crypto requirement here. */
function seedFrom(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Strips any previously-appended " - Colour" suffix so we don't end up
 *  with "Saree - Blue - Blue" if this runs on an already-suffixed name. */
function cleanProductName(name: string): string {
  return name.replace(/\s*[-–]\s*[^-–]+$/, '').trim() || name.trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd().replace(/[,.;:]$/, '') + '…';
}

export function generateVariantSeoContent(input: VariantSeoInput): VariantSeoOutput {
  const color = input.color.trim();
  const baseName = cleanProductName(input.productName || 'Handloom Saree');
  const fabric = (input.fabric || 'handloom').trim();
  const seed = seedFrom(`${baseName}|${color}`);

  const group = resolveProductGroup(input.category, baseName);
  const keywords = KEYWORD_PHRASES[group];
  const tips = STYLING_TIPS[group];

  const keyword = keywords[seed % keywords.length];
  const hook = OCCASION_HOOKS[Math.floor(seed / keywords.length) % OCCASION_HOOKS.length];
  const tip = tips[Math.floor(seed / (keywords.length * OCCASION_HOOKS.length)) % tips.length];

  const keywordTitleCase = keyword.replace(/\b\w/g, (c) => c.toUpperCase());

  const metaTitle = truncate(
    `${color} ${keywordTitleCase} – ${baseName} | AruhiHandlooms`,
    100
  );

  const metaDescription = truncate(
    `Shop the ${color} ${baseName.toLowerCase()} — ${hook}. Genuine ${fabric}, ${keyword}, doorstep delivery across India.`,
    160
  );

  const styleNote = `This ${color.toLowerCase()} colourway is ${hook}. ${tip}`;

  return { metaTitle, metaDescription, styleNote };
}
