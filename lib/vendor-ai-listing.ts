// Shared AI listing generator for vendor-submitted products.
// Called by /api/vendor/ai-process/[id] after a vendor publishes or edits a product.
// Uses the same NVIDIA NIM vision-language model as the admin generate-listing route.

import { buildSlug } from '@/lib/slug-utils';

const MODEL = 'meta/llama-3.2-11b-vision-instruct';
const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

export interface VendorAIInput {
  name: string;
  fabric: string;
  category: string;
  images: string[];
}

export interface VendorAIListing {
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
  highlights: Record<string, string>;
}

function buildVendorPrompt(input: {
  name: string;
  fabric: string;
  category: string;
  hasImage: boolean;
}): string {
  return `You are an SEO copywriter and Google Merchant Center data specialist for "AruhiHandlooms", an Indian ethnic-wear e-commerce store selling handwoven sarees, lehengas, bridal wear and kurtis.

${input.hasImage ? 'A photo of the actual product is attached — look at it closely and base the fabric, color, motifs, and craft details on what you actually see in the image.' : ''}

Write a complete product listing based on this vendor-submitted info:

- Product name/keywords: ${input.name || '(not given)'}
- Category: ${input.category || '(not given)'}
- Fabric: ${input.fabric || '(not given)'}

Fill in sensible, realistic details for an Indian handloom ethnic-wear store where a field is missing. Keep the vendor's provided details exactly as-is where possible.

CRITICAL — DO NOT ANCHOR ON THE EXAMPLE VALUES BELOW: every "e.g." in this prompt is only ONE of many possible values for that field, shown purely to illustrate the expected format/style. Look at the actual attached photo and pick whichever value truly matches it — including values not listed here at all. In particular, do NOT write 'Zari'/'Zari Border'/'Zari Work'/'Zari Woven' unless the photo actually shows visible gold/silver zari thread-work, and do NOT default to 'Maroon' as the colour unless the item is actually maroon. Two different photos should very rarely produce the same pattern/border/colour combination — if you notice yourself repeating the same value you used for another product, look again at THIS photo.

Respond with ONLY a JSON object (no markdown fences, no preamble) with these exact keys:
{
  "name": "SEO-friendly product title, 40-70 characters. Must combine: (1) the fabric/craft type, (2) the product type, (3) the exact base colour of THIS specific photographed item (e.g. 'Green', 'Black', 'Mustard Yellow', 'Teal', 'Blush Pink' — pick the one that actually matches the photo, not a generic default), and (4) one concrete visual detail that is actually visible in THIS photo (e.g. the specific motif, border style, or embroidery placement — not a generic word like 'floral' if you can see it's actually a vine or booti pattern). Two different products must never end up with an identical title — if you were shown a different photo, colour, or motif, the title must read differently too. No marketing fluff, no filler adjectives that don't come from the photo.",
  "description": "2-3 short paragraphs (120-180 words total) covering fabric/weave/craft, look and feel, occasion fit, and a care tip. Warm, boutique-style language. No emojis.",
  "fabric": "full fabric name — whichever actually matches the photo/notes, e.g. one of: 'Pure Kanjivaram Silk', 'Banarasi Silk', 'Chanderi Cotton', 'Mysore Silk', 'Tussar Silk', 'Georgette', 'Chiffon', 'Linen', 'Mulmul Cotton', 'Organza'",
  "origin": "weave region matching the fabric/craft, e.g. one of: 'Kanchipuram, Tamil Nadu', 'Varanasi, Uttar Pradesh', 'Chanderi, Madhya Pradesh', 'Mysore, Karnataka', 'Bhagalpur, Bihar', 'Pochampally, Telangana', 'Jaipur, Rajasthan'",
  "occasion": ["2-4 occasion tags, e.g.", "Wedding", "Festive"],
  "material": "single Google Shopping material value matching the actual fabric, e.g. one of: 'Silk', 'Cotton', 'Georgette', 'Chiffon', 'Linen', 'Crepe', 'Organza', 'Velvet'",
  "pattern": "single Google Shopping pattern value that matches what's actually visible in the photo, e.g. one of: 'Solid', 'Printed', 'Floral Print', 'Striped', 'Checked', 'Polka Dot', 'Ikat', 'Block Print', 'Bandhani', 'Zari Border', 'Embroidered', 'Woven Design' — do not default to the same one every time",
  "gender": "one of exactly: female, male, unisex",
  "meta_description": "SEO meta-description, 140-160 characters, enticing and keyword-rich",
  "colors": ["exactly ONE value -- the single base colour this exact photographed item is actually sold in, e.g. one of: 'Maroon', 'Green', 'Navy Blue', 'Mustard Yellow', 'Black', 'Off-White', 'Teal', 'Blush Pink', 'Rust Orange' — pick the one that truly matches the photo, never a fixed default. Do NOT list every decorative/embroidery/border colour visible in the photo -- this value becomes the colour swatch shown to shoppers, so extra colours here make the product look like it comes in colours it doesn't."],
  "highlights": {
    "border": "e.g. one of: 'Zari', 'Temple Border', 'Lace', 'Tassel Border', 'Contrast Woven Border', 'Printed Border', 'None' — leave empty string if not applicable, and only say 'Zari' if gold/silver thread is actually visible",
    "border_width": "e.g. 'Small Border', 'Broad Border', 'No Border' — leave empty string if not applicable",
    "blouse": "e.g. 'Separate Blouse Piece', 'Without Blouse', 'Attached Blouse' — leave empty string if not applicable",
    "saree_fabric": "e.g. 'Georgette' — leave empty string if not a saree",
    "saree_pattern": "e.g. 'Handloom Woven', 'Printed', 'Dyed / Washed', 'Embroidered' — leave empty string if not applicable",
    "ornamentation": "e.g. one of: 'Zari Work', 'Sequin Work', 'Thread Embroidery', 'Mirror Work', 'Beadwork', 'Plain' — leave empty string if none, and only say 'Zari Work' if actually visible",
    "blouse_fabric": "e.g. 'Bangalori Silk' — leave empty string if no blouse",
    "pallu_details": "e.g. 'Same as Saree', 'Contrast Pallu', 'Printed Pallu' — leave empty string if not applicable",
    "blouse_pattern": "e.g. 'Solid', 'Printed', 'Embroidered' — leave empty string if no blouse",
    "blouse_color": "e.g. 'Black', 'Gold', 'Ivory' — leave empty string if no blouse, match the actual photo",
    "brand": "AruhiHandlooms",
    "loom_type": "e.g. 'Handloom', 'Powerloom' — your best estimate, leave empty string if unclear",
    "fit_shape": "e.g. 'Straight', 'A-Line', 'Fit and Flare' — leave empty string if not applicable",
    "length": "e.g. 'Ankle-Length', 'Saree Length (5.5 m)'",
    "neck": "e.g. 'Round Neck', 'V-Neck', 'Sweetheart', 'Boat Neck' — leave empty string if not applicable (e.g. saree)",
    "sleeve_length": "e.g. 'Sleeveless', 'Full Sleeves', 'Three-Quarter Sleeves' — leave empty string if not applicable",
    "sleeve_styling": "e.g. 'Regular Sleeves', 'Puff Sleeves', 'Shoulder Strap' — leave empty string if not applicable",
    "surface_styling": "e.g. one of: 'Zari Woven', 'Embroidered', 'Printed', 'Hand-Painted', 'Plain' — only say 'Zari Woven' if actually visible",
    "print_or_pattern_type": "e.g. one of: 'Solid', 'Floral Print', 'Geometric Print', 'Ikat', 'Block Print', 'Zari Border' — pick whichever matches the photo, don't default to the same value every time",
    "net_quantity": "1",
    "add_on": "e.g. 'Blouse Piece', 'Petticoat', 'Jacket' — leave empty string if nothing bundled",
    "type": "e.g. 'Saree', 'Lehenga Set', 'Kurti'",
    "generic_name": "e.g. 'Sarees', 'Kurtis'",
    "country_of_origin": "India",
    "transparency": "e.g. 'Opaque', 'Semi-Sheer' — leave empty string if unsure"
  }
}`;
}

