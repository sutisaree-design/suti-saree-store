'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Notification-bell deep links.
 *
 * Clicking a bell entry navigates to `/admin?section=<panel>&focus=<item id>`.
 * Each panel calls this hook and tags its rows/cards with
 * `data-focus-id="<item id>"`. Once the panel's data has loaded (`ready`),
 * the matching element is scrolled into view and briefly highlighted, then the
 * `focus` param is removed from the URL so a reload doesn't re-trigger it.
 *
 * Returns the current focus id so a panel can first adjust its own tabs /
 * filters (e.g. clear a search box) to make sure the item is actually visible.
 */
export function useAdminFocus(ready: boolean): string | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  useEffect(() => {
    if (!focusId || !ready) return;

    const clearParam = () => {
      const params = new URLSearchParams(window.location.search);
      params.delete('focus');
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    };

    const find = () =>
      document.querySelector<HTMLElement>(`[data-focus-id="${focusId.replace(/"/g, '')}"]`);

    const highlight = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('admin-focus-flash');
      window.setTimeout(() => el.classList.remove('admin-focus-flash'), 4500);
    };

    // Panels may need a render or two (tab/filter state set in an effect)
    // before the target exists, so retry briefly before giving up.
    let tries = 0;
    const el0 = find();
    if (el0) {
      highlight(el0);
      clearParam();
      return;
    }
    const timer = window.setInterval(() => {
      tries += 1;
      const el = find();
      if (el) {
        window.clearInterval(timer);
        highlight(el);
        clearParam();
      } else if (tries >= 15) {
        window.clearInterval(timer);
        toast.info('That item is no longer in this list (it may have been handled or deleted).');
        clearParam();
      }
    }, 150);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, ready]);

  return focusId;
}
