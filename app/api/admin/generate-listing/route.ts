import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Vercel kills serverless functions after 10s by default (Hobby plan).
// The NVIDIA vision model + image fetch routinely takes longer than that on
// the free tier, which was silently truncating this request before it could
// respond — the admin panel would spin forever then fail with an empty form
// and no real error message. This tells Vercel to allow up to 60s (the max
// on Hobby; Pro/Enterprise can go higher).
export const maxDuration = 60;

// Free-tier NVIDIA NIM vision-language model (build.nvidia.com).
// Get a free API key (nvapi-...) at https://build.nvidia.com — no credit card,
// ~1,000 free inference credits on signup. Swap this string for any other
// vision-capable model in the NIM catalog if you want to try alternatives.
//
// Using the 11B model instead of 90B: the 90B model was regularly taking
// 55s+ on the free tier, which blows past Vercel Hobby's 60s hard timeout
// ceiling. 11B is noticeably faster while still handling this task
// (extracting fabric/color/pattern details from a product photo) well.
const MODEL = 'meta/llama-3.2-11b-vision-instruct';
const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface GeneratedHighlights {
  border: string;
  border_width: string;
  blouse: string;
  saree_fabric: string;
  saree_pattern: string;
  ornamentation: string;
  blouse_fabric: string;
  pallu_details: string;
  blouse_pattern: string;
  blouse_color: string;
  brand: string;
  loom_type: string;
  fit_shape: string;
  length: string;
  neck: string;
  sleeve_length: string;
  sleeve_styling: string;
  surface_styling: string;
  print_or_pattern_type: string;
  net_quantity: string;
  add_on: string;
  type: string;
  generic_name: string;
  country_of_origin: string;
  transparency: string;
}

interface GeneratedListing {
  name: string;
  description: string;
  fabric: string;
  origin: string;
  occasion: string[];
  material: string;
  pattern: string;
  gender: string;
  meta_description: string;
  colors: string[];
  highlights: GeneratedHighlights;
}

