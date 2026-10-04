'use client';

import { SignOutButton } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { BriefcaseBusiness, ClipboardList, Home, KeyRound, LoaderCircle, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { api } from '@/convex/_generated/api';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/agency', label: 'Home', icon: Home },
  { href: '/agency/quotes', label: 'Quotes', icon: ClipboardList },
  { href: '/agency/quotes/new', label: 'Request', icon: Plus },
  { href: '/agency/jobs', label: 'Jobs', icon: BriefcaseBusiness },
];

export function AgencyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const account = useQuery(api.agencyPortal.current);
  const passwordPage = pathname === '/agency/change-password';

  useEffect(() => {
    if (!account) return;
    if (account.mustChangePassword && !passwordPage) router.replace('/agency/change-password');
    if (!account.mustChangePassword && passwordPage) router.replace('/agency');
  }, [account, passwordPage, router]);

  if (account === undefined) return <main className="grid min-h-dvh place-items-center bg-[#eef3f2]"><LoaderCircle className="size-8 animate-spin text-[#087f70]" /></main>;

  return <div className="min-h-dvh bg-[#edf3f1] text-[#173c38]">
    <header className="sticky top-0 z-30 border-b border-[#dce8e3] bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"><BrandLogo href="/agency" size="sm" priority /><div className="flex min-w-0 items-center gap-3"><div className="hidden min-w-0 text-right sm:block"><p className="truncate text-sm font-bold">{account.agencyName}</p><p className="truncate text-xs text-slate-500">{account.teamName}</p></div><SignOutButton redirectUrl="/agency-sign-in"><button type="button" className="grid size-9 place-items-center rounded-xl border text-slate-500 hover:bg-slate-50" aria-label="Sign out"><LogOut className="size-4" /></button></SignOutButton></div></div></header>
    {passwordPage ? <main className="mx-auto max-w-lg px-4 py-10">{children}</main> : <>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block"><div className="sticky top-22 rounded-2xl border border-[#dce8e3] bg-white p-3"><p className="px-3 pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-[#087f70]">Agency portal</p><nav className="space-y-1">{navigation.map((item) => { const active = item.href === '/agency' ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold', active ? 'bg-[#087f70] text-white' : 'text-slate-600 hover:bg-emerald-50 hover:text-[#087f70]')}><item.icon className="size-4" />{item.label}</Link>; })}</nav></div></aside>
        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-start justify-around border-t bg-white/95 px-2 pt-2 backdrop-blur md:hidden">{navigation.map((item) => { const active = item.href === '/agency' ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={cn('flex min-w-16 flex-col items-center gap-1 text-[10px] font-semibold', active ? 'text-[#087f70]' : 'text-slate-400')}><span className={cn('grid size-8 place-items-center rounded-xl', active && 'bg-emerald-50')}><item.icon className="size-[18px]" /></span>{item.label}</Link>; })}</nav>
    </>}
  </div>;
}

export function PasswordRequiredNotice() {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><KeyRound className="mb-2 size-5" />Set a private password before using the agency portal.</div>;
}
