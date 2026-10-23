'use client';

import { useEffect } from 'react';
import { fireGtagEvent } from '@/lib/gtag-track';

interface ViewItemListTrackerItem {
  id: string;
  name: string;
  category?: string | null;
  price: number;
}

interface ViewItemListTrackerProps {
  listName: string;
  items: ViewItemListTrackerItem[];
}

/**
 * Fires the GA4 ecommerce "view_item_list" event for pages that render
 * their product grid server-side (e.g. app/category/[slug]/page.tsx),
 * which can't call fireGtagEvent directly since they have no 'use client'
 * boundary. Mount this once per grid, passed the same list the page
 * already rendered. Renders nothing.
 *
 * Only the first 20 items are reported — this is a "what did they see
 * first" signal for Google Ads, not full pagination data.
 */
export default function ViewItemListTracker({ listName, items }: ViewItemListTrackerProps) {
  useEffect(() => {
    if (items.length === 0) return;
    fireGtagEvent('view_item_list', {
      item_list_name: listName,
      items: items.slice(0, 20).map((item, idx) => ({
        item_id: item.id,
        item_name: item.name,
        item_category: item.category ?? undefined,
        price: item.price,
        index: idx,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listName, items.map((i) => i.id).join(',')]);

  return null;
}
