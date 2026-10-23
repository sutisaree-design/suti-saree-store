/**
 * A product's category name. Categories are admin-managed (Admin >
 * Categories, backed by the `categories` table) rather than a fixed
 * list — this union covers the common built-in ones for editor
 * convenience/autocomplete, but any category name the admin creates
 * (e.g. "Banarasi Sarees", "Kurta Sets") is valid too, hence the
 * trailing `(string & {})` escape hatch that keeps autocomplete
 * without rejecting other admin-created names.
 */
export type Category =
  | 'Silk Sarees'
  | 'Cotton Sarees'
  | 'Lehenga'
  | 'Anarkali'
  | 'Kurti'
  | 'Bridal'
  | (string & {});

/**
 * Extra "Product Highlights" attributes shown on the PDP in the Meesho-style
 * collapsible spec block (Occasion/Border/Border Width/Blouse up top; the
 * rest under "Additional Details"). All optional — the AI listing generator
 * fills these in from the name/photo, and the admin can edit them.
 */
export interface ProductHighlights {
  // Primary — always visible on the PDP
  border?: string;
  border_width?: string;
  blouse?: string;

  // Saree / fabric specifics
  saree_fabric?: string;
  saree_pattern?: string;
  ornamentation?: string;

  // Blouse specifics
  blouse_fabric?: string;
  pallu_details?: string;
  blouse_pattern?: string;
  blouse_color?: string;

  // Brand / manufacturing
  brand?: string;
  loom_type?: string;

  // Existing spec-sheet fields (still used, esp. for kurtis/lehengas)
  fit_shape?: string;
  length?: string;
  neck?: string;
  sleeve_length?: string;
  sleeve_styling?: string;
  surface_styling?: string;
  print_or_pattern_type?: string;
  net_quantity?: string;
  add_on?: string;
  type?: string;
  generic_name?: string;
  country_of_origin?: string;
  transparency?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: Category;
  price: number; // in INR (whole rupees)
  mrp?: number | null;
  description: string;
  fabric: string;
  origin: string;
  colors: string[];
  /**
   * Every distinct colour this product comes in -- the base product's own
   * colour plus every colour added later as a `product_variants` row,
   * de-duplicated. `colors` above is left untouched (many places rely on
   * `colors[0]` meaning "this exact item/variant's own colour" -- e.g. the
   * cart/checkout use it to tell two colours of the same product apart).
   * This field exists purely so product cards on shop/category pages can
   * show a dot for every colour the product actually comes in, instead of
   * just the one recorded on the base row. Undefined/empty falls back to
   * `colors` wherever it's read.
   */
  all_colors?: string[];
  sizes: string[];
  occasion: string[];
  gender: string;
  age_group: string;
  material: string | null;
  pattern: string | null;
  images: string[];
  video_url?: string | null;
  /** When true (and video_url is set), the storefront catalog grid shows a
   *  silently-autoplaying, looping video in this product's thumbnail slot
   *  instead of its first image. */
  autoplay_video_in_catalog?: boolean;
  sku?: string | null;
  /** GST % of this product (products.gst_rate). Used only to show the tax split at checkout. */
  gstRate?: number;
  highlights?: ProductHighlights | null;
  /**
   * Every colour variation this product has as a distinct row (i.e. every
   * `product_variants` entry, NOT including the base product's own
   * colour), each with its own slug/colour/image. Exists so admin UI that
   * needs to address one specific variation (e.g. the Collections product
   * picker's per-colour include/exclude checkboxes) has something to key
   * off of — `all_colors`/`all_images` above are pre-merged/flattened and
   * lose that per-variant identity. Undefined/empty means this product
   * has no added colour variants beyond its own base colour.
   */
  variant_list?: { slug: string; color: string; image?: string | null; inStock?: boolean }[];
  /** Slug of this product's default colour variant (if any) -- product
   *  cards on shop/category/home should link here instead of the base
   *  product slug, so shoppers land straight on the colour that's meant
   *  to be shown first. */
  default_variant_slug?: string | null;
  /** First image of the default colour variant, used as the card thumbnail
   *  in place of the base product's own photos when variants exist. */
  default_variant_image?: string | null;
  /** Colour of the default variant (if any). The card shows
   *  `default_variant_image`, which may belong to a different colour than
   *  the base product's own name/first photo -- this lets the card swap
   *  the displayed name/alt text to match the photo actually being shown,
   *  the same way the product detail page already does via
   *  getVariantDisplayName(). Without this, a "Maroon ..." base product
   *  whose default variant is "Blue" would show a blue photo captioned
   *  "Maroon ...". */
  default_variant_color?: string | null;
  /** Real stock state of the default colour variant (sum of its size rows).
   *  undefined = unknown, fall back to `inStock`. Cards use this so a colour that
   *  is sold out shows the Out of Stock badge even if the base product isn't. */
  default_variant_in_stock?: boolean;
  /**
   * Every photo this product has anywhere -- the base product's own
   * `images` plus every image on every `product_variants` row,
   * de-duplicated. Exists so "search by photo" (lib/image-search.ts) can
   * match a shopper's uploaded photo against ALL of a product's colour
   * variants, not just its first/default photo. Undefined/empty falls
   * back to `images` wherever it's read.
   */
  all_images?: string[];
  /** The vendor's public storefront collection this product belongs to --
   *  e.g. "Aruhi Weaves's Collection" at /collection/aruhi-weaves-a1b2c3.
   *  Null/undefined if the product has no approved vendor. Shown next to
   *  the category label on the product card and PDP, both clickable. */
  collection?: { name: string; slug: string } | null;
  rating: number;
  reviews: number;
  featured?: boolean;
  stock_quantity: number;
  low_stock_threshold?: number;
  inStock: boolean;
  created_at?: string;
}