function buildPrompt(input: {
  hint: string;
  name: string;
  category: string;
  fabric: string;
  origin: string;
  colors: string;
  occasion: string;
  gender: string;
  material: string;
  pattern: string;
  hasImage: boolean;
}) {
  return `You are an SEO copywriter and Google Merchant Center data specialist for "AruhiHandlooms", an Indian ethnic-wear e-commerce store selling handwoven sarees, lehengas, bridal wear and kurtis.

${input.hasImage ? 'A photo of the actual product is attached — look at it closely and base the fabric, color, motifs, and craft details on what you actually see in the image.' : ''}

Write a product listing based on this info (some fields may be blank — fill in sensible, realistic details for an Indian handloom ethnic-wear store where the field is missing, keeping existing details you ARE given exactly as-is where possible):

- Rough name/keywords: ${input.name || '(not given)'}
- Category: ${input.category || '(not given)'}
- Fabric: ${input.fabric || '(not given)'}
- Origin/weave region: ${input.origin || '(not given)'}
- Colors: ${input.colors || '(not given)'}
- Occasion tags: ${input.occasion || '(not given)'}
- Gender: ${input.gender || '(not given)'}
- Material (Google Shopping attribute, e.g. "Silk", "Cotton", "Georgette"): ${input.material || '(not given)'}
- Pattern (Google Shopping attribute, e.g. "Solid", "Floral Print", "Zari Border"): ${input.pattern || '(not given)'}
- Extra notes from the store owner: ${input.hint || '(none)'}

CRITICAL — DO NOT ANCHOR ON THE EXAMPLE VALUES BELOW: every "e.g." in this prompt is only ONE of many possible values for that field, shown purely to illustrate the expected format/style. Look at the actual attached photo and pick whichever value truly matches it — including values not listed here at all. In particular, do NOT write 'Zari'/'Zari Border'/'Zari Work'/'Zari Woven' unless the photo actually shows visible gold/silver zari thread-work, and do NOT default to 'Maroon' as the colour unless the item is actually maroon. Two different photos should very rarely produce the same pattern/border/colour combination — if you notice yourself repeating the same value you used for another product, look again at THIS photo.

Respond with ONLY a JSON object (no markdown fences, no preamble) with these exact keys:
{
  "name": "SEO-friendly product title, 40-70 characters, includes fabric/craft + product type + a distinguishing detail (color/motif/occasion). No marketing fluff like 'Buy now'.",
  "description": "2-3 short paragraphs (120-180 words total) covering the fabric/weave/craft, look and feel, occasion fit, and a care tip. Written in warm, boutique-style language. No emojis.",
  "fabric": "short fabric name matching the actual photo/notes, e.g. one of: 'Pure Kanjivaram Silk', 'Banarasi Silk', 'Chanderi Cotton', 'Mysore Silk', 'Tussar Silk', 'Georgette', 'Chiffon', 'Linen', 'Mulmul Cotton', 'Organza'",
  "origin": "short origin/weave region matching the fabric/craft, e.g. one of: 'Kanchipuram, Tamil Nadu', 'Varanasi, Uttar Pradesh', 'Chanderi, Madhya Pradesh', 'Mysore, Karnataka', 'Bhagalpur, Bihar', 'Pochampally, Telangana', 'Jaipur, Rajasthan'",
  "occasion": ["array", "of", "2-4", "short", "occasion", "tags", "e.g.", "Wedding", "Festive"],
  "material": "single Google Shopping material value matching the actual fabric, e.g. one of: 'Silk', 'Cotton', 'Georgette', 'Chiffon', 'Linen', 'Crepe', 'Organza', 'Velvet' — a plain fabric-family word, not a brand name. NOTE: this is your best visual estimate from the photo/notes, not a lab-verified fact — the store owner should confirm it.",
  "pattern": "single Google Shopping pattern value that matches what's actually visible in the photo, e.g. one of: 'Solid', 'Zari Border', 'Floral Print', 'Striped', 'Checked', 'Polka Dot', 'Ikat', 'Block Print', 'Bandhani', 'Embroidered', 'Woven Design' — do not default to the same one every time",
  "gender": "one of exactly: female, male, unisex",
  "meta_description": "a single SEO meta-description sentence, 140-160 characters, enticing and keyword-rich, ending without ellipsis",
  "colors": ["exactly ONE value -- the single base colour this exact product/photo is actually sold in, e.g. one of: 'Maroon', 'Green', 'Navy Blue', 'Mustard Yellow', 'Black', 'Off-White', 'Teal', 'Blush Pink', 'Rust Orange' — pick the one that truly matches the photo, never a fixed default. Do NOT list every decorative/embroidery/border colour visible -- this value becomes the colour swatch shown to shoppers, so extra colours here make the product look like it comes in colours it doesn't. If colours were already given above, keep that value as-is."],
  "highlights": {
    "border": "e.g. one of: 'Lace', 'Zari', 'Temple Border', 'Woven Design', 'Tassel Border', 'Contrast Woven Border', 'Printed Border', 'None' — leave '' if not applicable (e.g. a kurti with no saree-style border), and only say 'Zari' if gold/silver thread is actually visible",
    "border_width": "e.g. 'Small Border', 'Broad Border', 'No Border' — leave '' if not applicable",
    "blouse": "e.g. 'Separate Blouse Piece', 'Attached Blouse', 'Without Blouse' — leave '' if not applicable (e.g. a kurti)",
    "saree_fabric": "short fabric name for the saree itself, e.g. 'Georgette' — leave '' if this isn't a saree",
    "saree_pattern": "the overall pattern/technique, e.g. 'Dyed / Washed', 'Handloom Woven', 'Printed', 'Embroidered' — leave '' if not applicable",
    "ornamentation": "e.g. one of: 'Lace Border', 'Zari Work', 'Sequin Work', 'Thread Embroidery', 'Mirror Work', 'Beadwork', 'Plain' — leave '' if none, and only say 'Zari Work' if actually visible",
    "blouse_fabric": "e.g. 'Bangalori Silk' — leave '' if no blouse piece included",
    "pallu_details": "e.g. 'Same as Saree', 'Contrast Pallu', 'Zari Pallu', 'Printed Pallu' — leave '' if not applicable",
    "blouse_pattern": "e.g. 'Solid', 'Printed', 'Embroidered' — leave '' if no blouse piece included",
    "blouse_color": "e.g. 'Black', 'Gold', 'Ivory' — leave '' if no blouse piece included, match the actual photo",
    "brand": "the store's own brand name for this listing, e.g. 'AruhiHandlooms' — leave '' if unsure, don't invent an unrelated brand",
    "loom_type": "e.g. 'Handloom', 'Powerloom' — your best estimate from the photo/notes, leave '' if genuinely unclear",
    "fit_shape": "e.g. 'Fit and Flare', 'Straight', 'A-Line' — leave '' if not applicable to this product type",
    "length": "e.g. 'Calf-Length', 'Ankle-Length', 'Saree Length (5.5 m)'",
    "neck": "e.g. 'Round Neck', 'Shoulder Straps', 'Sweetheart', 'V-Neck', 'Boat Neck' — leave '' if not applicable (e.g. a saree with no stitched neckline)",
    "sleeve_length": "e.g. 'Sleeveless', 'Three-Quarter Sleeves', 'Full Sleeves' — leave '' if not applicable",
    "sleeve_styling": "e.g. 'Shoulder Strap', 'Regular Sleeves', 'Puff Sleeves' — leave '' if not applicable",
    "surface_styling": "e.g. one of: 'Zari Woven', 'Embroidered', 'Smocking or Shirred', 'Printed', 'Hand-Painted', 'Plain' — only say 'Zari Woven' if actually visible",
    "print_or_pattern_type": "e.g. one of: 'Solid', 'Floral Print', 'Geometric Print', 'Ikat', 'Block Print', 'Zari Border' — pick whichever matches the photo, don't default to the same value every time",
    "net_quantity": "a plain number as a string, almost always '1'",
    "add_on": "e.g. 'Jacket', 'Blouse Piece', 'Petticoat' — leave '' if nothing is bundled",
    "type": "the product form factor, e.g. 'Saree', 'One Piece', 'Lehenga Set', 'Kurti'",
    "generic_name": "the plain-English product category, e.g. 'Sarees', 'Dresses', 'Kurtis'",
    "country_of_origin": "almost always 'India' for this store unless notes say otherwise",
    "transparency": "e.g. 'Opaque', 'Semi-Sheer' — your best visual estimate, leave '' if unsure"
  }
}

For the "highlights" object: look closely at the attached photo (if any) and infer these spec-sheet style details yourself the way an experienced merchandiser would — the store owner should not have to type these in by hand. Leave a field as an empty string '' rather than guessing wildly if it genuinely doesn't apply to this product type (e.g. a saree has no "neck" or "sleeve" of its own).

CRITICAL OUTPUT RULE: Reply with the raw JSON object ONLY. Do not use markdown formatting, headers (e.g. "**Product Listing**"), bullet points, or any text before or after the JSON. Your entire reply must start with { and end with }.`;
}

