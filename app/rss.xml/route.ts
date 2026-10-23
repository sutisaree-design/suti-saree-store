// app/rss.xml/route.ts
//
// Pinterest-compatible RSS/product feed for auto-publish + shopping (price) tags.
// Feed URL: https://www.aruhihandlooms.com/rss.xml
//
// Uses the project's existing fetchProductsServer() (lib/products-api-server.ts),
// the same helper sitemap.ts uses, so this stays in sync with your real Supabase
// "products" table automatically -- no manual edits needed when products change.
//
// One <item> per COLOR + SIZE variant (not one item per product): a saree
// with 3 colors becomes 3 separate listings, and if a color has multiple
// sizes each size gets its own listing too -- all sharing g:item_group_id
// (= the parent product id) so Pinterest groups them as swatches of the
// same product instead of treating them as unrelated duplicates. This
// mirrors the variant logic already used in app/api/merchant-feed/route.ts
// for Google Merchant Center.
//
// FIX (2026-08-05): Added <enclosure> and <media:content> tags so Pinterest
// can find images in the feed. Pinterest's RSS crawler requires these standard
// image tags -- <g:image_link> alone is not picked up by the Pinterest RSS
// feed parser even though it works for Google Merchant Center.

import { fetchProductsServer } from "@/lib/products-api-server";
import { resolveGoogleProductCategory } from "@/lib/google-category";
import { getServerSupabase } from "@/lib/supabase-server";
import { toPublicMediaUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic"; // always fetch fresh data on each request

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.aruhihandlooms.com";

function escapeXml(unsafe: string = ""): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface FeedVariantSize {
  size: string;
  stock_quantity: number;
  price_override: number | null;
}

interface FeedVariant {
  id: string;
  product_id: string;
  color: string;
  slug: string;
  images: string[] | null;
  price_override: number | null;
  product_variant_sizes: FeedVariantSize[] | null;
}

/** Every color-variant row for the given products, each carrying its own
 *  per-size stock so we know whether *that specific color* is in stock --
 *  not just whether the parent product has stock in some other color. */
async function fetchVariantsForFeed(productIds: string[]): Promise<Map<string, FeedVariant[]>> {
  const byProduct = new Map<string, FeedVariant[]>();
  if (productIds.length === 0) return byProduct;

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, color, slug, images, price_override, product_variant_sizes(size, stock_quantity, price_override)"
    )
    .in("product_id", productIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as FeedVariant[]) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return byProduct;
}

export async function GET() {
  const products = await fetchProductsServer();
  const variantsByProduct = await fetchVariantsForFeed(products.map((p) => p.id));

  function renderItem(opts: {
    id: string;
    itemGroupId: string;
    title: string;
    link: string;
    description: string;
    image: string;
    inStock: boolean;
    price: number;
    color: string;
    size: string;
    category: string;
    productName: string;
  }) {
    const { id, itemGroupId, title, link, description, image, inStock, price, color, size, category, productName } =
      opts;

    // Build image tags only when we actually have a URL.
    // Pinterest requires <enclosure> and/or <media:content> to detect images;
    // <g:image_link> alone is ignored by the Pinterest RSS crawler.
    const imageXml = image
      ? `
      <enclosure url="${image}" type="image/webp" />
      <media:content url="${image}" medium="image" type="image/webp" />`
      : "";

    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <description>${escapeXml(description)}</description>
      <guid isPermaLink="false">${escapeXml(id)}</guid>${imageXml}
      <g:id>${escapeXml(id)}</g:id>
      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>
      <g:title>${escapeXml(title)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${link}</g:link>
      <g:image_link>${image}</g:image_link>
      <g:price>${price} INR</g:price>
      <g:availability>${inStock ? "in stock" : "out of stock"}</g:availability>
      <g:condition>new</g:condition>
      <g:product_type>${escapeXml(category)}</g:product_type>
      <g:google_product_category>${escapeXml(resolveGoogleProductCategory(category, productName))}</g:google_product_category>
      <g:color>${escapeXml(color)}</g:color>
      <g:size>${escapeXml(size)}</g:size>
    </item>`;
  }

  const items = products
    .map((p) => {
      const variants = variantsByProduct.get(p.id) ?? [];
      const description = p.description || "";

      // No colour variants recorded for this product yet -- fall back to
      // the single-item behaviour so nothing disappears from the feed.
      if (variants.length === 0) {
        return renderItem({
          id: p.id,
          itemGroupId: p.id,
          title: p.name,
          link: `${SITE_URL}/product/${p.slug}`,
          description,
          image: toPublicMediaUrl(p.images?.[0]) || "",
          inStock: p.inStock && p.stock_quantity > 0,
          price: p.price,
          color: (p.colors || []).slice(0, 3).join("/") || "Multicolor",
          size: (p.sizes || [])[0] || "Free Size",
          category: p.category,
          productName: p.name,
        });
      }

      // One item per SIZE within each colour variant (all sharing
      // item_group_id = product id, so Pinterest groups every colour/size
      // combo as swatches of the same product instead of separate items).
      return variants
        .flatMap((v) => {
          const sizes = v.product_variant_sizes ?? [];
          const images = v.images && v.images.length > 0 ? v.images : p.images || [];
          const image = toPublicMediaUrl(images[0]) || "";

          if (sizes.length === 0) {
            const price = v.price_override ?? p.price;
            return [
              renderItem({
                id: v.id,
                itemGroupId: p.id,
                title: `${p.name} - ${v.color}`,
                link: `${SITE_URL}/product/${v.slug}`,
                description,
                image,
                inStock: p.inStock && p.stock_quantity > 0,
                price,
                color: v.color,
                size: (p.sizes || [])[0] || "Free Size",
                category: p.category,
                productName: p.name,
              }),
            ];
          }

          return sizes.map((s) => {
            const price = s.price_override ?? v.price_override ?? p.price;
            // Keeps each color/size combo's id unique and under length
            // limits, same approach as the Google Merchant feed.
            const sizeSlug = s.size.replace(/\s+/g, "").slice(0, 10);
            // ?size= pre-selects this exact size on the landing page so
            // the price shown there matches what's advertised here.
            const sizeLink = `${SITE_URL}/product/${v.slug}?size=${encodeURIComponent(s.size)}`;
            return renderItem({
              id: `${v.id}-${sizeSlug}`,
              itemGroupId: p.id,
              title: `${p.name} - ${v.color} - ${s.size}`,
              link: sizeLink,
              description,
              image,
              inStock: (s.stock_quantity || 0) > 0,
              price,
              color: v.color,
              size: s.size,
              category: p.category,
              productName: p.name,
            });
          });
        })
        .join("");
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:g="http://base.google.com/ns/1.0"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>AruhiHandlooms</title>
    <link>${SITE_URL}</link>
    <description>Latest products from AruhiHandlooms</description>${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
