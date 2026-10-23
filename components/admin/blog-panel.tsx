'use client';

import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Eye,
  EyeOff,
  Sparkles,
  TrendingUp,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import { useProducts } from '@/lib/cart-context';
import {
  fetchBlogPostsAdmin,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
} from '@/lib/blog-api';
import { BlogPostRow, BlogFaq } from '@/lib/types';
import { fetchBlogPerformance, BlogPostPerformance } from '@/lib/blog-performance-api';
import { formatINR } from '@/lib/format';

// The AI/network-backed admin endpoints below (generate-blog-post especially
// — a long-running NVIDIA NIM call close to the platform's execution-time
// ceiling) can occasionally get killed by the HOSTING layer itself before
// our own route handler's try/catch gets a chance to return a proper JSON
// error (e.g. a Vercel function timeout, or a proxy/edge error). When that
// happens the browser gets back an HTML error page instead of JSON, and a
// bare `res.json()` throws the cryptic native
// `Unexpected token '<', "<!DOCTYPE"... is not valid JSON` error straight
// into the toast. This wrapper checks the content-type first so every
// failure mode — including "not JSON at all" — surfaces as one clear,
// actionable message instead.
async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 504 || res.status === 502 || res.status === 503) {
      throw new Error('The server took too long to respond. Please try again.');
    }
    throw new Error(`Unexpected server response (HTTP ${res.status}). Please try again.`);
  }
  return res.json();
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// Paragraphs are edited as one big textarea, one paragraph per blank-line
// break -- avoids building a whole array-editing UI for what's really just
// "write the article". Kept in sync with the reverse join when opening the
// edit dialog for an existing post.
const bodyToText = (paragraphs: string[]) => paragraphs.join('\n\n');
const textToBody = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// FAQs are edited the same low-friction way as the body: one big textarea,
// each Q/A pair as a "Q: ...\nA: ..." block separated by a blank line —
// no dedicated add/remove-row UI needed for what's really just writing
// four or five short question/answer pairs.
const faqsToText = (faqs: BlogFaq[]) =>
  faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
const textToFaqs = (text: string): BlogFaq[] =>
  text
    .split(/\n\s*\n/)
    .map((block) => {
      const qMatch = block.match(/Q:\s*(.+)/);
      const aMatch = block.match(/A:\s*([\s\S]+)/);
      const question = qMatch?.[1]?.trim() || '';
      const answer = aMatch?.[1]?.trim() || '';
      return { question, answer };
    })
    .filter((f) => f.question && f.answer);