/**
 * Checks whether another product (excluding the one currently being edited,
 * if any) already has this exact title (case-insensitive) and, if so,
 * deterministically appends a distinguishing detail the AI itself already
 * generated (colour, border, ornamentation, pattern, origin, or occasion --
 * whichever isn't already present in the title text) so the two listings
 * read differently in Search Console and on-site.
 *
 * This mirrors ensureUniqueVendorTitle() in lib/vendor-ai-listing.ts, which
 * only ran for vendor-submitted products -- admin-generated listings had no
 * equivalent check, so two AI-generated admin products could easily end up
 * with byte-identical titles (same photo style, same "e.g." anchoring the
 * prompt warns against), which reads as duplicate content to Google.
 */
async function ensureUniqueAdminTitle(
  listing: GeneratedListing,
  excludeProductId: string | null
): Promise<{ name: string; wasDuplicate: boolean }> {
  const baseName = listing.name;
  if (!baseName) return { name: baseName, wasDuplicate: false };

  try {
    const admin = getSupabaseAdmin();
    let query = admin.from('products').select('id').ilike('name', baseName);
    if (excludeProductId) query = query.neq('id', excludeProductId);
    const { data: matches, error } = await query;

    if (error) {
      console.error('[generate-listing] uniqueness check failed, keeping AI title as-is:', error);
      return { name: baseName, wasDuplicate: false };
    }
    if (!matches || matches.length === 0) return { name: baseName, wasDuplicate: false };

    const lowerBase = baseName.toLowerCase();
    const candidates = [
      listing.colors?.[0],
      listing.highlights?.border,
      listing.highlights?.ornamentation,
      listing.highlights?.saree_pattern,
      listing.pattern,
      listing.origin,
      listing.occasion?.[0],
    ].filter((v): v is string => !!v && v.trim() !== '' && !lowerBase.includes(v.toLowerCase()));

    if (candidates.length > 0) {
      return { name: `${baseName} – ${candidates[0]}`, wasDuplicate: true };
    }

    // Every distinguishing detail the AI generated is already in the title
    // and it's still an exact duplicate -- number it so the title text
    // itself is never repeated.
    return { name: `${baseName} (Batch ${matches.length + 1})`, wasDuplicate: true };
  } catch (err) {
    console.error('[generate-listing] uniqueness check threw, keeping AI title as-is:', err);
    return { name: baseName, wasDuplicate: false };
  }
}

