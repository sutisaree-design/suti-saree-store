import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Public, read-only feed of the last few real orders — powers the
// "Someone in Jaipur just bought this" toast on the storefront.
// Only exposes product name + city + relative time, nothing personal.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // last 3 days

    const { data, error } = await supabase
      .from('orders')
      .select('items, shipping_address, created_at')
      .neq('status', 'cancelled')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;

    const events = (data ?? [])
      .map((o: any) => {
        const items = Array.isArray(o.items) ? o.items : [];
        const firstItem = items[0];
        if (!firstItem) return null;
        const createdAt = new Date(o.created_at).getTime();
        const minutesAgo = Math.max(1, Math.round((Date.now() - createdAt) / 60000));
        return {
          product_name: firstItem.product_name || firstItem.name || 'a product',
          city: o.shipping_address?.city || null,
          minutes_ago: minutesAgo,
        };
      })
      .filter(Boolean)
      .slice(0, 10);

    return NextResponse.json({ events });
  } catch {
    // Fail quiet — social proof is decorative, never block the page for it.
    return NextResponse.json({ events: [] });
  }
}
