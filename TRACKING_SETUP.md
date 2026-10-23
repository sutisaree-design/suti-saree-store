# Product Tracking Setup Guide

## Overview
Proper tracking is essential for the popularity ranking system to work. Every user interaction (views, clicks, purchases) is recorded and weighted to determine which products are most popular.

## Tracking Events

### Activity Events Tracked

| Event | Weight | When Triggered | Purpose |
|-------|--------|-----------------|---------|
| `product_view` | 1 | User loads product page | Basic engagement |
| `product_click` | 2 | User clicks product link from listing | High intent |
| `add_to_cart` | 10 | User adds item to cart | Purchase intent |
| `checkout_start` | 30 | User initiates checkout | Very high intent |
| `purchase` | 100 | Order completed | Highest priority |
| `wishlist_add` | 5 | User saves for later | Moderate interest |

### Where to Add Tracking

#### 1. Product View (lib/track-api.ts)
Should already be tracking when `/product/[slug]` page loads:
```typescript
// In app/product/[slug]/page.tsx or component
useEffect(() => {
  trackEvent('product_view', { product_id: productId });
}, [productId]);
```

#### 2. Product Click (in product listing components)
Add to `components/product-card.tsx`:
```typescript
const handleProductClick = () => {
  trackEvent('product_click', { product_id: product.id });
  router.push(`/product/${product.slug}`);
};
```

#### 3. Add to Cart (in cart context)
Update `lib/cart-context.tsx`:
```typescript
const addToCart = (product: Product, quantity: number) => {
  trackEvent('add_to_cart', { product_id: product.id });
  // ... rest of add to cart logic
};
```

#### 4. Checkout Start (in checkout)
Update `app/checkout/page.tsx`:
```typescript
const handleCheckoutStart = () => {
  trackEvent('checkout_start', { product_id: cart.items[0].product.id });
  // ... rest of checkout logic
};
```

#### 5. Purchase (in order completion)
Update `lib/orders-api.ts`:
```typescript
const completeOrder = (order: Order) => {
  order.items.forEach(item => {
    trackEvent('purchase', { product_id: item.product_id });
  });
  // ... rest of completion logic
};
```

#### 6. Wishlist Add
Update `lib/wishlist-api.ts`:
```typescript
const addToWishlist = (productId: string) => {
  trackEvent('wishlist_add', { product_id: productId });
  // ... rest of wishlist logic
};
```

## Supabase Setup

### 1. Create activity_events Table

Run this SQL in Supabase:

```sql
-- Create the activity_events table
CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'product_view',
    'product_click',
    'add_to_cart',
    'checkout_start',
    'purchase',
    'wishlist_add'
  )),
  user_id UUID,
  session_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_activity_events_product_id ON public.activity_events(product_id);
CREATE INDEX idx_activity_events_created_at ON public.activity_events(created_at);
CREATE INDEX idx_activity_events_event_type ON public.activity_events(event_type);
CREATE INDEX idx_activity_events_user_id ON public.activity_events(user_id);
CREATE INDEX idx_activity_events_product_date ON public.activity_events(product_id, created_at DESC);

-- Set up RLS policies (if using RLS)
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert events
CREATE POLICY "Anyone can insert events" ON public.activity_events
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read events (optional, for debugging)
CREATE POLICY "Anyone can read events" ON public.activity_events
  FOR SELECT USING (true);
```

### 2. Optional: Add to Existing Database

If you already have an `activity_events` table, verify it has the right columns:

```sql
-- Check table structure
\d+ public.activity_events;

-- Add missing columns if needed
ALTER TABLE public.activity_events ADD COLUMN session_id TEXT;
ALTER TABLE public.activity_events ADD COLUMN metadata JSONB;
```

## Track API Implementation

### lib/track-api.ts

Make sure it has this function:

```typescript
interface TrackEventParams {
  product_id?: string;
  user_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

export async function trackEvent(
  eventType: string,
  params: TrackEventParams = {}
): Promise<void> {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        product_id: params.product_id,
        user_id: params.user_id,
        session_id: params.session_id,
        metadata: params.metadata,
      }),
    }).catch(() => {
      // Fail silently - tracking shouldn't break the site
    });
  } catch (err) {
    console.error('Track event failed:', err);
  }
}
```

## API Endpoint: /api/analytics/track

### Create: app/api/analytics/track/route.ts

```typescript
import { getServerSupabase } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_type, product_id, user_id, session_id, metadata } = body;

    if (!event_type || !product_id) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { error } = await supabase.from('activity_events').insert([
      {
        event_type,
        product_id,
        user_id,
        session_id,
        metadata,
      },
    ]);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Track API error:', error);
    // Still return 200 to avoid blocking user actions
    return Response.json({ success: false }, { status: 200 });
  }
}
```

## Verification Checklist

- [ ] `activity_events` table created in Supabase
- [ ] Table has proper indexes on product_id, created_at, event_type
- [ ] RLS policies allow inserts
- [ ] `/api/analytics/track` endpoint created
- [ ] `trackEvent()` called on product views
- [ ] `trackEvent()` called on product clicks
- [ ] `trackEvent()` called on cart additions
- [ ] `trackEvent()` called on checkout start
- [ ] `trackEvent()` called on purchases
- [ ] Test by viewing products and checking Supabase
- [ ] Popularity ranking refreshes on /category pages

## Testing

### Manual Test

1. Open browser dev tools (F12)
2. Go to `/shop`
3. Click several products
4. Go to Supabase dashboard → activity_events table
5. Should see entries with `event_type: 'product_click'`

### Check Popularity Score

```bash
# In browser console:
fetch('/api/products/popularity')
  .then(r => r.json())
  .then(d => console.log(d.ranked))
```

Should return array of product IDs ordered by popularity.

## Common Issues

### No events recorded
- Check that `/api/analytics/track` endpoint exists
- Verify Supabase connection is working
- Check browser console for fetch errors
- Ensure RLS policies allow inserts

### Events recorded but not affecting ranking
- Wait 60 seconds for server cache to refresh
- Hard refresh browser (Ctrl+Shift+R)
- Check that events are actually in the table
- Verify product_id matches exactly

### Ranking seems wrong
- Check that activity_events table has data
- Verify event weights in popularity-rank-server.ts
- Check time decay calculations
- Make sure recently inserted events are included

## Performance Tips

1. **Batch Tracking**: Don't track every single scroll/hover
2. **Session IDs**: Use to group events by user session
3. **Async Tracking**: Tracking should never block user interaction
4. **Fail Gracefully**: Tracking errors should not break the site

## Data Privacy

- Don't track without user consent (if required by law)
- Consider GDPR/CCPA compliance for user_id tracking
- Implement data retention policy (e.g., delete events after 90 days)
- Hash user IDs if privacy is a concern
