'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  ShoppingCart,
  MessageSquare,
  LifeBuoy,
  Undo2,
  PackageX,
  ShoppingBag,
  Loader2,
  Truck,
  Landmark,
  Star,
  Store,
  Users2,
  CheckCircle2,
  PackageCheck,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AdminSection } from './admin-shell';

interface AdminNotification {
  id: string;
  type:
    | 'order'
    | 'order_paid'
    | 'order_delivered'
    | 'contact_message'
    | 'support_ticket'
    | 'return'
    | 'restock'
    | 'abandoned_cart'
    | 'vendor_application'
    | 'vendor_bank_update'
    | 'vendor_pickup'
    | 'vendor_return_pending'
    | 'review'
    | 'new_reseller'
    | 'new_affiliate';
  title: string;
  message: string;
  section: string;
  ref?: string;
  created_at: string;
}

const ICONS: Record<AdminNotification['type'], typeof Bell> = {
  order: ShoppingCart,
  order_paid: CheckCircle2,
  order_delivered: PackageCheck,
  contact_message: MessageSquare,
  support_ticket: LifeBuoy,
  return: Undo2,
  restock: PackageX,
  abandoned_cart: ShoppingBag,
  vendor_application: Truck,
  vendor_bank_update: Landmark,
  vendor_pickup: Truck,
  vendor_return_pending: Undo2,
  review: Star,
  new_reseller: Store,
  new_affiliate: Users2,
};

const LAST_SEEN_KEY = 'admin_notifications_last_seen';
const POLL_INTERVAL_MS = 20_000;

interface NotificationBellProps {
  onNavigate: (section: AdminSection, focusId?: string) => void;
}

export default function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const initialized = useRef(false);

  // Read the "last seen" cutoff once on mount so the very first render
  // already knows which items are unread.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_SEEN_KEY) : null;
    setLastSeen(stored ? Number(stored) : 0);
    initialized.current = true;
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json();
      setNotifications(body.notifications || []);
    } catch {
      // Silent failure — the bell just keeps showing the last good state.
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for "live" updates. This keeps the badge fresh without needing a
  // websocket/Realtime subscription wired up.
  //
  // IMPORTANT: this used to poll every 20s unconditionally, including while
  // the admin tab sat open-but-unfocused in the background for hours. That
  // silent background polling was a major contributor to monthly Supabase
  // egress usage. It now pauses while the tab is hidden and immediately
  // refreshes + resumes polling the moment it becomes visible again.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id) return;
      fetchNotifications();
      id = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (!id) return;
      clearInterval(id);
      id = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => new Date(n.created_at).getTime() > lastSeen).length;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Mark everything currently loaded as seen. A fresh fetch also runs
      // so the list is up to date the moment the panel opens.
      fetchNotifications();
      const now = Date.now();
      setLastSeen(now);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_SEEN_KEY, String(now));
      }
    }
  };

  const handleItemClick = (n: AdminNotification) => {
    // Pass the item's id along so the target panel can scroll to and
    // highlight exactly that order / ticket / review / etc.
    onNavigate(n.section as AdminSection, n.ref);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-serif text-sm font-bold text-primary">Notifications</p>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Live · updates every 20s
          </span>
        </div>

        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            You&apos;re all caught up 🎉
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto overscroll-contain">
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = ICONS[n.type] || Bell;
                const isUnread = new Date(n.created_at).getTime() > lastSeen;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{n.title}</span>
                          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