/**
 * Checks whether another live product already has this exact title
 * (case-insensitive) and, if so, deterministically appends a distinguishing
 * detail the AI itself already generated for this item (colour, border,
 * ornamentation, pattern, origin, or occasion — whichever isn't already
 * present in the title text) so the two listings read differently.
 *
 * This is a plain DB lookup + string tweak, not a second AI call — a repeat
 * vision-model call would add another 20-55s on top of the one this route
 * already makes, risking the 60s function budget. Titles are already meant
 * to vary because the prompt grounds them in the actual photo, but two
 * genuinely similar-looking items (e.g. a restocked batch in the same
 * colour) can still land on the same wording, so this is the hard guarantee.
 */
export async function ensureUniqueVendorTitle(
  admin: { from: (table: string) => any },
  listing: VendorAIListing,
  excludeProductId: string
): Promise<string> {
  const baseName = listing.name;

  const { data: matches, error } = await admin
    .from('products')
    .select('id')
    .ilike('name', baseName)
    .neq('id', excludeProductId);

  if (error) {
    console.error('[vendor-ai-listing] uniqueness check failed, keeping AI title as-is:', error);
    return baseName;
  }
  if (!matches || matches.length === 0) return baseName;

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
    return `${baseName} – ${candidates[0]}`;
  }

  // Every distinguishing detail the AI generated is already in the title
  // and it's still an exact duplicate (e.g. a visually identical restocked
  // batch) — number it so the title text itself is never repeated.
  return `${baseName} (Batch ${matches.length + 1})`;
}

