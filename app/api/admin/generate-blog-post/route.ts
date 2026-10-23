import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Same free-tier NVIDIA NIM key already used by
// app/api/admin/generate-listing/route.ts and lib/vendor-ai-listing.ts —
// reuses NVIDIA_API_KEY so there's nothing new to configure. Text-only here
// (no product photo), so we deliberately use a lighter, text-only model
// instead of the 11b VISION model those other two routes need — the vision
// model was consistently taking 48s+ to finish a long JSON blog post on
// NIM's free tier and blowing straight through the 60s Vercel ceiling
// (logged in Vercel as a recurring `[AbortError] This operation was
// aborted` 504). The 8b text model produces the same JSON far faster.
export const maxDuration = 60;

const MODEL = 'meta/llama-3.1-8b-instruct';
const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface GeneratedPost {
  title: string;
  slug: string;
  excerpt: string;
  keywords: string[];
  body_paragraphs: string[];
  faqs: { question: string; answer: string }[];
  read_minutes: number;
  related_category_name: string;
  suggested_cover_image: string;
  // Real products auto-inserted as {{product:slug}} cards in body_paragraphs
  // below, surfaced back to the admin UI just so the toast/dialog can say
  // *which* products got picked — purely informational, the markers
  // themselves are already the source of truth for rendering.
  inserted_products: { slug: string; name: string }[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// In-content links use `[anchor text](category:Exact Category Name)`. Kept
// as plain text markup (no DB/schema change) and parsed by the public blog
// page into real <Link>s. Anything that doesn't match a real category name
// is stripped back to plain anchor text below — so a broken/hallucinated
// category name can never render as a dead link on the live site.
const CATEGORY_LINK_RE = /\[([^\]]+)\]\(category:([^)]+)\)/g;

function sanitizeInlineLinks(paragraph: string, validNames: Set<string>): string {
  return paragraph.replace(CATEGORY_LINK_RE, (full, anchorText, categoryName) => {
    const trimmed = categoryName.trim();
    return validNames.has(trimmed.toLowerCase()) ? full : anchorText;
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The model occasionally drops the required leading `[anchor text]` and
// just emits a bare `(category:Name)` straight in the prose — not a valid
// link (CATEGORY_LINK_RE won't match it, so sanitizeInlineLinks leaves it
// untouched), just literal junk text that leaks onto the live page
// verbatim, e.g. "...Banarasi silk saree (category:Banarasi Sarees) to
// the...". The sentence already reads fine without it, so it's stripped
// outright rather than attempting to reconstruct a link from a name that,
// in practice, is often not even a real category (as in that example).
const STRAY_CATEGORY_PAREN_RE = /(?<!\])\(category:[^)]+\)/gi;
function stripStrayCategoryParens(paragraph: string): string {
  return paragraph.replace(STRAY_CATEGORY_PAREN_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,])/g, '$1');
}

