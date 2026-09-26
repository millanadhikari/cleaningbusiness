'use client';

import { UserButton } from '@clerk/nextjs';
import {
  CalendarCheck,
  CalendarDays,
  ConciergeBell,
  FileText,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

type AdminShellProps = {
  children: ReactNode;
  user: {
    name: string;
    email?: string;
    role: AdminRole;
  };
};

type NavigationItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  superAdminOnly?: boolean;
};

const navigationGroups: Array<{
  label?: string;
  items: NavigationItem[];
}> = [
  {
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/quotes', label: 'Quotes', icon: ClipboardList },
      { href: '/admin/customers', label: 'Customers', icon: UsersRound },
      { href: '/admin/services', label: 'Services', icon: ConciergeBell },
      { href: '/admin/blog', label: 'Blog', icon: FileText },
      { href: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
      { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        href: '/admin/users',
        label: 'Admin Users',
        icon: ShieldCheck,
        superAdminOnly: true,
      },
    ],
  },
  {
    items: [{ href: '/admin/settings', label: 'Settings', icon: Settings }],
  },
];

const pageTitles: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/quotes': 'Quotes',
  '/admin/customers': 'Customers',
  '/admin/services': 'Services',
  '/admin/blog': 'Blog',
  '/admin/bookings': 'Bookings',
  '/admin/calendar': 'Calendar',
  '/admin/users': 'Admin Users',
  '/admin/settings': 'Settings',
};

function isActiveRoute(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  role,
  mobile = false,
}: {
  pathname: string;
  role: AdminRole;
  mobile?: boolean;
}) {
  return (
    <nav aria-label="Admin navigation" className="flex-1 space-y-7 px-4 py-6">
      {navigationGroups.map((group, groupIndex) => {
        const visibleItems = group.items.filter(
          (item) => !item.superAdminOnly || role === 'SUPER_ADMIN',
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.label ?? groupIndex}>
            {group.label ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {visibleItems.map(({ href, label, icon: Icon }) => {
                const link = (
                  <Link
                    href={href}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActiveRoute(pathname, href)
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                    )}
                  >
                    <Icon className="size-[18px]" />
                    {label}
                  </Link>
                );

                return mobile ? (
                  <SheetClose key={href} asChild>
                    {link}
                  </SheetClose>
                ) : (
                  <div key={href}>{link}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="inline-flex items-center" aria-label="WeDo Cleaning admin dashboard">
      <Image
        src="/wedo-logo.svg"
        alt="WeDo Cleaning Services"
        width={235}
        height={72}
        className="h-11 w-auto"
        priority
      />
    </Link>
  );
}

export function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname();
  const pageTitle =
    pageTitles[pathname] ??
    (pathname.startsWith('/admin/quotes/')
      ? 'Quote Details'
      : pathname.startsWith('/admin/bookings/')
        ? 'Booking Details'
      : pathname.startsWith('/admin/customers/')
        ? 'Customer Details'
        : pathname.startsWith('/admin/services/')
          ? 'Service Configuration'
        : 'Admin');

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/80 bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b border-slate-100 px-6">
          <Brand />
        </div>
        <SidebarContent pathname={pathname} role={user.role} />
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <UserButton
              appearance={{ elements: { avatarBox: 'size-9' } }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {user.email ?? 'Internal user'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Open navigation">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72">
                  <SheetHeader className="border-b border-slate-100 px-6 py-[18px] text-left">
                    <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                      Navigate the WeDo Cleaning administration area.
                    </SheetDescription>
                    <Brand />
                  </SheetHeader>
                  <SidebarContent pathname={pathname} role={user.role} mobile />
                </SheetContent>
              </Sheet>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Cleaning Admin
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {pageTitle}
              </h1>
            </div>

            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {user.email ?? 'Internal user'}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="hidden bg-emerald-50 text-emerald-800 md:inline-flex"
            >
              {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
            </Badge>
            <div className="lg:hidden">
              <UserButton
                appearance={{ elements: { avatarBox: 'size-9' } }}
              />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