/** Calls NVIDIA NIM to generate a full product listing from vendor-submitted basics.
 *  Returns null if NVIDIA_API_KEY is not set or the AI call fails — callers
 *  should still publish the product with basic fields in that case. */
export async function generateVendorListing(input: VendorAIInput): Promise<VendorAIListing | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[vendor-ai-listing] NVIDIA_API_KEY is not set — skipping AI generation, product will publish with basic fields only');
    return null;
  }

  // Fetch and convert the first image to base64 for vision analysis.
  // A 10s timeout (matching app/api/admin/generate-listing/route.ts) stops a
  // slow/hanging storage fetch from eating into the 60s function budget and
  // starving the NIM call below of the time it needs (20-55s on the free tier).
  let imageDataUri: string | null = null;
  if (input.images[0]) {
    const imgController = new AbortController();
    const imgTimeout = setTimeout(() => imgController.abort(), 10_000);
    try {
      const imgRes = await fetch(input.images[0], { signal: imgController.signal });
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        imageDataUri = `data:${contentType};base64,${base64}`;
      } else {
        console.error('[vendor-ai-listing] image fetch not ok:', imgRes.status, input.images[0]);
      }
    } catch (err) {
      console.error('[vendor-ai-listing] image fetch failed/timed out, proceeding text-only:', err);
    } finally {
      clearTimeout(imgTimeout);
    }
  }

  const promptText = buildVendorPrompt({
    name: input.name,
    fabric: input.fabric,
    category: input.category,
    hasImage: !!imageDataUri,
  });

  const userContent: unknown = imageDataUri
    ? [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: imageDataUri } },
      ]
    : promptText;

  // The calling route (/api/vendor/ai-process/[id]) declares
  // `export const maxDuration = 60`, and this app is hosted on Vercel
  // (not Netlify — an earlier version of this comment assumed Netlify's
  // 10s hard limit, which doesn't apply here and was never correct for
  // this deployment). The NVIDIA vision-language model routinely takes
  // 20-55s to respond on the free tier — see app/api/admin/generate-listing/
  // route.ts, which already uses a 55s timeout for this exact model/call
  // and works reliably. An 8s timeout was aborting almost every request,
  // which is why vendor products were going live with empty AI fields
  // (name/fabric/category from the vendor's own submission, but no
  // description/origin/occasion/highlights — those only ever come from
  // this call). 50s leaves ~10s of headroom within the 60s function
  // budget for the DB update + vendor email that follow.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  let res: Response;
  try {
    res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.4,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    // Network error, abort/timeout, DNS failure, etc. Never let this
    // throw out of the function — caller falls back to publishing the
    // product with the vendor's basic fields instead of AI-generated ones.
    console.error('[vendor-ai-listing] NIM fetch failed:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[vendor-ai-listing] NIM API error:', res.status, errText);
    return null;
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[vendor-ai-listing] failed to parse NIM response as JSON:', err);
    return null;
  }
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  let parsed: VendorAIListing | undefined;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
  }

  if (!parsed) {
    console.error('[vendor-ai-listing] non-JSON model response:', text.slice(0, 300));
    return null;
  }

  // Safety net: the prompt asks for exactly one base colour, but a vision
  // model won't always follow that perfectly. `colors` here represents this
  // product's own swatch (merged with real product_variants colours by
  // resolveAllColors in lib/products-api.ts / products-api-server.ts), so
  // any extra values that slip through would show up as fake colour dots
  // on the product card for colours that were never actually listed.
  if (Array.isArray(parsed.colors) && parsed.colors.length > 1) {
    parsed.colors = parsed.colors.slice(0, 1);
  }

  return parsed;
}

