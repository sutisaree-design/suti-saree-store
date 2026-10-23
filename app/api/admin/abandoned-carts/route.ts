import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Last 10 digits of a phone number, for loose matching between however a
// number happened to be typed (with/without +91, spaces, a leading 0) in
// the cart-tracking widget vs. the checkout form.
function last10Digits(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: carts, error } = await supabase
      .from('abandoned_carts')
      .select('*')
      .order('last_activity_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    // Cross-check every still-open cart against real orders, by email OR
    // phone, so the admin gets two pieces of context up front:
    //   - existing_order: an order placed at/around the same time as this
    //     cart's last activity — almost certainly THIS cart being
    //     completed, so re-contacting about it would be redundant. This is
    //     a safety net on top of the automatic `recovered` flag (set in
    //     lib/order-confirmation.ts), which only fires on an exact email
    //     match and can miss e.g. an order placed with a different email
    //     but the same phone number.
    //   - prior_order_count: earlier orders from the same person that
    //     clearly predate this cart. This does NOT mean this cart's items
    //     were bought — it's a "repeat customer" signal (e.g. they already
    //     bought product A last week and have now abandoned a cart with a
    //     different product B) so the admin knows to still follow up, and
    //     can do so knowing this shopper already trusts the store.
    const openCarts = (carts || []).filter((c) => !c.recovered);
    if (openCarts.length > 0) {
      const emails = Array.from(new Set(openCarts.map((c) => c.email).filter(Boolean)));
      const phoneDigitsList = Array.from(
        new Set(openCarts.map((c) => last10Digits(c.phone)).filter(Boolean))
      );

      const orFilters: string[] = [];
      if (emails.length > 0) {
        orFilters.push(`customer_email.in.(${emails.map((e) => `"${e}"`).join(',')})`);
      }
      for (const digits of phoneDigitsList) {
        orFilters.push(`customer_phone.ilike.%${digits}`);
      }

      if (orFilters.length > 0) {
        const { data: matchingOrders } = await supabase
          .from('orders')
          .select('id, customer_email, customer_phone, status, created_at, items')
          .neq('status', 'cancelled')
          .or(orFilters.join(','))
          .order('created_at', { ascending: false });

        // Group every matching order under each email / phone it could
        // belong to (a customer can have several past orders).
        const byEmail = new Map<string, any[]>();
        const byPhone = new Map<string, any[]>();
        for (const o of matchingOrders || []) {
          if (o.customer_email) {
            const arr = byEmail.get(o.customer_email) || [];
            arr.push(o);
            byEmail.set(o.customer_email, arr);
          }
          const d = last10Digits(o.customer_phone);
          if (d) {
            const arr = byPhone.get(d) || [];
            arr.push(o);
            byPhone.set(d, arr);
          }
        }

        // A short buffer around the cart's last-activity timestamp — an
        // order placed within this window of that activity is almost
        // certainly the completion of THIS cart, not an unrelated one.
        const SAME_SESSION_BUFFER_MS = 5 * 60 * 1000;

        for (const c of openCarts) {
          const byId = new Map<string, any>();
          for (const o of (c.email && byEmail.get(c.email)) || []) byId.set(o.id, o);
          for (const o of (c.phone && byPhone.get(last10Digits(c.phone) || '')) || []) byId.set(o.id, o);
          const orders = Array.from(byId.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          if (orders.length === 0) continue;

          const cartTime = new Date(c.last_activity_at).getTime() - SAME_SESSION_BUFFER_MS;

          // Orders placed at/after the cart's own activity → this cart was
          // most likely completed already (a genuine duplicate to avoid
          // re-contacting about). Orders placed well before it → separate,
          // earlier purchases — a "repeat customer" signal, NOT proof that
          // *this* cart's items were bought, so recovery outreach for this
          // cart is still worthwhile.
          const sameCartOrders = orders.filter((o) => new Date(o.created_at).getTime() >= cartTime);
          const priorOrders = orders.filter((o) => new Date(o.created_at).getTime() < cartTime);

          if (sameCartOrders.length > 0) {
            const match = sameCartOrders[0];
            (c as any).existing_order = { id: match.id, status: match.status, created_at: match.created_at };
          }
          if (priorOrders.length > 0) {
            const lastPrior = priorOrders[0];
            const lastPriorItem = Array.isArray(lastPrior.items) ? lastPrior.items[0] : null;
            (c as any).prior_order_count = priorOrders.length;
            (c as any).prior_order_last_item = lastPriorItem?.product_name || lastPriorItem?.name || null;
          }
        }
      }
    }

    return NextResponse.json({ carts: carts || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load abandoned carts' }, { status: 500 });
  }
}