export default function BlogPanel() {
  const { categories, products } = useProducts();
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPostRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<BlogPostRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Per-post performance (Views/Clicks/Conversions) — self-hosted, reads
  // straight from blog_analytics_events via /api/admin/blog-performance.
  const [perf, setPerf] = useState<Map<string, BlogPostPerformance>>(new Map());
  const [perfLoading, setPerfLoading] = useState(true);

  useEffect(() => {
    fetchBlogPerformance(30)
      .then((data) => setPerf(new Map(data.posts.map((p) => [p.slug, p]))))
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, []);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [keywords, setKeywords] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [faqsText, setFaqsText] = useState('');
  const [readMinutes, setReadMinutes] = useState(5);
  const [relatedCategory, setRelatedCategory] = useState<string>('none');
  const [published, setPublished] = useState(true);

  // AI blog generator — separate from the add/edit dialog above. Generates
  // a full draft from a topic, which then opens the same dialog pre-filled
  // so the admin still reviews/edits before it goes live.
  const [aiTopic, setAiTopic] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [trendIdeas, setTrendIdeas] = useState<{ topic: string; source: 'trends' | 'seasonal' | 'evergreen' }[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [keywordGaps, setKeywordGaps] = useState<string[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsNote, setGapsNote] = useState<string | null>(null);
  const [suggestingCover, setSuggestingCover] = useState(false);

  // Inline "product card" insertion — lets an admin drop a real product
  // (image + name + price + Shop Now link) into the middle of a blog post,
  // via the `{{product:slug}}` marker parsed by app/blog/[slug]/page.tsx.
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const loadKeywordGaps = async () => {
    setGapsLoading(true);
    setGapsNote(null);
    try {
      const res = await fetch('/api/admin/blog-keyword-gaps');
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load keyword gaps');
      setKeywordGaps(data.gaps || []);
      if (data.note) setGapsNote(data.note);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load keyword gaps');
    } finally {
      setGapsLoading(false);
    }
  };

  const loadTrendIdeas = async () => {
    setTrendsLoading(true);
    try {
      const res = await fetch('/api/admin/blog-trend-ideas');
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load ideas');
      setTrendIdeas(data.ideas || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load trending ideas');
    } finally {
      setTrendsLoading(false);
    }
  };

  const generateWithAI = async (topicOverride?: string) => {
    const topic = (topicOverride ?? aiTopic).trim();
    if (!topic) {
      toast.error('Enter a topic, or pick a trending idea below');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch('/api/admin/generate-blog-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'Generation failed');

      // Pre-fill the normal add/edit dialog with the AI draft — published
      // defaults to false so a human reviews it once before it goes live.
      // Flip the "Draft/Published" switch in the dialog to publish instantly.
      setEditing(null);
      setTitle(data.title || '');
      setSlug(data.slug || '');
      setExcerpt(data.excerpt || '');
      setKeywords(Array.isArray(data.keywords) ? data.keywords.join(', ') : '');
      setCoverImage(data.suggested_cover_image || '');
      setBodyText(bodyToText(data.body_paragraphs || []));
      setFaqsText(faqsToText(data.faqs || []));
      setReadMinutes(data.read_minutes || 5);
      const matchedCategory = categories.find(
        (c) => c.name.toLowerCase() === (data.related_category_name || '').toLowerCase()
      );
      setRelatedCategory(matchedCategory ? matchedCategory.name : 'none');
      setPublished(false);
      setOpen(true);

      const insertedNames: string[] = Array.isArray(data.inserted_products)
        ? data.inserted_products.map((p: { name: string }) => p.name).filter(Boolean)
        : [];
      const productNote =
        insertedNames.length > 0
          ? ` + auto-inserted product card${insertedNames.length > 1 ? 's' : ''} for ${insertedNames.join(' & ')}`
          : '';

      toast.success(
        (data.suggested_cover_image
          ? 'Draft generated with a product photo as cover'
          : 'Draft generated — add a cover image before publishing') +
          productNote +
          ' — review before publishing'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  // Manual counterpart to the auto-suggestion the AI generator does — lets
  // an admin pull a real, live product photo for the currently selected
  // "Related category" into the Cover image field. Also how old posts that
  // shipped with generic/broken stock-photo URLs get fixed: open the post,
  // pick a related category if it doesn't have one yet, click Suggest.
  const suggestCoverFromCategory = async () => {
    if (relatedCategory === 'none') {
      toast.error('Pick a related category first, then suggest an image');
      return;
    }
    setSuggestingCover(true);
    try {
      const res = await fetch('/api/admin/blog-suggest-cover-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_name: relatedCategory }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'No product photo found for that category');
      setCoverImage(data.image);
      toast.success('Cover image set from a live product photo');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not suggest an image');
    } finally {
      setSuggestingCover(false);
    }
  };

  const filteredPickerProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        )
      : products;
    return list.slice(0, 20);
  }, [products, productSearch]);

  // Inserts `{{product:slug}}` as its own paragraph at the textarea's
  // current cursor position (falls back to appending at the end if the
  // textarea ref isn't available for some reason). Surrounded by blank
  // lines so textToBody() splits it out as its own paragraph, and the
  // public blog page renders it as a product card instead of prose.
  const insertProductCard = (slug: string) => {
    const marker = `{{product:${slug}}}`;
    const textarea = bodyTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? bodyText.length;
      const end = textarea.selectionEnd ?? bodyText.length;
      const before = bodyText.slice(0, start);
      const after = bodyText.slice(end);
      const needsLeadingBreak = before.length > 0 && !before.endsWith('\n\n');
      const needsTrailingBreak = after.length > 0 && !after.startsWith('\n\n');
      const insertion = `${needsLeadingBreak ? '\n\n' : ''}${marker}${needsTrailingBreak ? '\n\n' : ''}`;
      const nextText = before + insertion + after;
      setBodyText(nextText);
      const cursorPos = before.length + insertion.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    } else {
      setBodyText((prev) => (prev.trim() ? `${prev}\n\n${marker}\n\n` : marker));
    }
    setProductPickerOpen(false);
    setProductSearch('');
    toast.success('Product card inserted into the body');
  };

  const load = async () => {
    setLoading(true);
    try {
      setPosts(await fetchBlogPostsAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load blog posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
    );
  }, [posts, searchQuery]);

  const openNew = () => {
    setEditing(null);
    setTitle('');
    setSlug('');
    setExcerpt('');
    setKeywords('');
    setCoverImage('');
    setBodyText('');
    setFaqsText('');
    setReadMinutes(5);
    setRelatedCategory('none');
    setPublished(true);
    setOpen(true);
  };

  const openEdit = (p: BlogPostRow) => {
    setEditing(p);
    setTitle(p.title);
    setSlug(p.slug);
    setExcerpt(p.excerpt);
    setKeywords(p.keywords.join(', '));
    setCoverImage(p.cover_image);
    setBodyText(bodyToText(p.body_paragraphs));
    setFaqsText(faqsToText(p.faqs || []));
    setReadMinutes(p.read_minutes);
    setRelatedCategory(p.related_category_name || 'none');
    setPublished(p.published);
    setOpen(true);
  };

  // The public /blog pages only self-heal within 60s (see `revalidate` in
  // app/blog/page.tsx) since posts are written straight to Supabase from
  // here, not through a server route. This best-effort ping makes a save
  // show up on the live site right away instead of the admin having to
  // wait. Never blocks or fails the actual save if it errors.
  const revalidateBlogPages = async (slug: string, published: boolean, previousSlug?: string) => {
    try {
      await fetch('/api/admin/revalidate-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, previous_slug: previousSlug || '', published }),
      });
    } catch {
      // Ignore -- the 60s ISR window still catches it either way.
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const paragraphs = textToBody(bodyText);
    if (paragraphs.length === 0) {
      toast.error('Post body cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        excerpt: excerpt.trim(),
        keywords: keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        cover_image: coverImage.trim(),
        body_paragraphs: paragraphs,
        faqs: textToFaqs(faqsText),
        read_minutes: readMinutes,
        related_category_name: relatedCategory === 'none' ? null : relatedCategory,
        published,
      };
      if (editing) {
        await updateBlogPost(editing.id, payload);
        toast.success('Post updated');
        await revalidateBlogPages(payload.slug, published, editing.slug);
      } else {
        await createBlogPost({ ...payload, published_at: new Date().toISOString() });
        toast.success('Post added');
        await revalidateBlogPages(payload.slug, published);
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (p: BlogPostRow) => {
    try {
      const nowPublished = !p.published;
      await updateBlogPost(p.id, { published: nowPublished });
      toast.success(p.published ? 'Post unpublished' : 'Post published');
      await revalidateBlogPages(p.slug, nowPublished);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    try {
      await deleteBlogPost(confirmTarget.id);
      toast.success('Post deleted');
      await revalidateBlogPages(confirmTarget.slug, false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmTarget(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : searchQuery
              ? `${filteredPosts.length} of ${posts.length} post${posts.length === 1 ? '' : 's'}`
              : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={openNew} className="bg-primary">
          <Plus className="mr-1 h-4 w-4" /> Add Post
        </Button>
      </div>

      <div className="mb-6 rounded-lg border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">AI Blog Generator</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="Topic, e.g. how to style a Chanderi saree for office wear"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => generateWithAI()}
            disabled={aiGenerating}
            className="bg-primary shrink-0"
          >
            {aiGenerating ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" /> Generate with AI
              </>
            )}
          </Button>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={loadTrendIdeas}
            disabled={trendsLoading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary hover:underline disabled:opacity-60"
          >
            {trendsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" />
            )}
            Get trending topic ideas
          </button>

          {trendIdeas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trendIdeas.map((idea, i) => (
                <button
                  key={`${idea.topic}-${i}`}
                  type="button"
                  onClick={() => {
                    setAiTopic(idea.topic);
                    generateWithAI(idea.topic);
                  }}
                  disabled={aiGenerating}
                  title={
                    idea.source === 'trends'
                      ? 'From Google Trends'
                      : idea.source === 'evergreen'
                        ? 'City/purchase-intent long-tail idea'
                        : 'Seasonal/festival idea'
                  }
                  className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {idea.source === 'trends' ? '🔥 ' : idea.source === 'evergreen' ? '📍 ' : '🗓️ '}
                  {idea.topic}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={loadKeywordGaps}
            disabled={gapsLoading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary hover:underline disabled:opacity-60"
          >
            {gapsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Find content gaps (Google Suggest)
          </button>

          {gapsNote && <p className="mt-1.5 text-xs text-muted-foreground">{gapsNote}</p>}

          {keywordGaps.length > 0 && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Real searches people are typing that none of your blog posts cover yet:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {keywordGaps.map((gap, i) => (
                  <button
                    key={`${gap}-${i}`}
                    type="button"
                    onClick={() => {
                      setAiTopic(gap);
                      generateWithAI(gap);
                    }}
                    disabled={aiGenerating}
                    title="Not covered by any existing post — click to generate"
                    className="rounded-full border border-dashed border-secondary/50 bg-secondary/5 px-2.5 py-1 text-xs text-foreground hover:bg-secondary/10 disabled:opacity-60"
                  >
                    🔍 {gap}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Generates a full draft (title, excerpt, keywords, body). It opens below as a Draft — review, add a cover
          image, and flip the switch to publish.
        </p>
      </div>

      <div className="mb-4 relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title, slug…"
          className="pl-9 pr-8"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <table className="w-full table-auto">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Views</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">Conversions</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 text-sm font-medium">{p.title}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{p.slug}</td>
                <td className="px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => togglePublished(p)}
                    className={
                      p.published
                        ? 'inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                        : 'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                    }
                  >
                    {p.published ? (
                      <>
                        <Eye className="h-3 w-3" /> Live
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" /> Draft
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm">
                  {perfLoading ? '…' : (perf.get(p.slug)?.views ?? 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm">
                  {perfLoading ? '…' : (perf.get(p.slug)?.clicks ?? 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm">
                  {perfLoading ? '…' : (perf.get(p.slug)?.conversions ?? 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(p.published_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmTarget(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && posts.length > 0 && filteredPosts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No posts match your search.
                </td>
              </tr>
            )}
            {!loading && posts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No blog posts yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              {editing ? 'Edit Post' : 'Add Post'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="post-title">Title *</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. How to Wear a Banarasi Saree"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="post-slug">Slug (optional — auto-generated if left blank)</Label>
              <Input
                id="post-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugify(title) || 'how-to-wear-a-banarasi-saree'}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="post-excerpt">Excerpt (used as meta description, ~160 chars)</Label>
              <Textarea
                id="post-excerpt"
                rows={2}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Short summary shown on the blog listing and in Google search results"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="post-cover">Cover image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="post-cover"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={suggestCoverFromCategory}
                  disabled={suggestingCover}
                  className="shrink-0 whitespace-nowrap"
                >
                  {suggestingCover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5 hidden sm:inline">Suggest from category</span>
                  <span className="ml-1.5 sm:hidden">Suggest</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pulls a live product photo from the &quot;Related category&quot; below. Use this to
                fix old posts that have a broken or generic stock image, too.
              </p>
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="post-body">
                  Body — separate paragraphs with a blank line
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProductPickerOpen(true)}
                  className="h-7 gap-1.5 text-xs"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Insert product card
                </Button>
              </div>
              <Textarea
                id="post-body"
                ref={bodyTextareaRef}
                rows={10}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder={'First paragraph…\n\nSecond paragraph…'}
              />
              <p className="text-xs text-muted-foreground">
                Tip: link a phrase to a category page inline with{' '}
                <code className="rounded bg-muted px-1">[text](category:Category Name)</code> — e.g.{' '}
                <code className="rounded bg-muted px-1">[Banarasi silk saree](category:Silk Sarees)</code>. The
                category name must match a real category exactly, or it renders as plain text.
                Place your cursor where you want a product card and click &quot;Insert product
                card&quot; above to drop in a full image + price + Shop Now card. Start a
                paragraph with{' '}
                <code className="rounded bg-muted px-1">{'{{h2:Your Heading Text}}'}</code> to
                render it as a section heading instead of prose — aim for 4-6 sections and
                1200-1800 words total on long-form posts.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="post-faqs">
                FAQ section — one &quot;Q: … / A: …&quot; pair per block, separated by a blank line
              </Label>
              <Textarea
                id="post-faqs"
                rows={6}
                value={faqsText}
                onChange={(e) => setFaqsText(e.target.value)}
                placeholder={'Q: Is a Banarasi saree suitable for a daytime wedding?\nA: Yes, in lighter zari work…'}
              />
              <p className="text-xs text-muted-foreground">
                Renders as a collapsible FAQ block at the end of the post and adds FAQPage
                structured data, which makes the post eligible for Google&apos;s FAQ rich result.
                Optional, but recommended — aim for 4-5 pairs.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="post-read-minutes">Read time (minutes)</Label>
                <Input
                  id="post-read-minutes"
                  type="number"
                  min={1}
                  value={readMinutes}
                  onChange={(e) => setReadMinutes(Number(e.target.value) || 1)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Related category (shows a "Shop this" button)</Label>
                <Select value={relatedCategory} onValueChange={setRelatedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="post-keywords">Keywords (comma-separated, for SEO meta tags)</Label>
              <Input
                id="post-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="banarasi saree kaise pehnein, how to wear banarasi saree"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="post-published" checked={published} onCheckedChange={setPublished} />
              <Label htmlFor="post-published">
                {published ? 'Published (visible on the site)' : 'Draft (hidden from the site)'}
              </Label>
            </div>
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving} className="bg-primary">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Post'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={productPickerOpen}
        onOpenChange={(o) => {
          setProductPickerOpen(o);
          if (!o) setProductSearch('');
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">
              Insert a product card
            </DialogTitle>
            <DialogDescription>
              Pick a live product — it&apos;ll drop into the body as a card with its photo, name,
              price, and a Shop Now link.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products by name or category…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {filteredPickerProducts.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No live products match that search.
              </p>
            )}
            {filteredPickerProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insertProductCard(p.default_variant_slug || p.slug)}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"
              >
                <div className="h-12 w-10 shrink-0 overflow-hidden rounded bg-muted">
                  {(p.default_variant_image || p.images[0]) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.default_variant_image || p.images[0]}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.category} · {formatINR(p.price)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-primary">Delete this post?</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{confirmTarget?.title}&quot; from the blog. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