/** Fetches a product image and returns it as a base64 data: URI for NIM's image_url input. */
async function fetchImageAsDataUri(imageUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(imageUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) return null;
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function POST(req: Request) {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI generation is not configured. Add NVIDIA_API_KEY to your environment (free key at build.nvidia.com).' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const input = {
    hint: (body?.hint as string | undefined)?.trim() || '',
    name: (body?.name as string | undefined)?.trim() || '',
    category: (body?.category as string | undefined)?.trim() || '',
    fabric: (body?.fabric as string | undefined)?.trim() || '',
    origin: (body?.origin as string | undefined)?.trim() || '',
    colors: (body?.colors as string | undefined)?.trim() || '',
    occasion: (body?.occasion as string | undefined)?.trim() || '',
    gender: (body?.gender as string | undefined)?.trim() || '',
    material: (body?.material as string | undefined)?.trim() || '',
    pattern: (body?.pattern as string | undefined)?.trim() || '',
  };
  const imageUrl = (body?.imageUrl as string | undefined)?.trim() || '';
  // Present only when the admin is editing an already-live product (see
  // components/admin/products-panel.tsx) -- excluded from its own
  // duplicate-title check below so a product isn't flagged as a dupe of
  // itself when the AI simply regenerates the same/similar title.
  const productId = (body?.productId as string | undefined)?.trim() || null;

  if (!input.hint && !input.name && !input.category && !imageUrl) {
    return NextResponse.json(
      { error: 'Give at least a product name, category, note, or photo to generate from.' },
      { status: 400 }
    );
  }

  try {
    let imageDataUri: string | null = null;
    if (imageUrl) {
      imageDataUri = await fetchImageAsDataUri(imageUrl).catch(() => null);
    }

    const promptText = buildPrompt({ ...input, hasImage: !!imageDataUri });

    // NIM follows the OpenAI chat-completions format: content is either a
    // plain string, or an array of {type:"text"} / {type:"image_url"} parts
    // when an image is attached.
    const userContent: any = imageDataUri
      ? [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: imageDataUri } },
        ]
      : promptText;

    const nimController = new AbortController();
    const nimTimeout = setTimeout(() => nimController.abort(), 55_000);

    let res: Response;
    try {
      res = await fetch(NIM_ENDPOINT, {
        method: 'POST',
        signal: nimController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.4,
          max_tokens: 1024,
          // The 90B model handled the full nested json_schema mode fine, but
          // the faster 11B model doesn't reliably honor it and would reply
          // with markdown prose instead of JSON. json_object is a simpler,
          // more widely-supported mode — exact field names/types come from
          // the strict instructions in the prompt itself instead.
          response_format: { type: 'json_object' },
        }),
      });
    } finally {
      clearTimeout(nimTimeout);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[generate-listing] NVIDIA NIM API error:', res.status, errText);
      const rateLimited = res.status === 429;
      return NextResponse.json(
        {
          error: rateLimited
            ? 'AI is rate-limited right now (free tier). Wait a minute and try again.'
            : 'AI generation failed. Please try again.',
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed: GeneratedListing | undefined;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Smaller/faster vision models (e.g. 11B) don't always honor
      // response_format and sometimes reply in markdown/prose with the JSON
      // object embedded inside (or not at all). Try to salvage a JSON object
      // from anywhere in the text before giving up.
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = undefined;
        }
      }
    }

    if (!parsed) {
      // Log the raw model output so we can see exactly what came back
      // (e.g. a markdown-formatted refusal) instead of just "not valid JSON".
      console.error('[generate-listing] Non-JSON model response:', text.slice(0, 500));
      return NextResponse.json(
        { error: 'AI returned an unexpected response format. Please try again.' },
        { status: 502 }
      );
    }

    // Safety net: the prompt asks for exactly one base colour, but a vision
    // model won't always follow that perfectly -- extra values here would
    // show up as fake colour swatches on the product page (see
    // resolveAllColors() in lib/products-api.ts).
    if (Array.isArray(parsed.colors) && parsed.colors.length > 1) {
      parsed.colors = parsed.colors.slice(0, 1);
    }

    const { name: uniqueName, wasDuplicate } = await ensureUniqueAdminTitle(parsed, productId);
    parsed.name = uniqueName;

    return NextResponse.json({
      listing: parsed,
      // Lets the admin UI show a heads-up banner instead of silently
      // renaming -- an admin who typed a specific name expects to see if/why
      // the AI's title changed.
      duplicateTitleAdjusted: wasDuplicate,
    });
  } catch (err) {
    console.error('[generate-listing] error:', err);
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      {
        error: timedOut
          ? 'AI is taking too long to respond (free tier can be slow). Please try again in a minute.'
          : 'Could not generate a listing right now. Please try again.',
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