export interface CartItem {
  product: Product;
  size: string;
  quantity: number;
  /** True only for the line added via the checkout order-bump upsell toggle.
   *  Needed because the bump is admin-configured as a single fixed product —
   *  if a shopper happens to buy THAT SAME product (any colour variant) as
   *  their main item, matching by product.id alone would misidentify their
   *  own main item as "the bump line" and incorrectly hide its qty +/-. */
  isBump?: boolean;
  /**
   * The exact `<g:id>` value this line's colour/size variant has in the
   * Google Merchant Center feed (see feedMatchedItemId() in
   * lib/gtag-track.ts) — computed once when the item is added (product
   * page still has `variant` + `selectedSize` in scope there) and carried
   * on the cart line so view_cart / begin_checkout / purchase can reuse it
   * without needing to re-derive a variant match from just `product.id` +
   * `size`. Undefined for products with no colour variants, where
   * `product.id` alone already matches the feed.
   */
  feedItemId?: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

/** Managed from Admin > Blog (`blog_posts` table). Public pages only ever
 *  read rows where `published` is true; the admin panel reads everything. */
export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  keywords: string[];
  cover_image: string;
  body_paragraphs: string[];
  faqs: BlogFaq[];
  read_minutes: number;
  related_category_name: string | null;
  published: boolean;
  published_at: string;
  updated_at: string;
  created_at: string;
}

/** An admin-created, curated collection (distinct from the auto-generated
 *  per-vendor collection) -- e.g. "Diwali Specials". Managed entirely from
 *  Admin > Collections; shows publicly at /collection/[slug]. */
export interface AdminCollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  /** Independent of is_active — controls whether this collection appears
   *  as a circle in the homepage "Shop by Collection" row. A collection
   *  can be active (its page exists, Promotions/Homepage Tiles can link
   *  to it) while being hidden from that row. */
  show_on_homepage: boolean;
  /** Controls whether products in this collection show the dynamic
   *  "Buy X Get Y Free" badge on the shop grid and product page, when
   *  this collection is the scope of an active Promotion. Independent
   *  of is_active/show_on_homepage -- lets an admin run the discount
   *  quietly (e.g. only reachable via a direct link) without the badge
   *  advertising it everywhere the product appears. */
  show_bogo_badge: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at?: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface ReturnRequest {
  id: string;
  order_id: string;
  order_item_id: string | null;
  user_id: string | null;
  type: 'return' | 'exchange';
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'refunded' | 'completed';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityEventType =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'wishlist'
  | 'checkout_start'
  | 'purchase'
  | 'search'
  | 'variant_switch';

export interface ActivityEvent {
  id: string;
  session_id: string;
  user_id: string | null;
  event_type: ActivityEventType;
  page_path: string | null;
  product_id: string | null;
  order_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface WholesalePricingTier {
  id: string;
  product_id: string;
  min_quantity: number;
  unit_price: number;
  label: string | null;
  created_at?: string;
}

// Shape returned by Supabase (snake_case) — we map to Product on read.
export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  mrp: number | null;
  category_id: string | null;
  category_name: string | null;
  fabric: string | null;
  origin: string | null;
  colors: string[] | null;
  sizes: string[] | null;
  occasion: string[] | null;
  gender: string;
  age_group: string;
  material: string | null;
  pattern: string | null;
  images: string[] | null;
  video_url: string | null;
  autoplay_video_in_catalog: boolean | null;
  sku: string | null;
  gst_rate?: number | null;
  highlights: ProductHighlights | null;
  /** Embedded via `product_variants(slug, images, is_default, color)` in the
   *  list queries -- used to resolve the default colour variant for cards,
   *  and (via `color`) to build the full swatch-dot list on the card. */
  product_variants?: {
    slug: string;
    images: string[] | null;
    is_default: boolean;
    color?: string | null;
    /** Embedded size rows -- their stock_quantity sum is that colour's real stock. */
    product_variant_sizes?: { stock_quantity: number }[] | null;
  }[] | null;
  stock_quantity: number;
  low_stock_threshold?: number;
  rating: number;
  reviews: number;
  featured: boolean;
  in_stock: boolean;
  created_at: string;
  updated_at: string;
}
