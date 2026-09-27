'use client';

import { UserButton } from '@clerk/nextjs';
import {
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ConciergeBell,
  ExternalLink,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
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

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/admin/quotes', label: 'Quotes', icon: ClipboardList },
      { href: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
      { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/admin/customers', label: 'Customers', icon: UsersRound },
      { href: '/admin/services', label: 'Services', icon: ConciergeBell },
      { href: '/admin/blog', label: 'Blog', icon: FileText },
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
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
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

function getPageTitle(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/admin/quotes/')) {
    return pathname.endsWith('/edit') ? 'Edit Quote' : 'Quote Details';
  }
  if (pathname.startsWith('/admin/bookings/')) {
    return 'Booking Details';
  }
  if (pathname.startsWith('/admin/customers/')) {
    return 'Customer Details';
  }
  if (pathname.startsWith('/admin/services/')) {
    return 'Service Configuration';
  }
  return 'Administration';
}

function SidebarNavigation({
  pathname,
  role,
  mobile = false,
  collapsed = false,
}: {
  pathname: string;
  role: AdminRole;
  mobile?: boolean;
  collapsed?: boolean;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (!item.superAdminOnly || role === 'SUPER_ADMIN') &&
              (!normalizedQuery ||
                item.label.toLowerCase().includes(normalizedQuery)),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [normalizedQuery, role],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed ? (
        <div className="px-4 pb-2 pt-4">
          <label className="flex h-10 items-center gap-2.5 rounded-xl border border-[#dce8e3] bg-[#f8fbf9] px-3 text-[#71827e] transition focus-within:border-[#68b9a8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#68b9a8]/15">
            <Search className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search navigation"
              aria-label="Search admin navigation"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#183e3b] outline-none placeholder:text-[#91a09b]"
            />
          </label>
        </div>
      ) : null}

      <nav
        aria-label="Admin navigation"
        className={cn(
          'min-h-0 flex-1 overflow-y-auto py-4',
          collapsed ? 'space-y-3 px-2' : 'space-y-5 px-4',
        )}
      >
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.02em] text-[#6f817c]">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActiveRoute(pathname, href);
                const link = (
                  <Link
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-label={collapsed ? label : undefined}
                    className={cn(
                      'group relative flex h-10 items-center rounded-xl text-[13px] font-medium transition-colors',
                      collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                      active
                        ? 'bg-[#007c70] text-white shadow-[0_5px_14px_rgba(0,124,112,0.18)]'
                        : 'text-[#4e625e] hover:bg-[#edf6f2] hover:text-[#006c62]',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-[17px] shrink-0',
                        active
                          ? 'text-white'
                          : 'text-[#70847f] group-hover:text-[#007c70]',
                      )}
                    />
                    {!collapsed ? <span className="truncate">{label}</span> : null}
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
        ))}
        {groups.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[#7b8d88]">
            No navigation items found.
          </p>
        ) : null}
      </nav>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/admin"
      className="inline-flex min-w-0 items-center"
      aria-label="WeDo Cleaning admin dashboard"
    >
      <Image
        src={compact ? '/favicon.svg' : '/wedo-logo.svg'}
        alt="WeDo Cleaning Services"
        width={compact ? 42 : 188}
        height={compact ? 42 : 58}
        className={compact ? 'size-9' : 'h-10 w-auto'}
        priority
      />
    </Link>
  );
}

function ProfileCard({
  user,
  collapsed = false,
}: {
  user: AdminShellProps['user'];
  collapsed?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center rounded-xl border border-[#e0e9e5] bg-[#f8fbf9]',
        collapsed ? 'justify-center p-2' : 'gap-3 p-2.5',
      )}
    >
      <UserButton appearance={{ elements: { avatarBox: 'size-8' } }} />
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-4 text-[#203b38]">
            {user.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[#7c8b87]">
            {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-[#183e3b]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-[#dfe8e4] bg-white transition-[width] duration-200 lg:flex lg:flex-col',
          sidebarCollapsed ? 'w-20' : 'w-[268px]',
        )}
      >
        <div
          className={cn(
            'flex h-[76px] items-center border-b border-[#edf2ef]',
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5',
          )}
        >
          <Brand compact={sidebarCollapsed} />
          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="grid size-8 place-items-center rounded-lg border border-[#e1e9e5] text-[#71817d] transition hover:bg-[#edf6f2] hover:text-[#007c70]"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>

        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="mx-auto mt-4 grid size-9 place-items-center rounded-xl border border-[#dfe8e4] text-[#71817d] transition hover:bg-[#edf6f2] hover:text-[#007c70]"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : null}

        <SidebarNavigation
          pathname={pathname}
          role={user.role}
          collapsed={sidebarCollapsed}
        />

        <div className={cn('border-t border-[#edf2ef]', sidebarCollapsed ? 'p-3' : 'p-4')}>
          <ProfileCard user={user} collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <div
        className={cn(
          'transition-[padding] duration-200',
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-[268px]',
        )}
      >
        <header className="sticky top-0 z-20 border-b border-[#dfe8e4] bg-white/95 backdrop-blur">
          <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl border-[#dce8e3] text-[#36534e] shadow-none"
                    aria-label="Open navigation"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[292px] gap-0 p-0 sm:max-w-[292px]">
                  <SheetHeader className="border-b border-[#edf2ef] px-5 py-[18px] text-left">
                    <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                      Navigate the WeDo Cleaning administration area.
                    </SheetDescription>
                    <Brand />
                  </SheetHeader>
                  <SidebarNavigation pathname={pathname} role={user.role} mobile />
                  <div className="border-t border-[#edf2ef] p-4">
                    <ProfileCard user={user} />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-[#72827e]">
                <Home className="size-3.5 text-[#007c70]" />
                <ChevronRight className="size-3" />
                <span className="truncate rounded-md bg-[#edf6f2] px-2 py-1 text-[#176d63]">
                  {pageTitle}
                </span>
              </div>
              <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-[#142f36] sm:text-xl">
                {pageTitle}
              </h1>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <a
                href="https://wedocleaning.com.au"
                target="_blank"
                rel="noreferrer"
                className="grid size-10 place-items-center rounded-xl border border-[#dfe8e4] bg-white text-[#536963] transition hover:bg-[#edf6f2] hover:text-[#007c70]"
                aria-label="Open public website"
                title="Open public website"
              >
                <ExternalLink className="size-[17px]" />
              </a>
              <Link
                href="/admin/settings"
                className="grid size-10 place-items-center rounded-xl border border-[#dfe8e4] bg-white text-[#536963] transition hover:bg-[#edf6f2] hover:text-[#007c70]"
                aria-label="Open settings"
                title="Open settings"
              >
                <Settings className="size-[17px]" />
              </Link>
              <Button asChild className="h-10 rounded-xl bg-[#007c70] px-4 text-[13px] text-white shadow-none hover:bg-[#006a60]">
                <Link href="/admin/quotes/new">
                  <Plus className="size-4" />
                  New quote
                </Link>
              </Button>
            </div>

            <Badge
              variant="secondary"
              className="hidden border border-[#dce8e2] bg-[#f3f8f6] px-2.5 py-1 text-[11px] font-semibold text-[#176d63] xl:inline-flex"
            >
              {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
            </Badge>
            <div className="lg:hidden">
              <UserButton appearance={{ elements: { avatarBox: 'size-9' } }} />
            </div>
          </div>
        </header>

        <main className="px-4 py-5 [&_h3]:!text-[17px] [&_h3]:!leading-6 sm:px-6 sm:py-7 lg:px-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