// Fallback so a post never ships with ZERO internal links. The prompt asks
// the model to embed `[anchor](category:Name)` links itself, but that's an
// instruction-following ask on top of an already-long structured-JSON
// task — the lighter/faster 8b text model (swapped in to fix the NIM
// timeout, see MODEL comment above) follows it far less reliably than the
// bigger vision model used to. Rather than depend on the model for
// something this important for SEO, we guarantee it ourselves:
//   1) If the model DID embed at least one valid link, leave its output
//      alone entirely — no double-linking.
//   2) Otherwise, look for a category name (or its simple singular) that
//      already appears naturally in the prose and wrap that real mention
//      in the link markup — reads exactly like the model had done it.
//   3) If literally no category name appears anywhere in the text, append
//      one short, clearly-labelled sentence linking the related category
//      to a mid-post paragraph, so there's always at least one link.
function ensureCategoryLinks(
  paragraphs: string[],
  categoryNames: string[],
  relatedCategoryName: string
): string[] {
  const alreadyLinked = new Set<string>();
  for (const p of paragraphs) {
    CATEGORY_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CATEGORY_LINK_RE.exec(p)) !== null) {
      alreadyLinked.add(m[2].trim().toLowerCase());
    }
  }
  if (alreadyLinked.size > 0) return paragraphs;

  const isEligible = (p: string) =>
    p.trim().length > 0 && !/^\{\{h2:/.test(p) && !/^\{\{product:/.test(p) && !/^\{\{review:/.test(p);

  const result = [...paragraphs];
  let inserted = 0;
  const maxLinks = 2;

  for (const name of categoryNames) {
    if (inserted >= maxLinks) break;
    const singular = name.replace(/s$/i, '');
    const re = new RegExp(`\\b(${escapeRegExp(name)}|${escapeRegExp(singular)})\\b`, 'i');
    for (let i = 0; i < result.length; i++) {
      if (!isEligible(result[i])) continue;
      const m = result[i].match(re);
      if (m && m.index !== undefined) {
        const matchedText = m[0];
        result[i] =
          result[i].slice(0, m.index) +
          `[${matchedText}](category:${name})` +
          result[i].slice(m.index + matchedText.length);
        inserted++;
        break;
      }
    }
  }

  if (inserted === 0) {
    const fallbackName =
      relatedCategoryName && categoryNames.some((c) => c.toLowerCase() === relatedCategoryName.toLowerCase())
        ? relatedCategoryName
        : categoryNames[0];
    if (fallbackName) {
      const midStart = Math.floor(result.length / 2);
      let targetIdx = -1;
      for (let i = midStart; i < result.length; i++) {
        if (isEligible(result[i])) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) targetIdx = result.findIndex(isEligible);
      if (targetIdx !== -1) {
        result[targetIdx] =
          `${result[targetIdx].trim()} For more options, browse our [${fallbackName}](category:${fallbackName}) collection.`;
      }
    }
  }

  return result;
}

function buildPrompt(topic: string, extraKeywords: string, categoryNames: string[], strict = false) {
  const categoryList = categoryNames.length > 0 ? categoryNames.join(', ') : '(no categories available)';
  // `strict` is used for the one-shot automatic retry when a normal
  // generation comes back truncated (JSON cut off before the closing
  // brace — the model ran out of its token budget mid-post). A visibly
  // shorter, more conservative target gives the retry a much better
  // chance of actually finishing this time, rather than repeating the
  // same failure. Everything else about the post (tone, structure,
  // required JSON shape) stays the same so the output is still a
  // legitimate blog post, just a leaner one.
  const wordRange = strict ? '500 and 750' : '900 and 1300';
  const sectionRange = strict ? '2 to 3' : '3 to 5';
  const paraRange = strict ? '2 (max 3 sentences each)' : '2 to 3 (3-5 sentences each)';
  const faqRange = strict ? '2 to 3' : '3 to 4';
  return `You are an SEO content writer for "AruhiHandlooms", an Indian ethnic-wear e-commerce store selling handwoven sarees, lehengas, bridal wear and kurtis. Their existing blog targets real search-intent, long-tail keywords (often Hinglish) in a warm, boutique-style, no-fuss voice — practical how-to and guide content, not generic marketing fluff.

Write a full blog post for this topic: "${topic}"
${extraKeywords ? `Additional keywords/context to weave in naturally: ${extraKeywords}` : ''}

The store's ACTUAL live product categories are exactly: ${categoryList}
Do not invent or use any category name outside this exact list.

LENGTH & STRUCTURE (both are hard requirements, not suggestions):
- Total length must land between ${wordRange} words across the whole body${strict ? ' — keep this SHORT and tight, this is a compact guide, not a long-form piece' : ' — this is a solid, ranking-focused guide, not a short blurb, but it must stay disciplined in length (see IMPORTANT note below on why)'}. If you find yourself running long, tighten paragraphs rather than adding more sections.
- Organize the post into ${sectionRange} distinct sections. Each section starts with its own H2-style heading, written as its own array entry using the exact marker syntax: {{h2:Section Heading Text}} — the heading text itself should be specific and contain a natural keyword variation (e.g. "{{h2:How to Choose the Right Silk Saree for a Wedding}}"), not a generic label like "Introduction" or "Conclusion".
- Each section then contains ${paraRange} prose paragraphs directly after its {{h2:...}} marker entry, before the next section's heading.
- The very first array entry should be 1 intro paragraph BEFORE the first {{h2:...}} marker, hooking the reader on the problem/question before the structured sections begin.
- IMPORTANT: you must finish the ENTIRE JSON object, including every key below and the closing brace. A longer post that gets cut off mid-sentence and produces broken JSON is a hard failure — a complete, well-formed, slightly shorter post is always the right tradeoff. Stay well within the word budget above specifically so you have room to close out every field properly.

CRITICAL — avoid repetition across sections: if the post covers multiple outfit types (e.g. saree, lehenga, kurti), each one needs its own genuinely distinct styling advice, fabric detail, and occasion fit. Do not reuse the same color/pairing suggestion ("neutral color like beige or cream, paired with a white or light-colored blouse") more than once in the whole post — that reads as generic AI filler and hurts both readability and SEO.

OTHER CONTENT RULES:
- Written for an Indian audience shopping for ethnic wear online.
- No emojis, no markdown formatting — plain prose paragraphs only, EXCEPT for the {{h2:...}} section markers and the in-content category links described below.
- In ${strict ? '1 to 2' : '2 to 3'} of the paragraphs (not all, and never inside a heading marker itself), naturally weave in ONE in-content link per paragraph using this exact syntax: [natural anchor text](category:Exact Category Name) — the category name must be copied exactly from the list above. Example: "you could reach for a [Banarasi silk saree](category:Silk Sarees) in a warm gold tone". Only link where it's a genuinely relevant, natural mention — never force it, never link the same category twice.
- Naturally mention relevant fabrics/crafts (e.g. Banarasi, Kanjivaram, Chanderi, Tussar, Mysore Silk, Georgette) only where genuinely relevant to the topic — don't force it.

FAQ SECTION (separate from body_paragraphs, required):
- Write ${faqRange} genuinely useful FAQ question/answer pairs that real shoppers would search for around this topic (think "People Also Ask" style queries). Questions should be specific, not generic. Answers should be ${strict ? '1-2 sentences' : '2-3 sentences'}, self-contained (make sense without reading the rest of the post), and free of markdown/emojis.

Respond with ONLY a JSON object (no markdown fences, no preamble) with these exact keys:
{
  "title": "SEO title, 45-70 characters, includes the main keyword naturally",
  "excerpt": "meta description / listing summary, 140-160 characters, makes someone want to click",
  "keywords": ["3-5 realistic search-intent keyword phrases a real shopper would type, mix of Hinglish and English where natural"],
  "body_paragraphs": ["1 intro paragraph, then {{h2:Heading}} markers interleaved with paragraphs per the structure above, ${wordRange} words combined, with category links embedded per the syntax above"],
  "faqs": [{"question": "specific search-style question", "answer": "self-contained answer"}, "... ${faqRange} items total"],
  "related_category_name": "the single BEST-matching category from the exact list above for a final 'Shop this collection' button — must be copied exactly from the list, or empty string if genuinely none fit"
}`;
}

// One NIM call + parse attempt. Returns the parsed post on success, or a
// tagged failure reason so the caller can decide whether to retry (only
// `truncated` is worth retrying — a truncated response means the model
// simply ran out of token budget for THIS attempt, which a shorter/
// stricter prompt on retry can realistically fix. An HTTP error or a
// genuinely malformed non-truncated response won't be fixed by retrying
// with the same shape of request, so those are returned as-is for the
// caller to surface immediately).
type NimAttempt =
  | { ok: true; parsed: GeneratedPost }
  | { ok: false; reason: 'http_error'; status: number; rateLimited: boolean }
  | { ok: false; reason: 'truncated' | 'malformed' | 'timeout' };

async function attemptGeneration(
  apiKey: string,
  promptText: string,
  maxTokens: number,
  timeoutMs: number
): Promise<NimAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.6,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (fetchErr) {
      // Covers our own AbortController firing (NIM simply hadn't replied
      // within timeoutMs — verified via Vercel logs as DOMException
      // [AbortError], previously left UNCAUGHT here so it skipped past
      // this function entirely into the outer catch, skipping the retry
      // below in the process) as well as genuine network failures. Both
      // are worth one retry with a smaller/faster request rather than
      // failing outright.
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      console.error(
        `[generate-blog-post] NIM fetch failed (${isAbort ? 'timed out after ' + timeoutMs + 'ms' : 'network error'}):`,
        fetchErr
      );
      return { ok: false, reason: 'timeout' };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[generate-blog-post] NVIDIA NIM API error:', res.status, errText);
      return { ok: false, reason: 'http_error', status: res.status, rateLimited: res.status === 429 };
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed: GeneratedPost | undefined;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = undefined;
        }
      }
    }

    if (!parsed || !parsed.title || !Array.isArray(parsed.body_paragraphs) || parsed.body_paragraphs.length === 0) {
      const looksTruncated = !cleaned.trim().endsWith('}');
      console.error(
        `[generate-blog-post] Could not parse AI response${looksTruncated ? ' (looks truncated — did not end with "}")' : ''}:`,
        text.slice(0, 500)
      );
      return { ok: false, reason: looksTruncated ? 'truncated' : 'malformed' };
    }

    return { ok: true, parsed };
  } finally {
    clearTimeout(timeout);
  }
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
  const topic = (body?.topic as string | undefined)?.trim() || '';
  const extraKeywords = (body?.keywords as string | undefined)?.trim() || '';

  if (!topic) {
    return NextResponse.json({ error: 'Give a topic or pick a trending idea to generate from.' }, { status: 400 });
  }

  // Real, live category names — this is what actually fixes "related
  // category: None" and dead-end inline links: the AI is only ever allowed
  // to reference categories that genuinely exist and have products, instead
  // of guessing from a hardcoded list that can drift out of sync with the
  // real catalog.
  const supabase = getSupabaseAdmin();
  const { data: categoriesData } = await supabase.from('categories').select('name');
  const categoryNames: string[] = (categoriesData ?? []).map((c: any) => String(c.name)).filter(Boolean);
  const validNameSet = new Set(categoryNames.map((n) => n.toLowerCase()));

  try {
    // First attempt: the normal-length prompt (900-1300 words) on the fast
    // 8b text model, given a 35s budget — comfortably enough for this
    // model on NIM's free tier, while still leaving a real ~15-18s window
    // for a retry plus the DB reads before/after, all inside the 60s
    // platform ceiling. Both a TRUNCATED response (model ran out of tokens
    // mid-JSON) and a TIMEOUT (NIM free tier just being slow right now —
    // verified via Vercel logs as a real, recurring failure mode) now get
    // ONE retry with a shorter/stricter prompt and a smaller token budget,
    // since that retry is cheap and fast enough on the 8b model to still
    // fit the remaining time — previously a timeout skipped the retry
    // entirely and failed the whole request outright.
    let attempt = await attemptGeneration(
      apiKey,
      buildPrompt(topic, extraKeywords, categoryNames, false),
      5500,
      35_000
    );

    if (!attempt.ok && (attempt.reason === 'truncated' || attempt.reason === 'timeout')) {
      console.error(
        `[generate-blog-post] First attempt ${attempt.reason} — retrying with a shorter/stricter prompt.`
      );
      attempt = await attemptGeneration(
        apiKey,
        buildPrompt(topic, extraKeywords, categoryNames, true),
        3000,
        18_000
      );
    }

    if (!attempt.ok) {
      if (attempt.reason === 'http_error') {
        return NextResponse.json(
          {
            error: attempt.rateLimited
              ? 'AI is rate-limited right now (free tier). Wait a minute and try again.'
              : 'AI generation failed. Please try again.',
          },
          { status: 502 }
        );
      }
      if (attempt.reason === 'timeout') {
        return NextResponse.json(
          {
            error:
              "AI service (NVIDIA's free tier) is responding slowly right now and didn't finish in time, even after a retry. Please wait a minute and try again.",
          },
          { status: 504 }
        );
      }
      // Ran out of retries — either truncated twice in a row (rare given
      // the much smaller retry budget) or genuinely malformed output.
      return NextResponse.json(
        {
          error:
            attempt.reason === 'truncated'
              ? 'AI response was cut off before finishing, even after a retry. Please try again — if this keeps happening, try a shorter/more specific topic.'
              : 'AI returned an unexpected format. Please try again.',
        },
        { status: 502 }
      );
    }

    const parsed = attempt.parsed;


    let bodyParagraphs = parsed.body_paragraphs
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .map((p) => sanitizeInlineLinks(p, validNameSet))
      .map(stripStrayCategoryParens);

    const relatedRaw = (parsed.related_category_name || '').trim();
    const relatedCategoryName = validNameSet.has(relatedRaw.toLowerCase())
      ? categoryNames.find((n) => n.toLowerCase() === relatedRaw.toLowerCase()) || ''
      : '';

    // Guarantee at least one real internal (category) link — see comment
    // on ensureCategoryLinks for why this can no longer be left entirely
    // up to the model.
    bodyParagraphs = ensureCategoryLinks(bodyParagraphs, categoryNames, relatedCategoryName);

    // Estimated by us from the actual generated word count (~200 wpm),
    // rather than trusting the model's own guess, which was frequently off
    // (e.g. claiming 8 minutes for a ~500-word post).
    const totalWords = bodyParagraphs.join(' ').split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(2, Math.round(totalWords / 200));

    // Pull a real product photo from that category to suggest as the cover
    // image — a live catalog photo converts better than a generic stock
    // image, and it saves the manual "go find a URL" step for the admin.
    let suggestedCoverImage = '';
    if (relatedCategoryName) {
      const { data: productRows } = await supabase
        .from('products')
        .select('images')
        .eq('category_name', relatedCategoryName)
        .eq('approval_status', 'live')
        .order('created_at', { ascending: false })
        .limit(10);
      const withImages = (productRows ?? []).find(
        (p: any) => Array.isArray(p.images) && p.images.length > 0
      );
      if (withImages) suggestedCoverImage = withImages.images[0];
    }

    // Fallback so the post never ships with "No Image": relatedCategoryName
    // is only ever set when the model's related_category_name exactly
    // matches a real, live category (see validNameSet check above) — the
    // model can and does sometimes invent a plausible-sounding but
    // non-existent category (e.g. "Banarasi Sarees" when the real
    // category is "Silk Sarees"), which leaves relatedCategoryName empty
    // and, previously, the cover image blank too. When that happens (or
    // the matched category simply has no live product photos yet), fall
    // back to any live, in-stock product photo store-wide instead of
    // leaving the field empty — still a real catalog photo, just not
    // guaranteed to match the topic as closely as an in-category one.
    if (!suggestedCoverImage) {
      const { data: fallbackRows } = await supabase
        .from('products')
        .select('images')
        .eq('approval_status', 'live')
        .eq('in_stock', true)
        .order('featured', { ascending: false })
        .order('rating', { ascending: false })
        .limit(10);
      const fallbackWithImages = (fallbackRows ?? []).find(
        (p: any) => Array.isArray(p.images) && p.images.length > 0
      );
      if (fallbackWithImages) suggestedCoverImage = fallbackWithImages.images[0];
    }

    // Auto-insert real product cards ({{product:slug}} — same marker the
    // admin's "Insert product card" button writes, parsed by
    // app/blog/[slug]/page.tsx into a <BlogProductCard> with a real photo,
    // price and "Shop Now" link). Doing this here means every AI-generated
    // draft already has conversion-driving product cards in place, instead
    // of relying on the admin to add them by hand after the fact — the
    // admin can still remove/move the markers in the review step before
    // publishing, same as any other text in the draft.
    const insertedProducts: { slug: string; name: string }[] = [];
    if (relatedCategoryName) {
      const { data: cardCandidates } = await supabase
        .from('products')
        .select('slug, name, images, rating, featured')
        .eq('category_name', relatedCategoryName)
        .eq('approval_status', 'live')
        .eq('in_stock', true)
        .order('featured', { ascending: false })
        .order('rating', { ascending: false })
        .limit(10);

      // Posts are now long-form (4-6 H2 sections), so 2-3 product cards
      // spread through the post reads naturally instead of feeling sparse
      // — was capped at 1-2 back when posts were 6-8 short paragraphs.
      const picked = (cardCandidates ?? [])
        .filter((p: any) => Array.isArray(p.images) && p.images.length > 0)
        // Don't repeat the exact product whose photo is already the cover image.
        .filter((p: any) => p.images[0] !== suggestedCoverImage)
        .slice(0, bodyParagraphs.length >= 12 ? 3 : 2);

      if (picked.length > 0) {
        // Spread the cards through the post rather than bunching them at
        // the top/bottom — roughly evenly across the length — so they read
        // as a natural break, not an ad wall.
        const insertAt = picked.map((_, i) =>
          Math.max(1, Math.round(((i + 1) * bodyParagraphs.length) / (picked.length + 1)))
        );
        // Insert back-to-front so earlier insertions don't shift later indices.
        insertAt
          .map((pos, i) => ({ pos, product: picked[i] }))
          .sort((a, b) => b.pos - a.pos)
          .forEach(({ pos, product }) => {
            bodyParagraphs.splice(pos, 0, `{{product:${product.slug}}}`);
          });
        picked.forEach((p: any) => insertedProducts.push({ slug: p.slug, name: p.name }));
      }
    }

    // Auto-insert one real customer review as social proof — a short
    // blockquote from an actually-approved review on a product in the same
    // category, encoded into a {{review:<base64 json>}} marker so
    // app/blog/[slug]/page.tsx can render it without a second DB round
    // trip and without breaking if the underlying review is later deleted
    // or unapproved (the quote, once embedded, is just text from then on).
    // Best-effort: if the category has no approved reviews yet, the post
    // simply ships without one — nothing breaks.
    if (relatedCategoryName) {
      try {
        const { data: categoryProducts } = await supabase
          .from('products')
          .select('id, name')
          .eq('category_name', relatedCategoryName)
          .eq('approval_status', 'live')
          .limit(50);
        const productIds = (categoryProducts ?? []).map((p: any) => p.id);
        const productNameById = new Map((categoryProducts ?? []).map((p: any) => [p.id, p.name]));

        if (productIds.length > 0) {
          const { data: reviewRows } = await supabase
            .from('reviews')
            .select('product_id, customer_name, rating, comment')
            .in('product_id', productIds)
            .eq('is_approved', true)
            .not('comment', 'is', null)
            .order('rating', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(5);

          const bestReview = (reviewRows ?? []).find(
            (r: any) => typeof r.comment === 'string' && r.comment.trim().length >= 20
          );

          if (bestReview) {
            const payload = {
              name: bestReview.customer_name || 'Verified customer',
              rating: bestReview.rating || 5,
              comment: bestReview.comment.trim(),
              product: productNameById.get(bestReview.product_id) || relatedCategoryName,
            };
            const marker = `{{review:${Buffer.from(JSON.stringify(payload)).toString('base64')}}}`;
            // Place it about 80% of the way through — after most of the
            // how-to content, right before things wrap up, so it reads as
            // a natural "here's proof this works" beat, not an interruption.
            const pos = Math.max(1, Math.round(bodyParagraphs.length * 0.8));
            bodyParagraphs.splice(pos, 0, marker);
          }
        }
      } catch (reviewErr) {
        console.error('[generate-blog-post] review lookup failed (non-fatal):', reviewErr);
      }
    }

    // FAQs: validate shape defensively since this comes straight from the
    // model — anything malformed is dropped rather than saved as broken
    // JSON that could crash the FAQPage schema or the public render.
    const faqs = Array.isArray(parsed.faqs)
      ? parsed.faqs
          .filter(
            (f): f is { question: string; answer: string } =>
              !!f &&
              typeof f.question === 'string' &&
              typeof f.answer === 'string' &&
              f.question.trim().length > 0 &&
              f.answer.trim().length > 0
          )
          .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
          .slice(0, 6)
      : [];

    const result: GeneratedPost = {
      title: parsed.title.trim(),
      slug: slugify(parsed.title),
      excerpt: (parsed.excerpt || '').trim(),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
      body_paragraphs: bodyParagraphs,
      faqs,
      read_minutes: readMinutes,
      related_category_name: relatedCategoryName,
      suggested_cover_image: suggestedCoverImage,
      inserted_products: insertedProducts,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[generate-blog-post] Unexpected error:', err);
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 });
  }
}
