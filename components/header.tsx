'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useMemo, useRef, useEffect, useCallback, FormEvent } from 'react';
import { Search, ShoppingBag, Menu, User, Heart, ArrowLeft, Camera, Loader2, Clock, Sparkles, ChevronRight, ChevronDown, BookOpen, Info, Users, Phone } from 'lucide-react';
import { useCart, useCategories, loadProductsCached } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import { getCheckoutReturnPath, isCheckoutReturnFromBuyNow, clearCheckoutReturnBuyNowFlag } from '@/lib/checkout-return';
import { rankProductIdsByImage, createSearchThumbnail } from '@/lib/image-search';
import { getKeywordSuggestions, fuzzyMatch } from '@/lib/search-utils';

const SEARCH_HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 6;
// Per-shopper "preference" signal for keyword suggestions: every word from
// a search they actually ran or a keyword they clicked gets its count
// bumped here, so future dropdowns nudge phrases containing words this
// shopper cares about (e.g. "cotton", "yellow") higher up the list --
// not just an exact repeat of a past query. Purely additive/local; never
// sent anywhere.
const TOKEN_PREFS_KEY = 'searchTokenPrefs';
// Common short connector words that would otherwise dominate every
// preference score without meaning anything ("saree" itself is fine to
// count, generic joiners aren't).
const TOKEN_PREF_STOPWORDS = new Set(['and', 'the', 'for', 'with', 'aur', 'ka', 'ke', 'ki', 'ko', 'se', 'ek']);

function getSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveSearchHistory(q: string) {
  const h = getSearchHistory().filter((s) => s !== q);
  h.unshift(q);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}
