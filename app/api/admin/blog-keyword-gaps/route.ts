import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Google Suggest is the same autocomplete data you see typing into
// google.com — it reflects what people are ACTUALLY searching right now
// (unlike a static keyword list), which is why it's useful for finding
// content gaps. It's an unofficial/undocumented endpoint (no official free
// API exists for this either), so — same as the Trends route — every call
// is best-effort and failures just shrink the result instead of erroring.
const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search';

// Base head-terms for the niche, plus purchase-intent phrasing and major
// India saree-buying/handloom-craft cities/regions — combined at request
// time with the store's live category names, so Suggest returns real
// autocomplete queries around "where do people actually buy this" and
// "what do they search right before purchasing", not just generic terms.
const BASE_SEEDS = ['saree', 'lehenga', 'kurti', 'silk saree', 'bridal wear', 'ethnic wear'];
const PURCHASE_INTENT_SEEDS = ['buy sarees online', 'handloom saree price', 'silk saree online shopping'];
const CITY_SEEDS = [
  'saree shopping mumbai', 'saree shopping chennai', 'saree shopping kolkata',
  'saree shopping delhi', 'banarasi saree varanasi', 'kanchipuram silk saree',
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'to', 'of', 'and', 'or', 'in', 'on', 'with', 'is',
  'how', 'what', 'best', 'vs', 'near', 'me', 'my', 'your',
]);

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

async function fetchSuggestions(seed: string): Promise<string[]> {
  try {
    const url = `${SUGGEST_ENDPOINT}?client=firefox&hl=en-IN&q=${encodeURIComponent(seed)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogKeywordGapBot/1.0)' },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return [];
    const data = await res.json();
    // Response shape: ["seed query", ["suggestion 1", "suggestion 2", ...]]
    const suggestions = Array.isArray(data?.[1]) ? (data[1] as string[]) : [];
    return suggestions.filter((s) => typeof s === 'string' && s.trim().length > 0);
  } catch (err) {
    console.error(`[blog-keyword-gaps] Suggest fetch failed for "${seed}" (non-fatal):`, err);
    return [];
  }
}

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: categoriesData }, { data: postsData }] = await Promise.all([
    supabase.from('categories').select('name').limit(20),
    supabase.from('blog_posts').select('title, keywords').limit(200),
  ]);

  const categoryNames = (categoriesData ?? []).map((c: any) => String(c.name)).filter(Boolean);
  const seeds = Array.from(
    new Set([...BASE_SEEDS, ...PURCHASE_INTENT_SEEDS, ...CITY_SEEDS, ...categoryNames])
  ).slice(0, 16);

  // "Covered" corpus = every existing blog post's title + its keyword list,
  // reduced to significant words. A suggestion counts as covered if enough
  // of its own significant words already appear in some single existing
  // post's corpus (simple set-overlap heuristic — no need for anything
  // fancier at this content volume).
  const coveredCorpus: string[][] = (postsData ?? []).map((p: any) => {
    const text = [p.title, ...(Array.isArray(p.keywords) ? p.keywords : [])].join(' ');
    return significantWords(text);
  });

  const isCovered = (suggestion: string): boolean => {
    const words = significantWords(suggestion);
    if (words.length === 0) return true;
    return coveredCorpus.some((corpusWords) => {
      const overlap = words.filter((w) => corpusWords.includes(w)).length;
      return overlap >= Math.max(2, Math.ceil(words.length * 0.6));
    });
  };

  const results = await Promise.all(seeds.map((seed) => fetchSuggestions(seed)));
  const allSuggestions = Array.from(new Set(results.flat()));

  const gaps = allSuggestions.filter((s) => !isCovered(s)).slice(0, 20);
  const covered = allSuggestions.filter((s) => isCovered(s)).slice(0, 10);

  return NextResponse.json({
    gaps,
    covered,
    seedsUsed: seeds,
    note:
      allSuggestions.length === 0
        ? 'Google Suggest was unreachable right now — try again in a bit.'
        : undefined,
  });
}
