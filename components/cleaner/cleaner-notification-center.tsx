'use client';

import { formatDistanceToNow } from 'date-fns';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  MessageSquareText,
  RefreshCw,
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
  if (notification.type === 'JOB_OFFERED') return <BriefcaseBusiness className={className} />;
  if (notification.type === 'JOB_REMINDER') return <CalendarClock className={className} />;
  if (notification.type === 'ADMIN_MESSAGE') return <MessageSquareText className={className} />;
  return <RefreshCw className={className} />;
}

export function CleanerNotificationCenter() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const notifications = useQuery(
    api.notifications.listCleanerMine,
    isAuthenticated ? { limit: 30 } : 'skip',
  );
  const unread = useQuery(
    api.notifications.getCleanerUnreadCount,
    isAuthenticated ? {} : 'skip',
  );
  const markRead = useMutation(api.notifications.markCleanerRead);
  const markAllRead = useMutation(api.notifications.markAllCleanerRead);
  const unreadCount = unread?.count ?? 0;

  const openNotification = (notification: Notification) => {
    if (!notification.isRead) void markRead({ notificationId: notification._id });
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
          className="relative grid size-10 place-items-center rounded-2xl border border-black/5 bg-white text-[#31534e] shadow-sm transition active:scale-95"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full border-2 border-[#f7f9f8] bg-[#d94841] px-1 text-[9px] font-bold leading-4 text-white">
              {unread?.hasMore ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="isolate w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-[24px] border-[#dce7e2] bg-white p-0 text-[#173c38] opacity-100 shadow-[0_18px_50px_rgba(24,62,59,0.18)]"
      >
        <PopoverHeader className="border-b border-[#e7eeeb] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <PopoverTitle className="text-[15px] font-bold">Notifications</PopoverTitle>
              <PopoverDescription className="mt-0.5 text-xs text-slate-500">
                Job offers and updates from the team
              </PopoverDescription>
            </div>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0 || markingAll}
              className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-[#087f70] transition hover:bg-emerald-50 disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          </div>
        </PopoverHeader>

        <ScrollArea className="h-[min(420px,65vh)]">
          {notifications === undefined ? (
            <div className="space-y-3 p-4" aria-label="Loading notifications">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse gap-3 rounded-2xl p-2">
                  <div className="size-9 rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <div className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-[#087f70]">
                <Bell className="size-5" />
              </div>
              <p className="mt-3 text-sm font-bold">You&apos;re all caught up</p>
              <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">
                New job offers and team updates will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    'relative flex w-full gap-3 px-4 py-3 text-left transition hover:bg-emerald-50/60',
                    !notification.isRead && 'bg-[#f7fbf9]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                      notification.priority === 'HIGH'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-emerald-50 text-[#087f70]',
                    )}
                  >
                    <NotificationIcon notification={notification} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-[13px] font-bold">{notification.title}</span>
                      {!notification.isRead ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#087f70]" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                      {notification.body}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium text-slate-400">
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
