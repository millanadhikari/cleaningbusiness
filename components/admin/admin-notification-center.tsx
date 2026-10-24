'use client';

import { formatDistanceToNow } from 'date-fns';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  ClipboardList,
  Mail,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Notification = Doc<'notifications'>;

function NotificationIcon({ notification }: { notification: Notification }) {
  const className = 'size-4';
  if (notification.priority === 'HIGH') return <CircleAlert className={className} />;
  if (notification.type === 'QUOTE_REQUEST_NEW') return <ClipboardList className={className} />;
  if (notification.type === 'CUSTOMER_EMAIL_RECEIVED') return <Mail className={className} />;
  if (notification.type === 'JOB_ACCEPTED' || notification.type === 'JOB_DECLINED') {
    return <UserRoundCheck className={className} />;
  }
  if (notification.type === 'JOB_COMPLETED') return <Check className={className} />;
  if (notification.type === 'JOB_REMINDER') return <CalendarClock className={className} />;
  return <Sparkles className={className} />;
}

export function AdminNotificationCenter() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const notifications = useQuery(
    api.notifications.listMine,
    isAuthenticated ? { limit: 30 } : 'skip',
  );
  const unread = useQuery(
    api.notifications.getUnreadCount,
    isAuthenticated ? {} : 'skip',
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const unreadCount = unread?.count ?? 0;
  const unreadLabel = unread?.hasMore ? '99+' : String(unreadCount);

  const openNotification = (notification: Notification) => {
    if (!notification.isRead) {
      void markRead({ notificationId: notification._id });
    }
    setOpen(false);
    if (notification.deepLink) router.push(notification.deepLink);
  };

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllRead({});
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe8e4] bg-white text-[#536963] transition hover:bg-[#edf6f2] hover:text-[#007c70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#68b9a8]/40"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full border-2 border-white bg-[#d94841] px-1 text-[9px] font-bold leading-4 text-white">
              {unreadLabel}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="isolate w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-[#dce7e2] bg-white p-0 text-[#183e3b] opacity-100 shadow-[0_18px_50px_rgba(24,62,59,0.16)]"
      >
        <PopoverHeader className="border-b border-[#e7eeeb] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <PopoverTitle className="text-[15px] font-semibold text-[#183e3b]">
                Notifications
              </PopoverTitle>
              <PopoverDescription className="mt-0.5 text-xs text-[#72827e]">
                Live operational updates from the CRM
              </PopoverDescription>
            </div>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0 || markingAll}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[#007c70] transition hover:bg-[#edf6f2] disabled:cursor-default disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          </div>
        </PopoverHeader>

        <ScrollArea className="h-[min(430px,65vh)]">
          {notifications === undefined ? (
            <div className="space-y-3 p-4" aria-label="Loading notifications">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse gap-3 rounded-xl p-2">
                  <div className="size-9 rounded-xl bg-[#eaf1ee]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-2/3 rounded bg-[#eaf1ee]" />
                    <div className="h-3 w-full rounded bg-[#eef3f1]" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#edf6f2] text-[#007c70]">
                <Bell className="size-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#294943]">You&apos;re all caught up</p>
              <p className="mt-1 max-w-64 text-xs leading-5 text-[#74847f]">
                New quote, cleaner and booking activity will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf2ef]">
              {notifications.map((notification) => (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    'relative flex w-full gap-3 px-4 py-3 text-left transition hover:bg-[#f1f7f4]',
                    !notification.isRead && 'bg-[#f7fbf9]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                      notification.priority === 'HIGH'
                        ? 'bg-[#fff0ee] text-[#c43e37]'
                        : 'bg-[#e6f4ef] text-[#007c70]',
                    )}
                  >
                    <NotificationIcon notification={notification} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-[#203e39]">
                        {notification.title}
                      </span>
                      {!notification.isRead ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#008f80]" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#657872]">
                      {notification.body}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium text-[#8a9995]">
                      {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
