import { NextResponse } from 'next/server';
import { fetchImageSearchAiSettingsServer } from '@/lib/settings-api';

// ---------------------------------------------------------------------
// "Search by photo" — AI-powered variant.
//
// Uses the same free NVIDIA NIM vision model already used by
// app/api/admin/detect-variant-color/route.ts (no new key/signup needed
// if NVIDIA_API_KEY is already configured for that / AI Chat / "Generate
// with AI"). Unlike lib/image-search.ts's client-side colour-fingerprint
// match, this route actually looks at the photo and identifies what it
// is — garment type, colour(s), pattern, style — then ranks the catalog
// against those attributes. That means a photo of a floral green kurti
// won't get confused with a plain green saree just because the average
// colour is similar, which the fingerprint method can't tell apart.
//
// This is a toggle-gated enhancement, never a hard dependency:
//   - Admin has it switched off              -> { ok:false, reason:'disabled' }
//   - NVIDIA_API_KEY missing                 -> { ok:false, reason:'not_configured' }
//   - NIM call fails / times out / rate-limited -> { ok:false, reason:'error' }
// In every case the header's handleImageFileChange() falls back to the
// always-on client-side colour match, so shoppers never see a broken
// search — just a less precise one.
// ---------------------------------------------------------------------

export const maxDuration = 60;

const MODEL = 'meta/llama-3.2-90b-vision-instruct';
const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NIM_TIMEOUT_MS = 20000;

interface LiteProduct {
  id: string;
  name: string;
  category?: string;
  colors?: string[];
  pattern?: string | null;
  occasion?: string[];
  fabric?: string;
}

interface DetectedAttributes {
  garment_type: string;
  colors: string[];
  pattern: string;
  style_keywords: string[];
}

const PROMPT = `You are a visual merchandiser for an Indian ethnic-wear store (sarees, lehengas, kurtis, dupattas, blouses, and similar garments). Look at the attached photo — it may be a shopper's own photo of a garment they like, not a studio product shot.

Identify what's being worn/shown and respond with ONLY a JSON object (no markdown fences, no preamble) with these exact keys:
{
  "garment_type": "the single most likely garment category, e.g. 'Saree', 'Lehenga', 'Kurti', 'Dupatta', 'Blouse', 'Salwar Suit' — your best guess even if unsure",
  "colors": ["1-3 dominant colours actually on the garment, ignoring background/skin/props, e.g. ['Maroon', 'Gold']"],
  "pattern": "the dominant pattern/work, e.g. 'Floral', 'Zari embroidery', 'Plain/Solid', 'Printed', 'Geometric', 'Bandhani'",
  "style_keywords": ["2-5 short descriptive keywords a shopper might use to search for this look, e.g. ['bridal', 'silk', 'heavy embroidery', 'festive']"]
}

CRITICAL OUTPUT RULE: Reply with the raw JSON object ONLY. Your entire reply must start with { and end with }.`;

function scoreProduct(p: LiteProduct, attrs: DetectedAttributes): number {
  const haystack = [
    p.name,
    p.category,
    p.pattern,
    p.fabric,
    ...(p.colors || []),
    ...(p.occasion || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let score = 0;

  if (attrs.garment_type && haystack.includes(attrs.garment_type.toLowerCase())) score += 6;

  for (const c of attrs.colors || []) {
    if (c && haystack.includes(c.toLowerCase())) score += 3;
  }

  if (attrs.pattern) {
    const patternWords = attrs.pattern.toLowerCase().split(/[\s/,-]+/).filter((w) => w.length > 2);
    for (const w of patternWords) {
      if (haystack.includes(w)) score += 2;
    }
  }

  for (const kw of attrs.style_keywords || []) {
    const words = kw.toLowerCase().split(/[\s/,-]+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (haystack.includes(w)) score += 1;
    }
  }

  return score;
}

export async function POST(req: Request) {
  const settings = await fetchImageSearchAiSettingsServer();
  if (!settings.enabled) {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 200 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const image = (body?.image as string | undefined) || '';
  const products = Array.isArray(body?.products) ? (body.products as LiteProduct[]) : [];

  if (!image || !image.startsWith('data:image')) {
    return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 });
  }
  if (products.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no_products' }, { status: 200 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NIM_TIMEOUT_MS);

  try {
    const res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[image-search] NVIDIA NIM API error:', res.status, errText);
      return NextResponse.json({ ok: false, reason: 'error' }, { status: 200 });
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let attrs: DetectedAttributes | undefined;
    try {
      attrs = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          attrs = JSON.parse(match[0]);
        } catch {
          attrs = undefined;
        }
      }
    }

    if (!attrs || !attrs.garment_type) {
      console.error('[image-search] Non-JSON model response:', text.slice(0, 500));
      return NextResponse.json({ ok: false, reason: 'error' }, { status: 200 });
    }

    const scored = products
      .map((p) => ({ id: p.id, score: scoreProduct(p, attrs!) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      // AI understood the photo fine but nothing in the catalog matches
      // well enough — say so distinctly so the client doesn't silently
      // fall back to a much cruder result set for no visible reason.
      return NextResponse.json({ ok: true, rankedIds: [], attrs }, { status: 200 });
    }

    return NextResponse.json({ ok: true, rankedIds: scored.map((s) => s.id), attrs }, { status: 200 });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error('[image-search] error:', timedOut ? 'timeout' : err);
    return NextResponse.json({ ok: false, reason: timedOut ? 'timeout' : 'error' }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
