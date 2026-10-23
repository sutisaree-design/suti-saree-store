import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Google has no official free Trends API. The public "Trending Now" RSS feed
// (used by the Trends website itself) is the closest thing — no key needed,
// but it's undocumented, can change shape, get rate-limited, or be
// unreachable from some hosts. Everything here is best-effort: if the fetch
// or parse fails, we just fall back to the curated list below instead of
// erroring the whole endpoint out.
const TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=IN';

// Loose relevance filter — keeps only trending queries that plausibly relate
// to this store's niche (Indian ethnic wear) instead of showing completely
// unrelated trending news to the admin.
const RELEVANCE_WORDS = [
  'saree', 'sari', 'lehenga', 'kurti', 'kurta', 'ethnic', 'wedding', 'bridal',
  'silk', 'banarasi', 'kanjivaram', 'festive', 'diwali', 'navratri', 'durga puja',
  'karva chauth', 'raksha bandhan', 'eid', 'holi', 'fashion', 'outfit', 'dress',
  'salwar', 'anarkali', 'dupatta', 'handloom', 'weave', 'blouse', 'sangeet',
];

// Evergreen topic bank tied to the Indian festival/wedding calendar plus
// reliable SEO content shapes (how-to, comparison, care guide, size guide).
// Always returned alongside live Trends data so the admin never sees an
// empty list — this is the reliable backbone, Trends data is the bonus.
const SEASONAL_BANK: { month: number; topics: string[] }[] = [
  { month: 1, topics: ['republic day outfit ideas ethnic wear', 'winter wedding guest saree guide', 'pongal and makar sankranti traditional outfits'] },
  { month: 2, topics: ['valentines day ethnic outfit ideas', 'spring wedding season lehenga trends', 'how to accessorize a saree for day functions'] },
  { month: 3, topics: ['holi outfit guide cotton and silk', 'what to wear for holi that wont stain', 'navratri chaniya choli buying guide'] },
  { month: 4, topics: ['summer saree fabric guide cotton vs linen', 'baisakhi traditional outfit ideas', 'lightweight kurtis for summer'] },
  { month: 5, topics: ['how to keep silk sarees cool and fresh in summer', 'destination wedding outfit packing guide', 'best fabrics for humid weather ethnic wear'] },
  { month: 6, topics: ['monsoon saree care tips', 'rath yatra traditional outfit guide', 'how to prevent silk from fungus in monsoon'] },
  { month: 7, topics: ['guru purnima traditional outfit ideas', 'monsoon wedding guest outfit guide', 'how to store sarees during monsoon'] },
  { month: 8, topics: ['raksha bandhan outfit ideas for sisters', 'independence day tricolor ethnic outfit ideas', 'janmashtami traditional dress guide'] },
  { month: 9, topics: ['onam traditional kasavu saree guide', 'ganesh chaturthi outfit ideas', 'early navratri shopping guide'] },
  { month: 10, topics: ['navratri 9 colours outfit guide', 'durga puja saree shopping guide', 'karva chauth outfit and makeup pairing', 'dussehra traditional outfit ideas'] },
  { month: 11, topics: ['diwali saree and lehenga trends', 'wedding season 2026 lehenga trends', 'diwali gifting guide ethnic wear', 'bhai dooj outfit ideas'] },
  { month: 12, topics: ['winter wedding season bridal shopping guide', 'christmas and new year ethnic party wear', 'year end sale saree shopping guide'] },
];

interface TopicIdea {
  topic: string;
  source: 'trends' | 'seasonal' | 'evergreen';
}

// Long-tail, purchase-intent + India-city-tied topics — the kind of
// specific query a real buyer types before purchasing rather than just
// browsing (e.g. "kanchipuram silk saree buying guide" over "silk
// sarees"). Each major handloom craft is deliberately tied to the Indian
// city/region it's actually associated with and known/searched for, since
// that's both a genuine long-tail SEO angle and matches real buyer intent
// ("where do I get an authentic X"). Kept separate from SEASONAL_BANK
// (which is festival/calendar-driven) since these don't expire — they're
// filtered against already-published posts below just like everything
// else, so once a topic here gets used it drops out and the next one
// surfaces instead of repeating forever.
const EVERGREEN_LONGTAIL_BANK: string[] = [
  'kanchipuram silk saree buying guide',
  'banarasi silk saree shopping guide varanasi',
  'pochampally ikkat saree guide hyderabad',
  'bandhani saree shopping guide jaipur',
  'patola saree buying guide ahmedabad',
  'saree wholesale market guide surat',
  'chanderi saree buying guide madhya pradesh',
  'tant saree shopping guide kolkata',
  'mysore silk saree buying guide bangalore',
  'saree shopping guide chennai t nagar',
  'saree market guide delhi chandni chowk',
  'best sarees for wedding shopping mumbai',
  'how to identify a genuine handloom saree before buying',
  'handloom vs powerloom saree difference explained',
  'best silk sarees under 5000 online india',
  'affordable handloom sarees online india',
  'cotton handloom sarees for daily wear online',
  'wedding silk saree price guide india',
  'how to buy sarees online safely in india',
  'best handloom saree brands in india',
  'maheshwari saree buying guide indore',
  'sambalpuri saree guide odisha',
  'jamdani saree guide west bengal',
  'gadwal saree buying guide telangana',
  'silk saree care and storage tips for indian summers',
];

