import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { fetchProductsServer } from '@/lib/products-api-server';
import { resolveGoogleProductCategory } from '@/lib/google-category';
import { toPublicMediaUrls } from '@/lib/media-url';

const SITE_URL = 'https://www.sutisaree.com';

export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function plain(h: string): string {
  return (h || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

function absUrl(u: string): string {
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  return SITE_URL + (u.startsWith('/') ? '' : '/') + u;
}

function cn(c: string): string {
  return (c || '').toLowerCase().trim().replace(/\s+/g, '-');
}

function niceColor(c: string): string {
  return (c || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export async function GET() {
  const sb = getServerSupabase();
  const { data: mrow } = await sb.from('settings').select('value').eq('key', 'feed_idmap').maybeSingle();
  const idmap: any = (mrow as any)?.value || {};
  const pmap: Record<string, string> = idmap.parents || {};
  const vmap: Record<string, string> = idmap.variants || {};

  const products: any[] = (await fetchProductsServer()) as any[];
  const { data: vrows } = await sb
    .from('product_variants')
    .select('product_id,color,slug,images,price_override,sku')
    .limit(5000);
  const byProduct = new Map<string, any[]>();
  for (const v of (vrows || []) as any[]) {
    const l = byProduct.get(v.product_id) || [];
    l.push(v);
    byProduct.set(v.product_id, l);
  }

  const SIZE_TYPES = ['regular', 'petite', 'plus', 'big and tall', 'maternity'];
  const parts: string[] = [];

  function item(o: any) {
    const p = o.product;
    const h: any = p.highlights || {};
    const price = Number(o.price);
    const mrp = Number(p.mrp || 0);
    const hasSale = mrp > price;
    const imgs: string[] = (toPublicMediaUrls(o.images || []) as string[]).map(absUrl).filter(Boolean);
    const mpn = String(o.mpn || h.mpn || '').trim();
    const gtin = String(h.gtin || '').replace(/\D/g, '');
    const gtinOk = gtin.length >= 8 && gtin.length <= 14;
    const sizeType = String(h.size_type || '').toLowerCase();
    const lines: string[] = [];
    const t = (n: string, v: unknown) => {
      const s = String(v ?? '').trim();
      if (s) lines.push('<g:' + n + '>' + esc(s) + '</g:' + n + '>');
    };
    t('id', o.id);
    lines.push('<title>' + esc(o.title) + '</title>');
    lines.push('<description>' + esc(plain(p.description || p.name) || p.name) + '</description>');
    t('item_group_id', o.group);
    lines.push('<link>' + esc(o.link) + '</link>');
    t('canonical_link', o.canonical || o.link);
    t('product_type', p.category);
    t('google_product_category', 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas');
    t('image_link', imgs[0] || '');
    for (const extra of imgs.slice(1, 11)) t('additional_image_link', extra);
    t('availability', p.inStock === false ? 'out_of_stock' : 'in_stock');
    t('price', (hasSale ? mrp : price).toFixed(2) + ' INR');
    if (hasSale) t('sale_price', price.toFixed(2) + ' INR');
    t('mpn', mpn);
    if (gtinOk) t('gtin', gtin);
    t('brand', 'Sutisaree');
    t('color', o.color);
    t('condition', 'new');
    if (SIZE_TYPES.includes(sizeType)) t('size_type', sizeType);
    t('age_group', String(p.age_group || 'adult').toLowerCase());
    t('gender', String(p.gender || 'female').toLowerCase());
    t('size', (p.sizes || [])[0] || 'Free Size');
    t('pattern', p.pattern);
    t('material', p.fabric || p.material);
    t('identifier_exists', mpn || gtinOk ? 'yes' : 'no');
    parts.push('<item>\n' + lines.join('\n') + '\n</item>');
  }

  for (const p of products) {
    const pid = pmap[p.slug] || p.sku || p.slug;
    const pcolor = niceColor((p.colors || []).slice(0, 3).join(' ')) || 'Multicolor';
    item({
      id: pid,
      group: pid,
      title: p.name,
      link: SITE_URL + '/product/' + p.slug + '/',
      images: p.images || [],
      price: p.price,
      color: pcolor,
      product: p,
    });
    const seen = new Set<string>();
    for (const v of byProduct.get(p.id) || []) {
      const key = p.slug + '|' + cn(v.color);
      if (seen.has(key)) continue;
      seen.add(key);
      const vid = vmap[key] || (p.sku ? p.sku + '-' + cn(v.color) : p.slug + '-' + cn(v.color));
      item({
        id: vid,
        group: pid,
        title: p.name + ' - ' + niceColor(v.color),
        link: SITE_URL + '/product/' + p.slug + '/?attribute_pa_color=' + encodeURIComponent(cn(v.color)),
        images: v.images && v.images.length > 0 ? v.images : p.images || [],
        price: v.price_override ?? p.price,
        color: niceColor(v.color),
        canonical: SITE_URL + '/product/' + p.slug + '/',
        mpn: String(v.sku || '').trim(),
        product: p,
      });
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n' +
    '<title>Sutisaree Product Feed</title>\n<link>' + SITE_URL + '</link>\n' +
    '<description>Sutisaree Google Merchant feed</description>\n' +
    parts.join('\n') +
    '\n</channel>\n</rss>';

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
