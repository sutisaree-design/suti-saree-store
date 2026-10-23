import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { COLOR_PRESETS } from '@/lib/color-presets';

// Same free-tier NVIDIA NIM vision model already used by /api/admin/generate-listing
// (see that route for why the 11B model + 60s duration are used on Hobby plan).
export const maxDuration = 60;

const MODEL = 'meta/llama-3.2-11b-vision-instruct';
const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface DetectedColor {
  color: string;
  colorHex: string;
}

/** Fetches an image and returns it as a base64 data: URI for NIM's image_url input. */
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

function buildPrompt(existingColors: string[]) {
  const presetNames = COLOR_PRESETS.map((c) => c.name).join(', ');
  const existingBlock =
    existingColors.length > 0
      ? `\n\nThis specific product already has these colour variants: ${existingColors.join(', ')}. Do NOT reuse any of these exact names for a different photo — if this shade is close to one of them, pick a more precise, distinguishing name instead (e.g. if "Blue" is taken, call a different blue shade "Steel Blue" or "Cobalt Blue", whichever actually matches what you see).`
      : '';
  return `You are a merchandiser for an Indian ethnic-wear store (sarees, lehengas, kurtis). Look at the attached product photo and identify the main garment's dominant colour — ignore the background, model's skin tone, and any props.

Our colour library (for reference/inspiration only — you are NOT limited to it): ${presetNames}.

Be precise, not generic. A store often stocks several distinct shades of the same base colour (e.g. Navy Blue, Sky Blue, Royal Blue, Steel Blue, Denim Blue, Cobalt Blue are all "blue" but must stay distinguishable as separate products). If the photo's shade is clearly a specific, more precise variant of a library colour, use that more precise two-word name (e.g. "Steel Blue", not just "Blue") instead of defaulting to the broad/generic library name. Only use a bare, one-word library name like "Blue", "Green" or "Pink" when the shade genuinely is that plain, unremarkable, textbook colour with no distinct undertone worth naming. When unsure between a generic and a specific name, prefer the specific one.${existingBlock}

Respond with ONLY a JSON object (no markdown fences, no preamble) with these exact keys:
{
  "color": "the most precise natural colour name for this exact shade (1-3 words, e.g. 'Peacock Blue', 'Steel Blue', 'Coral Pink') — favour specificity over matching the library exactly, and never reuse a name already listed above",
  "colorHex": "a precise hex code (e.g. '#6D071A') for the exact shade you see in the photo"
}

CRITICAL OUTPUT RULE: Reply with the raw JSON object ONLY. Your entire reply must start with { and end with }.`;
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
      { error: 'AI colour detection is not configured. Add NVIDIA_API_KEY to your environment (free key at build.nvidia.com).' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const imageUrl = (body?.imageUrl as string | undefined)?.trim() || '';
  const existingColors = Array.isArray(body?.existingColors)
    ? (body.existingColors as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];
  if (!imageUrl) {
    return NextResponse.json({ error: 'Give a variant photo to detect the colour from.' }, { status: 400 });
  }

  try {
    const imageDataUri = await fetchImageAsDataUri(imageUrl).catch(() => null);
    if (!imageDataUri) {
      return NextResponse.json({ error: 'Could not read that image. Try a different photo.' }, { status: 400 });
    }

    const userContent = [
      { type: 'text', text: buildPrompt(existingColors) },
      { type: 'image_url', image_url: { url: imageDataUri } },
    ];

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
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
      });
    } finally {
      clearTimeout(nimTimeout);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[detect-variant-color] NVIDIA NIM API error:', res.status, errText);
      const rateLimited = res.status === 429;
      return NextResponse.json(
        {
          error: rateLimited
            ? 'AI is rate-limited right now (free tier). Wait a minute and try again.'
            : 'Colour detection failed. Please try again.',
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed: DetectedColor | undefined;
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

    if (!parsed || !parsed.color) {
      console.error('[detect-variant-color] Non-JSON model response:', text.slice(0, 500));
      return NextResponse.json({ error: 'AI returned an unexpected response. Please try again.' }, { status: 502 });
    }

    // Guard against a malformed/missing hex from the model — fall back to a
    // neutral grey so the colour-swatch input never breaks, the admin can
    // still adjust it manually.
    const hex = /^#([0-9a-f]{3}){1,2}$/i.test(parsed.colorHex || '') ? parsed.colorHex : '#8C8C8C';

    return NextResponse.json({ color: parsed.color.trim(), colorHex: hex });
  } catch (err) {
    console.error('[detect-variant-color] error:', err);
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      {
        error: timedOut
          ? 'AI is taking too long to respond (free tier can be slow). Please try again in a minute.'
          : 'Could not detect the colour right now. Please try again.',
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