function extractRssTitles(xml: string): string[] {
  // Deliberately regex-based rather than pulling in an XML parser dependency
  // for one endpoint — Trends RSS <item><title> is a plain, well-formed tag.
  const titles: string[] = [];
  const itemBlocks = xml.split('<item>').slice(1);
  for (const block of itemBlocks) {
    const match = block.match(/<title>([\s\S]*?)<\/title>/);
    if (match) {
      const raw = match[1]
        .replace('<![CDATA[', '')
        .replace(']]>', '')
        .trim();
      if (raw) titles.push(raw);
    }
  }
  return titles;
}

async function fetchTrendingTopics(): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(TRENDS_RSS_URL, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogTrendBot/1.0)' },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return [];
    const xml = await res.text();
    const titles = extractRssTitles(xml);
    const lower = (s: string) => s.toLowerCase();
    return titles.filter((t) => RELEVANCE_WORDS.some((w) => lower(t).includes(w)));
  } catch (err) {
    console.error('[blog-trend-ideas] Trends RSS fetch failed (non-fatal, using seasonal bank only):', err);
    return [];
  }
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'to', 'of', 'and', 'or', 'in', 'on', 'with', 'is',
  'how', 'what', 'best', 'vs', 'near', 'me', 'my', 'your', 'guide', 'ideas', 'idea',
]);

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Same "already covered" idea as blog-keyword-gaps: a topic counts as
  // used once its significant words substantially overlap with an
  // existing post's title/keywords, so a suggestion that's already been
  // written about (in any of these three buckets — trending, seasonal, or
  // evergreen) drops out and the next best one takes its place instead of
  // showing the same pill forever.
  const supabase = getSupabaseAdmin();
  const { data: postsData } = await supabase.from('blog_posts').select('title, keywords').limit(300);
  const coveredCorpus: string[][] = (postsData ?? []).map((p: any) => {
    const text = [p.title, ...(Array.isArray(p.keywords) ? p.keywords : [])].join(' ');
    return significantWords(text);
  });
  const isCovered = (topic: string): boolean => {
    const words = significantWords(topic);
    if (words.length === 0) return false;
    return coveredCorpus.some((corpusWords) => {
      const overlap = words.filter((w) => corpusWords.includes(w)).length;
      return overlap >= Math.max(2, Math.ceil(words.length * 0.6));
    });
  };

  const now = new Date();
  const monthIndex = (offset: number) => (((now.getMonth() + offset) % 12) + 12) % 12;
  // Current + next month's festival topics first (most timely); if too
  // many of those are already covered, backfill from the following month
  // and last month too, so the seasonal bucket doesn't just shrink to
  // nothing as the month's few topics get used up one by one.
  const monthOrder = [monthIndex(0), monthIndex(1), monthIndex(2), monthIndex(-1)];
  const seasonalPool = Array.from(
    new Set(
      monthOrder.flatMap((mIdx) => SEASONAL_BANK.find((m) => m.month === mIdx + 1)?.topics ?? [])
    )
  );
  const seasonal: TopicIdea[] = seasonalPool
    .filter((t) => !isCovered(t))
    .slice(0, 5)
    .map((topic) => ({ topic, source: 'seasonal' as const }));

  const evergreen: TopicIdea[] = EVERGREEN_LONGTAIL_BANK.filter((t) => !isCovered(t))
    .slice(0, 6)
    .map((topic) => ({ topic, source: 'evergreen' as const }));

  const trendingRaw = await fetchTrendingTopics();
  const trending: TopicIdea[] = trendingRaw
    .filter((t) => !isCovered(t))
    .slice(0, 6)
    .map((topic) => ({ topic, source: 'trends' as const }));

  return NextResponse.json({ ideas: [...trending, ...evergreen, ...seasonal] });
}