/** Minimal shape of a `products` row this helper needs — callers pass
 *  whatever subset they already fetched. */
export interface VendorProductForAIPublish {
  id: string;
  name: string;
  fabric: string | null;
  category_name: string | null;
  images: unknown;
  slug: string;
}

export interface VendorAIPublishResult {
  /** The title actually saved (AI-generated + made unique, or the vendor's
   *  original name if AI was unavailable/failed). */
  finalName: string;
  /** True only if the AI call succeeded and its fields were saved. */
  aiApplied: boolean;
}

/**
 * Runs AI generation for a vendor product and publishes it live — the exact
 * same logic that used to live only inline in
 * app/api/vendor/ai-process/[id]/route.ts. Pulled out here so it can also be
 * reused by lib/cron-jobs.ts::runStuckVendorListingsJob, which previously
 * force-published stuck listings with `approval_status: 'live'` ONLY,
 * skipping AI entirely — so a listing that got stuck (e.g. a Vercel Hobby
 * function killed mid-flight) went live permanently with the vendor's raw
 * placeholder name/slug and no AI description/highlights, instead of ever
 * getting the real generated listing. Every caller of this function now
 * gets one consistent behaviour: try AI first, and only fall back to a bare
 * publish if the AI call itself genuinely fails.
 *
 * `isEdit` controls the same two things it always has: whether the title is
 * forced unique against other live products (skipped on edits, so an
 * already-shared title isn't needlessly renamed), and whether the slug is
 * regenerated from the new title (skipped on edits, so a live product's URL
 * never changes and doesn't break anything already shared/indexed).
 */
export async function publishVendorProductWithAI(
  admin: { from: (table: string) => any },
  product: VendorProductForAIPublish,
  isEdit: boolean
): Promise<VendorAIPublishResult> {
  const listing = await generateVendorListing({
    name: product.name,
    fabric: product.fabric ?? '',
    category: product.category_name ?? '',
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
  });

  if (!listing) {
    // AI unavailable or failed — publish anyway with the vendor's basic
    // fields, same as before. Callers should log the reason on their side.
    await admin.from('products').update({ approval_status: 'live' }).eq('id', product.id);
    return { finalName: product.name, aiApplied: false };
  }

  const finalName = isEdit ? listing.name : await ensureUniqueVendorTitle(admin, listing, product.id);
  const nextSlug = isEdit ? product.slug : buildSlug(finalName);

  const patch = {
    name: finalName,
    slug: nextSlug,
    description: listing.description,
    fabric: listing.fabric,
    origin: listing.origin,
    occasion: listing.occasion,
    material: listing.material,
    pattern: listing.pattern,
    gender: listing.gender,
    meta_description: listing.meta_description,
    colors: Array.isArray(listing.colors) ? listing.colors : [],
    highlights: listing.highlights ?? {},
    approval_status: 'live' as const,
  };

  const { error: updateErr } = await admin.from('products').update(patch).eq('id', product.id);

  // Extremely unlikely slug collision (two vendors' AI titles slugifying to
  // the same base + same 5-char random suffix) — retry once with a fresh
  // suffix.
  if (updateErr?.code === '23505' && updateErr.message?.includes('slug')) {
    const { error: retryErr } = await admin
      .from('products')
      .update({ ...patch, slug: isEdit ? product.slug : buildSlug(finalName) })
      .eq('id', product.id);

    if (retryErr) {
      console.error('[vendor-ai-listing] failed to publish with AI fields after slug retry:', product.id, retryErr);
      await admin.from('products').update({ approval_status: 'live' }).eq('id', product.id);
      return { finalName, aiApplied: false };
    }
  } else if (updateErr) {
    console.error('[vendor-ai-listing] failed to publish with AI fields:', product.id, updateErr);
    await admin.from('products').update({ approval_status: 'live' }).eq('id', product.id);
    return { finalName, aiApplied: false };
  }

  return { finalName, aiApplied: true };
}