function removeSearchHistory(q: string) {
  const h = getSearchHistory().filter((s) => s !== q);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(h));
}
function getTokenPrefs(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TOKEN_PREFS_KEY) || '{}'); } catch { return {}; }
}
/** Bump preference weight for every meaningful word in a searched/clicked phrase. */
function bumpTokenPrefs(text: string) {
  try {
    const prefs = getTokenPrefs();
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !TOKEN_PREF_STOPWORDS.has(w));
    for (const w of words) prefs[w] = (prefs[w] ?? 0) + 1;
    localStorage.setItem(TOKEN_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* localStorage unavailable — preference personalisation just no-ops */ }
}
import { expandProductVariants } from '@/lib/expand-product-variants';
import { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

const navLinks = [
  { href: '/shop', label: 'Shop All' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About Us' },
];

// Mobile drawer "More" section — account/info links that sit below the
// category list, each with a small icon so the premium drawer doesn't
// degrade back into an undifferentiated wall of plain text links.
const MOBILE_UTILITY_LINKS = [
  { href: '/blog', label: 'Blog', icon: BookOpen },
  { href: '/about', label: 'About Us', icon: Info },
  { href: '/account', label: 'My Account', icon: User },
  { href: '/account/reseller', label: 'Become a Reseller', icon: Users },
  { href: '/contact', label: 'Contact Us', icon: Phone },
];

export default function Header() {
  const { count, setCartOpen, addItem, buyNowItem, clearBuyNow } = useCart();
  const { categories } = useCategories();
  const { user } = useAuth();
  // Header renders on every page, so it can't sit behind the heavy
  // ProductsProvider (root layout only carries the light Categories/
  // PaymentDiscount providers now). Products are only needed for search
  // suggestions, the mobile menu's category list, and image search — all
  // things the shopper opts into — so we fetch the catalog lazily, once,
  // the first time any of those is used, instead of on every page load.
  const [products, setProducts] = useState<Product[]>([]);
  const productsLoadedRef = useRef(false);
  const productsPromiseRef = useRef<Promise<Product[]> | null>(null);

  const ensureProductsLoaded = useCallback((): Promise<Product[]> => {
    if (productsLoadedRef.current) return Promise.resolve(products);
    if (productsPromiseRef.current) return productsPromiseRef.current;
    const promise = loadProductsCached()
      .then((prods) => {
        productsLoadedRef.current = true;
        setProducts(prods);
        return prods;
      })
      .catch(() => [] as Product[])
      .finally(() => {
        productsPromiseRef.current = null;
      });
    productsPromiseRef.current = promise;
    return promise;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // Desktop "Categories" mega-menu — separate from the mobile drawer's
  // own category list (which has its own open/close via `mobileOpen`),
  // opened on hover so a shopper never needs to leave the current page
  // just to see what's in stock across every category, image + live
  // count included, matching the same categoryStats data the drawer uses.
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageSearching, setImageSearching] = useState(false);

  // On these sub-pages, mobile shows a back arrow (left of the logo)
  // instead of the hamburger menu — matches how shopping apps let you
  // step back to the previous screen instead of opening the full nav.
  // The drawer itself renders `categories` (every category that actually
  // has at least one product) as its own "Shop by Category" section
  // below, and MOBILE_UTILITY_LINKS as its own "More" section — kept as
  // two separate groups (instead of one flat list) purely for the
  // premium drawer's visual hierarchy.

  // Per-category product count + up to 3 representative thumbnails, built
  // from the lazily-loaded `products` list (see ensureProductsLoaded,
  // triggered when the drawer opens). `useCategories()` returns every
  // category row regardless of whether it currently has stock (that's
  // the admin's full list — see Admin > Categories), so without this the
  // drawer would list empty categories a shopper could tap into and find
  // nothing. Filtering here, once, off real product data keeps the
  // drawer's list honest without needing a separate counts API.
  //
  // Counts run over expandProductVariants(products) — the same "one card
  // per colour" expansion the shop/category grids render — so a product
  // with 4 colours counts as 4 here too, matching what the shopper
  // actually sees once they tap into the category, instead of the base
  // product-row count (which undercounts any category with multi-colour
  // listings).
  const categoryStats = useMemo(() => {
    const stats = new Map<string, { count: number; thumbs: string[] }>();
    const expanded = expandProductVariants(products);
    for (const p of expanded) {
      const entry = stats.get(p.category) ?? { count: 0, thumbs: [] as string[] };
      entry.count += 1;
      if (entry.thumbs.length < 3 && p.images?.[0]) entry.thumbs.push(p.images[0]);
      stats.set(p.category, entry);
    }
    return stats;
  }, [products]);

  const categoriesWithProducts = useMemo(
    () => categories.filter((c) => (categoryStats.get(c.name)?.count ?? 0) > 0),
    [categories, categoryStats]
  );

  // Product data (and therefore real counts) only exists once
  // ensureProductsLoaded has resolved. Until then the drawer shows a
  // short skeleton instead of either an empty flash or every category
  // (including ones with zero stock) while loading.
  const categoriesLoading = !productsLoadedRef.current;

  const showBackButton =
    pathname === '/shop' ||
    pathname.startsWith('/cart') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/product/');

  // Browser history depth isn't reliable enough to build a "one tap always
  // works" back button on — prefetching, redirects, colour-swatch URL swaps
  // (see handleSelectVariant in product-detail.tsx, which updates the URL
  // with a raw history.replaceState so switching colour never reloads the
  // page) can all leave Next.js's own idea of "current route" out of sync
  // with the real browser history stack. That mismatch is what made native
  // back (hardware back button, edge-swipe gesture, or the browser's own
  // back button) sometimes need two taps to actually leave /checkout —
  // especially on a colour-variant page. So on /checkout specifically, we
  // don't trust history depth at all: we use the exact page
  // markCheckoutEntry() recorded when the shopper navigated here (see
  // lib/checkout-return.ts) and push straight to it.
  //
  // Buy Now is special: it's a single-item express checkout that never
  // touches the real cart. If the shopper backs out of it (by any method),
  // we don't want that item to just vanish, so we drop it into the real
  // cart — but we don't force the side cart drawer open; the shopper just
  // lands back on the page they were on, same as any other back nav.
  const recoverFromCheckout = (returnPath: string | null) => {
    if (isCheckoutReturnFromBuyNow()) {
      if (buyNowItem) {
        addItem(buyNowItem.product, buyNowItem.size, buyNowItem.quantity, { silent: true });
      }
      clearBuyNow();
      clearCheckoutReturnBuyNowFlag();
    }
    return returnPath;
  };

  const handleBack = () => {
    if (pathname.startsWith('/checkout')) {
      // /checkout is always entered via router.push (Buy Now, cart drawer,
      // cart page), so the page we want is already one step back in real
      // browser history — a native back cleanly consumes that pushed
      // /checkout entry and lands exactly there, with no duplicate entries.
      // The pathname-watcher effect below silently corrects the landing
      // spot (via replace, never push) if native back ever lands somewhere
      // other than what markCheckoutEntry recorded, so this stays reliable
      // even when history doesn't behave as expected.
      recoverFromCheckout(getCheckoutReturnPath());
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else {
        router.replace(getCheckoutReturnPath() || '/');
      }
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      router.back();
    }
  };

  // Tapping our own arrow above is one way off /checkout — but the shopper
  // can just as easily leave it with the phone's hardware back button, an
  // edge-swipe gesture, or the browser's native back button. None of those
  // call handleBack, so without this they'd skip the Buy Now recovery above
  // and could land wherever the (unreliable) history stack happened to
  // point, which is exactly the "needs two taps" bug. This watches for the
  // route actually changing away from /checkout — however it happened —
  // and replays the same recovery, correcting the landing page to the
  // exact page markCheckoutEntry() recorded if native back didn't land
  // there itself.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    const wasOnCheckout = pathnameRef.current?.startsWith('/checkout');
    const nowOnCheckout = pathname.startsWith('/checkout');
    // /login and /signup are intentional detours from checkout (e.g. the
    // resell-login prompt sends the shopper there with ?next=/checkout) —
    // they bring the shopper straight back to /checkout once they're done,
    // so this recovery logic must not treat that as a "left checkout" event
    // and bounce them to wherever they were before checkout instead.
    const nowOnAuthDetour = pathname === '/login' || pathname === '/signup';
    // A successful order sends the shopper from /checkout to
    // /order-confirmation/[id] — that's a real, intentional destination,
    // not an accidental "left checkout" navigation, so it must never be
    // treated as one or the Thank You page gets bounced back instantly.
    const nowOnOrderConfirmation = pathname.startsWith('/order-confirmation');
    if (wasOnCheckout && !nowOnCheckout && !nowOnAuthDetour && !nowOnOrderConfirmation) {
      const returnPath = recoverFromCheckout(getCheckoutReturnPath());
      if (returnPath && returnPath !== pathname + window.location.search) {
        router.replace(returnPath);
      }
    }
    pathnameRef.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Keyword-phrase suggestions ("Yellow Sarees", "Mulmul Cotton Sarees") --
  // NOT full product results. A shopper mid-type wants help finishing the
  // word/phrase, not a product photo+price before they've even said what
  // they mean. Two layers, in priority order:
  //  1. This shopper's own past searches/clicks that relate to what
  //     they're typing right now -- the strongest possible signal of
  //     intent, so these always sit above anything else.
  //  2. Phrases generated from the live catalog (colour+category,
  //     fabric+category, etc.), ranked by how common they are and nudged
  //     by this shopper's accumulated word-level preferences (see
  //     bumpTokenPrefs) so their own habits shape future rankings too,
  //     not just an exact repeat of one past query.
  const keywordSuggestions = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];

    const historyMatches = searchHistory.filter(
      (h) => h.toLowerCase() !== q.toLowerCase() && fuzzyMatch(h, q)
    );

    const prefWeights = getTokenPrefs();
    const catalogPhrases = getKeywordSuggestions(products, q, prefWeights, 8);

    const seen = new Set(historyMatches.map((h) => h.toLowerCase()));
    const merged = [
      ...historyMatches,
      ...catalogPhrases.filter((p) => !seen.has(p.toLowerCase())),
    ];
    return merged.slice(0, 8);
  }, [query, products, searchHistory]);

  /** A shopper picked a suggested keyword (catalog phrase OR one of their
   *  own recent searches) — search for it immediately, the same way
   *  clicking a Google/Amazon autocomplete row does, and record it as a
   *  preference signal for next time. */
  const selectKeyword = (phrase: string) => {
    saveSearchHistory(phrase);
    setSearchHistory(getSearchHistory());
    bumpTokenPrefs(phrase);
    router.push(`/search?q=${encodeURIComponent(phrase)}`);
    setQuery('');
    setSuggestOpen(false);
    setMobileOpen(false);
    setMobileSearchOpen(false);
  };

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveSearchHistory(query.trim());
      setSearchHistory(getSearchHistory());
      bumpTokenPrefs(query.trim());
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setMobileOpen(false);
      setSuggestOpen(false);
      setMobileSearchOpen(false);
    }
  };

  // "Search by image": shopper taps the camera icon, picks a photo, and we
  // rank the whole catalog by visual similarity, then hand the ranked id
  // list to /shop via sessionStorage — same pattern as the text search's
  // `?q=` but there's no clean way to put an uploaded photo in a URL, so
  // sessionStorage is the handoff instead.
  //
  // Two ranking methods, tried in order:
  //  1. AI (app/api/image-search) — the real NVIDIA vision model reads the
  //     photo (garment type/colour/pattern) and ranks the catalog against
  //     that. Only used if the admin has turned it on in Settings AND
  //     NVIDIA_API_KEY is configured; the route itself reports back which
  //     of those wasn't true via `reason` so this never just hangs.
  //  2. Colour-fingerprint match (lib/image-search.ts) — free, instant,
  //     fully client-side. Always available as the fallback, so the
  //     feature keeps working even with AI off or the free NVIDIA tier
  //     rate-limited.
  const triggerImageSearch = () => {
    if (imageSearching) return;
    // Kick off the product fetch as early as possible — the file picker
    // (imageInputRef.current?.click()) hands control to the OS/browser UI
    // while the shopper picks a photo, which gives this a head start so the
    // catalog is often already loaded by the time handleImageFileChange
    // needs it.
    ensureProductsLoaded();
    imageInputRef.current?.click();
  };

  const tryAiImageSearch = async (currentProducts: Product[], dataUrl: string): Promise<string[] | null> => {
    try {
      const liteProducts = currentProducts.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        colors: p.all_colors && p.all_colors.length > 0 ? p.all_colors : p.colors,
        pattern: p.pattern,
        occasion: p.occasion,
        fabric: p.fabric,
      }));

      const res = await fetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, products: liteProducts }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.ok) return null; // disabled / not configured / rate-limited / error — caller falls back
      return Array.isArray(data.rankedIds) ? data.rankedIds : null;
    } catch {
      return null; // network hiccup — caller falls back
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImageSearching(true);
    setSuggestOpen(false);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      // Don't rely on the `products` state closure here — it may still be
      // empty if this fires before the lazy fetch (started in
      // triggerImageSearch) has resolved. Awaiting the same in-flight
      // promise guarantees whichever caller gets here first, everyone
      // resolves against the same up-to-date catalog.
      let currentProducts = await ensureProductsLoaded();
      // The catalog fetch is lazy and best-effort (see ensureProductsLoaded),
      // so it can legitimately come back empty on a network blip. Retry once
      // before giving up — otherwise every photo looks "unmatched" for a
      // reason that has nothing to do with the photo.
      if (currentProducts.length === 0) {
        productsLoadedRef.current = false;
        currentProducts = await ensureProductsLoaded();
      }
      if (currentProducts.length === 0) {
        window.alert("Couldn't load the product catalog — check your connection and try again.");
        return;
      }

      const aiRankedIds = await tryAiImageSearch(currentProducts, dataUrl);

      // Always run the colour fingerprint pass too — even when the AI call
      // succeeds — because it's the only thing that tells us WHICH photo of
      // a product (its default shot, or a specific colour variant's shot)
      // actually looks like what the shopper uploaded. The AI path only
      // ranks products, it doesn't say which of a product's several photos
      // matched, so without this every card would keep showing its default
      // image even when the shopper's photo was clearly the "blue" variant.
      const colourMatch = await rankProductIdsByImage(currentProducts, dataUrl);

      // Prefer the AI's ordering when it gave us a usable, non-empty
      // result; otherwise fall back to the colour match's own ordering.
      // Previously an AI response of `rankedIds: []` (photo understood,
      // but nothing scored) was treated as final and skipped the fallback
      // entirely, so the shopper saw "couldn't match" even though the
      // colour-fingerprint method might have found something.
      const rankedIds =
        aiRankedIds && aiRankedIds.length > 0 ? aiRankedIds : colourMatch.ids;
      const systemicFailure =
        !(aiRankedIds && aiRankedIds.length > 0) && colourMatch.systemicFailure;

      if (!rankedIds || rankedIds.length === 0) {
        // A systemic failure means we couldn't read the photo or any
        // product photo at all (network/proxy issue) — that's not the
        // shopper's fault, so don't tell them to "try a clearer photo".
        window.alert(
          systemicFailure
            ? "Image search is having trouble loading photos right now — please try again in a moment."
            : "Couldn't match that photo to any products — try a clearer photo of the item."
        );
        return;
      }

      // Small preview of the shopper's own uploaded photo, shown back to
      // them in the "showing pieces similar to..." banner as confirmation
      // of what they searched with.
      const thumbnail = await createSearchThumbnail(dataUrl);

      sessionStorage.setItem('imageSearchResults', JSON.stringify(rankedIds));
      sessionStorage.setItem(
        'imageSearchMatchedImages',
        JSON.stringify(colourMatch.bestImageByProductId)
      );
      if (thumbnail) {
        sessionStorage.setItem('imageSearchThumbnail', thumbnail);
      } else {
        sessionStorage.removeItem('imageSearchThumbnail');
      }
      setMobileOpen(false);
      setMobileSearchOpen(false);
      router.push('/shop?imgsearch=1');
    } catch {
      window.alert('Something went wrong reading that photo. Please try another image.');
    } finally {
      setImageSearching(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />
      <div className="container-boutique flex h-12 items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {showBackButton ? (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              aria-label="Go back"
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
          <Sheet
            open={mobileOpen}
            onOpenChange={(open) => {
              setMobileOpen(open);
              if (open) ensureProductsLoaded();
            }}
          >
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[300px] flex-col gap-0 bg-background p-0 sm:max-w-sm"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {/* Drawer header — brand + tagline, on the maroon brand colour
                  so the premium drawer reads as a boutique, not a generic
                  admin-style side panel. */}
              <div className="flex flex-col items-center gap-1 bg-primary px-5 pb-5 pt-8">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-0"
                >
                  <span className="font-serif text-2xl font-bold text-primary-foreground">Aruhi</span>
                  <span className="font-serif text-2xl font-bold text-secondary">Handlooms</span>
                </Link>
                <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary-foreground/70">
                  Where Craft Meets Culture
                </span>
              </div>

              {/* Search */}
              <div className="border-b border-border/60 px-4 py-4">
                <form onSubmit={onSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search sarees..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="rounded-full border-border/60 bg-muted/50 pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Search by image"
                    onClick={triggerImageSearch}
                    disabled={imageSearching}
                    className="shrink-0 rounded-full"
                  >
                    {imageSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>

              {/* Scrollable nav content */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {/* Shop All — prominent CTA, not just another link in the list */}
                <Link
                  href="/shop"
                  onClick={() => setMobileOpen(false)}
                  className="mb-5 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-secondary" />
                    Shop All
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-70" />
                </Link>

                {/* Categories — only ones that actually have stock right
                    now (zero-product categories are filtered out, see
                    categoriesWithProducts above), shown as a small card
                    per category with its live product count and a stack
                    of real product thumbnails, instead of a plain text
                    row — easier to scan and immediately shows how much
                    is actually in each category. */}
                {categoriesLoading ? (
                  <div className="mb-5">
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-secondary">
                      Shop by Category
                    </p>
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted/60" />
                      ))}
                    </div>
                  </div>
                ) : categoriesWithProducts.length > 0 ? (
                  <div className="mb-5">
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-secondary">
                      Shop by Category
                    </p>
                    <nav className="flex flex-col gap-2">
                      {categoriesWithProducts.map((c, idx) => {
                        const stats = categoryStats.get(c.name);
                        const count = stats?.count ?? 0;
                        const thumbs = stats?.thumbs ?? [];
                        return (
                          <Link
                            key={c.slug}
                            href={`/category/${c.slug}`}
                            onClick={() => setMobileOpen(false)}
                            className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-accent ${
                              idx % 2 === 0 ? 'bg-primary/5' : 'bg-secondary/10'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {c.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {count} {count === 1 ? 'product' : 'products'}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {thumbs.length > 0 && (
                                <span className="flex items-center -space-x-2.5">
                                  {thumbs.map((src, i) => (
                                    <span
                                      key={i}
                                      className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-background shadow-sm"
                                      style={{ zIndex: thumbs.length - i }}
                                    >
                                      <Image src={src} alt="" fill sizes="32px" className="object-cover" />
                                    </span>
                                  ))}
                                </span>
                              )}
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                ) : null}

                {/* More — account/info links */}
                <div>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-secondary">
                    More
                  </p>
                  <nav className="flex flex-col">
                    {MOBILE_UTILITY_LINKS.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-3 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-primary"
                      >
                        <l.icon className="h-4 w-4 text-muted-foreground" />
                        {l.label}
                      </Link>
                    ))}
                  </nav>
                </div>
              </div>

              {/* Footer strip */}
              <div className="border-t border-border/60 px-4 py-3">
                <p className="text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  ✦ Free Shipping ✦
                </p>
              </div>
            </SheetContent>
          </Sheet>
          )}

          <Link href="/" className="flex shrink-0 items-center gap-0">
            <span className="whitespace-nowrap font-serif text-lg font-bold tracking-tight text-primary sm:text-2xl">
              Aruhi
            </span>
            <span className="whitespace-nowrap font-serif text-lg font-bold tracking-tight text-secondary sm:text-2xl">
              Handlooms
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-7 md:flex">
          <Link
            href="/shop"
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Shop All
          </Link>

          {/* Categories mega-menu — every category that actually has
              stock, each with a live product+variant count and a real
              product thumbnail, instead of a handful of hardcoded
              category links competing for space in this row. Opens on
              hover; products (and therefore counts/thumbs) are lazily
              fetched the first time it's opened, same lazy-load the
              mobile drawer already relies on. */}
          <div
            className="relative"
            onMouseEnter={() => {
              setCategoriesMenuOpen(true);
              ensureProductsLoaded();
            }}
            onMouseLeave={() => setCategoriesMenuOpen(false)}
          >
            <button
              type="button"
              className="group relative flex items-center gap-1 py-1 text-sm font-medium tracking-wide text-foreground/75 transition-colors hover:text-primary"
              aria-expanded={categoriesMenuOpen}
            >
              Categories
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${categoriesMenuOpen ? 'rotate-180' : ''}`}
              />
              <span className="absolute -bottom-0.5 left-0 h-0.5 w-0 rounded-full bg-primary transition-all duration-300 ease-out group-hover:w-full" />
            </button>

            {categoriesMenuOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-3 w-[720px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
                <div className="max-h-[70vh] overflow-y-auto p-4">
                  {categoriesLoading ? (
                    <div className="grid grid-cols-3 gap-3">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/60" />
                      ))}
                    </div>
                  ) : categoriesWithProducts.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {categoriesWithProducts.map((c) => {
                        const stats = categoryStats.get(c.name);
                        const count = stats?.count ?? 0;
                        const thumb = stats?.thumbs?.[0];
                        return (
                          <Link
                            key={c.slug}
                            href={`/category/${c.slug}`}
                            onClick={() => setCategoriesMenuOpen(false)}
                            className="group/cat flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-accent"
                          >
                            <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                              {thumb ? (
                                <Image src={thumb} alt={c.name} fill sizes="56px" className="object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                  {c.name.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 pt-0.5">
                              <span className="block text-sm font-semibold leading-snug text-foreground group-hover/cat:text-primary">
                                {c.name}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {count} {count === 1 ? 'product' : 'products'}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No categories in stock right now.
                    </p>
                  )}
                </div>

                <Link
                  href="/shop"
                  onClick={() => setCategoriesMenuOpen(false)}
                  className="flex items-center justify-center gap-1 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-muted/50"
                >
                  View All Categories
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          {navLinks
            .filter((l) => l.href !== '/shop')
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group relative py-1 text-sm font-medium tracking-wide text-foreground/75 transition-colors hover:text-primary"
              >
                {l.label}
                <span className="absolute -bottom-0.5 left-0 h-0.5 w-0 rounded-full bg-primary transition-all duration-300 ease-out group-hover:w-full" />
              </Link>
            ))}
        </nav>

        <span className="hidden h-6 w-px shrink-0 bg-border/70 md:block" />

        <div ref={searchWrapRef} className="relative hidden flex-1 max-w-sm md:block">
          <form onSubmit={onSearch} className="flex items-center">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search sarees, lehenga, kurti..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  setSuggestOpen(true);
                  setSearchHistory(getSearchHistory());
                  ensureProductsLoaded();
                }}
                className="rounded-full border-border/60 bg-muted/40 pl-10 pr-9 transition-colors focus-visible:bg-background"
              />
              <button
                type="button"
                onClick={triggerImageSearch}
                disabled={imageSearching}
                aria-label="Search by image"
                title="Search by image"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
              >
                {imageSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>

          {suggestOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border/60 bg-background shadow-lg">
              {/* Search History — shown when input is empty */}
              {!query.trim() && searchHistory.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Searches</span>
                    <button
                      onClick={() => { localStorage.removeItem(SEARCH_HISTORY_KEY); setSearchHistory([]); }}
                      className="text-[10px] text-muted-foreground hover:text-primary"
                    >Clear all</button>
                  </div>
                  {searchHistory.map((h) => (
                    <div key={h} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <button
                        className="flex-1 text-left text-sm"
                        onClick={() => selectKeyword(h)}
                      >{h}</button>
                      <button
                        onClick={() => { removeSearchHistory(h); setSearchHistory(getSearchHistory()); }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >✕</button>
                    </div>
                  ))}
                </>
              )}

              {/* Keyword suggestions — phrases like "Yellow Sarees" or
                  "Mulmul Cotton Sarees", not full product cards. A shopper's
                  own matching past searches/clicks are folded in here too,
                  pinned first (see keywordSuggestions above). */}
              {keywordSuggestions.length > 0 && (
                <>
                  {keywordSuggestions.map((phrase) => {
                    const isRecent = searchHistory.some((h) => h.toLowerCase() === phrase.toLowerCase());
                    return (
                      <button
                        key={phrase}
                        onClick={() => selectKeyword(phrase)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        {isRecent ? (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-sm">{phrase}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={onSearch as any}
                    className="w-full border-t border-border/60 px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted/60"
                  >
                    See all results for &quot;{query}&quot;
                  </button>
                </>
              )}

              {/* No results */}
              {query.trim().length >= 2 && keywordSuggestions.length === 0 && (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm font-medium text-foreground">No results for &quot;{query}&quot;</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Try a different spelling or browse categories below</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {['Silk Sarees', 'Cotton', 'Lehenga', 'Kurti'].map((s) => (
                      <button
                        key={s}
                        onClick={() => selectKeyword(s)}
                        className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary"
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-1.5">
          <span className="hidden h-6 w-px shrink-0 bg-border/70 md:block md:mr-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              ensureProductsLoaded();
            }}
            className="md:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon" asChild aria-label="Wishlist" className="rounded-full transition-colors hover:bg-accent">
            <Link href="/account/wishlist">
              <Heart className="h-5 w-5" />
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild aria-label={user ? 'My account' : 'Login'} className="rounded-full transition-colors hover:bg-accent">
            <Link href={user ? '/account' : '/login'}>
              <User className="h-5 w-5" />
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
            className="relative rounded-full transition-colors hover:bg-accent"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-secondary px-1 text-xs font-bold text-secondary-foreground">
                {count}
              </span>
            )}
          </Button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <div className="container-boutique py-3">
            <form onSubmit={onSearch} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={mobileSearchInputRef}
                placeholder="Search sarees, lehenga, kurti..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-border/60 bg-muted/40 pl-9 pr-9"
              />
              <button
                type="button"
                onClick={triggerImageSearch}
                disabled={imageSearching}
                aria-label="Search by image"
                title="Search by image"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
              >
                {imageSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
            </form>

            {/* Mobile: Search History */}
            {!query.trim() && searchHistory.length > 0 && (
              <div className="mt-2 rounded-lg border border-border/60">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</span>
                  <button
                    onClick={() => { localStorage.removeItem(SEARCH_HISTORY_KEY); setSearchHistory([]); }}
                    className="text-[10px] text-muted-foreground hover:text-primary"
                  >Clear</button>
                </div>
                {searchHistory.map((h) => (
                  <div key={h} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <button className="flex-1 text-left text-sm" onClick={() => selectKeyword(h)}>
                      {h}
                    </button>
                    <button
                      onClick={() => { removeSearchHistory(h); setSearchHistory(getSearchHistory()); }}
                      className="text-xs text-muted-foreground"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Mobile: Keyword suggestions */}
            {keywordSuggestions.length > 0 && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border/60">
                {keywordSuggestions.map((phrase) => {
                  const isRecent = searchHistory.some((h) => h.toLowerCase() === phrase.toLowerCase());
                  return (
                    <button
                      key={phrase}
                      onClick={() => selectKeyword(phrase)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      {isRecent ? (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-sm">{phrase}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mobile: No results */}
            {query.trim().length >= 2 && keywordSuggestions.length === 0 && (
              <div className="mt-2 rounded-lg border border-border/60 px-4 py-5 text-center">
                <p className="text-sm font-medium">No results for &quot;{query}&quot;</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Try a different spelling or a category</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {['Silk Sarees', 'Cotton', 'Lehenga', 'Kurti'].map((s) => (
                    <button
                      key={s}
                      onClick={() => selectKeyword(s)}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary"
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
